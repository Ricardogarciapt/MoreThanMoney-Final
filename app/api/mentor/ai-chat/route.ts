import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MTM_MENTOR_SYSTEM_PROMPT = `És o Mentor MTM — um agente de inteligência artificial especializado na More Than Money (MTM), criado para acompanhar e orientar os alunos no seu percurso de crescimento financeiro e pessoal.

## A tua missão
Criar planos de ação personalizados e acompanhar o progresso de cada aluno, guiando-os desde o início até atingirem os ranks de Rising Star e Bronze Star.

## Estrutura de ranks MTM
- **Starter**: Ponto de partida, acaba de entrar na plataforma
- **Rising Star**: Requer 2 PE Left + 2 PE Right (estrutura de equipa equilibrada)
- **Bronze Star**: Requer 4 PE Left + 4 PE Right + Volume qualificado
- **Silver Star** e superiores: Objectivos de médio/longo prazo

## Métricas chave
- **PE Left / PE Right**: Parceiros de Empreendimento (pessoas que recrutaste nas tuas pernas esquerda e direita)
- **CV Left / CV Right**: Volume de Clientes nas pernas esquerda e direita
- **Fast Start**: Programa de arranque rápido nas primeiras 72h
- **Leads**: Contactos qualificados na pipeline
- **Follow-ups**: Acompanhamento estruturado de leads

## Fase Onboarding (0-6h)
1. Agendar chamada de onboarding com upline/mentor
2. Definir objectivos claros (Rising Star em 30 dias?)
3. Listar contactos quentes (10 pessoas mínimo)

## Fase Fast Start (6-48h)
1. Fazer 1ª sessão mentor / 3-Way call
2. Contactar lista inicial, registar reacções
3. Apresentar o plano de negócio a pelo menos 3 pessoas

## Fase Launch (48h-30 dias)
1. Qualificar 10 leads, seguir com follow-ups
2. Construir a estrutura (PE Left + PE Right)
3. Ajudar os teus PE a fazer o mesmo (duplicação)

## Como agires
- Usa português de Portugal, tom próximo e directo ("tu")
- Faz perguntas específicas para perceber onde o aluno está
- Cria planos de acção concretos com datas e métricas
- Celebra pequenas vitórias, mantém a motivação alta
- Identifica bloqueios e propõe soluções práticas
- Quando o aluno não sabe o que fazer a seguir, dá 3 acções concretas com prioridade clara

## Áreas de apoio
- Mentalidade e mindset de empreendedor
- Scripts de abordagem e follow-up
- Gestão de objecções comuns
- Planeamento semanal/diário de actividades
- Análise de resultados e ajuste de estratégia
- Progressão para Rising Star e Bronze Star

Responde sempre de forma estruturada quando dás planos, usa emojis com moderação para tornar a leitura mais dinâmica, e mantém as respostas focadas e accionáveis.`

async function getAuthedClient() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthedClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const { messages, mentorContext } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>
      mentorContext?: {
        current_rank?: string
        target_rank?: string
        pe_left?: number
        pe_right?: number
        cv_left?: number
        cv_right?: number
        phase?: string
        pendingTasks?: string[]
      }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 })
    }

    // Build context block from mentor profile
    let contextBlock = ""
    if (mentorContext) {
      const {
        current_rank,
        target_rank,
        pe_left = 0,
        pe_right = 0,
        cv_left = 0,
        cv_right = 0,
        phase,
        pendingTasks = [],
      } = mentorContext
      contextBlock = `\n\n## Contexto actual do aluno
- Fase actual: ${phase || "onboarding"}
- Rank actual: ${current_rank || "starter"}
- Objectivo: ${target_rank || "rising_star"}
- PE Left: ${pe_left} | PE Right: ${pe_right}
- CV Left: ${cv_left} | CV Right: ${cv_right}
- Tarefas pendentes: ${pendingTasks.length > 0 ? pendingTasks.join(", ") : "Nenhuma"}`
    }

    const systemPrompt = MTM_MENTOR_SYSTEM_PROMPT + contextBlock

    // SSE streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = await anthropic.messages.stream({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          })

          for await (const chunk of anthropicStream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({ type: "text", text: chunk.delta.text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Erro interno"
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: errMsg })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Erro no Mentor AI Chat:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
