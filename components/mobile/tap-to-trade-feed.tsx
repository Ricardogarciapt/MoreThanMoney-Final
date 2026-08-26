"use client"

import { t2tMode } from "@/lib/mtmcopy/t2t-source"
import { pipSizeForSymbol, unitFor } from "@/lib/mtmcopy/trade-outcome"

import { useCallback, useEffect, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { useT } from "@/components/i18n-provider"
import { supabase } from "@/lib/supabase"
import { T2T_BROKERS } from "@/lib/mtmcopy/t2t-brokers"
import { isAllowedT2TSource, matchesT2TPrefs, T2T_SOURCES, T2T_ASSET_CLASSES } from "@/lib/mtmcopy/t2t-source"
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Settings,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Wallet,
  Clock,
  Trash2,
} from "lucide-react"
import MtmAutoMetricas from "@/components/mobile/mtm-auto-metricas"

const FOLLOWUP_RE = /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|entry\s*hit|(alvo\s+(final|\d)|stop\s+loss|trailing\s+ativo)\s*·)/i
/** Encerra mesmo a ideia (ao contrário de um BE ou de um TP1, que a deixam a correr). */
const TERMINAL_RE = /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i
const DIR_RE = /(\b(buy|sell|long|short|compra|venda)\b|🟢|🔴)/i
/** Sensei: só a "Entry Alert / Ideia Activada" (entrada activada) é um sinal válido. */
const SENSEI_ACTIVE_RE = /(entrada\s+activ|entrada\s+ativ|ideia\s+activ|ideia\s+ativ|entry\s+alert)/i
/** Mensagens de performance/resumo/saída — não são sinais negociáveis. */
const PERF_RE = /(performance|resultado\s+do\s+dia|resumo|recap|relat[óo]rio|estat[íi]stic|balan[çc]o|total\s+de\s+pips|pips\s+(de\s+)?(hoje|esta\s+semana|do\s+dia)|fecho\s+do\s+dia|lucro\s+do\s+dia)/i

/** Só sinais de ENTRADA válidos passam (saídas/performance/incompletos são excluídos). */
function isEntrySignal(channelSlug: string, content?: string | null): boolean {
  if (!content) return false
  if (!isAllowedT2TSource(channelSlug, content)) return false // só Premium/Sensei/James/PrimeVerse
  if (FOLLOWUP_RE.test(content)) return false // saídas / TP hit / fecho / SL / cancelado
  if (PERF_RE.test(content)) return false // performance / resumo do dia
  if (!DIR_RE.test(content)) return false // precisa de direção
  if (!/\d{2,}/.test(content)) return false // precisa de preço
  // Entrada COMPLETA: exige TP (alvo). Exclui updates só-SL / "Ref:" → não são negociáveis.
  if (!/\btp\s*\d|\btp\s*:|take\s*profit|🎯/i.test(content)) return false
  // Sensei: exige o alerta de entrada activada COMPLETO (entrada + SL + TP)
  if (channelSlug === "sensei-scanner") {
    const activated = SENSEI_ACTIVE_RE.test(content)
    const hasSL = /stop\s*loss|🛑/i.test(content)
    const hasTP = /take\s*profit|tp\s*\d/i.test(content)
    if (!(activated && hasSL && hasTP)) return false
  }
  return true
}

const CHANNEL_LABEL: Record<string, string> = {
  "sensei-scanner": "Sensei Scanner",
  "premium-ideas": "Premium · Ouro",
  "trade-ideas-setup": "Ideias Forex",
  "trade-ideas": "Trade Ideas",
  "sinais-goldkiller": "GoldKiller",
}

function directionOf(content: string): "BUY" | "SELL" | "" {
  const c = content.toLowerCase()
  // PALAVRAS primeiro (a 1ª ocorrência ganha) — só depois emojis. Um "GOLD SELL SETUP"
  // com marcador 🟢 no texto era classificado BUY porque o emoji era testado primeiro.
  const buyIdx = c.search(/\b(buy|long|compra)\b/)
  const sellIdx = c.search(/\b(sell|short|venda)\b/)
  if (buyIdx >= 0 && (sellIdx < 0 || buyIdx < sellIdx)) return "BUY"
  if (sellIdx >= 0) return "SELL"
  if (/🔴/.test(content)) return "SELL"
  if (/🟢|🔵/.test(content)) return "BUY"
  return ""
}

/** Tempo máximo para um sinal estar ativo (5 minutos) — entradas A MERCADO. */
const T2T_MAX_AGE_MS = 5 * 60 * 1000
/** Setups PENDENTES (entrada por zona/limite ainda por tocar) ficam aceitáveis até 24h, enquanto
 *  não forem ativados/fechados por um follow-up. Pedido Ricardo 2026-08-18 (espelha o servidor). */
const T2T_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/**
 * O sinal traz um NÍVEL de entrada (zona/limite)? Decide a validade: com nível é um setup
 * PENDENTE e vale 24h; sem nível é "a mercado" e morre em 5 minutos.
 *
 * A zona nem sempre vem etiquetada. O Golden Moves escreve-a a seco — «I'm buying XAUUSD ⏎
 * 4606-4602 ⏎ TP1 4609» — e como aqui só se procurava a PALAVRA «entrada/zona», todos os sinais
 * dele caíam na janela dos 5 minutos e desapareciam do Tap to Trade antes de alguém lhes tocar.
 * Eram 239 mensagens em duas semanas contra 560 com nível reconhecido.
 *
 * E a etiqueta nem sempre encosta ao número: o Sensei escreve «Entrada activada: 4637.54», com
 * uma palavra pelo meio — com `\s*:?\s*` ficava de fora e os alertas dele expiravam em 5 minutos.
 */
function hasEntryLevel(content?: string | null): boolean {
  if (!content) return false
  if (/(entrada|entry|zona|zone)[^\n\d]{0,20}[0-9]+[.,]?[0-9]*/i.test(content)) return true
  // Zona sem etiqueta, em linha própria: «4606-4602» / «4642.50 - 4638».
  return /^\s*\d{2,7}(?:[.,]\d+)?\s*[-–—]\s*\d{2,7}(?:[.,]\d+)?\s*$/m.test(content)
}

/** Extrai o símbolo do sinal (para emparelhar com follow-ups TP/fecho). */
function symbolOf(content: string): string | null {
  const c = content.toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|NAS100|US30|US500|GER40|UK100|JP225|SPX500|BTCUSD|ETHUSD|SOLUSD|XRPUSD)\b/) ||
    c.match(/\b[A-Z]{3}(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/) ||
    c.match(/\bXAU\b|\bGOLD\b/)
  return m ? m[0] : null
}

/**
 * Extrai os campos estruturados de um sinal (símbolo, direção, entrada, SL, TPs)
 * a partir do texto cru — que chega em formatos diferentes por fonte (Premium literal
 * do Telegram, "📡 PrimeVerse", master-poll "🟢 XAUUSD BUY"). Serve SÓ para o card
 * harmonizado do tab T2T; NÃO altera o texto guardado nem os chats.
 */
interface SignalFields {
  symbol: string | null
  direction: "BUY" | "SELL" | ""
  entry: string | null   // preço ou "Mercado"
  sl: string | null
  tps: string[]
}
function parseSignalFields(content: string): SignalFields {
  const numRe = "(\\d+(?:[.,]\\d+)?)"
  const entryM = content.match(new RegExp(`(?:entrada|entry|entrar)\\s*[:=]?\\s*${numRe}`, "i"))
  const marketM = /(?:entrada|entry)\s*[:=]?\s*(mercado|market)/i.test(content)
  const slM = content.match(new RegExp(`(?:sl|stop\\s?loss|stoploss|s\\/l)\\s*[:=]?\\s*${numRe}`, "i"))
  const tps: string[] = []
  const seen = new Set<string>()
  for (const m of content.matchAll(new RegExp(`(?:tp\\s*\\d*|take\\s?profit\\s*\\d*|alvo\\s*\\d*|target\\s*\\d*)\\s*[:=]?\\s*${numRe}`, "gi"))) {
    const v = m[1]
    if (v && !seen.has(v)) { seen.add(v); tps.push(v) }
  }
  return {
    symbol: symbolOf(content),
    direction: directionOf(content),
    entry: entryM ? entryM[1] : marketM ? "Mercado" : null,
    sl: slM ? slM[1] : null,
    tps,
  }
}

