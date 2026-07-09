import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import Anthropic from "@anthropic-ai/sdk"
import { findTerminalAsset } from "@/lib/mtm-terminal-assets"
import { fetchTerminalQuote, buildLivePriceContext } from "@/lib/mtm-terminal-quote"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/** Prompt do analista institucional MTM (Terminal Sentimental de Mercado). */
const TERMINAL_SYSTEM_PROMPT = `És um analista sénior de mercados financeiros, macroeconomia e geopolítica com 20+ anos de experiência em bancos de investimento (Goldman Sachs, JP Morgan, BlackRock). O teu papel é dar uma análise institucional, direta e acionável a traders sobre um ativo específico ANTES deles negociarem.

Deves produzir uma resposta ESTRUTURADA em Markdown com EXATAMENTE as seguintes secções, em português europeu:

## 🎯 Veredicto Rápido
Uma frase clara: **BULLISH**, **BEARISH** ou **NEUTRO** com nível de convicção (Alto/Médio/Baixo). Adiciona 1 linha de racional.

## 📊 Sentimento de Mercado
- **Sentimento Retail:** (Bullish/Bearish + % estimada)
- **Sentimento Institucional:** (posicionamento COT, fluxos, smart money)
- **Fear & Greed:** valor estimado e interpretação

## 🌍 Contexto Macro & Geopolítico
Fatores macro relevantes (Fed, BCE, inflação, taxas, emprego, PIB) e riscos geopolíticos ativos (guerras, eleições, tensões comerciais) que impactam este ativo AGORA.

## 🏦 O Que Esperam as Grandes Instituições
Posicionamento e teses de Goldman Sachs, JP Morgan, Morgan Stanley, BlackRock, Bridgewater. Price targets recentes se conhecidos.

## 📰 Análise de Notícias Recentes
Principais catalisadores/notícias dos últimos 7-30 dias que movem o preço.

## 📈 Cenários de Movimento (Próximas 1-4 Semanas)
- **Cenário Bullish:** movimento esperado em % + gatilhos
- **Cenário Base:** movimento esperado em % + gatilhos
- **Cenário Bearish:** movimento esperado em % + gatilhos
- **Níveis Chave:** suporte e resistência aproximados

## ⚠️ Riscos & Alertas
Riscos específicos que podem invalidar a tese. Eventos de calendário económico próximos a vigiar.

## 🎓 Recomendação para Traders
Direção preferida, timing, gestão de risco. Se é melhor aguardar, dizê-lo. Lembra que isto é análise educativa, não conselho financeiro.

REGRAS:
- Sê DIRETO e INSTITUCIONAL. Nada de linguagem vaga tipo "pode subir ou descer".
- Se não tens dados em tempo real, usa o contexto conhecido do teu treino + raciocínio macro estrutural, e sinaliza explicitamente onde precisas de confirmação em tempo real.
- Usa números, percentagens e níveis específicos.
- Termina sempre com: *"⚠️ Análise educacional. Não constitui aconselhamento financeiro."*
Relatório de Análise.`

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

/** Acesso: admin, vip ou premium (mesma regra das Apps MTM). */
function canAccessTerminal(profile: {
  user_type?: string | null
  member_category?: string | null
  subscription_plan?: string | null
  is_active?: boolean | null
} | null): boolean {
  if (!profile || profile.is_active === false) return false
  if (profile.user_type === "admin") return true
  if (profile.user_type === "vip" || profile.member_category === "vip") return true
  return (
    profile.member_category === "iq" ||
    profile.member_category === "premium" ||
    profile.subscription_plan === "premium"
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type, member_category, subscription_plan, is_active")
      .eq("id", session.user.id)
      .single()

    if (!canAccessTerminal(profile)) {
      return NextResponse.json(
        { error: "Acesso exclusivo a membros Premium, VIP e Admin." },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { symbol, timeframe, question } = body as {
      symbol?: string
      timeframe?: string
      question?: string
    }

    const asset = symbol ? findTerminalAsset(symbol) : undefined
    if (!asset) {
      return NextResponse.json({ error: "Ativo inválido" }, { status: 400 })
    }

    // Enriquecer com preço ao vivo (fontes existentes)
    const quote = await fetchTerminalQuote(asset)
    const liveContext = buildLivePriceContext(asset, quote)

    const userPrompt = `Faz a análise institucional completa do ativo **${asset.name} (${asset.symbol})**${
      timeframe ? `, com foco no horizonte de ${timeframe}` : ""
    }.${liveContext}${
      question ? `\n\nPergunta adicional do trader: ${question}` : ""
    }`

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Enviar cotação primeiro para o cliente ancorar o cabeçalho
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "quote", quote, symbol: asset.symbol, tvSymbol: asset.tvSymbol })}\n\n`
          )
        )
        try {
          const anthropicStream = await anthropic.messages.stream({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
            max_tokens: 2500,
            system: TERMINAL_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
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
    console.error("Erro no Terminal MTM:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
