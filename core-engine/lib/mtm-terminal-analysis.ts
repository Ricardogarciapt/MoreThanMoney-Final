import Anthropic from "@anthropic-ai/sdk"
import type { TerminalAsset } from "@/lib/mtm-terminal-assets"
import { buildLivePriceContext, type TerminalQuote } from "@/lib/mtm-terminal-quote"
import {
  buildLevelsContext,
  buildTechnicalsContext,
  type TerminalLevels,
  type TerminalTechnicals,
} from "@/lib/mtm-terminal-technicals"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * Modelos a tentar por ordem: MTM_TERMINAL_MODEL (só para o Terminal) → ANTHROPIC_MODEL →
 * claude-sonnet-5 → claude-opus-5. Um 404 / «modelo desconhecido» passa ao seguinte.
 * (Também usado pela gestão de trade dos Alertas MTM.)
 */
export function modelCandidates(): string[] {
  const list = [
    process.env.MTM_TERMINAL_MODEL?.trim(),
    process.env.ANTHROPIC_MODEL?.trim(),
    "claude-sonnet-5",
    "claude-opus-5",
  ].filter((m): m is string => Boolean(m))
  return [...new Set(list)]
}

/**
 * Geração 5 / 4.6+: aceitam `effort` e RECUSAM `temperature` (400).
 * ATENÇÃO: isto diz respeito SÓ ao `effort`/`temperature`. As saídas estruturadas
 * (`output_config.format`) são aceites por modelos mais antigos (ex.: claude-sonnet-4-5) e têm de
 * ser enviadas SEMPRE — ver `structuredFormat()`.
 */