interface TapPreviewAccount {
  id: string
  label: string
  equity: number | null
  lot: number | null
  lotMode: string | null
  riskPct: number | null
  riskAmount: number | null
  /** Risco REAL do lote que vai ser enviado (o piso de 0,01 do broker pode subi-lo). */
  realRiskPct?: number | null
  /** Tecto configurado, quando o risco real o ultrapassa. */
  overCap?: number | null
  available: boolean
}

interface TapPreview {
  mode: "execute" | "follow"
  trade: {
    symbol: string
    direction: "buy" | "sell"
    entry: number | null
    sl: number | null
    tps: number[]
    stopPips: number | null
    channel: string
  }
  accounts: TapPreviewAccount[]
  /** Contas que NÃO podem aceitar, com o motivo — ver a rota de preview. */
  blocked?: Array<{ id: string; label: string; motivo: string; comoResolver: string }>
}

interface Sig {
  id: string
  channel_slug: string
  content: string
  created_at: string
  expired?: boolean
  reason?: string
  /** Desfecho gravado pelo servidor (pips e percentagem). Ver lib/mtmcopy/signal-outcomes. */
  outcome?: { label?: string; pips?: number; pct?: number | null } | null
  /** Desfecho já resolvido para leitura (etiqueta pronta). */
  desfecho?: string
}

interface Conn {
  id: string
  account_label?: string | null
  metaapi_account_id?: string | null
  mt5_login?: string | number | null
  mt5_server?: string | null
  mt5_platform?: string | null
  mt5_status?: string | null
  last_error?: string | null
  lot_mode?: string | null
  lot_value?: number | null
  max_risk_percent?: number | null
  copy_sl?: boolean | null
  copy_tp?: boolean | null
  is_active?: boolean | null
  balance?: number | null
  broker_name?: string | null
  auto_trailing_stop?: boolean | null
  trailing_stop_points?: number | null
  exit_pct_tp1?: number | null
  exit_pct_tp2?: number | null
  exit_pct_tp3?: number | null
  t2t_sources?: string[] | null
  t2t_asset_classes?: string[] | null
  t2t_risk_level?: string | null
  t2t_enabled?: boolean | null
}

/** Preset de risco → risco por trade (%). */
const RISK_PRESET: Record<string, number> = { low: 0.5, medium: 1, high: 2 }
const RISK_LABEL: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto" }

/**
 * Desfecho de um sinal terminado, em pips e percentagem.
 *
 * Os pips vêm do que a FONTE anunciou ("HIT TP3 ✅ +200PIPS", "SL HIT −100PIPS") — é o número
 * que o cliente viu no chat, e reescrevê-lo com o nosso cálculo só criaria discórdia. A
 * percentagem é derivada desses pips com o tamanho de pip canónico e a entrada do setup, para
 * ser a mesma conta que o resto do sistema faz.
 */
