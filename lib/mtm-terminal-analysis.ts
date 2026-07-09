import Anthropic from "@anthropic-ai/sdk"
import type { TerminalAsset } from "@/lib/mtm-terminal-assets"
import { buildLivePriceContext, type TerminalQuote } from "@/lib/mtm-terminal-quote"

/** Prompt do analista institucional MTM (Terminal Sentimental de Mercado). */
export const TERMINAL_SYSTEM_PROMPT = `És um analista sénior de mercados financeiros, macroeconomia e geopolítica com 20+ anos de experiência em bancos de investimento (Goldman Sachs, JP Morgan, BlackRock). O teu papel é dar uma análise institucional, direta e acionável a traders sobre um ativo específico ANTES deles negociarem.

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

/**
 * Modelos a tentar por ordem. O ANTHROPIC_MODEL configurado vem primeiro (se
 * válido), seguido de modelos comprovadamente disponíveis nesta conta
 * (o webhook TradingView usa claude-opus-4-8). Evita o 404 de modelos inexistentes.
 */
export function modelCandidates(): string[] {
  const configured = process.env.ANTHROPIC_MODEL?.trim()
  const list = [configured, "claude-opus-4-8", "claude-3-5-sonnet-20241022"].filter(
    (m): m is string => Boolean(m)
  )
  return [...new Set(list)]
}

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function isModelNotFound(err: unknown): boolean {
  const e = err as { status?: number; error?: { error?: { type?: string } }; message?: string }
  if (e?.status === 404) return true
  const msg = (e?.message || "").toLowerCase()
  return msg.includes("not_found") || msg.includes("model:")
}

export function buildUserPrompt(
  asset: TerminalAsset,
  quote: TerminalQuote,
  opts?: { timeframe?: string; question?: string }
): string {
  const liveContext = buildLivePriceContext(asset, quote)
  return `Faz a análise institucional completa do ativo **${asset.name} (${asset.symbol})**${
    opts?.timeframe ? `, com foco no horizonte de ${opts.timeframe}` : ""
  }.${liveContext}${opts?.question ? `\n\nPergunta adicional do trader: ${opts.question}` : ""}`
}

/** Geração NÃO-streaming (usada pelo cron diário). Tenta modelos com fallback. */
export async function generateTerminalAnalysis(
  asset: TerminalAsset,
  quote: TerminalQuote,
  opts?: { timeframe?: string; question?: string }
): Promise<{ text: string; model: string }> {
  const userPrompt = buildUserPrompt(asset, quote, opts)
  let lastErr: unknown
  for (const model of modelCandidates()) {
    try {
      const res = await anthropic.messages.create({
        model,
        max_tokens: 2500,
        system: TERMINAL_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      const block = res.content.find((b) => b.type === "text") as { text?: string } | undefined
      return { text: block?.text ?? "", model }
    } catch (err) {
      lastErr = err
      if (isModelNotFound(err)) continue // tenta o próximo modelo
      throw err
    }
  }
  throw lastErr ?? new Error("Nenhum modelo Anthropic disponível")
}

/**
 * Streaming com fallback de modelo. Chama onText por cada pedaço.
 * Só faz fallback se o erro ocorrer ANTES de qualquer texto (para não duplicar).
 */
export async function streamTerminalAnalysis(
  asset: TerminalAsset,
  quote: TerminalQuote,
  onText: (chunk: string) => void,
  opts?: { timeframe?: string; question?: string }
): Promise<void> {
  const userPrompt = buildUserPrompt(asset, quote, opts)
  let lastErr: unknown
  for (const model of modelCandidates()) {
    let yielded = false
    try {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 2500,
        system: TERMINAL_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      })
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          yielded = true
          onText(chunk.delta.text)
        }
      }
      return // sucesso
    } catch (err) {
      lastErr = err
      if (!yielded && isModelNotFound(err)) continue // modelo inexistente → próximo
      throw err
    }
  }
  throw lastErr ?? new Error("Nenhum modelo Anthropic disponível")
}
