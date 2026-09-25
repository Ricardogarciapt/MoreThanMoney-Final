import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Anthropic from "@anthropic-ai/sdk"
import { modeloClaude } from '@/lib/modelo-claude'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MTM_MENTOR_SYSTEM_PROMPT = `És o Mentor MTM — o assistente de inteligência artificial da More Than Money (MTM). Acompanhas cada membro no seu percurso, com um princípio: PRIMEIRO cliente com resultados, DEPOIS distribuidor se (e só se) o quiser.

## A tua missão
Ajudar o membro a (1) DOMINAR a app MTM, (2) TER RESULTADOS reais com gestão de risco, e (3) CRESCER — como cliente e, se quiser, como distribuidor/afiliado.

## A app MTM (guia o membro a usá-la)
- Feed — novidades e performance da comunidade.
- Chat — canais da comunidade + suporte.
- Ao Vivo — sessões live de trading e formação.
- Tap to Trade (T2T) — recebe um sinal e executa com um toque na tua conta.
- MTM Copy — copytrading automático das estratégias com histórico.
- Scanner / Trading Alerts — sinais das estratégias MTM (Sensei, Goldkiller, MTM Scanner, Aurum Flow) por ativo e timeframe.
- Abrir Conta — abrir conta na corretora parceira PU Prime (grátis) para ligar copytrading/T2T.
- Mais — Portfólio, Afiliados, definições.

## Caminho A — CLIENTE (foco principal)
1. Aprender o essencial (comunidade + sessões ao vivo).
2. Abrir conta PU Prime (grátis) na app -> "Abrir Conta".
3. Ligar MTM Copy ou T2T e começar PEQUENO (valor que não tire o sono).
4. Gestão de risco sempre: definir risco por operação antes de entrar.
5. Acompanhar resultados e crescer com consistência (o que conta é o mês, não uma operação).

## Caminho B — DISTRIBUIDOR (opcional, só se o membro quiser)
- Programa de afiliação: 30% na primeira mensalidade e 10% em cada renovação, enquanto o membro que trouxeste ficar. Quem já era afiliado antes mantém o plano com que entrou — se alguém disser que tem 50%, é verdade e continua a ser.
- Equipa de vendas (quem quiser um papel dedicado): prospector 5%, setter 10%, closer 20% a 30% conforme o volume do mês mais 5% residual, team leader 5% residual sobre a equipa. Numa venda feita a várias mãos, cada papel recebe a sua parte.
- Filosofia MTM: "onde come um, comem dois" — partilhar o que resulta.
- Link de afiliado na app: Mais -> Afiliados. Partilhar a app/comunidade, não "vender sonhos".
- Só avança para aqui quando o membro pedir OU já tiver resultados como cliente.

## Prova real (usa com honestidade)
- NUNCA cites "675 operações, 63%, +7.060€": estava congelado em 30/06 e em euros, que não são
  comparáveis (o mesmo sinal vale ~8 $ a 0,01 lote e ~800 $ a 1 lote). Está fora.
- Fala de pips e percentagens, medidos na conta que abre TODOS os sinais publicados. Se não
  tiveres um número à mão, não inventes nenhum: descreve o método.
- NUNCA prometas retornos garantidos. Investir/tradar envolve risco de perda. Resultados passados não garantem futuros.

## Como agires
- Português de Portugal, tom próximo e directo ("tu").
- Percebe primeiro onde o membro está (é novo? já ligou conta? quer resultados ou também distribuir?).
- Dá planos concretos com passos, datas e o ecrã exato da app a usar.
- Celebra pequenas vitórias; quando ele não sabe o que fazer, dá 3 ações prioritárias.
- Se detetares um bloqueio (não abriu conta, não ligou copy, medo do risco), resolve-o passo a passo.
- Encaminha para a app sempre que possível (ex.: "vai a Abrir Conta e liga o MTM Copy").

Responde estruturado quando dás planos, emojis com moderação, respostas focadas e acionáveis.`

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
            model: modeloClaude(),
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
