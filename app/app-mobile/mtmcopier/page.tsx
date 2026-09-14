"use client"

import { TradeLockerBadge } from "@/components/tradelocker/tradelocker-connect-form"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { waitForSupabaseSession } from "@/lib/supabase-session"
import {
  ArrowLeft, Send, RefreshCw, Lock, ExternalLink,
  CheckCircle2, Settings2, Plus, Zap, Loader2,
  AlertTriangle, BarChart3, History, ChevronDown, ChevronUp, Power,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/components/i18n-provider"
import SetupModal, { type MTMcopierConnection, type MtmcopySenderMode } from "@/components/mtmcopy/setup-modal"
import {
  StatusPill, SignalCard, EmptySignals, ModeBanner, CopyTraderBanner, StrategyMtmBanner,
  formatRelative, formatMt5Money,
} from "@/components/mtmcopy/mtmcopy-shared"
import {
  connectionMethodStatus,
  connectionUsesTelegramChannel,
  isTelegramChannelErrorMessage,
} from "@/lib/mtmcopy/connection-sanitize"
import {
  copyMethodLabel, parseTelegramGroups, strategyPickLabel, telegramGroupsLabel,
  type MtmcopyCopyMethod,
} from "@/lib/mtmcopy/copy-methods"
import {
  countCopyTraderSlaves, maxCopyTraderSlaves,
} from "@/lib/mtmcopy/copy-limits"
import { isMasterReadyForCopySlaves } from "@/lib/mtmcopy/user-copy-context"
import {
  getClientConnectionTitle, isMasterConnection, MTM_MASTER_LABEL,
} from "@/lib/mtmcopy/display-utils"
import type { MtmcopyUserLimits } from "@/lib/mtmcopy/account-limits"

/** App iOS nativa (MTM System) — compras têm de ser via App Store (Apple 3.1.1). */
const isIosNativeApp = () =>
  typeof navigator !== "undefined" &&
  /mtmnativeapp/i.test(navigator.userAgent) &&
  /iphone|ipad|ipod/i.test(navigator.userAgent)

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnRow = MTMcopierConnection & {
  last_signal_at: string | null
  last_error: string | null
  account_balance?: number | null
  account_equity?: number | null
  copyfactory_subscribed?: boolean
}

interface SignalLog {
  id: string
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  lot: number | null
  status: "received" | "executed" | "skipped" | "error"
  detail: string | null
  created_at: string
}

interface AccessStatus {
  hasAccess: boolean
  subscribed: boolean
  canActivate: boolean
  reason: string
}

// ─── Signal History (mobile) ──────────────────────────────────────────────────

function SignalHistoryMobile({ accessToken }: { accessToken: string }) {
  const t = useT()
  const [signals, setSignals] = useState<SignalLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mtmcopy/signals?limit=30", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (res.ok) {
        setSignals(data.signals ?? [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { load() }, [load])

  const visible = expanded ? signals : signals.slice(0, 5)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          {t("mtmcopier.signalHistory")}
          {total > 0 && <span className="normal-case font-normal">({total})</span>}
        </h2>
        <button onClick={load} className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-[#D2A63C] animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <EmptySignals />
      ) : (
        <>
          <div className="space-y-2">
            {visible.map(sig => <SignalCard key={sig.id} signal={sig} />)}
          </div>
          {signals.length > 5 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-white py-2 transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-4 h-4" /> {t("mtmcopier.showLess")}</>
                : <><ChevronDown className="w-4 h-4" /> {t("mtmcopier.showAll")} ({signals.length})</>}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MtmcopierMobilePage() {
  const t = useT()
  const router = useRouter()
  const [access, setAccess] = useState<AccessStatus | null>(null)
  const [connections, setConnections] = useState<ConnRow[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupSelectionId, setSetupSelectionId] = useState<string | "new" | null>(null)
  const [senderMode, setSenderMode] = useState<MtmcopySenderMode>("telegram")
  const [copyMethod, setCopyMethod] = useState<MtmcopyCopyMethod>("telegram_group")
  const [subscribed, setSubscribed] = useState(false)
  const [accountLimits, setAccountLimits] = useState<MtmcopyUserLimits | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState("")
  const [error, setError] = useState("")

  const hasConnections = connections.length > 0
  const masterConn = connections.find(c => c.account_role === "master") ?? null
  const isCopyTrader = senderMode === "master_account" || Boolean(masterConn)

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadData = useCallback(async (token?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/app-mobile/login"); return }

      const tok = token ?? session.access_token
      setAccessToken(tok)
      const headers = { Authorization: `Bearer ${tok}` }

      const [accessRes, connRes] = await Promise.all([
        fetch("/api/mtmcopy/access", { headers }),
        fetch("/api/mtmcopy/connection", { headers }),
      ])

      if (accessRes.ok) {
        const data = await accessRes.json()
        setAccess(data)
      }

      if (connRes.ok) {
        const data = await connRes.json()
        setConnections(data.connections ?? [])
        if (data.sender_mode) setSenderMode(data.sender_mode)
        const first = (data.connections ?? [])[0]
        if (first?.copy_method) setCopyMethod(first.copy_method)
        else if (data.sender_mode === "master_account") setCopyMethod("master_slave")
        setSubscribed(Boolean(data.subscribed))
        if (data.limits) setAccountLimits(data.limits)
      }
    } catch (err) {
      console.error("[MTMcopier mobile]", err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Open setup modal ─────────────────────────────────────────────────────────
  const openSetup = async (
    selectionId: string | "new" | null = null,
    methodOverride?: MtmcopyCopyMethod,
  ) => {
    try {
      const tok = await waitForSupabaseSession()
      if (!tok) { setError(t("mtmcopier.sessionExpired")); return }
      setAccessToken(tok)

      const res = await fetch("/api/mtmcopy/connection", {
        headers: { Authorization: `Bearer ${tok}` },
      })
      const data = await res.json()
      const list = (res.ok ? data.connections ?? [] : connections) as ConnRow[]
      setConnections(list)
      if (data.sender_mode) setSenderMode(data.sender_mode)
      if (data.subscribed != null) setSubscribed(Boolean(data.subscribed))

      const conn = selectionId && selectionId !== "new"
        ? list.find(c => c.id === selectionId)
        : list[0]

      if (methodOverride) {
        setCopyMethod(methodOverride)
      } else if (conn?.copy_method) {
        setCopyMethod(conn.copy_method)
      } else if (conn?.account_role === "master") {
        setCopyMethod("master_slave")
      } else if (conn) {
        setCopyMethod(conn.sender_mode === "master_account" ? "master_slave" : "telegram_group")
      }

      setSetupSelectionId(selectionId)
      setShowSetup(true)
    } catch {
      setError(t("mtmcopier.cannotOpenSetup"))
    }
  }

  const openGerirContas = () => {
    if (masterConn) {
      const slaves = countCopyTraderSlaves(connections)
      const maxS = accountLimits?.maxCopyTraderSlaves ?? maxCopyTraderSlaves(connections)
      const addSlave = isMasterReadyForCopySlaves(masterConn) && slaves < maxS
      void openSetup(addSlave ? "new" : masterConn.id, "master_slave")
      return
    }
    void openSetup(connections[0]?.id ?? null)
  }

  const handleSetupSaved = async () => {
    setShowSetup(false)
    await loadData(accessToken ?? undefined)
  }

  // ── Toggle ────────────────────────────────────────────────────────────────────
  const handleToggle = async (conn: ConnRow) => {
    if (!accessToken) return
    setTogglingId(conn.id)
    setError("")
    try {
      const res = await fetch("/api/mtmcopy/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ connection_id: conn.id, is_active: !conn.is_active }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t("mtmcopier.errorUpdateState"))
      } else {
        setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, is_active: !c.is_active } : c))
      }
    } catch {
      setError(t("mtmcopier.networkError"))
    } finally {
      setTogglingId(null)
    }
  }

  // ── Checkout ──────────────────────────────────────────────────────────────────
  const handleCheckout = async () => {
    // App iOS: subscrições via App Store (Apple Guideline 3.1.1)
    if (isIosNativeApp()) {
      setError(t("mtmcopier.iosSubscribeError"))
      return
    }
    setCheckingOut(true)
    setError("")
    try {
      const tok = await waitForSupabaseSession()
      if (!tok) { router.push("/app-mobile/login"); return }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ planId: "mtmcopy_addon_monthly" }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) { setError(data.error || t("mtmcopier.errorStartPayment")); return }
      window.location.href = data.url
    } catch {
      setError(t("mtmcopier.networkError"))
    } finally {
      setCheckingOut(false)
    }
  }

  // ── Verify Telegram ───────────────────────────────────────────────────────────
  const handleVerifyTelegram = async () => {
    if (!accessToken) return
    setVerifying(true)
    setVerifyMsg("")
    try {
      const res = await fetch("/api/mtmcopy/telegram/verify", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      setVerifyMsg(data.ok ? (data.message || t("mtmcopier.telegramConfirmed")) : (data.error || t("mtmcopier.cannotVerify")))
      if (data.ok) await loadData(accessToken)
    } catch {
      setVerifyMsg(t("mtmcopier.networkError"))
    } finally {
      setVerifying(false)
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-[#D2A63C] animate-spin" />
      </div>
    )
  }

  // ─── No Access ────────────────────────────────────────────────────────────────
  if (!access?.hasAccess) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800">
          <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Send className="w-5 h-5 text-[#D2A63C]" />
          <h1 className="font-bold text-lg">MTMcopier</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
          <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
            <Lock className="w-9 h-9 text-gray-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{t("mtmcopier.noAccessTitle")}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              {t("mtmcopier.noAccessDesc")}
            </p>
          </div>
          <div className="w-full space-y-3">
            <a
              href="https://www.morethanmoney.pt/mtmcopy"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#D2A63C]/10 border border-[#D2A63C]/30 text-[#D2A63C] font-semibold"
            >
              <ExternalLink className="w-4 h-4" />
              {t("mtmcopier.learnMore")}
            </a>
            <button onClick={() => router.back()} className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-medium">
              {t("mtmcopier.back")}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Main View ────────────────────────────────────────────────────────────────
  return (
    <>
      {showSetup && (
        <SetupModal
          connections={connections}
          initialSelectionId={setupSelectionId}
          initialSenderMode={senderMode}
          initialCopyMethod={copyMethod}
          accountLimits={accountLimits}
          onClose={() => setShowSetup(false)}
          onSaved={handleSetupSaved}
        />
      )}

      <div className="min-h-screen bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-800 sticky top-0 bg-black z-10">
          <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </button>
          <Send className="w-5 h-5 text-[#D2A63C]" />
          <div className="flex-1">
            <h1 className="font-bold text-lg leading-none">MTMcopier</h1>
            <p className="text-xs text-gray-400 mt-0.5">{t("mtmcopier.headerSubtitle")}</p>
          </div>
          <button onClick={() => loadData(accessToken ?? undefined)} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Subscription status */}
          {subscribed ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-sm text-emerald-400 font-medium">{t("mtmcopier.subscriptionActive")}</span>
            </div>
          ) : hasConnections && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3">
              <p className="text-amber-100/90 text-sm">
                {t("mtmcopier.preconfiguredNote")}{isIosNativeApp() ? "" : ` ${t("mtmcopier.priceSuffix")}`}.
              </p>
              {isIosNativeApp() ? (
                <p className="text-xs text-amber-100/70">{t("mtmcopier.iosActivatePre")} <strong>App Store</strong>{t("mtmcopier.iosActivatePost")}</p>
              ) : (
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="w-full py-2.5 rounded-xl bg-[#D2A63C] text-black font-bold text-sm flex items-center justify-center gap-2"
                >
                  {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {t("mtmcopier.activateSubscription")}
                </button>
              )}
            </div>
          )}

          {/* Connections */}
          {!hasConnections ? (
            <div className="py-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mx-auto border border-gray-700">
                <Send className="w-7 h-7 text-gray-500" />
              </div>
              <div>
                <p className="text-white font-semibold">{t("mtmcopier.noAccountsTitle")}</p>
                <p className="text-gray-400 text-sm mt-1">{t("mtmcopier.noAccountsDesc")}</p>
              </div>
              <button
                onClick={() => openSetup("new")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D2A63C] text-black font-bold text-sm"
              >
                <Plus className="w-4 h-4" />
                {t("mtmcopier.setupMt5Account")}
              </button>
              {!subscribed && !isIosNativeApp() && (
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut}
                  className="w-full py-3 rounded-xl bg-gray-800 text-gray-300 font-medium text-sm flex items-center justify-center gap-2"
                >
                  {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("mtmcopier.activateMtmcopier")} {t("mtmcopier.priceSuffix")}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Section header */}
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Power className="w-3.5 h-3.5" />
                  {t("mtmcopier.yourAccounts")} ({connections.length}{accountLimits?.unlimited ? "" : `/${accountLimits?.maxAccounts ?? 4}`})
                </h2>
                <button
                  onClick={() => {
                    if (masterConn && isMasterReadyForCopySlaves(masterConn)) {
                      void openSetup("new", "master_slave")
                    } else {
                      void openSetup("new")
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-[#D2A63C] font-semibold py-1.5 px-3 rounded-lg bg-[#D2A63C]/10 border border-[#D2A63C]/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("mtmcopier.newAccount")}
                </button>
              </div>

              {isCopyTrader && masterConn && (
                <CopyTraderBanner strategyId={masterConn.copyfactory_strategy_id} />
              )}

              {/* Connection cards */}
              <div className="space-y-3">
                {connections.map((conn, index) => (
                  <div
                    key={conn.id}
                    className={`rounded-xl border p-4 space-y-3 ${conn.is_active ? "bg-gray-900 border-gray-700" : "bg-gray-900/50 border-gray-800 opacity-75"}`}
                  >
                    {/* Title + toggle */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-white truncate flex-1">
                        {getClientConnectionTitle(conn, index)}
                        {(conn as { mt5_platform?: string | null }).mt5_platform === "tradelocker" && <TradeLockerBadge className="ml-2 align-middle" />}
                      </p>
                      <button
                        onClick={() => handleToggle(conn)}
                        disabled={togglingId === conn.id}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          conn.is_active
                            ? "border-green-500/30 bg-green-500/10 text-green-400"
                            : "border-gray-600 bg-gray-800 text-gray-400"
                        }`}
                      >
                        {togglingId === conn.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : null}
                        {conn.is_active ? t("mtmcopier.active") : t("mtmcopier.paused")}
                      </button>
                    </div>

                    {/* Mode/method info */}
                    {isMasterConnection(conn.account_role) ? (
                      <div className="rounded-lg bg-[#D2A63C]/5 border border-[#D2A63C]/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[#D2A63C]/70 mb-1">{t("mtmcopier.personalCopyTrader")}</p>
                        <p className="text-sm font-semibold text-white">{MTM_MASTER_LABEL}</p>
                        <div className="mt-2">
                          <StatusPill status={conn.mt5_status} />
                        </div>
                      </div>
                    ) : (
                      <>
                        {!isCopyTrader && (
                          conn.copy_method === "strategy" ? (
                            <StrategyMtmBanner strategyPick={conn.copyfactory_strategy_pick} />
                          ) : (
                            <ModeBanner customChannel={conn.telegram_channel} />
                          )
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-2.5">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{t("mtmcopier.method")}</p>
                            <p className="text-xs text-white font-medium truncate">
                              {isCopyTrader ? MTM_MASTER_LABEL : conn.copy_method === "strategy" ? t("mtmcopier.mtmStrategy") : copyMethodLabel(conn.copy_method)}
                            </p>
                            {!isCopyTrader && conn.copy_method === "strategy" && (
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                {strategyPickLabel(conn.copyfactory_strategy_pick)}
                                {conn.copyfactory_subscribed ? ` · ${t("mtmcopier.copyActive")}` : ` · ${t("mtmcopier.copyPending")}`}
                              </p>
                            )}
                            {!isCopyTrader && conn.copy_method === "telegram_group" && (
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                {telegramGroupsLabel(parseTelegramGroups(conn))}
                              </p>
                            )}
                            <div className="mt-1.5">
                              <StatusPill status={connectionMethodStatus(conn)} />
                            </div>
                          </div>
                          <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-2.5">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">MetaTrader</p>
                            <p className="text-xs text-white font-medium truncate">
                              {conn.mt5_server || "—"}
                              {conn.mt5_login_last4 && <span className="text-gray-500"> ····{conn.mt5_login_last4}</span>}
                            </p>
                            <div className="mt-1.5">
                              <StatusPill status={conn.mt5_status} />
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Balance + stats */}
                    {conn.account_role !== "master" && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-[#D2A63C]/10 border border-[#D2A63C]/25 p-2 text-center">
                          <p className="text-[10px] text-[#D2A63C]/80 mb-0.5">{t("mtmcopier.balance")}</p>
                          <p className="text-xs font-semibold text-white tabular-nums">{formatMt5Money(conn.account_balance)}</p>
                          {conn.account_equity != null && conn.account_equity !== conn.account_balance && (
                            <p className="text-[9px] text-gray-500 mt-0.5">{t("mtmcopier.equityShort")} {formatMt5Money(conn.account_equity)}</p>
                          )}
                        </div>
                        {isCopyTrader ? (
                          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-2 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">{t("mtmcopier.multiplier")}</p>
                            <p className="text-xs text-white font-medium">
                              {conn.lot_mode === "multiplier" ? conn.lot_value : "1"}×
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-2 text-center">
                            <p className="text-[10px] text-gray-500 mb-0.5">{t("mtmcopier.lotMode")}</p>
                            <p className="text-xs text-white font-medium">
                              {conn.lot_mode === "fixed" ? t("mtmcopier.fixed") : conn.lot_mode === "risk_percent" ? `${conn.lot_value}%` : `${conn.lot_value}×`}
                            </p>
                          </div>
                        )}
                        <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-2 text-center">
                          <p className="text-[10px] text-gray-500 mb-0.5">
                            {isCopyTrader ? t("mtmcopier.copyState") : t("mtmcopier.lastSignal")}
                          </p>
                          <p className="text-xs text-white font-medium">
                            {isCopyTrader
                              ? (conn.copyfactory_subscribed ? t("mtmcopier.statusActive") : t("mtmcopier.statusPending"))
                              : (conn.last_signal_at ? formatRelative(conn.last_signal_at) : t("mtmcopier.none"))}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {connectionUsesTelegramChannel(conn) &&
                      conn.telegram_status === "pending" &&
                      conn.telegram_channel && (
                      <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <p>{t("mtmcopier.addBotPre")} <strong>@MoreThanMoney_aibot</strong> {t("mtmcopier.addBotMid")} <strong>{conn.telegram_channel}</strong>.</p>
                      </div>
                    )}
                    {conn.mt5_status === "pending" && (
                      <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <p>{t("mtmcopier.connectingAccount")}</p>
                      </div>
                    )}
                    {conn.last_error && !isTelegramChannelErrorMessage(conn.last_error) && (
                      <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <p className="line-clamp-2">{conn.last_error}</p>
                      </div>
                    )}

                    {/* Edit button */}
                    <button
                      onClick={() => openSetup(conn.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 transition-all"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      {t("mtmcopier.editAccount")}
                    </button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-1">
                {!isCopyTrader && (
                  <button
                    onClick={handleVerifyTelegram}
                    disabled={verifying}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#D2A63C] text-black font-bold text-sm"
                  >
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {t("mtmcopier.verifyTelegram")}
                  </button>
                )}
                {verifyMsg && (
                  <p className={`text-xs text-center ${verifyMsg.includes("confirmad") || verifyMsg.includes("activo") ? "text-emerald-400" : "text-amber-400"}`}>
                    {verifyMsg}
                  </p>
                )}
                {subscribed && (
                  <a
                    href="/mtmcopy/metrics"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 text-sm font-medium"
                  >
                    <BarChart3 className="w-4 h-4 text-[#D2A63C]" />
                    {t("mtmcopier.metricsTerminal")}
                  </a>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-400 text-center">{error}</p>
              )}

              {/* Signal history */}
              {accessToken && subscribed && (
                <SignalHistoryMobile accessToken={accessToken} />
              )}
            </>
          )}

          {/* Bottom safe area */}
          <div style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))" }} />
        </div>
      </div>
    </>
  )
}
