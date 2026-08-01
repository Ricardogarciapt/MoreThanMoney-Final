import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin, isValidEmail } from "@/lib/admin-api-helpers"
import { getAssessmentBySlug, issueCertificateDirect, regenerateCertificatePdfByCode } from "@/lib/avaliacoes/service"
import { sendCertificateEmail } from "@/lib/avaliacoes/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — lista de tentativas/certificados (filtro opcional ?slug= &passed=1)
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const supabase = getSupabaseAdmin()
  const slug = req.nextUrl.searchParams.get("slug")
  const onlyPassed = req.nextUrl.searchParams.get("passed") === "1"

  let q = supabase
    .from("assessment_attempts")
    .select("id, assessment_slug, name, email, score_percent, grade_value, passed, cert_code, cert_url, emailed_at, feedback, created_at")
    .order("created_at", { ascending: false })
    .limit(500)
  if (slug) q = q.eq("assessment_slug", slug)
  if (onlyPassed) q = q.eq("passed", true)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attempts: data || [] }, { headers: { "Cache-Control": "no-store" } })
}

// POST — issue (lote) | resend | delete
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const supabase = getSupabaseAdmin()
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")

  if (action === "issue") {
    const slug = String(body?.slug || "")
    const assessment = await getAssessmentBySlug(slug)
    if (!assessment) return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 })
    const sendEmail = body?.sendEmail !== false
    const entries: Array<{ name: string; email: string; gradeValue?: number | null }> = Array.isArray(body?.entries)
      ? body.entries
      : []
    if (!entries.length) return NextResponse.json({ error: "Sem entradas para emitir." }, { status: 400 })

    const results: Array<{ email: string; ok: boolean; code?: string; emailed?: boolean; error?: string }> = []
    for (const e of entries) {
      const email = String(e?.email || "").trim().toLowerCase()
      const name = String(e?.name || "").trim()
      if (!isValidEmail(email) || name.length < 2) {
        results.push({ email, ok: false, error: "nome/email inválido" })
        continue
      }
      try {
        const out = await issueCertificateDirect({
          assessment,
          name,
          email,
          gradeValue: typeof e?.gradeValue === "number" ? e.gradeValue : null,
          sendEmail,
        })
        results.push({ email, ok: true, code: out.certCode, emailed: out.emailed })
      } catch (err: any) {
        results.push({ email, ok: false, error: err?.message || "erro" })
      }
    }
    return NextResponse.json({ success: true, results })
  }

  if (action === "resend") {
    const code = String(body?.cert_code || "").trim().toUpperCase()
    const { data: attempt } = await supabase
      .from("assessment_attempts")
      .select("name, email, assessment_slug, grade_value, passed")
      .eq("cert_code", code)
      .maybeSingle()
    if (!attempt || !attempt.passed) return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    const assessment = await getAssessmentBySlug(attempt.assessment_slug)
    const out = await regenerateCertificatePdfByCode(code)
    if (!assessment || !out) return NextResponse.json({ error: "Falha a gerar o PDF" }, { status: 500 })
    let emailGrade: string | null = null
    if (assessment.grade_display === "valores20" && typeof attempt.grade_value === "number") {
      emailGrade = `${Number(attempt.grade_value).toFixed(1).replace(".", ",")} valores`
    }
    const mail = await sendCertificateEmail({
      to: attempt.email,
      name: attempt.name,
      assessmentTitle: assessment.title,
      pdfBuffer: out.pdf,
      code,
      gradeText: emailGrade,
    })
    if (mail.success) await supabase.from("assessment_attempts").update({ emailed_at: new Date().toISOString() }).eq("cert_code", code)
    return NextResponse.json({ success: mail.success })
  }

  if (action === "delete") {
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
    const { error } = await supabase.from("assessment_attempts").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
