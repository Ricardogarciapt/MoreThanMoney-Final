"use client"

import { useCallback, useEffect, useState } from "react"
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

const FOLLOWUP_RE = /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i
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

type Category = "all" | "gold" | "forex" | "crypto" | "indices"

function categoryOf(content: string): Exclude<Category, "all"> | "other" {
  const c = content.toUpperCase()
  if (/XAU|GOLD/.test(c)) return "gold"
  if (/BTC|ETH|SOL|XRP|USDT|CRYPTO/.test(c)) return "crypto"
  if (/NAS100|US30|US500|GER40|SPX|DOW|UK100|JP225/.test(c)) return "indices"
  if (/[A-Z]{3}USD|USD[A-Z]{3}|EUR|GBP|JPY|AUD|CAD|CHF|NZD/.test(c)) return "forex"
  return "other"
}

function directionOf(content: string): "BUY" | "SELL" | "" {
  const c = content.toLowerCase()
  if (/🟢|\bbuy\b|\blong\b|\bcompra\b/.test(c)) return "BUY"
  if (/🔴|\bsell\b|\bshort\b|\bvenda\b/.test(c)) return "SELL"
  return ""
}

/** Tempo máximo para um sinal estar ativo (5 minutos). */
const T2T_MAX_AGE_MS = 5 * 60 * 1000

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

interface Sig {
  id: string
  channel_slug: string
  content: string
  created_at: string
  expired?: boolean
  reason?: string
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

const FILTERS: { id: Category; labelKey: string }[] = [
  { id: "all", labelKey: "t2t.filterAll" },
  { id: "gold", labelKey: "t2t.filterGold" },
  { id: "forex", labelKey: "t2t.filterForex" },
  { id: "crypto", labelKey: "t2t.filterCrypto" },
  { id: "indices", labelKey: "t2t.filterIndices" },
]


export default function TapToTradeFeed() {
  const t = useT()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Category>("all")
  const [limitMode, setLimitMode] = useState<"last5" | "all">("last5")
  const [tap, setTap] = useState<{ sig: Sig; status: "confirm" | "loading" | "done" | "error"; message?: string } | null>(null)
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
      .select("id, channel_slug, content, created_at")
      .in("channel_slug", channels)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(120)
    const all = (data ?? []) as Sig[]
    // follow-ups (TP atingido / fechado / SL / cancelado) para marcar sinais resolvidos
    const followups = all.filter((m) => FOLLOWUP_RE.test(m.content))
    const now = Date.now()
    const sigs = all
      .filter((m) => isEntrySignal(m.channel_slug, m.content))
      // Sensei: só ideias activadas (abrem na conta provider = aparecem no chat)
      .filter((m) => m.channel_slug !== "sensei-scanner" || !senseiFilterOn || senseiIds.has(m.id))
      .map((m) => {
        const ageMs = now - new Date(m.created_at).getTime()
        const ageExpired = ageMs > T2T_MAX_AGE_MS
        const sym = symbolOf(m.content)
        const resolved = followups.some(
          (f) =>
            f.channel_slug === m.channel_slug &&
            new Date(f.created_at).getTime() > new Date(m.created_at).getTime() &&
            (!sym || symbolOf(f.content) === sym),
        )
        return {
          ...m,
          expired: ageExpired || resolved,
          reason: resolved ? "resolved" : ageExpired ? "aged" : "",
        }
      })
    setItems(sigs)
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

  // Deep-link: notificação T2T → abrir directamente a confirmação da trade
  useEffect(() => {
    const sigId = searchParams?.get("signal") || searchParams?.get("msg")
    if (!sigId) return
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
  }, [searchParams, items])

  const filtered = items
    // "O que seguir": só as fontes + classes de ativo que o user escolheu ([]=todas)
    .filter((s) => matchesT2TPrefs(s.channel_slug, s.content, { sources: follow.sources, assetClasses: follow.assetClasses }))
    .filter((s) => cat === "all" || categoryOf(s.content) === cat)
  const shown = limitMode === "last5" ? filtered.slice(0, 5) : filtered

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
  }
  // PERSISTE as prefs (botão Guardar). O risco também aplica o sizing por %.
  const persistFollow = async () => {
    if (!conn) return
    setSavingFollow(true)
    try {
      const tok = await token()
      if (!tok) return
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
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      })
      await loadConnection()
      setFollowDirty(false)
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
            {savingFollow ? "A guardar…" : followDirty ? "Guardar" : "Guardado ✓"}
          </button>
        </div>
      )}

      {providers.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-zinc-500 shrink-0">{t("t2t.activeStrategies")}</span>
          {providers.map((p, i) => (
            <span key={i} className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/30 whitespace-nowrap">
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* alcance: últimos 5 (default) vs todos */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          onClick={() => setLimitMode("last5")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
            limitMode === "last5" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
          }`}
        >
          {t("t2t.last5")}
        </button>
        <button
          onClick={() => setLimitMode("all")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${
            limitMode === "all" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
          }`}
        >
          {t("t2t.all")}
        </button>
      </div>

      {/* filtros por categoria */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setCat(f.id)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium ${
              cat === f.id ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" /></div>
      ) : shown.length === 0 ? (
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
                ) : s.expired ? (
                  <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800/70 text-zinc-500 font-semibold text-[12px] py-2.5 cursor-not-allowed">
                    <Clock className="w-4 h-4" /> {t("t2t.signalExpired")}{s.reason ? ` · ${s.reason === "resolved" ? t("t2t.reasonResolved") : t("t2t.reasonAged")}` : ""}
                  </div>
                ) : (
                  <button
                    onClick={() => setTap({ sig: s, status: "confirm" })}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 active:scale-[0.98] transition-transform"
                  >
                    <Zap className="w-4 h-4" /> Tap to Trade
                  </button>
                )}
              </div>
            )
          })}
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
                <p className="text-sm text-zinc-300 mb-3">
                  {t("t2t.confirmBefore")}<strong className="text-white">{t("t2t.yourAccount")}</strong>{t("t2t.confirmMiddle")}<strong className="text-white">{riskLabel}</strong>{t("t2t.confirmEnd")}
                </p>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 max-h-28 overflow-y-auto whitespace-pre-wrap mb-4">{tap.sig.content}</div>
                <div className="flex gap-2">
                  <button onClick={() => setTap(null)} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">{t("t2t.cancel")}</button>
                  <button onClick={runTap} className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95">{t("t2t.confirmOpen")}</button>
                </div>
              </>
            )}
            {tap.status === "loading" && <p className="text-sm text-zinc-300 py-6 text-center">{t("t2t.openingTrade")}</p>}
            {tap.status === "done" && (
              <>
                <p className="text-sm text-emerald-400 py-4 text-center">✅ {tap.message}</p>
                <button onClick={() => setTap(null)} className="w-full rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95">{t("t2t.close")}</button>
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
