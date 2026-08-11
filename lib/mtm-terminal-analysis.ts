import type { TerminalAsset } from "@/lib/mtm-terminal-assets"
import { buildLivePriceContext, type TerminalQuote } from "@/lib/mtm-terminal-quote"
import { buildLevelsContext, type TerminalLevels } from "@/lib/mtm-terminal-levels"

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
- levels: 2-3 supports e 2-3 resistances. Se te forem fornecidos NÍVEIS TÉCNICOS REAIS (calculados de OHLC), usa ESSES números EXATOS; nunca inventes níveis diferentes.
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
  levels?: TerminalLevels | null,
): Promise<{ data: TerminalDashboard; model: string }> {
  const userPrompt =
    buildUserPrompt(asset, quote, { timeframe: "1-4 semanas" }) +
    buildLevelsContext(levels ?? null) +
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
    // Autoridade dos números: se temos níveis REAIS (OHLC), sobrepõem-se ao que o LLM devolveu.
    if (levels && (levels.supports.length || levels.resistances.length)) {
      data.levels = { supports: levels.supports, resistances: levels.resistances }
    }
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