export function isCurrentGenModel(model: string): boolean {
  return /claude-(sonnet|opus|fable|mythos)-5|claude-opus-4-[678]|claude-sonnet-4-6/.test(model)
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface TerminalSource {
  title: string
  url: string
}

export interface TerminalDashboard {
  verdict: { direction: "BULLISH" | "BEARISH" | "NEUTRO"; conviction: "Alto" | "Médio" | "Baixo"; rationale: string }
  macro: string[]
  scenarios: { kind: "bull" | "base" | "bear"; movePct: number; triggers: string }[]
  levels: { supports: number[]; resistances: number[] }
  risks: string[]
  recommendation: { bias: string; timing: string; risk: string }
  /** Só com pesquisa web e fonte verificada (URL devolvido pela pesquisa). */
  news: { headline: string; impact: "alto" | "medio" | "baixo"; source?: string }[]
  /** Com que dados foi gerada — a página mostra-o. */
  grounding?: {
    asOf: string
    price: number | null
    priceSource: string
    webSearch: boolean
    signals: number
    sources: TerminalSource[]
  }
  /** Campos antigos (análises de antes de 2026-09-15): a página ignora-os. */
  sentiment?: unknown
  institutions?: unknown
}

const CORE_PROPS = {
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
  macro: { type: "array", items: { type: "string" } },
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
  risks: { type: "array", items: { type: "string" } },
  recommendation: {
    type: "object",
    properties: { bias: { type: "string" }, timing: { type: "string" }, risk: { type: "string" } },
    required: ["bias", "timing", "risk"],
    additionalProperties: false,
  },
} as const

const DASHBOARD_SCHEMA = {
  type: "object",
  properties: CORE_PROPS,
  required: ["verdict", "macro", "scenarios", "risks", "recommendation"],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `És o analista do Terminal MTM. Produzes uma leitura EDUCACIONAL de um ativo, em português europeu, em JSON para um dashboard.

REGRA PRINCIPAL — só afirmas o que está nos DADOS fornecidos${"{{WEB}}"}. É proibido inventar:
- recordes, máximos/mínimos históricos, níveis de preço, percentagens ou datas que não estejam nos dados;
- notícias, decisões de bancos centrais, dados económicos, posições de instituições, COT, sentimento retail, «Fear & Greed»;
- eventos do calendário económico (não há calendário nos dados — não cites eventos agendados).
Se um dado não existe, não o preenchas com conhecimento de memória: a tua memória está desatualizada e o preço de hoje pode estar muito longe do que te lembras.

Campos:
- verdict: BULLISH/BEARISH/NEUTRO + convicção + 1 frase apoiada nos técnicos fornecidos (regime, EMAs, RSI, posição no intervalo).
- macro: 2-3 fatores ESTRUTURAIS que costumam mexer neste ativo, escritos como condições («se o dólar fortalecer…», «dados de inflação acima do esperado tendem a…»), sem afirmar que aconteceram.
- scenarios: EXATAMENTE 3 (bull/base/bear). movePct plausível face ao ATR fornecido (negativo no bear). Gatilhos ligados aos níveis fornecidos.
- risks: 2-3 riscos que invalidam a leitura, ligados aos níveis/técnicos fornecidos.
- recommendation: bias, timing, risk (gestão de risco: stop técnico além do nível, tamanho de posição prudente). Se o quadro for misto, recomenda aguardar.
- Sinais MTM recentes: podes referi-los só com o que está nos dados (direção, hora); nunca inventes o desfecho.

Tom: direto e educacional. Nunca prometas lucro nem uses «garantido». Nunca fales em euros; resultados só em pips, pontos ou %.`

/** Forma literal do JSON, para quando não se pode enviar o schema (pesquisa web). */
const SHAPE_HINT = `{
  "verdict": { "direction": "BULLISH"|"BEARISH"|"NEUTRO", "conviction": "Alto"|"Médio"|"Baixo", "rationale": "..." },
  "macro": ["...", "..."],
  "scenarios": [{ "kind": "bull"|"base"|"bear", "movePct": <número>, "triggers": "..." }],
  "risks": ["...", "..."],
  "recommendation": { "bias": "...", "timing": "...", "risk": "..." },
  "news": [{ "headline": "...", "impact": "alto"|"medio"|"baixo", "source": "<URL exato da pesquisa>" }]
}`

const WEB_RULES = ` ou em resultados da pesquisa web que fizeres agora. Podes pesquisar notícias dos últimos 7 dias sobre o ativo; cada notícia em «news» tem de ter «source» = URL exato de um resultado da pesquisa. Sem fonte, não entra`

// ─── Contexto ────────────────────────────────────────────────────────────────
export interface RecentSignal {
  action: string | null
  price: number | null
  alertName: string | null
  status: string | null
  receivedAt: string
}

/** Últimos sinais MTM (7 dias) do ativo — só na geração, nunca por visita. */
export async function fetchRecentSignals(asset: TerminalAsset): Promise<RecentSignal[]> {
  try {
    const needle = asset.type === "crypto" ? asset.symbol.replace(/USD$/, "") : asset.brokerSymbol ?? asset.symbol
    const since = new Date(Date.now() - 7 * 86400_000).toISOString()
    const { data } = await getSupabaseAdmin()
      .from("tradingview_signals")
      .select("action, price, alert_name, trade_status, received_at")
      .ilike("ticker", `%${needle}%`)
      .or("signal_kind.is.null,signal_kind.eq.entry")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(5)
      .abortSignal(AbortSignal.timeout(5_000))
    return (data ?? []).map((r) => ({
      action: r.action ?? null,
      price: r.price != null && Number.isFinite(Number(r.price)) ? Number(r.price) : null,
      alertName: r.alert_name ?? null,
      status: r.trade_status ?? null,
      receivedAt: String(r.received_at),
    }))
  } catch {
    return []
  }
}

function buildSignalsContext(signals: RecentSignal[]): string {
  if (!signals.length) return "\n\n[SINAIS MTM — últimos 7 dias]: nenhum para este ativo."
  return `\n\n[SINAIS MTM — últimos 7 dias, mais recente primeiro]:\n${signals
    .map((s) => `- ${s.receivedAt} · ${s.action ?? "?"} @ ${s.price ?? "?"} · ${s.alertName ?? ""} · estado ${s.status ?? "n/d"}`)
    .join("\n")}`
}

export interface AnalysisInput {
  asset: TerminalAsset
  quote: TerminalQuote
  levels: TerminalLevels | null
  technicals: TerminalTechnicals | null
  signals: RecentSignal[]
}

export function buildUserPrompt(input: AnalysisInput): string {
  const now = new Date().toISOString()
  return `Leitura do ativo ${input.asset.name} (${input.asset.symbol}) para as próximas 1-4 semanas. Agora: ${now}.${buildLivePriceContext(
    input.asset,
    input.quote,
  )}${buildLevelsContext(input.levels)}${buildTechnicalsContext(input.technicals)}${buildSignalsContext(input.signals)}
\n[CALENDÁRIO ECONÓMICO]: não disponível.`
}

// ─── Geração ─────────────────────────────────────────────────────────────────
function webSearchEnabled(model: string): boolean {
  return process.env.MTM_TERMINAL_WEB_SEARCH === "1" && isCurrentGenModel(model)
}

/**
 * Parâmetros que dependem do modelo. A regra que PARTIU a página: o `format` (saída estruturada)
 * estava preso ao mesmo teste do `effort`, por isso um modelo da geração anterior
 * (ANTHROPIC_MODEL=claude-sonnet-4-5) ficava SEM schema e inventava os nomes das chaves
 * (`bias`/`summary`/`name` em vez de `direction`/`rationale`/`kind`) — a análise era guardada oca.
 * · `effort`: só na geração atual (sonnet-4-5 → 400 «does not support the effort parameter»).
 * · `format`: em TODOS os modelos (verificado contra a API em sonnet-4-5 e sonnet-5).
 * · `temperature`: só fora da geração atual (4.6+ devolve 400).
 */
export function modelTuning(
  model: string,
  format: { type: "json_schema"; schema: Record<string, unknown> } | null,
): { output_config?: Record<string, unknown>; temperature?: number } {
  const current = isCurrentGenModel(model)
  const output_config: Record<string, unknown> = {}
  if (current) output_config.effort = "low"
  if (format) output_config.format = format
  return {
    ...(Object.keys(output_config).length ? { output_config } : {}),
    ...(current ? {} : { temperature: 0.2 }),
  }
}

function isModelUnavailable(err: unknown): boolean {
  if (err instanceof Anthropic.NotFoundError) return true
  if (err instanceof Anthropic.BadRequestError) {
    const m = String(err.message).toLowerCase()
    return m.includes("model") || m.includes("not supported") || m.includes("effort") || m.includes("output_config")
  }
  return false
}

/**
 * Gera o dashboard. `deadlineMs` é o tempo total disponível (rota: ~100 s; cron: por ativo).
 * Os níveis finais são SEMPRE os calculados, nunca os do modelo.
 */
export async function generateTerminalDashboard(
  input: AnalysisInput,
  opts: { deadlineMs?: number } = {},
): Promise<{ data: TerminalDashboard; model: string }> {
  const started = Date.now()
  const deadline = started + (opts.deadlineMs ?? 100_000)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 0 })
  const userPrompt = buildUserPrompt(input)
  let lastErr: unknown = new Error("sem modelo configurado")

  for (const model of modelCandidates()) {
    const remaining = deadline - Date.now()
    if (remaining < 10_000) break
    const current = isCurrentGenModel(model)
    const web = webSearchEnabled(model)
    const system = SYSTEM_PROMPT.replace("{{WEB}}", web ? WEB_RULES : "")
    // O schema vai SEMPRE que não há pesquisa web (é o que obriga o modelo às chaves certas:
    // direction/rationale/kind). Só a pesquisa web o dispensa, porque não pode ir com `tools`.
    const format = web
      ? null
      : { type: "json_schema" as const, schema: DASHBOARD_SCHEMA as unknown as Record<string, unknown> }

    try {
      const messages: Anthropic.MessageParam[] = [
        {
          role: "user",
          content:
            userPrompt +
            // Com pesquisa web não há schema (não pode ir com `tools`), por isso a FORMA tem de ir
            // escrita — incluindo as sub-chaves. Foi o que faltou e deu veredito e cenários vazios.
            (web ? `\n\nResponde no fim APENAS com um objeto JSON com esta forma exata:\n${SHAPE_HINT}` : ""),
        },
      ]
      const sources = new Map<string, TerminalSource>()
      let text = ""
      // pause_turn (pesquisa web longa) → continua a mesma volta, no máximo 3 vezes.
      for (let turn = 0; turn < 3; turn++) {
        const left = deadline - Date.now()
        if (left < 5_000) throw new Error("tempo esgotado a gerar a análise")
        const resp = await client.messages.create(
          {
            model,
            max_tokens: 4_000,
            system,
            messages,
            ...modelTuning(model, format),
            ...(web ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3 }] } : {}),
          },
          { timeout: left },
        )
        for (const block of resp.content) {
          if (block.type === "text") {
            text += block.text
            for (const c of block.citations ?? []) {
              if (c.type === "web_search_result_location") sources.set(c.url, { title: c.title ?? c.url, url: c.url })
            }
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) sources.set(r.url, { title: r.title, url: r.url })
          }
        }
        if (resp.stop_reason === "refusal") throw new Error("o modelo recusou gerar esta análise")
        if (resp.stop_reason !== "pause_turn") break
        messages.push({ role: "assistant", content: resp.content })
      }

      const parsed = parseJsonLoose(text) as Partial<TerminalDashboard>
      const data = normaliseDashboard(parsed, input, sources, web)
      // Uma análise oca (sem leitura nem cenários) NÃO se guarda: era o que enchia a página de
      // cartões vazios em silêncio. Vale mais tentar o modelo seguinte e, se nenhum servir, falhar.
      const faltam = missingDashboardParts(data)
      if (faltam.length) {
        lastErr = new Error(`o modelo ${model} devolveu uma análise incompleta (${faltam.join(", ")})`)
        continue
      }
      return { data, model }
    } catch (err) {
      lastErr = err
      if (isModelUnavailable(err)) continue
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * O que falta a um dashboard para ser mostrável. Vazio = está bom.
 * Sem isto, um modelo que invente os nomes das chaves passa como sucesso e a página fica oca.
 */
export function missingDashboardParts(d: TerminalDashboard): string[] {
  const faltam: string[] = []
  if (!d.verdict.rationale.trim()) faltam.push("leitura do veredito")
  if (!d.scenarios.length) faltam.push("cenários")
  if (!d.recommendation.bias.trim()) faltam.push("recomendação")
  return faltam
}

/** Sinónimos que os modelos sem schema costumam usar em vez das chaves pedidas. */
const CONVICTION_ALIASES: Record<string, "Alto" | "Médio" | "Baixo"> = {
  alta: "Alto", alto: "Alto", high: "Alto",
  média: "Médio", media: "Médio", médio: "Médio", medio: "Médio", medium: "Médio",
  baixa: "Baixo", baixo: "Baixo", low: "Baixo",
}

/** Aceita movePct como número ou como texto («+4,9 %», «-3.7%»). */
function toMovePct(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").replace(/[^0-9.+-]/g, ""))
    if (Number.isFinite(n)) return n
  }
  return null
}

