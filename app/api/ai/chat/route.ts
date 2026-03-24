import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { buildLocalMtmCoachReply } from "@/lib/mtm-ai-coach-fallback"

type ChatContext = {
  pathname?: string
  tab?: string
  include_dca?: boolean
  mentor_mode?: boolean
  onboarding_focus?: boolean
}

async function callAnthropic(system: string, userMessage: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null

  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-20241022"

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error("❌ [AI CHAT] Anthropic error:", res.status, errText)
    return null
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[]
  }
  const text = data.content?.find((b) => b.type === "text")?.text?.trim()
  return text || null
}

async function callOpenAI(system: string, userMessage: string): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return null

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800,
    }),
  })

  if (!response.ok) {
    const errorData = await response.text()
    console.error("❌ [AI CHAT] OpenAI error:", errorData)
    return null
  }

  const data = await response.json()
  const aiMessage = data.choices?.[0]?.message?.content
  return typeof aiMessage === "string" ? aiMessage.trim() : null
}

function buildSystemPrompt(
  dcaContext: string,
  additionalContext: string,
  ctx: ChatContext
): string {
  const mtmBlocks: string[] = []

  if (ctx.mentor_mode) {
    mtmBlocks.push(
      "O utilizador está no modo Mentor (app-mobile). Prioriza plano 72h, Rising Star (2 PE esq + 2 PE dir), Bronze Star (2 PE + 700 CV por perna), 3-way e leads/follow-up."
    )
  }
  if (ctx.onboarding_focus) {
    mtmBlocks.push(
      "Contexto: onboarding / fast-start MoreThanMoney. Liga respostas a execução prática, hábitos diários e próximos passos claros."
    )
  }

  return `És o assistente oficial **MoreThanMoney (MTM)** — educação, trading, copytrading e crescimento de negócio com acompanhamento.

${mtmBlocks.join("\n")}

Áreas:
1. **Negócio / rede:** prospecção, 3-way com mentor, leads, follow-up, ranks (Rising Star, Bronze Star com CV 700/700 por perna quando aplicável).
2. **Trading / investimento:** visão geral, DCA, gestão de risco — sem promessas de retorno; lembra riscos.
3. **Mindset & fitness** (se houver dados do utilizador abaixo).

${dcaContext}${additionalContext}

Responde em **português de Portugal**, de forma concisa e acionável. Se faltar informação, pergunta 1 coisa específica em vez de generalizar.`
}

// AI Chat: Claude (Anthropic) → OpenAI → resposta local (sempre funcional)
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
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { message, context } = body as { message?: string; context?: ChatContext }

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
          .eq("user_id", session.user.id)
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
            .eq("user_id", session.user.id)
            .eq("is_active", true)
            .limit(3),
          supabase
            .from("fitness_goals")
            .select("*")
            .eq("user_id", session.user.id)
            .eq("is_active", true)
            .limit(3),
          supabase
            .from("workout_sessions")
            .select("*, workouts(*)")
            .eq("user_id", session.user.id)
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

    const systemPrompt = buildSystemPrompt(dcaContext, additionalContext, context || {})

    const prefer = (process.env.AI_CHAT_PROVIDER || "auto").toLowerCase()
    let aiMessage: string | null = null
    let source: "anthropic" | "openai" | "local" = "local"

    const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim())

    if (prefer === "anthropic" && hasAnthropic) {
      aiMessage = await callAnthropic(systemPrompt, message)
      if (aiMessage) source = "anthropic"
    } else if (prefer === "openai" && hasOpenAI) {
      aiMessage = await callOpenAI(systemPrompt, message)
      if (aiMessage) source = "openai"
    } else if (prefer === "auto") {
      if (hasAnthropic) {
        aiMessage = await callAnthropic(systemPrompt, message)
        if (aiMessage) source = "anthropic"
      }
      if (!aiMessage && hasOpenAI) {
        aiMessage = await callOpenAI(systemPrompt, message)
        if (aiMessage) source = "openai"
      }
    }

    if (!aiMessage) {
      aiMessage = buildLocalMtmCoachReply(message, context)
      source = "local"
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
          context: { user_id: session.user.id },
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
