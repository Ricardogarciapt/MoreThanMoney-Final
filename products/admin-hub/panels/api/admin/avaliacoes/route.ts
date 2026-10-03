import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — todas as avaliações + perguntas (com resposta certa) para o editor.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const supabase = getSupabaseAdmin()

  const { data: assessments, error: aErr } = await supabase
    .from("assessments")
    .select("*")
    .order("sort", { ascending: true })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const { data: questions, error: qErr } = await supabase
    .from("assessment_questions")
    .select("id, assessment_id, order_index, prompt, options, correct_index, points, active")
    .order("order_index", { ascending: true })
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  // contagem de certificados emitidos por avaliação
  const { data: attempts } = await supabase
    .from("assessment_attempts")
    .select("assessment_slug, passed")
  const issued: Record<string, number> = {}
  for (const a of attempts || []) {
    if (a.passed) issued[a.assessment_slug] = (issued[a.assessment_slug] || 0) + 1
  }

  const byAssessment = (assessments || []).map((a: any) => ({
    ...a,
    issuedCount: issued[a.slug] || 0,
    questions: (questions || []).filter((q: any) => q.assessment_id === a.id),
  }))

  return NextResponse.json({ assessments: byAssessment }, { headers: { "Cache-Control": "no-store" } })
}

// POST — ações: updateAssessment | createQuestion | updateQuestion | deleteQuestion
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const supabase = getSupabaseAdmin()
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "")

  if (action === "updateAssessment") {
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
    const patch: Record<string, unknown> = {}
    for (const k of ["title", "subtitle", "intro", "pass_mark", "grade_display", "active"]) {
      if (k in body) patch[k] = body[k]
    }
    if (typeof patch.pass_mark === "number") patch.pass_mark = Math.max(0, Math.min(100, patch.pass_mark))
    const { error } = await supabase.from("assessments").update(patch).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "createQuestion") {
    const assessment_id = String(body?.assessment_id || "")
    if (!assessment_id) return NextResponse.json({ error: "assessment_id em falta" }, { status: 400 })
    // próximo order_index
    const { data: last } = await supabase
      .from("assessment_questions")
      .select("order_index")
      .eq("assessment_id", assessment_id)
      .order("order_index", { ascending: false })
      .limit(1)
    const nextOrder = (last?.[0]?.order_index ?? 0) + 1
    const options = Array.isArray(body?.options) ? body.options.map((o: any) => String(o)) : ["", "", "", ""]
    const { data, error } = await supabase
      .from("assessment_questions")
      .insert({
        assessment_id,
        order_index: body?.order_index ?? nextOrder,
        prompt: String(body?.prompt || "Nova pergunta"),
        options,
        correct_index: Number(body?.correct_index) || 0,
        points: Number(body?.points) || 1,
        active: body?.active ?? true,
      })
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, id: data?.id })
  }

  if (action === "updateQuestion") {
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if ("prompt" in body) patch.prompt = String(body.prompt)
    if ("options" in body && Array.isArray(body.options)) patch.options = body.options.map((o: any) => String(o))
    if ("correct_index" in body) patch.correct_index = Number(body.correct_index) || 0
    if ("points" in body) patch.points = Number(body.points) || 1
    if ("active" in body) patch.active = !!body.active
    if ("order_index" in body) patch.order_index = Number(body.order_index) || 0
    const { error } = await supabase.from("assessment_questions").update(patch).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === "deleteQuestion") {
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ error: "id em falta" }, { status: 400 })
    const { error } = await supabase.from("assessment_questions").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
