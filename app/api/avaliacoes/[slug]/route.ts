import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getAuthenticatedUser, checkRateLimit, isValidEmail } from "@/lib/admin-api-helpers"
import { getAssessmentBySlug, getQuestions, submitAttempt } from "@/lib/avaliacoes/service"
import { toPublicQuestion } from "@/lib/avaliacoes/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET — devolve a avaliação + perguntas (SEM a resposta certa) + prefill do perfil.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const assessment = await getAssessmentBySlug(slug)
  if (!assessment || !assessment.active) {
    return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 })
  }
  const questions = await getQuestions(assessment.id)

  // prefill (nome/email) se autenticado
  let prefill: { name?: string; email?: string } = {}
  let alreadyPassed = false
  const auth = await getAuthenticatedUser()
  if (auth.userId) {
    const supabase = getSupabaseAdmin()
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", auth.userId).maybeSingle()
    const name = (profile?.full_name || profile?.name || profile?.display_name || "") as string
    prefill = { name: name || undefined, email: auth.email }
    const { data: passed } = await supabase
      .from("assessment_attempts")
      .select("id")
      .eq("assessment_slug", slug)
      .eq("user_id", auth.userId)
      .eq("passed", true)
      .limit(1)
    alreadyPassed = !!(passed && passed.length)
  }

  return NextResponse.json(
    {
      assessment: {
        slug: assessment.slug,
        title: assessment.title,
        subtitle: assessment.subtitle,
        intro: assessment.intro,
        material_url: assessment.material_url ?? null,
        kind: assessment.kind,
        pass_mark: assessment.pass_mark,
        grade_display: assessment.grade_display,
        total: questions.length,
      },
      questions: questions.map(toPublicQuestion),
      prefill,
      alreadyPassed,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

// POST — { name, email, answers: { [questionId]: chosenIndex } } → corrige e emite.
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon"
  const rl = checkRateLimit(`avaliacao:${slug}:${ip}`, 12, 60_000)
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas tentativas. Aguarda um momento." }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || "").trim()
  const email = String(body?.email || "").trim().toLowerCase()
  const rawAnswers = body?.answers && typeof body.answers === "object" ? body.answers : {}

  if (name.length < 2) return NextResponse.json({ error: "Indica o teu nome completo." }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: "Email inválido." }, { status: 400 })

  const assessment = await getAssessmentBySlug(slug)
  if (!assessment || !assessment.active) return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 })

  const questions = await getQuestions(assessment.id)
  if (!questions.length) return NextResponse.json({ error: "Avaliação sem perguntas." }, { status: 400 })

  // normaliza respostas: { questionId: number }
  const answers: Record<string, number> = {}
  for (const q of questions) {
    const v = rawAnswers[q.id]
    if (typeof v === "number" && Number.isInteger(v)) answers[q.id] = v
  }

  const auth = await getAuthenticatedUser()

  // Opinião opcional sobre o teste
  let feedback: { opinion?: string; favorite?: string } | null = null
  if (body?.feedback && typeof body.feedback === "object") {
    const opinion = String(body.feedback.opinion || "").trim().slice(0, 1000)
    const favorite = String(body.feedback.favorite || "").trim().slice(0, 1000)
    if (opinion || favorite) feedback = { opinion, favorite }
  }

  try {
    const result = await submitAttempt({
      assessment,
      questions,
      name,
      email,
      answers,
      userId: auth.userId || null,
      feedback,
    })
    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    console.error("[avaliacoes] submit error:", e)
    return NextResponse.json({ error: e?.message || "Erro ao processar a avaliação." }, { status: 500 })
  }
}