function desfechoDoSinal(setup: Sig, fecho: Sig | undefined): string {
  const sym = symbolOf(setup.content)
  if (!fecho) return ""

  const perdeu = /\bsl\s*hit|stop\s*loss\s*hit|❌/i.test(fecho.content)
  const m = fecho.content.match(/([+\-−]?\s*\d+(?:[.,]\d+)?)\s*pips?/i)
  if (!m) return ""
  const bruto = Math.abs(Number(m[1].replace(/[\s−]/g, "").replace(",", ".")))
  if (!Number.isFinite(bruto) || bruto === 0) return ""
  const pips = perdeu ? -bruto : bruto

  const entrada = Number((setup.content.match(/(?:entrada|entry|zone)\D{0,12}(\d[\d.,]*)/i) ?? [])[1]?.replace(",", "."))
  const unidade = unitFor(sym)
  const sinal = pips >= 0 ? "+" : "−"
  const parte = `${sinal}${Math.abs(pips).toLocaleString("pt-PT")} ${unidade}`
  if (!Number.isFinite(entrada) || entrada <= 0) return parte
  const pct = (Math.abs(pips) * pipSizeForSymbol(sym)) / entrada * 100
  return `${parte} · ${sinal}${pct.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export default function TapToTradeFeed() {
  const t = useT()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [limitMode, setLimitMode] = useState<"today" | "week">("today")
  const [historico, setHistorico] = useState<Array<Sig & { desfecho: string }>>([])
  /** Resultado FLUTUANTE por sinal, calculado pelo motor (não por cotações no cliente). */
  const [aoVivo, setAoVivo] = useState<Record<string, { pips: number | null; pct: number | null }>>({})
  /** Lido dentro do `load` sem o tornar dependente do estado — o intervalo de 20s não se recria. */
  const limitModeRef = useRef<"today" | "week">("today")
  const [tap, setTap] = useState<{ sig: Sig; status: "confirm" | "loading" | "done" | "error"; message?: string } | null>(null)
  /**
   * Pré-visualização do sinal: parâmetros da trade e, por conta, o lote e o risco calculados
   * sobre a equity real. Antes o cliente confirmava sem ver o tamanho da posição que ia abrir.
   */
  const [preview, setPreview] = useState<TapPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [providers, setProviders] = useState<{ label: string; strategy: string }[]>([])
  const [noProviders, setNoProviders] = useState(false)
  // Sinais que este utilizador já aceitou: { chat_message_id: status }
  const [accepted, setAccepted] = useState<Record<string, string>>({})
  const [closingAll, setClosingAll] = useState(false)

  // Configuração da conta (estilo PrimeSync, dentro do próprio T2T)
  const [conn, setConn] = useState<Conn | null>(null)
  // Multi-conta: todas as contas T2T do user (fan-out). O user escolhe uma ou várias ligando o T2T
  // por conta. `conn` acima é a primária (para a config detalhada existente).
  const [t2tConns, setT2tConns] = useState<Conn[]>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connForm, setConnForm] = useState<{ broker: string; server: string; login: string; password: string; platform: "mt5" }>({ broker: T2T_BROKERS[0].id, server: T2T_BROKERS[0].servers[0], login: "", password: "", platform: "mt5" })
  const [connBusy, setConnBusy] = useState(false)
  const [connError, setConnError] = useState("")
  const [savingConn, setSavingConn] = useState(false)
  const [removingConn, setRemovingConn] = useState(false)
  // "O que seguir": fontes + classes de ativo + nível de risco (prefs por-user na conta T2T)
  const [follow, setFollow] = useState<{ sources: string[]; assetClasses: string[]; risk: string | null }>({ sources: [], assetClasses: [], risk: null })
  const [savingFollow, setSavingFollow] = useState(false)
  const [followDirty, setFollowDirty] = useState(false)
  /** Confirmação (ou falha) do último Guardar. Some sozinha ao fim de 4s quando corre bem. */
  const [followMsg, setFollowMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [cfg, setCfg] = useState<{
    lot_mode: "risk_percent" | "fixed"
    risk: number
    lot: number
    copy_sl: boolean
    copy_tp: boolean
    trailing: boolean
    trailingPts: number
    tp1: number
    tp2: number
    tp3: number
  } | null>(null)

  const token = useCallback(async () => {
    const { getAccessToken } = await import("@/lib/auth-token")
    return getAccessToken()
  }, [])

  const loadConnection = useCallback(async () => {
    const tok = await token()
    if (!tok) return
    try {
      const r = await fetch("/api/mtmcopy/connection?purpose=tap_to_trade", { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) return
      const d = await r.json()
      // Contas T2T do user (fan-out). Se a API ainda não devolver a lista, cai para a conta única.
      const list: Conn[] = Array.isArray(d.t2t_connections) && d.t2t_connections.length
        ? d.t2t_connections
        : (Array.isArray(d.connections) ? d.connections.filter((x: Conn) => x.t2t_enabled === true) : [])
      const c: Conn | null = d.connection ?? (d.connections?.[0] ?? null)
      setT2tConns(list.length ? list : (c ? [c] : []))
      setConn(c)
      if (c) {
        setCfg({
          lot_mode: c.lot_mode === "fixed" ? "fixed" : "risk_percent",
          risk: typeof c.max_risk_percent === "number" ? c.max_risk_percent : 1,
          lot: typeof c.lot_value === "number" ? c.lot_value : 0.01,
          copy_sl: c.copy_sl !== false,
          copy_tp: c.copy_tp !== false,
          trailing: c.auto_trailing_stop === true,
          trailingPts: typeof c.trailing_stop_points === "number" ? c.trailing_stop_points : 100,
          tp1: typeof c.exit_pct_tp1 === "number" ? c.exit_pct_tp1 : 50,
          tp2: typeof c.exit_pct_tp2 === "number" ? c.exit_pct_tp2 : 30,
          tp3: typeof c.exit_pct_tp3 === "number" ? c.exit_pct_tp3 : 20,
        })
        setFollow({
          sources: Array.isArray(c.t2t_sources) ? c.t2t_sources : [],
          assetClasses: Array.isArray(c.t2t_asset_classes) ? c.t2t_asset_classes : [],
          risk: c.t2t_risk_level ?? null,
        })
      }
    } catch {
      /* ignore */
    }
  }, [token])

  const load = useCallback(async () => {
    setLoading(true)
    // "Esta semana" precisa da janela larga; "Hoje" fica-se pela curta — é o refrescar de 20s
    // que corre aqui, e 400 mensagens com conteúdo inteiro a cada 20 segundos pagam-se em egress.
    const janelaLarga = limitModeRef.current === "week"
    const tok = await token()
    let channels: string[] = []
    let senseiIds = new Set<string>()
    let senseiFilterOn = false
    if (tok) {
      try {
        const r = await fetch("/api/mtmcopy/tap-to-trade/providers", { headers: { Authorization: `Bearer ${tok}` } })
        if (r.ok) {
          const d = await r.json()
          setProviders(d.providers ?? [])
          channels = (d.channels ?? []) as string[]
          if (Array.isArray(d.senseiSignalIds)) {
            senseiIds = new Set(d.senseiSignalIds as string[])
            senseiFilterOn = true
          }
        }
      } catch {
        /* ignore */
      }
    }
    setNoProviders(channels.length === 0)
    if (channels.length === 0) {
      setItems([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("id, channel_slug, content, created_at, outcome")
      .in("channel_slug", channels)
      .eq("is_deleted", false)
      // A janela larga (7 dias / 400 linhas) só se vai buscar quando o cliente PEDE histórico.
      // O refrescar automático de 20s fica com a janela curta — senão são 400 mensagens com
      // conteúdo inteiro a cada 20 segundos, por pessoa, e o egress do Supabase paga a fatura.
      .gte("created_at", new Date(Date.now() - (janelaLarga ? 7 * 86_400_000 : 36 * 3_600_000)).toISOString())
      .order("created_at", { ascending: false })
      .limit(janelaLarga ? 400 : 120)
    const all = (data ?? []) as Sig[]
    /**
     * Só os follow-ups TERMINAIS encerram uma ideia — um break-even ou um TP1 não encerram nada,
     * a trade continua a correr. E cada fecho encerra as entradas do canal que ainda estavam de
     * pé antes dele: o Premium publica o mesmo setup em várias zonas ("3.", "4.", "5. GOLD BUY
     * SETUP") e anuncia UM desfecho — sem isto ficavam todas eternamente como "expirado" e o
     * cliente nunca via quanto tinham rendido.
     */
    const terminais = all
      .filter((m) => TERMINAL_RE.test(m.content))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const entradasAsc = all
      .filter((m) => isEntrySignal(m.channel_slug, m.content))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const fechoDe = new Map<string, Sig | undefined>()
    for (const f of terminais) {
      const fSym = symbolOf(f.content)
      const fDir = directionOf(f.content)
      const atingidas = entradasAsc.filter((e) => {
        if (fechoDe.has(e.id)) return false
        if (e.channel_slug !== f.channel_slug) return false
        if (e.created_at >= f.created_at) return false
        const eSym = symbolOf(e.content)
        // Fecho sem par identificado refere-se ao setup do canal (é assim que se lê no chat);
        // com par identificado só encerra o mesmo par.
        if (fSym && eSym && fSym !== eSym) return false
        const eDir = directionOf(e.content)
        if (fDir && eDir && fDir !== eDir) return false
        return true
      })
      // O desfecho anunciado é UM só e pertence ao setup que estava vivo — o último publicado
      // antes do fecho. As zonas anteriores foram substituídas por ele: fecham na mesma, mas
      // SEM número. Repetir "+163 pips" em cinco cartões faria parecer cinco ganhos onde houve um.
      atingidas.forEach((e, i) => fechoDe.set(e.id, i === atingidas.length - 1 ? f : undefined))
    }
    const now = Date.now()
    const sigs = all
      .filter((m) => isEntrySignal(m.channel_slug, m.content))
      // Sensei: só ideias activadas (abrem na conta provider = aparecem no chat)
      .filter((m) => m.channel_slug !== "sensei-scanner" || !senseiFilterOn || senseiIds.has(m.id))
      .map((m) => {
        const ageMs = now - new Date(m.created_at).getTime()
        // Setup pendente (nível de entrada por tocar) → janela alargada; a mercado → 5 min.
        const pendingSetup = hasEntryLevel(m.content)
        const ageExpired = ageMs > (pendingSetup ? T2T_PENDING_MAX_AGE_MS : T2T_MAX_AGE_MS)
        const resolved = fechoDe.has(m.id)
        return {
          ...m,
          expired: ageExpired || resolved,
          reason: resolved ? "resolved" : ageExpired ? "aged" : "",
        }
      })
    // Os TERMINADOS deixam de ser deitados fora: saem da lista de ideias aceitáveis (que é o
    // que "Últimos 5" mostra) e passam a formar o HISTÓRICO do dia e da semana, com o desfecho
    // em pips e percentagem ao lado do par.
    setItems(sigs.filter((x) => !x.expired))
    // Resultado ao vivo dos que estão a correr: uma chamada por refrescar, números já feitos.
    try {
      const vivos = sigs.filter((x) => !x.expired).map((x) => x.id)
      if (vivos.length) {
        const rl = await fetch(`/api/mtmcopy/signal-live?ids=${vivos.join(",")}`)
        if (rl.ok) setAoVivo(((await rl.json()) as { live?: typeof aoVivo }).live ?? {})
      } else {
        setAoVivo({})
      }
    } catch {
      /* sem números ao vivo — o cartão continua a funcionar */
    }
    setHistorico(
      sigs
        .filter((x) => x.expired && x.reason === "resolved")
        // O desfecho VEM DA BASE DE DADOS (uma conta só, feita pelo servidor). O cálculo local
        // fica como rede para sinais ainda não processados.
        .map((x) => ({ ...x, desfecho: x.outcome?.label || desfechoDoSinal(x, fechoDe.get(x.id)) })),
    )
    // Quais destes sinais o utilizador já aceitou (persiste entre reloads)
    if (tok) {
      try {
        const ra = await fetch("/api/mtmcopy/tap-to-trade/accepted", { headers: { Authorization: `Bearer ${tok}` } })
        if (ra.ok) {
          const da = await ra.json()
          setAccepted(da.accepted ?? {})
        }
      } catch {
        /* ignore */
      }
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
    loadConnection()
    // Sinais novos aparecem sozinhos: refresca a cada 20s e sempre que a app volta ao foco
    // (sem isto o tab só carregava ao montar → sinais publicados depois não surgiam).
    const iv = setInterval(load, 20000)
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") load()
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(iv)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis)
    }
  }, [load, loadConnection])

  // Vindo de /automation ("Ativar Tap to Trade") → abre logo a config/ligação da conta
  useEffect(() => {
    if (searchParams?.get("setup") === "1") setShowConfig(true)
  }, [searchParams])

  // Deep-link: notificação T2T → abrir directamente a confirmação da trade (1× por sinal —
  // sem o guard, o efeito reabria o modal sempre que `items` recarregava depois de o fechar).
  const [deepLinkHandled, setDeepLinkHandled] = useState<string | null>(null)
  useEffect(() => {
    const sigId = searchParams?.get("signal") || searchParams?.get("msg")
    // O guard e por SINAL: um sinal diferente reabre; o mesmo nao reabre sozinho quando a
    // lista recarrega. Tocar outra vez na notificacao do mesmo sinal volta a trazer o URL e,
    // como o utilizador ja saiu do modal, faz sentido reabrir -- por isso limpa-se o guard
    // quando o modal e fechado (ver setTap(null) mais abaixo).
    if (!sigId || deepLinkHandled === sigId) return
    setDeepLinkHandled(sigId)
    const found = items.find((s) => s.id === sigId)
    if (found) {
      setTap({ sig: found, status: "confirm" })
      return
    }
    // não está na lista carregada → vai buscar a mensagem directamente
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_slug, content, created_at")
        .eq("id", sigId)
        .maybeSingle()
      if (!cancelled && data) setTap({ sig: data as Sig, status: "confirm" })
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, items, deepLinkHandled])

  // Pré-visualização: corre quando o modal abre. Se falhar, o modal continua a funcionar com
  // o texto do sinal — nunca bloqueia a aceitação por causa de números que não chegaram.
  useEffect(() => {
    if (!tap || tap.status !== "confirm") { setPreview(null); return }
    let cancelado = false
    setPreviewBusy(true)
    ;(async () => {
      try {
        const tok = await token()
        if (!tok) return
        const r = await fetch(`/api/mtmcopy/tap-to-trade/preview?chat_message_id=${encodeURIComponent(tap.sig.id)}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        if (!r.ok) return
        const j = (await r.json()) as TapPreview
        if (!cancelado) setPreview(j)
      } catch {
        /* fica sem números — o texto do sinal chega para decidir */
      } finally {
        if (!cancelado) setPreviewBusy(false)
      }
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap?.sig.id, tap?.status])

  const filtered = items
    // "O que seguir" é a ÚNICA filtragem: fontes + classes de ativo que o user escolheu ([]=todas).
    .filter((s) => matchesT2TPrefs(s.channel_slug, s.content, { sources: follow.sources, assetClasses: follow.assetClasses }))
  // Passar a "Esta semana" muda a janela que se vai buscar → recarrega uma vez, e só então.
  useEffect(() => {
    const anterior = limitModeRef.current
    limitModeRef.current = limitMode
    if (anterior !== "week" && limitMode === "week") load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitMode])

  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0)
  const desde = limitMode === "today" ? inicioDoDia.getTime() : Date.now() - 7 * 86_400_000
  const naJanela = (x: { created_at: string }) => new Date(x.created_at).getTime() >= desde
  const historicoFiltrado = historico.filter((x) =>
    matchesT2TPrefs(x.channel_slug, x.content, { sources: follow.sources, assetClasses: follow.assetClasses }),
  )
  // "Últimos 5" = os cinco sinais MAIS RECENTES, seja qual for o estado deles. Antes só contava
  // os ainda aceitáveis, e como um setup expira em minutos o separador aparecia vazio a quem
  // vinha ver o que tinha saído.
  const shown = filtered.filter(naJanela)
  const historicoVisivel = historicoFiltrado.filter(naJanela)

  const runTap = async () => {
    if (!tap) return
    const sig = tap.sig
    setTap({ sig, status: "loading" })
    try {
      const tok = await token()
      if (!tok) {
        setTap({ sig, status: "error", message: t("t2t.sessionUnavailableLogin") })
        return
      }
      const res = await fetch("/api/mtmcopy/tap-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ chat_message_id: sig.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Já aceite anteriormente (idempotência) → marca o cartão como aceite
        if (res.status === 409 || data.code === "already_accepted") {
          setAccepted((a) => ({ ...a, [sig.id]: "open" }))
          setTap({ sig, status: "error", message: data.error || t("t2t.alreadyAcceptedMsg") })
          return
        }
        setTap({ sig, status: "error", message: data.error || t("t2t.openTradeFailed") })
        return
      }
      setAccepted((a) => ({ ...a, [sig.id]: "open" }))
      setTap({ sig, status: "done", message: data.message || t("t2t.tradeOpened") })
    } catch (e) {
      setTap({ sig, status: "error", message: e instanceof Error ? e.message : t("t2t.unexpectedError") })
    }
  }

  const saveConfig = async () => {
    if (!conn || !cfg) return
    setSavingConn(true)
    try {
      const tok = await token()
      if (!tok) return
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
      // risco + SL/TP + proteção (trailing) + alocação de take profit
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers,
        body: JSON.stringify({
          connection_id: conn.id,
          lot_mode: cfg.lot_mode,
          max_risk_percent: cfg.risk,
          lot_value: cfg.lot,
          copy_sl: cfg.copy_sl,
          copy_tp: cfg.copy_tp,
          auto_trailing_stop: cfg.trailing,
          trailing_stop_points: cfg.trailingPts,
          exit_pct_tp1: cfg.tp1,
          exit_pct_tp2: cfg.tp2,
          exit_pct_tp3: cfg.tp3,
        }),
      })
      await loadConnection()
      setShowConfig(false)
    } finally {
      setSavingConn(false)
    }
  }

  // Atualiza LOCALMENTE as prefs "O que seguir" (marca por-guardar) — só persiste no botão Guardar.
  const setFollowLocal = (next: { sources: string[]; assetClasses: string[]; risk: string | null }) => {
    setFollow(next)
    setFollowDirty(true)
    setFollowMsg(null)
  }
  /**
   * PERSISTE as prefs (botão Guardar). O risco também aplica o sizing por %.
   *
   * O resultado do pedido é VERIFICADO. Antes fazia-se `await fetch(...)` sem olhar para a
   * resposta: se a gravação falhasse — sessão expirada, rede, 500 — o botão passava na mesma a
   * "Guardado ✓" e o cliente ficava convencido de que tinha guardado filtros que nunca foram
   * gravados.
   */
  const persistFollow = async () => {
    if (!conn) return
    setSavingFollow(true)
    setFollowMsg(null)
    try {
      const tok = await token()
      if (!tok) {
        setFollowMsg({ tipo: "erro", texto: "Sessão expirada. Entra outra vez para guardar." })
        return
      }
      const body: Record<string, unknown> = {
        connection_id: conn.id,
        t2t_sources: follow.sources,
        t2t_asset_classes: follow.assetClasses,
        t2t_risk_level: follow.risk,
      }
      if (follow.risk && RISK_PRESET[follow.risk] != null) {
        body.lot_mode = "risk_percent"
        body.max_risk_percent = RISK_PRESET[follow.risk]
      }
      const res = await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setFollowMsg({ tipo: "erro", texto: j.error || `Não foi possível guardar (${res.status}).` })
        return
      }
      await loadConnection()
      setFollowDirty(false)
      const quantas = follow.sources.length + follow.assetClasses.length
      setFollowMsg({
        tipo: "ok",
        texto: quantas === 0 ? "Guardado. A seguir todas as fontes e ativos." : "Guardado. Filtros aplicados ao teu feed.",
      })
      setTimeout(() => setFollowMsg((m) => (m?.tipo === "ok" ? null : m)), 4000)
    } catch (e) {
      setFollowMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Não foi possível guardar." })
    } finally {
      setSavingFollow(false)
    }
  }
  const toggleFollow = (kind: "sources" | "assetClasses", key: string) => {
    const cur = follow[kind]
    const nextArr = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]
    setFollowLocal({ ...follow, [kind]: nextArr })
  }

  // Liga/desliga o T2T (fan-out) numa conta. Aceitar um sinal abre em TODAS as contas ligadas.
  const toggleAccountT2T = async (id: string, enabled: boolean) => {
    setTogglingId(id)
    try {
      const tok = await token()
      if (!tok) return
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ connection_id: id, t2t_enabled: enabled }),
      })
      await loadConnection()
    } finally {
      setTogglingId(null)
    }
  }

  const connectAccount = async () => {
    if (!connForm.server.trim() || !connForm.login.trim() || !connForm.password) {
      setConnError(t("t2t.fillBrokerServerLogin"))
      return
    }
    setConnBusy(true)
    setConnError("")
    try {
      const tok = await token()
      if (!tok) { setConnError(t("t2t.sessionUnavailable")); setConnBusy(false); return }
      const res = await fetch("/api/mtmcopy/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          mt5_server: connForm.server.trim(),
          mt5_login: connForm.login.trim(),
          mt5_password: connForm.password,
          mt5_platform: connForm.platform,
          copy_method: "telegram_group",
          purpose: "tap_to_trade",
          account_label: "T2T",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setConnError(data.error || t("t2t.linkAccountFailed")); setConnBusy(false); return }
      setConnBusy(false)
      setConnectOpen(false)
      setConnForm({ broker: T2T_BROKERS[0].id, server: T2T_BROKERS[0].servers[0], login: "", password: "", platform: "mt5" })
      await loadConnection()
    } catch (e) {
      setConnError(e instanceof Error ? e.message : t("t2t.unexpectedError"))
      setConnBusy(false)
    }
  }

  const removeAccount = async () => {
    if (!conn) return
    if (!window.confirm(t("t2t.confirmRemoveAccount"))) return
    setRemovingConn(true)
    setConnError("")
    try {
      const tok = await token()
      if (!tok) { setConnError(t("t2t.sessionUnavailable")); return }
      const res = await fetch(`/api/mtmcopy/connection?id=${encodeURIComponent(conn.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tok}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setConnError(data.error || t("t2t.removeAccountFailed")); return }
      setConnectOpen(false)
      setConn(null)
      await loadConnection()
    } catch (e) {
      setConnError(e instanceof Error ? e.message : t("t2t.unexpectedError"))
    } finally {
      setRemovingConn(false)
    }
  }

  const emergencyStop = async () => {
    if (!window.confirm(t("t2t.confirmCloseAll"))) return
    setClosingAll(true)
    try {
      const tok = await token()
      if (!tok) return
      const res = await fetch("/api/mtmcopy/tap-to-trade/close-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { window.alert(data.error || t("t2t.closePositionsFailed")); return }
      window.alert(`${t("t2t.closedResultPre")}${data.closed ?? 0}${t("t2t.closedResultMid")}${data.total ?? 0}${t("t2t.closedResultSuf")}`)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("t2t.unexpectedError"))
    } finally {
      setClosingAll(false)
    }
  }

  // Existe uma ligação (mesmo pendente/erro) → mostrar a conta + estado.
  const hasAccount = !!conn
  // Pronta a operar (conta MetaApi criada e ligada à corretora).
  const isReady = !!conn?.metaapi_account_id && conn?.mt5_status === "connected"
  const riskLabel = cfg
    ? cfg.lot_mode === "fixed"
      ? `${cfg.lot}${t("t2t.lotFixedSuffix")}`
      : `${cfg.risk}${t("t2t.riskPerTradeSuffix")}`
    : "—"

  return (
    <div className="px-3 pt-3 pb-24 text-white">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#D2A63C]" /> T2T <span className="text-[#D2A63C]">Tap to Trade</span>
        </h1>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-zinc-700 text-zinc-400" aria-label={t("t2t.refresh")}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        {t("t2t.introBefore")}<strong className="text-zinc-200">{t("t2t.yourAccount")}</strong>{t("t2t.introAfter")}
      </p>

      {/* Se também usas a MTM Auto, o que ela fez na tua conta aparece aqui — as duas partilham
          o login, e saltar entre apps para saber como está o mês não faz sentido nenhum. */}
      <MtmAutoMetricas />

      {/* Configuração da conta (PrimeSync-style, dentro do T2T) */}
      <div className="rounded-2xl border border-[#D2A63C]/25 bg-zinc-900/60 mb-3 overflow-hidden">
        <button
          onClick={() => setShowConfig((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        >
          <Settings className="w-4 h-4 text-[#D2A63C]" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">{t("t2t.myAccount")}</p>
            <p className="text-[11px] text-zinc-400 truncate">
              {hasAccount ? (
                <>{conn?.account_label || t("t2t.mt5Account")} · {riskLabel}</>
              ) : (
                t("t2t.noAccountTapConfigure")
              )}
            </p>
          </div>
          {showConfig ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {showConfig && (
          <div className="px-3 pb-3 border-t border-zinc-800 pt-3 space-y-3">
            {/* Contas T2T (fan-out): escolhe UMA ou VÁRIAS. Aceitar um sinal abre em todas as ligadas. */}
            {t2tConns.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white">Contas Tap to Trade</span>
                  <span className="text-[10px] text-zinc-500">{t2tConns.filter((c) => c.t2t_enabled !== false && c.is_active !== false).length} ativa(s)</span>
                </div>
                <p className="text-[10px] leading-snug text-zinc-500">Aceitar um sinal abre em <strong className="text-zinc-300">todas</strong> as contas ligadas, cada uma com o risco pelo seu próprio saldo.</p>
                {t2tConns.map((c) => {
                  const on = c.t2t_enabled !== false
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/30 px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white truncate">
                          <Wallet className="w-3.5 h-3.5 text-[#D2A63C] shrink-0" /> {c.account_label || t("t2t.mt5Account")}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {c.mt5_login ?? "—"} · {c.mt5_server || "—"}
                          {typeof c.balance === "number" ? ` · ${c.balance.toLocaleString("pt-PT", { style: "currency", currency: "USD" })}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={togglingId === c.id}
                        onClick={() => toggleAccountT2T(c.id, !on)}
                        aria-label={on ? "Desligar T2T nesta conta" : "Ligar T2T nesta conta"}
                        className={`relative ml-2 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#D2A63C]" : "bg-zinc-700"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => { setConnError(""); setConnectOpen(true) }}
                  className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[12px] font-semibold text-zinc-300"
                >
                  + Adicionar outra conta
                </button>
              </div>
            )}
            {!hasAccount ? (
              <div className="text-center py-2">
                <Wallet className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                <p className="text-xs text-zinc-400 mb-3">
                  {t("t2t.linkOnceHelp")}
                </p>
                <button
                  onClick={() => { setConnError(""); setConnectOpen(true) }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] px-4 py-2"
                >
                  <Wallet className="w-4 h-4" /> {t("t2t.linkMt5Account")}
                </button>
              </div>
            ) : cfg ? (
              <>
                {/* Dados da conta ligada */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                      <Wallet className="w-4 h-4 text-[#D2A63C]" /> {conn?.account_label || t("t2t.mt5Account")}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      conn?.mt5_status === "connected" ? "bg-emerald-500/15 text-emerald-400"
                        : conn?.mt5_status === "error" ? "bg-rose-500/15 text-rose-400"
                        : "bg-zinc-700/60 text-zinc-300"
                    }`}>
                      {conn?.mt5_status === "connected" ? t("t2t.statusConnected")
                        : conn?.mt5_status === "error" ? t("t2t.statusError")
                        : conn?.mt5_status === "disconnected" ? t("t2t.statusDisconnected")
                        : t("t2t.statusConnecting")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                    <span>{t("t2t.loginLabel")} <span className="text-zinc-200">{conn?.mt5_login ?? "—"}</span></span>
                    <span>{t("t2t.platformLabel")} <span className="text-zinc-200 uppercase">{conn?.mt5_platform || "mt5"}</span></span>
                    <span className="col-span-2 truncate">{t("t2t.serverLabel")} <span className="text-zinc-200">{conn?.mt5_server || "—"}</span></span>
                    {typeof conn?.balance === "number" && (
                      <span className="col-span-2">{t("t2t.balanceLabel")} <span className="text-white font-semibold">{conn.balance.toLocaleString("pt-PT", { style: "currency", currency: "USD" })}</span></span>
                    )}
                  </div>
                  {conn?.mt5_status !== "connected" && (
                    <div className={`mt-1 rounded-lg px-2.5 py-2 text-[11px] leading-snug ${conn?.mt5_status === "error" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>
                      {conn?.mt5_status === "error" ? (
                        <>⚠️ {conn?.last_error || t("t2t.brokerConnectFailed")} {t("t2t.errorHintBefore")}<strong>{t("t2t.manageAccount")}</strong> → <strong>{t("t2t.remove")}</strong>{t("t2t.errorHintAfter")}</>
                      ) : (
                        <>⏳ {t("t2t.validatingBroker")}</>
                      )}
                    </div>
                  )}
                </div>

                {/* modo de risco */}
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1.5">{t("t2t.positionSize")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCfg({ ...cfg, lot_mode: "risk_percent" })}
                      className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "risk_percent" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                    >
                      {t("t2t.riskPercentMode")}
                    </button>
                    <button
                      onClick={() => setCfg({ ...cfg, lot_mode: "fixed" })}
                      className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "fixed" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                    >
                      {t("t2t.fixedLot")}
                    </button>
                  </div>
                </div>

                {cfg.lot_mode === "risk_percent" ? (
                  <label className="block">
                    <span className="text-[11px] text-zinc-500">{t("t2t.riskPerTrade")}</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="20"
                      value={cfg.risk}
                      onChange={(e) => setCfg({ ...cfg, risk: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[11px] text-zinc-500">{t("t2t.fixedLot")}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={cfg.lot}
                      onChange={(e) => setCfg({ ...cfg, lot: parseFloat(e.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                    />
                  </label>
                )}

                {/* SL / TP */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCfg({ ...cfg, copy_sl: !cfg.copy_sl })}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_sl ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                  >
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {t("t2t.copySl")}</span>
                    <span className="font-bold">{cfg.copy_sl ? t("t2t.on") : t("t2t.off")}</span>
                  </button>
                  <button
                    onClick={() => setCfg({ ...cfg, copy_tp: !cfg.copy_tp })}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_tp ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                  >
                    <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {t("t2t.copyTp")}</span>
                    <span className="font-bold">{cfg.copy_tp ? t("t2t.on") : t("t2t.off")}</span>
                  </button>
                </div>

                {/* Proteção da trade — trailing / breakeven automático */}
                <div className="rounded-xl border border-zinc-800 p-2.5">
                  <button
                    onClick={() => setCfg({ ...cfg, trailing: !cfg.trailing })}
                    className="w-full flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-1 text-zinc-300"><ShieldCheck className="w-3.5 h-3.5 text-[#D2A63C]" /> {t("t2t.trailingAuto")}</span>
                    <span className={`font-bold ${cfg.trailing ? "text-emerald-400" : "text-zinc-500"}`}>{cfg.trailing ? t("t2t.on") : t("t2t.off")}</span>
                  </button>
                  {cfg.trailing && (
                    <label className="block mt-2">
                      <span className="text-[11px] text-zinc-500">{t("t2t.trailingDistance")}</span>
                      <input
                        type="number"
                        step="10"
                        min="10"
                        value={cfg.trailingPts}
                        onChange={(e) => setCfg({ ...cfg, trailingPts: parseInt(e.target.value) || 0 })}
                        className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                      />
                    </label>
                  )}
                </div>

                {/* Alocação de Take Profit (parcial por nível) */}
                <div className="rounded-xl border border-zinc-800 p-2.5">
                  <p className="text-[11px] text-zinc-500 mb-2">{t("t2t.tpAllocation")}</p>
                  {([["TP1", "tp1"], ["TP2", "tp2"], ["TP3", "tp3"]] as const).map(([label, key]) => (
                    <div key={key} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs text-zinc-400 w-9">{label}</span>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        max="100"
                        value={cfg[key]}
                        onChange={(e) => setCfg({ ...cfg, [key]: parseInt(e.target.value) || 0 })}
                        className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm text-white"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  ))}
                  <div className={`text-[11px] mt-1 ${cfg.tp1 + cfg.tp2 + cfg.tp3 === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                    {t("t2t.totalLabel")} {cfg.tp1 + cfg.tp2 + cfg.tp3}%{cfg.tp1 + cfg.tp2 + cfg.tp3 !== 100 ? t("t2t.mustSum100") : ""}
                  </div>
                </div>

                <button
                  onClick={saveConfig}
                  disabled={savingConn}
                  className="w-full rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 disabled:opacity-60"
                >
                  {savingConn ? t("t2t.saving") : t("t2t.saveConfig")}
                </button>
                <button
                  onClick={() => { setConnError(""); setConnectOpen(true) }}
                  className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-[#D2A63C]/40 text-[#D2A63C] font-semibold text-[13px] py-2.5"
                >
                  <Wallet className="w-4 h-4" /> {t("t2t.manageAccountFull")}
                </button>

                {/* Zona de risco — fechar tudo de uma vez */}
                <div className="mt-1 pt-3 border-t border-rose-500/20">
                  <button
                    onClick={emergencyStop}
                    disabled={closingAll}
                    className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-rose-500/40 text-rose-400 font-semibold text-[13px] py-2.5 disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4" /> {closingAll ? t("t2t.closing") : t("t2t.emergencyStop")}
                  </button>
                  <p className="text-[10px] text-zinc-500 mt-1.5 text-center">{t("t2t.emergencyStopHelp")}</p>
                </div>
              </>
            ) : (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" /></div>
            )}
          </div>
        )}
      </div>

      {/* O QUE SEGUIR — o user escolhe fontes, ativos e risco. Vazio = segue tudo. */}
      {hasAccount && (
        <div className="rounded-2xl border border-[#D2A63C]/25 bg-zinc-900/60 mb-3 p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#D2A63C]" />
            <p className="text-[13px] font-semibold">O que seguir</p>
            {savingFollow && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D2A63C]" />}
          </div>

          <p className="text-[11px] text-zinc-500 mb-1.5">Fontes {follow.sources.length === 0 && <span className="text-zinc-600">(todas)</span>}</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {T2T_SOURCES.map((s) => {
              const on = follow.sources.includes(s.key)
              return (
                <button
                  key={s.key}
                  onClick={() => toggleFollow("sources", s.key)}
                  title={s.hint}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${on ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                >
                  {on ? "✓ " : ""}{s.label}
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-zinc-500 mb-1.5">Ativos {follow.assetClasses.length === 0 && <span className="text-zinc-600">(todos)</span>}</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {T2T_ASSET_CLASSES.map((a) => {
              const on = follow.assetClasses.includes(a.key)
              return (
                <button
                  key={a.key}
                  onClick={() => toggleFollow("assetClasses", a.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium ${on ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                >
                  {on ? "✓ " : ""}{a.label}
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-zinc-500 mb-1.5">Risco por trade</p>
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as const).map((lvl) => {
              const on = follow.risk === lvl
              return (
                <button
                  key={lvl}
                  onClick={() => setFollowLocal({ ...follow, risk: lvl })}
                  className={`rounded-xl border py-2 text-xs font-semibold ${on ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                >
                  {RISK_LABEL[lvl]}<span className="block text-[10px] font-normal opacity-70">{RISK_PRESET[lvl]}%</span>
                </button>
              )
            })}
          </div>

          {/* Botão Guardar — só persiste ao clicar (pedido Ricardo) */}
          <button
            onClick={persistFollow}
            disabled={savingFollow || !followDirty || !conn}
            className={`mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold ${followDirty && conn ? "bg-[#D2A63C] text-black" : "bg-zinc-800 text-zinc-500"} disabled:opacity-60`}
          >
            {savingFollow ? "A guardar…" : followDirty ? "Guardar alterações" : "Sem alterações por guardar"}
          </button>
          {/* A confirmação aparece DEPOIS de a gravação responder — não é o estado de repouso
              do botão. Assim "Guardado" quer mesmo dizer que ficou gravado. */}
          {followMsg && (
            <p
              className={`mt-2 text-[12px] text-center ${followMsg.tipo === "ok" ? "text-emerald-400" : "text-rose-400"}`}
              role="status"
            >
              {followMsg.tipo === "ok" ? "✓ " : "⚠️ "}{followMsg.texto}
            </p>
          )}
        </div>
      )}

      {/* «Estratégias ativas» (automatizadas) removido: o Tap to Trade é MANUAL — segue os CHATS
          conforme o «O que seguir» (fontes + ativo + risco), não as estratégias de cópia auto. */}

      {/* Alcance. "Todos" era uma lista sem fim de setups aceitáveis e sem histórico nenhum;
          passa a Hoje / Esta semana, que é como se olha para o dia de trading. */}
      <div className="flex items-center gap-1.5 mb-2">
        {([
          ["today", "Hoje"],
          ["week", "Esta semana"],
        ] as const).map(([modo, rotulo]) => (
          <button
            key={modo}
            onClick={() => setLimitMode(modo)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              limitMode === modo ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* Filtro por categoria removido: duplicava o «Ativo» do «O que seguir» (ouro/forex/cripto/
          índices). O feed já é filtrado pelas prefs em matchesT2TPrefs. */}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" /></div>
      ) : shown.length === 0 && historicoVisivel.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          {noProviders
            ? t("t2t.noProviders")
            : t("t2t.noSignals")}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((s) => {
            const f = parseSignalFields(s.content)
            const dir = f.direction
            // Card harmonizado quando conseguimos ler símbolo + direção; senão cai no texto cru.
            const structured = Boolean(f.symbol && dir)
            return (
              <div key={s.id} className={`rounded-2xl border p-3 ${s.expired ? "border-zinc-800/60 bg-zinc-900/30 opacity-70" : "border-zinc-800 bg-zinc-900/60"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-[#D2A63C]">{CHANNEL_LABEL[s.channel_slug] ?? s.channel_slug}</span>
                  <div className="flex items-center gap-1.5">
                    {s.expired && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/60 text-zinc-300 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {t("t2t.expired")}
                      </span>
                    )}
                    {dir && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${dir === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {dir}
                      </span>
                    )}
                  </div>
                </div>
                {structured ? (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold text-white tracking-wide">{f.symbol}</span>
                      <span className={`text-[11px] font-semibold ${dir === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{dir === "BUY" ? "COMPRA" : "VENDA"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-zinc-800/80 text-zinc-300">🎯 {f.entry ?? "Mercado"}</span>
                      {/* A CORRER: o que a trade vale NESTE momento. Sem isto o cartão de um
                          sinal vivo não dizia se estava a ganhar ou a perder — só os terminados
                          traziam números, e esses já não servem para decidir nada. */}
                      {aoVivo[s.id]?.pips != null && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-semibold tabular-nums ${
                            (aoVivo[s.id]!.pips ?? 0) >= 0
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}
                          title="Resultado a correr, calculado pelo motor"
                        >
                          {(aoVivo[s.id]!.pips ?? 0) >= 0 ? "+" : ""}{aoVivo[s.id]!.pips} pips
                          {aoVivo[s.id]!.pct != null && ` · ${(aoVivo[s.id]!.pct ?? 0) >= 0 ? "+" : ""}${aoVivo[s.id]!.pct}%`}
                        </span>
                      )}
                      {f.sl && <span className="text-[11px] px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-300">🛑 SL {f.sl}</span>}
                      {f.tps.map((tp, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300">✅ TP{i + 1} {tp}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-zinc-200 whitespace-pre-wrap break-words leading-snug line-clamp-5">{s.content}</p>
                )}
                {accepted[s.id] ? (
                  <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 font-semibold text-[12px] py-2.5">
                    <ShieldCheck className="w-4 h-4" />
                    {accepted[s.id] === "closed" ? t("t2t.acceptedClosed")
                      : accepted[s.id] === "error" ? t("t2t.acceptedError")
                      : t("t2t.alreadyAccepted")}
                  </div>
                ) : s.desfecho ? (
                  // Sinal terminado: o que interessa saber é quanto rendeu, não que expirou.
                  <div className={`mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl font-semibold text-[12px] py-2.5 ${
                    s.desfecho.startsWith("+") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    🏁 {t("t2t.reasonResolved")} · {s.desfecho}
                  </div>
                ) : s.expired ? (
                  <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/70 text-zinc-500 font-semibold text-[12px] py-2.5 cursor-not-allowed">
                    <Clock className="w-4 h-4" /> {t("t2t.signalExpired")}{s.reason ? ` · ${s.reason === "resolved" ? t("t2t.reasonResolved") : t("t2t.reasonAged")}` : ""}
                  </div>
                ) : (
                  <button
                    onClick={() => setTap({ sig: s, status: "confirm" })}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 active:scale-[0.98] transition-transform"
                  >
                    <Zap className="w-4 h-4" />
                    {/* Nos perpétuos o botão não abre ordem nenhuma — segue a posição-mestre.
                        O rótulo tem de dizer isso, senão promete o que não faz. */}
                    {t2tMode(s.channel_slug, s.content) === "follow" ? "Seguir posição" : "Tap to Trade"}
                  </button>
                )}
              </div>
            )
          })}

          {/* HISTÓRICO — sinais já terminados na janela escolhida, com o desfecho ao lado do
              par. É o que faltava para o tab responder a "como correu o dia" sem sair da app. */}
          {historicoVisivel.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                Terminados · {limitMode === "today" ? "hoje" : "esta semana"} ({historicoVisivel.length})
              </p>
              <div className="flex flex-col gap-2">
                {historicoVisivel.map((h) => {
                  const ganhou = h.desfecho.startsWith("+")
                  return (
                    <div key={h.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-zinc-300 truncate">
                          {symbolOf(h.content) || h.channel_slug}
                          {directionOf(h.content) && (
                            <span className={`ml-1.5 text-[11px] font-bold ${directionOf(h.content) === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                              {directionOf(h.content) === "BUY" ? "COMPRA" : "VENDA"}
                            </span>
                          )}
                        </span>
                        {h.desfecho ? (
                          <span className={`text-[12px] font-mono font-semibold tabular-nums flex-shrink-0 ${ganhou ? "text-emerald-400" : "text-rose-400"}`}>
                            {h.desfecho}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-600 flex-shrink-0">terminado</span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-zinc-600 mt-1">
                        {new Date(h.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {connectOpen && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => !connBusy && setConnectOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5 text-[#D2A63C]" />
              <h3 className="text-base font-bold">{hasAccount ? t("t2t.editMt5Title") : t("t2t.linkMt5Title")}</h3>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">{t("t2t.exclusiveAccountNote")}</p>
            {hasAccount && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 mb-3 text-[11px] text-zinc-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white">{conn?.account_label || t("t2t.mt5Account")}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    conn?.mt5_status === "connected" ? "bg-emerald-500/15 text-emerald-400"
                      : conn?.mt5_status === "error" ? "bg-rose-500/15 text-rose-400"
                      : "bg-zinc-700/60 text-zinc-300"
                  }`}>
                    {conn?.mt5_status === "connected" ? t("t2t.statusConnected") : conn?.mt5_status === "error" ? t("t2t.statusError") : conn?.mt5_status === "disconnected" ? t("t2t.statusDisconnected") : t("t2t.statusConnecting")}
                  </span>
                </div>
                <div>{t("t2t.loginLabel")} <span className="text-zinc-200">{conn?.mt5_login ?? "—"}</span> · {(conn?.mt5_platform || "mt5").toUpperCase()}</div>
                <div className="truncate">{t("t2t.serverLabel")} <span className="text-zinc-200">{conn?.mt5_server || "—"}</span></div>
                <button
                  onClick={removeAccount}
                  disabled={removingConn || connBusy}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 text-rose-400 text-[12px] font-semibold px-3 py-1.5 disabled:opacity-60"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {removingConn ? t("t2t.removing") : t("t2t.removeAccount")}
                </button>
                <p className="text-[10px] text-zinc-500 pt-1">Podes ligar várias contas — aceitar um sinal abre em todas as que tiveres com o Tap to Trade ligado (acima).</p>
              </div>
            )}
            {!hasAccount && (
              <div className="space-y-2.5">
                {/* Corretora — apenas FTMO, FundedNext, VT Markets */}
                <div>
                  <label className="text-[11px] text-zinc-500">{t("t2t.brokerField")}</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {T2T_BROKERS.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setConnForm({ ...connForm, broker: b.id, server: b.servers[0] })}
                        className={`rounded-xl border py-2 text-xs font-medium ${connForm.broker === b.id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Servidor — apenas os da corretora escolhida */}
                <div>
                  <label className="text-[11px] text-zinc-500">{t("t2t.serverField")}</label>
                  <select
                    value={connForm.server}
                    onChange={(e) => setConnForm({ ...connForm, server: e.target.value })}
                    className="mt-1 w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
                  >
                    {(T2T_BROKERS.find((b) => b.id === connForm.broker)?.servers ?? []).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {/* Login + password (podes colar) */}
                <input value={connForm.login} onChange={(e) => setConnForm({ ...connForm, login: e.target.value })} placeholder={t("t2t.loginPlaceholder")} inputMode="numeric" autoComplete="off" className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white" />
                <input value={connForm.password} onChange={(e) => setConnForm({ ...connForm, password: e.target.value })} placeholder={t("t2t.passwordPlaceholder")} type="password" autoComplete="off" className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white" />
              </div>
            )}
            {connError && <p className="text-xs text-rose-400 mt-2">{connError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConnectOpen(false)} disabled={connBusy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300">{hasAccount ? t("t2t.close") : t("t2t.cancel")}</button>
              {!hasAccount && (
                <button onClick={connectAccount} disabled={connBusy} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black disabled:opacity-60">{connBusy ? t("t2t.linking") : t("t2t.linkAccount")}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {tap && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => tap.status !== "loading" && setTap(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-[#D2A63C]" />
              <h3 className="text-base font-bold">T2T · Tap to Trade</h3>
            </div>
            {tap.status === "confirm" && (
              <>
                {!isReady && (
                  <p className="text-xs text-amber-400 mb-2">{t("t2t.notLinkedWarning")}</p>
                )}
                {preview?.mode === "follow" ? (
                  <p className="text-sm text-zinc-300 mb-3">
                    Perpétuo: <strong className="text-white">seguir a posição</strong>. Não é aberta nenhuma
                    ordem na tua conta — a gestão da posição-mestre chega-te por notificação.
                  </p>
                ) : (
                  <p className="text-sm text-zinc-300 mb-3">
                    {t("t2t.confirmBefore")}<strong className="text-white">{t("t2t.yourAccount")}</strong>{t("t2t.confirmMiddle")}<strong className="text-white">{riskLabel}</strong>{t("t2t.confirmEnd")}
                  </p>
                )}

                {/* Parâmetros da trade — o que se está a aceitar, sem ter de ler o texto cru. */}
                {preview?.trade && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[15px] font-bold text-white">{preview.trade.symbol}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${preview.trade.direction === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {preview.trade.direction === "buy" ? "Compra" : "Venda"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-mono tabular-nums">
                      {preview.trade.entry != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">Entrada</span><span className="text-zinc-200">{preview.trade.entry}</span></div>
                      )}
                      {preview.trade.sl != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">Stop</span><span className="text-rose-400">{preview.trade.sl}</span></div>
                      )}
                      {preview.trade.tps.slice(0, 3).map((tp, i) => (
                        <div key={i} className="flex justify-between"><span className="text-zinc-500">Alvo {i + 1}</span><span className="text-emerald-400">{tp}</span></div>
                      ))}
                      {preview.trade.stopPips != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">Ao stop</span><span className="text-zinc-400">{preview.trade.stopPips} pips</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quanto se arrisca, por conta. É a pergunta que o cliente faz antes de tocar. */}
                {preview?.mode === "execute" && preview.accounts.length > 0 && (
                  <div className="rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-[#D2A63C] mb-2">Nas tuas contas</p>
                    <div className="flex flex-col gap-2">
                      {preview.accounts.map((a) => (
                        <div key={a.id} className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] text-zinc-300 truncate">{a.label}</span>
                          {a.available ? (
                            <span className="text-[12px] font-mono tabular-nums text-right">
                              <span className="text-white font-semibold">{a.lot != null ? `${a.lot} lote${a.lot === 1 ? "" : "s"}` : "—"}</span>
                              {/* O risco REAL do lote manda: com lote fixo, ou quando o mínimo do
                                  broker sobe o lote, o que vai para o mercado não é a % escolhida. */}
                              {a.realRiskPct != null ? (
                                <span className={a.overCap != null ? "text-amber-400 font-semibold" : "text-zinc-500"}> · {a.realRiskPct}%</span>
                              ) : (
                                a.riskPct != null && <span className="text-zinc-500"> · {a.riskPct}%</span>
                              )}
                              {a.riskAmount != null && <span className="text-zinc-400"> ≈ {a.riskAmount}</span>}
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-600">conta não respondeu</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {preview.accounts.some((a) => a.overCap != null) && (
                      <p className="text-[10px] text-amber-400 mt-2 leading-snug">
                        ⚠️ O lote mínimo da corretora arrisca mais do que o tecto que escolheste
                        {preview.accounts.filter((a) => a.overCap != null).map((a) => ` — ${a.label}: ${a.realRiskPct}% contra ${a.overCap}%`).join("")}. Com este saldo não há lote que respeite a percentagem.
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 mt-2">Percentagem e valor calculados sobre a equity de cada conta.</p>
                  </div>
                )}
                {/* DIZER PORQUE É QUE NÃO DÁ. Uma conta em pausa, desligada ou sem saldo era
                    simplesmente omitida: o cliente via a lista vazia, carregava em aceitar e
                    apanhava um erro opaco. Agora o motivo aparece ANTES do clique. */}
                {preview?.mode === "execute" && (preview.blocked?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-3">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-2">
                      {preview!.accounts.length > 0 ? "Contas que ficam de fora" : "Nenhuma conta pode aceitar"}
                    </p>
                    <div className="flex flex-col gap-2">
                      {preview!.blocked!.map((b) => (
                        <div key={`${b.id}-${b.motivo}`} className="text-[11px] leading-snug">
                          <span className="text-zinc-300 font-medium">{b.label}</span>
                          <span className="text-amber-300"> — {b.motivo}</span>
                          <span className="text-zinc-500"> {b.comoResolver}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {previewBusy && !preview && <p className="text-[11px] text-zinc-500 mb-3">A calcular o risco nas tuas contas…</p>}

                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap mb-4">{tap.sig.content}</div>
                <div className="flex gap-2">
                  <button onClick={() => setTap(null)} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">{t("t2t.cancel")}</button>
                  <button onClick={runTap} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95">
                    {preview?.mode === "follow" ? "Seguir posição" : t("t2t.confirmOpen")}
                  </button>
                </div>
              </>
            )}
            {tap.status === "loading" && <p className="text-sm text-zinc-300 py-6 text-center">{t("t2t.openingTrade")}</p>}
            {tap.status === "done" && (
              <>
                <p className="text-sm text-emerald-400 py-4 text-center">✅ {tap.message}</p>
                {/* Depois de aceitar há sempre um sítio para onde ir: o chat da fonte, onde a
                    gestão desta trade vai aparecer em thread. Fechar o modal e ficar na lista
                    deixava o cliente sem saber onde seguir o desfecho. */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTap(null)}
                    className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95"
                  >
                    {t("t2t.close")}
                  </button>
                  <button
                    onClick={() => {
                      const slug = tap.sig.channel_slug
                      setTap(null)
                      window.location.href = `/app-mobile?tab=chat&channel=${encodeURIComponent(slug)}&msg=${encodeURIComponent(tap.sig.id)}`
                    }}
                    className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95"
                  >
                    Ver no chat
                  </button>
                </div>
              </>
            )}
            {tap.status === "error" && (
              <>
                <p className="text-sm text-rose-400 py-4 text-center">⚠️ {tap.message}</p>
                <button onClick={() => setTap(null)} className="w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">{t("t2t.close")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
