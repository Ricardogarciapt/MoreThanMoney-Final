import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { firstLastName } from "@/lib/avaliacoes/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — vitrine pública de alunos certificados (prova social). Sem emails.
export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data: assessments } = await supabase.from("assessments").select("slug, title, grade_display")
  const meta: Record<string, { title: string; grade: string }> = {}
  for (const a of assessments || []) meta[a.slug] = { title: a.title, grade: a.grade_display }

  const { data, error } = await supabase
    .from("assessment_attempts")
    .select("name, assessment_slug, grade_value, cert_code, created_at")
    .eq("passed", true)
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) return NextResponse.json({ items: [], total: 0 })

  // dedupe por (nome+curso) para não repetir a mesma pessoa
  const seen = new Set<string>()
  const items: any[] = []
  for (const r of data || []) {
    const key = `${(r.name || "").toLowerCase()}|${r.assessment_slug}`
    if (seen.has(key)) continue
    seen.add(key)
    const m = meta[r.assessment_slug]
    let gradeText: string | null = null
    if (m?.grade === "valores20" && typeof r.grade_value === "number") {
      gradeText = `${Number(r.grade_value).toFixed(1).replace(".", ",")} valores`
    }
    items.push({
      name: firstLastName(r.name) || r.name,
      course: m?.title || r.assessment_slug,
      grade: gradeText,
      code: r.cert_code,
      date: r.created_at,
    })
  }

  const { count } = await supabase
    .from("assessment_attempts")
    .select("*", { count: "exact", head: true })
    .eq("passed", true)

  return NextResponse.json({ items, total: count ?? items.length }, { headers: { "Cache-Control": "no-store" } })
}
