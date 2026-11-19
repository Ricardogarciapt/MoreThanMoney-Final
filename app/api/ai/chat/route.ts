import { NextRequest, NextResponse } from "next/server"
import type { NomeFornecedor } from "@/lib/ia/chamar"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { buildLocalMtmCoachReply } from "@/lib/mtm-ai-coach-fallback"
import { chamarIAGratis, mensagemIndisponivel } from "@/lib/ia/chamar"
import { normalizeLang } from "@/lib/i18n/config"
import { montarSistema, type ContextoAluno } from "@/lib/mentor/prompt"
import { contextoDoAluno, salasDaSemana } from "@/lib/mentor/contexto-servidor"

type ChatContext = {
  pathname?: string
  tab?: string
  include_dca?: boolean
  mentor_mode?: boolean
  onboarding_focus?: boolean
}

/**
 * Assistente dos membros (app). Desde 17/11 usa o MESMO cérebro do Mentor (`lib/mentor/prompt.ts`):
 * mesma base de conhecimento, mesmo tom humano, mesma regra de língua (a da mensagem do membro,
 * não PT-PT à força) e nada de network marketing. Sem notas escondidas: aqui não se guardam sinais.
 */
async function buildSystemPrompt(
  dcaContext: string,
  additionalContext: string,
  ctx: ChatContext,
  userId: string,
  idioma: string | undefined
): Promise<string> {
  const extras: string[] = []
  if (ctx.mentor_mode || ctx.onboarding_focus) {
    extras.push("## Foco desta conversa\nOnboarding: liga as respostas ao próximo passo concreto dos 5 passos e a hábitos diários.")
  }
  if (dcaContext || additionalContext) extras.push(`## Dados do membro\n${dcaContext}${additionalContext}`)
  const [{ contexto, idiomaPerfil }, salas] = await Promise.all([
    contextoDoAluno(userId).catch(() => ({ contexto: {} as ContextoAluno, idiomaPerfil: null as string | null })),
    salasDaSemana(),
  ])
  const base = montarSistema({
    langApp: normalizeLang(idioma || idiomaPerfil || undefined),
    ultimaPorBotao: false,
    contexto,
    salas,
    comNotas: false,
  })
  // Os extras entram ANTES do bloco da língua (que tem de ficar em último).
  const i = base.lastIndexOf("## Língua")
  return extras.length ? `${base.slice(0, i)}${extras.join("\n\n")}\n\n${base.slice(i)}` : base
}

// AI Chat: OpenAI (prioridade em auto) → Anthropic → resposta local
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { user: authUser },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !authUser) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { message, context, idioma } = body as { message?: string; context?: ChatContext; idioma?: string }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 })
    }

    const pathname = context?.pathname || ""

    let dcaContext = ""
    if (context?.include_dca) {
      try {
        const { data: dcaData } = await supabase
          .from("dca_plans")
          .select("*")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false })
          .limit(5)

        if (dcaData && dcaData.length > 0) {
          dcaContext = `\n\nContexto DCA do utilizador:\n${JSON.stringify(dcaData, null, 2)}`
        }
      } catch (dcaError) {
        console.warn("⚠️ [AI CHAT] Erro ao buscar contexto DCA:", dcaError)
      }
    }

    let additionalContext = ""
    const isMindsetFitness =
      pathname?.includes("mindset-fitness") || pathname?.includes("app-mobile")

    if (isMindsetFitness) {
      try {
        const [mindsetGoals, fitnessGoals, recentWorkouts] = await Promise.all([
          supabase
            .from("mindset_goals")
            .select("*")
            .eq("user_id", authUser.id)
            .eq("is_active", true)
            .limit(3),
          supabase
            .from("fitness_goals")
            .select("*")
            .eq("user_id", authUser.id)
            .eq("is_active", true)
            .limit(3),
          supabase
            .from("workout_sessions")
            .select("*, workouts(*)")
            .eq("user_id", authUser.id)
            .order("start_time", { ascending: false })
            .limit(5),
        ])

        if (mindsetGoals.data && mindsetGoals.data.length > 0) {
          additionalContext += `\n\nObjetivos de Mindset:\n${JSON.stringify(
            mindsetGoals.data.map((g) => ({
              type: g.goal_type,
              target: g.target_value,
              current: g.current_value,
              description: g.description,
            })),
            null,
            2
          )}`
        }

        if (fitnessGoals.data && fitnessGoals.data.length > 0) {
          additionalContext += `\n\nObjetivos de Fitness:\n${JSON.stringify(
            fitnessGoals.data.map((g) => ({
              type: g.goal_type,
              target: g.target_value,
              current: g.current_value,
              description: g.description,
            })),
            null,
            2
          )}`
        }

        if (recentWorkouts.data && recentWorkouts.data.length > 0) {
          additionalContext += `\n\nTreinos Recentes:\n${JSON.stringify(
            recentWorkouts.data.map((s) => ({
              workout: s.workouts?.name,
              completed: s.end_time ? "Sim" : "Não",
              duration: s.duration_minutes,
              rating: s.rating,
            })),
            null,
            2
          )}`
        }
      } catch (contextError) {
        console.warn("⚠️ [AI CHAT] Erro ao buscar contexto Mindset/Fitness:", contextError)
      }
    }

    const systemPrompt = await buildSystemPrompt(dcaContext, additionalContext, context || {}, authUser.id, idioma)

    // 04/10: saem as chamadas à mão (OpenAI → Anthropic); entra a porta única da IA, grátis
    // primeiro. Se a cadeia falhar toda, o guia local responde — mas a DIZER que a IA está em
    // baixo e quem foi tentado, nunca a fingir que é IA.
    let aiMessage: string
    let source: NomeFornecedor | "local"
    try {
      const resposta = await chamarIAGratis({
        tarefa: "ai-chat",
        sistema: systemPrompt,
        mensagens: [{ role: "user", content: message }],
        maxTokens: 1024,
        temperatura: 0.7,
      })
      aiMessage = resposta.texto
      source = resposta.fornecedor
    } catch (err) {
      source = "local"
      aiMessage = `⚠️ ${mensagemIndisponivel(err)}\n\nEntretanto, o guia local da MTM responde:\n\n${buildLocalMtmCoachReply(message, context)}`
    }

    const responseTime = Date.now() - startTime

    try {
      const base =
        process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin || "http://localhost:3000"
      await fetch(`${base}/api/ai/track-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "ai_chat_response",
          event_data: {
            message_length: message.length,
            response_length: aiMessage.length,
            has_dca_context: !!dcaContext,
            source,
          },
          context: { user_id: authUser.id },
          ai_feature: "chat_assistant",
          response_time: responseTime,
          success: true,
        }),
      })
    } catch (trackError) {
      console.warn("⚠️ [AI CHAT] Erro ao trackear evento:", trackError)
    }

    return NextResponse.json({
      success: true,
      message: aiMessage,
      response: aiMessage,
      response_time: responseTime,
      source,
    })
  } catch (error: unknown) {
    console.error("❌ [AI CHAT] Erro:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