/** Garante a forma, impõe os níveis calculados e deita fora notícias sem fonte verificada. */
export function normaliseDashboard(
  p: Partial<TerminalDashboard>,
  input: AnalysisInput,
  sources: Map<string, TerminalSource>,
  web: boolean,
): TerminalDashboard {
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 4) : [])
  // Sem schema, o modelo escreve `bias`/`summary` em vez de `direction`/`rationale` — aceita-se
  // o sinónimo em vez de deitar a análise fora.
  const v = (p.verdict ?? {}) as Record<string, unknown>
  const dir = String(v.direction ?? v.bias ?? "").toUpperCase()
  const conv = CONVICTION_ALIASES[String(v.conviction ?? "").trim().toLowerCase()]
  const news = Array.isArray(p.news)
    ? p.news.filter((n) => n && typeof n.headline === "string" && typeof n.source === "string" && sources.has(n.source)).slice(0, 4)
    : []
  return {
    verdict: {
      direction: dir === "BULLISH" || dir === "BEARISH" ? dir : "NEUTRO",
      conviction: conv ?? "Médio",
      rationale: String(v.rationale ?? v.summary ?? ""),
    },
    macro: strArr(p.macro),
    scenarios: Array.isArray(p.scenarios)
      ? p.scenarios
          .map((raw) => {
            const s = (raw ?? {}) as Record<string, unknown>
            // `kind` pode vir no próprio nome do cenário («Bull – rutura acima da EMA20»).
            const label = String(s.kind ?? s.name ?? "").toLowerCase()
            const kind = (["bull", "base", "bear"] as const).find((k) => label.startsWith(k) || label.includes(k))
            const movePct = toMovePct(s.movePct ?? s.move_pct)
            if (!kind || movePct == null) return null
            return { kind, movePct, triggers: String(s.triggers ?? s.trigger ?? "") }
          })
          .filter((s): s is { kind: "bull" | "base" | "bear"; movePct: number; triggers: string } => s !== null)
          .slice(0, 3)
      : [],
    levels: { supports: input.levels?.supports ?? [], resistances: input.levels?.resistances ?? [] },
    risks: strArr(p.risks),
    recommendation: {
      bias: String(p.recommendation?.bias ?? ""),
      timing: String(p.recommendation?.timing ?? ""),
      risk: String(p.recommendation?.risk ?? ""),
    },
    news: news.map((n) => ({ headline: n.headline, impact: n.impact === "alto" || n.impact === "baixo" ? n.impact : "medio", source: n.source })),
    grounding: {
      asOf: new Date().toISOString(),
      price: input.quote.price,
      priceSource: input.quote.source,
      webSearch: web,
      signals: input.signals.length,
      sources: news.map((n) => sources.get(n.source as string)!).filter(Boolean),
    },
  }
}

