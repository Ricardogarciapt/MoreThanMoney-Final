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

// ─── Dashboard estruturado (JSON) ────────────────────────────────────────────
export interface TerminalDashboard {
  verdict: { direction: "BULLISH" | "BEARISH" | "NEUTRO"; conviction: "Alto" | "Médio" | "Baixo"; rationale: string }
  sentiment: {
    retailBias: "bullish" | "bearish" | "neutral"
    retailPct: number
    institutional: string
    fearGreed: number
    fearGreedLabel: string
  }
  macro: string[]
  institutions: { name: string; stance: string }[]
  news: { headline: string; impact: "alto" | "medio" | "baixo" }[]
  scenarios: { kind: "bull" | "base" | "bear"; movePct: number; triggers: string }[]
  levels: { supports: number[]; resistances: number[] }
  risks: string[]
  recommendation: { bias: string; timing: string; risk: string }
}

const DASHBOARD_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["BULLISH", "BEARISH", "NEUTRO"] },
        conviction: { type: "string", enum: ["Alto", "Médio", "Baixo"] },
        rationale: { type: "string" },
      },
      required: ["direction", "conviction", "rationale"],
      additionalProperties: false,
    },
    sentiment: {
      type: "object",
      properties: {
        retailBias: { type: "string", enum: ["bullish", "bearish", "neutral"] },
        retailPct: { type: "number" },
        institutional: { type: "string" },
        fearGreed: { type: "number" },
        fearGreedLabel: { type: "string" },
      },
      required: ["retailBias", "retailPct", "institutional", "fearGreed", "fearGreedLabel"],
      additionalProperties: false,
    },
    macro: { type: "array", items: { type: "string" } },
    institutions: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, stance: { type: "string" } },
        required: ["name", "stance"],
        additionalProperties: false,
      },
    },
    news: {
      type: "array",
      items: {
        type: "object",
        properties: { headline: { type: "string" }, impact: { type: "string", enum: ["alto", "medio", "baixo"] } },
        required: ["headline", "impact"],
        additionalProperties: false,
      },
    },
    scenarios: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["bull", "base", "bear"] },
          movePct: { type: "number" },
          triggers: { type: "string" },
        },
        required: ["kind", "movePct", "triggers"],
        additionalProperties: false,
      },
    },
    levels: {
      type: "object",
      properties: {
        supports: { type: "array", items: { type: "number" } },
        resistances: { type: "array", items: { type: "number" } },
      },
      required: ["supports", "resistances"],
      additionalProperties: false,
    },
    risks: { type: "array", items: { type: "string" } },
    recommendation: {
      type: "object",
      properties: { bias: { type: "string" }, timing: { type: "string" }, risk: { type: "string" } },
      required: ["bias", "timing", "risk"],
      additionalProperties: false,
    },
  },
  required: ["verdict", "sentiment", "macro", "institutions", "news", "scenarios", "levels", "risks", "recommendation"],
  additionalProperties: false,
} as const

const DASHBOARD_SYSTEM_PROMPT = `És um analista sénior de mercados (Goldman Sachs / JP Morgan / BlackRock, 20+ anos). Produz uma análise institucional ACIONÁVEL de um ativo, em português europeu, em JSON estruturado para um dashboard.

Preenche todos os campos com dados concretos e números:
- verdict: BULLISH/BEARISH/NEUTRO + convicção + racional curto (1 frase).
- sentiment: retailBias + retailPct (0-100, % de retail bullish), institutional (posicionamento COT/fluxos/smart money, 1 frase), fearGreed (0-100) + label.
- macro: 2-4 pontos macro/geopolíticos que impactam o ativo AGORA (Fed/BCE/inflação/taxas/guerras/eleições).
- institutions: 2-4 instituições (Goldman, JP Morgan, Morgan Stanley, BlackRock, Bridgewater) com a tese/target curto.
- news: 2-4 catalisadores recentes (7-30 dias) com impacto alto/medio/baixo.
- scenarios: EXATAMENTE 3 (kind bull/base/bear) com movePct (% esperada, negativa no bear) + gatilhos.
- levels: 2-3 supports e 2-3 resistances (números plausíveis à volta do preço atual dado).
- risks: 2-4 riscos que invalidam a tese.
- recommendation: bias (direção preferida), timing, risk (gestão de risco). Se for melhor aguardar, diz.

Usa o preço ao vivo fornecido como âncora real. Sê direto e institucional, nada de vago. NÃO incluas texto fora do JSON.`

function isModelNotFoundFetch(status: number, body: string): boolean {
  if (status === 404) return true
  const b = body.toLowerCase()
  return b.includes("not_found") || b.includes("model:")
}

/** Gera o dashboard estruturado (JSON) com fallback de modelo. */
export async function generateTerminalDashboard(
  asset: TerminalAsset,
  quote: TerminalQuote,
): Promise<{ data: TerminalDashboard; model: string }> {
  const userPrompt =
    buildUserPrompt(asset, quote, { timeframe: "1-4 semanas" }) +
    "\n\nResponde APENAS com o objeto JSON válido (sem ```), com esta forma exata:\n" +
    JSON.stringify(DASHBOARD_EXAMPLE)
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  let lastErr = "sem modelo"
  for (const model of modelCandidates()) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 2800,
        system: DASHBOARD_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      lastErr = `Anthropic ${resp.status}: ${body.slice(0, 200)}`
      if (isModelNotFoundFetch(resp.status, body)) continue
      throw new Error(lastErr)
    }
    const json = await resp.json()
    const block = (json.content ?? []).find((b: { type: string }) => b.type === "text")
    const data = parseJsonLoose(block?.text ?? "") as TerminalDashboard
    return { data, model }
  }
  throw new Error(lastErr)
}

/** Extrai o objeto JSON da resposta (tolera ```json fences, vírgulas finais e truncagem). */
function parseJsonLoose(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const start = t.indexOf("{")
  if (start >= 0) t = t.slice(start)
  const end = t.lastIndexOf("}")
  if (end > 0) t = t.slice(0, end + 1)

  const stripTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1")

  try {
    return JSON.parse(stripTrailingCommas(t))
  } catch {
    // JSON possivelmente truncado — remove cauda incompleta e fecha o que ficou aberto
    let repaired = t.replace(/,\s*"[^"]*"?\s*:?\s*[^,{}\[\]]*$/, "")
    const stack: string[] = []
    let inStr = false
    let esc = false
    for (const ch of repaired) {
      if (esc) { esc = false; continue }
      if (ch === "\\") { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === "{") stack.push("}")
      else if (ch === "[") stack.push("]")
      else if (ch === "}" || ch === "]") stack.pop()
    }
    while (stack.length) repaired += stack.pop()
    return JSON.parse(stripTrailingCommas(repaired))
  }
}

const DASHBOARD_EXAMPLE = {
  verdict: { direction: "BULLISH", conviction: "Médio", rationale: "..." },
  sentiment: { retailBias: "bullish", retailPct: 62, institutional: "...", fearGreed: 58, fearGreedLabel: "Ganância" },
  macro: ["...", "..."],
  institutions: [{ name: "Goldman Sachs", stance: "..." }],
  news: [{ headline: "...", impact: "alto" }],
  scenarios: [
    { kind: "bull", movePct: 3.2, triggers: "..." },
    { kind: "base", movePct: 0.8, triggers: "..." },
    { kind: "bear", movePct: -2.1, triggers: "..." },
  ],
  levels: { supports: [0], resistances: [0] },
  risks: ["..."],
  recommendation: { bias: "...", timing: "...", risk: "..." },
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
