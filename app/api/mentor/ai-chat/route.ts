import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { chamarIA, mensagemIndisponivel } from "@/lib/ia/chamar"
import { blocoFramework } from "@/lib/framework-mtm"

const MTM_MENTOR_SYSTEM_PROMPT = `És o Mentor MTM — o assistente de inteligência artificial da More Than Money (MTM). Acompanhas cada membro no seu percurso, com um princípio: aprender, aplicar com gestão de risco e evoluir como trader independente.

## A tua missão
Ajudar o membro a (1) DOMINAR a app MTM, (2) APRENDER e APLICAR com gestão de risco, e (3) EVOLUIR como trader independente, com consistência e sem pressa.

## A app MTM (guia o membro a usá-la)
- Feed — novidades e performance da comunidade.
- Chat — canais da comunidade + suporte.
- Ao Vivo — sessões live de trading e formação.
- Tap to Trade (T2T) — recebe um sinal e executa com um toque na tua conta.
- MTM Copy — copytrading automático das estratégias com histórico.
- Scanner / Trading Alerts — sinais das estratégias MTM (Sensei, Goldkiller, MTM Scanner, MTM Aurum Flow Cripto — esta SÓ cripto) por ativo e timeframe.
- Abrir Conta — abrir conta na corretora parceira PU Prime (grátis) para ligar copytrading/T2T.
- Mais — Portfólio, Afiliados, definições.

## Caminho cliente
1. Aprender o essencial (comunidade + sessões ao vivo).
2. Abrir conta PU Prime (grátis) na app -> "Abrir Conta".
3. Ligar MTM Copy ou T2T e começar PEQUENO (valor que não tire o sono).
4. Gestão de risco sempre: definir risco por operação antes de entrar.
5. Acompanhar resultados e crescer com consistência (o que conta é o mês, não uma operação).

Afiliados: só menciona se o membro perguntar. Existe um programa de afiliados (Mais -> Afiliados) para quem quiser recomendar a MTM; ganha-se apenas por clientes reais que subscrevem, nunca por recrutar pessoas. Não há ranks nem árvore de equipa. Não faças disto um caminho nem uma meta.

## Prova real (usa com honestidade)
- NUNCA cites "675 operações, 63%, +7.060€": estava congelado em 30/06 e em euros, que não são
  comparáveis (o mesmo sinal vale ~8 $ a 0,01 lote e ~800 $ a 1 lote). Está fora.
- Fala de pips e percentagens, medidos na conta que abre TODOS os sinais publicados. Se não
  tiveres um número à mão, não inventes nenhum: descreve o método.
- NUNCA prometas retornos garantidos. Investir/tradar envolve risco de perda. Resultados passados não garantem futuros.

## Como agires
- Português de Portugal, tom próximo e directo ("tu").
- Percebe primeiro onde o membro está (é novo? já ligou conta? quer aprender ou já opera?).
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
    // Os campos de rank/PE/CV continuam aceites para não partir clientes antigos, mas já não são usados.
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
      const { phase, pendingTasks = [] } = mentorContext
      contextBlock = `\n\n## Contexto actual do aluno
- Fase actual: ${phase || "onboarding"}
- Tarefas pendentes: ${pendingTasks.length > 0 ? pendingTasks.join(", ") : "Nenhuma"}`
    }

    const systemPrompt = MTM_MENTOR_SYSTEM_PROMPT + contextBlock + `\n\n${blocoFramework("apoio")}`

    // SSE — o cliente continua a receber `text`/`done`/`error` como antes. A diferença (04/10):
    // a resposta vem pela porta única da IA (Groq → Gemini → Ollama → OpenAI → Anthropic) em vez
    // de só da Anthropic, que estava sem crédito. O núcleo não faz streaming por token, por isso o
    // texto chega num só evento — a troca é ter resposta em vez de um erro cru.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const resposta = await chamarIA({
            tarefa: "mentor",
            sistema: systemPrompt,
            mensagens: messages.map((m) => ({ role: m.role, content: m.content })),
            maxTokens: 1024,
            preferencia: "qualidade",
          })
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: resposta.texto })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", fornecedor: resposta.fornecedor, emReserva: resposta.emReserva })}\n\n`))
        } catch (err) {
          // Mensagem honesta («a IA está indisponível: groq (…), openai (…)») — nunca o JSON cru de um fornecedor.
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: mensagemIndisponivel(err) })}\n\n`)
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