/** Extrai o objeto JSON da resposta (tolera ```json fences, texto antes, vírgulas finais e truncagem). */
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

// ─── Pipeline completo (rota + cron) ─────────────────────────────────────────
/** Preço ao vivo → velas → níveis/técnicos → sinais → modelo. Devolve a linha pronta a guardar. */
export async function buildAndGenerate(asset: TerminalAsset, opts: { deadlineMs?: number } = {}) {
  const { fetchLiveQuote } = await import("@/lib/mtm-terminal-quote")
  const { fetchTerminalCandleSeries } = await import("@/lib/mtm-terminal-levels")
  const { basisAdjust, computeTerminalLevels, computeTechnicals } = await import("@/lib/mtm-terminal-technicals")
  const started = Date.now()
  const [quote, series, signals] = await Promise.all([fetchLiveQuote(asset), fetchTerminalCandleSeries(asset), fetchRecentSignals(asset)])
  const { candles } = series
  // sameLevel da referência que DEU as velas (a de reserva do ouro/prata tem de ser reescalada).
  const adj = quote.price != null ? basisAdjust(candles, quote.price, series.ref.sameLevel).candles : candles
  const levels = quote.price != null ? computeTerminalLevels(adj, quote.price) : null
  const technicals = quote.price != null ? computeTechnicals(adj, quote.price) : null
  const deadlineMs = (opts.deadlineMs ?? 100_000) - (Date.now() - started)
  const { data, model } = await generateTerminalDashboard({ asset, quote, levels, technicals, signals }, { deadlineMs })
  return { dashboard: data, quote, model }
}
