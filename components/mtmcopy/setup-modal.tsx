"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight, Loader2, X, Check, Settings2, Plus, Trash2, Send, LineChart,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import BrokerServerSelect from "@/components/mtmcopy/broker-server-select"
import { COPY_METHODS, TELEGRAM_GROUPS, MTMCOPY_TELEGRAM_GROUP_IDS, parseTelegramGroups, normalizeTelegramChannel, type MtmcopyCopyMethod, type MtmcopyTelegramGroup } from "@/lib/mtmcopy/copy-methods"
import {
  connectionCopyMethod,
  countCopyTraderSlaves,
  countMtmSignalSlaves,
  countTotalActive,
  maxCopyTraderSlaves,
} from "@/lib/mtmcopy/copy-limits"
import { isMasterReadyForCopySlaves } from "@/lib/mtmcopy/user-copy-context"
import type { MtmcopyUserLimits } from "@/lib/mtmcopy/account-limits"
import {
  MAX_MTMCOPY_ACCOUNTS_MEMBER,
  MAX_MTMCOPY_SIGNAL_SLAVES,
} from "@/lib/mtmcopy/account-limits"
import { getClientConnectionTitle, MTM_MASTER_LABEL } from "@/lib/mtmcopy/display-utils"
import { isSafariBrowser } from "@/lib/supabase-session"
import { formatMt5Money } from "@/components/mtmcopy/mtmcopy-shared"
import { PROP_FIRM_PRESETS, type PropFirmType } from "@/lib/mtmcopy/prop-firm-presets"
import TradeLockerConnectForm, { TradeLockerBadge } from "@/components/tradelocker/tradelocker-connect-form"

const MODAL_Z = 2147483647

// Os tipos da ligacao vivem em lib/mtmcopy/types.ts. Este ficheiro chegou a ter
// uma copia propria de `MTMcopierConnection` que tinha divergido do canonico
// (sem user_id/last_signal_at/last_error), o que obrigava a casts em todo o lado.
// Re-exporta-se aqui so para nao partir os imports existentes.
export type {
  MtmcopySenderMode,
  MtmcopyAccountRole,
  MTMcopierConnection,
} from "@/lib/mtmcopy/types"
import type {
  MtmcopySenderMode,
  MtmcopyAccountRole,
  MTMcopierConnectionEnriquecida,
} from "@/lib/mtmcopy/types"

/** O modal mostra saldo/equity, por isso trabalha com a ligacao enriquecida. */
type MTMcopierConnection = MTMcopierConnectionEnriquecida

type Selection = "new" | string

function deriveSenderMode(connections: MTMcopierConnection[]): MtmcopySenderMode {
  if (connections.some((c) => c.account_role === "master")) return "master_account"
  return connections[0]?.sender_mode ?? "telegram"
}

function deriveCopyMethod(connections: MTMcopierConnection[]): MtmcopyCopyMethod {
  if (connections.some((c) => c.account_role === "master")) return "master_slave"
  const m = connections[0]?.copy_method
  if (m === "strategy" || m === "telegram_group" || m === "master_slave") return m
  return deriveSenderMode(connections) === "master_account" ? "master_slave" : "telegram_group"
}

function parseGroupsFromConn(conn: MTMcopierConnection | null): MtmcopyTelegramGroup[] {
  if (!conn) return ["premium"]
  return parseTelegramGroups(conn)
}

interface StrategyOption {
  id: string
  title: string
  description: string
}

function accountTabLabel(conn: MTMcopierConnection, index: number) {
  return getClientConnectionTitle(conn, index)
}

function loadFormFromConnection(conn: MTMcopierConnection | null) {
  const rawLabel = conn?.account_label?.trim()
  return {
    accountLabel: rawLabel && rawLabel.toLowerCase() !== "null" ? rawLabel : "",
    isAudited: conn?.is_audited ?? false,
    auditLabel: conn?.audit_label ?? "",
    telegramChannel: conn?.telegram_channel ?? "",
    mt5Server: conn?.mt5_server ?? "",
    symbolSuffix: (conn as { symbol_suffix?: string | null } | null)?.symbol_suffix ?? "",
    lotMode: (conn?.lot_mode ?? "fixed") as MTMcopierConnection["lot_mode"],
    lotValue: String(conn?.lot_value ?? "0.01"),
    maxRisk: String(conn?.max_risk_percent ?? "1"),
    symbolsInput: (conn?.symbols_whitelist ?? []).join(", "),
    copySl: conn?.copy_sl ?? true,
    copyTp: conn?.copy_tp ?? true,
    autoTrailing: conn?.auto_trailing_stop ?? false,
    trailingPoints: String(conn?.trailing_stop_points ?? 200),
    reverse: conn?.reverse_signals ?? false,
  }
}

export default function SetupModal({
  connections,
  initialSelectionId,
  initialSenderMode,
  initialCopyMethod,
  accountLimits,
  onClose,
  onSaved,
}: {
  connections: MTMcopierConnection[]
  initialSelectionId: Selection | null
  initialSenderMode?: MtmcopySenderMode | null
  initialCopyMethod?: MtmcopyCopyMethod | null
  accountLimits?: MtmcopyUserLimits | null
  onClose: () => void
  onSaved: () => void
}) {
  const masterConn = useMemo(
    () => connections.find((c) => c.account_role === "master") ?? null,
    [connections],
  )
  const slaveConns = useMemo(
    () => connections.filter((c) => (c.account_role ?? "slave") === "slave"),
    [connections],
  )

  const [copyMethod, setCopyMethod] = useState<MtmcopyCopyMethod>(
    initialCopyMethod ?? deriveCopyMethod(connections),
  )
  const senderMode: MtmcopySenderMode =
    copyMethod === "master_slave" ? "master_account" : "telegram"

  const limits = accountLimits
  const unlimited = limits?.unlimited ?? false
  const maxAccounts = limits?.maxAccounts ?? MAX_MTMCOPY_ACCOUNTS_MEMBER
  const maxSignalSlaves = limits?.maxSignalSlaves ?? MAX_MTMCOPY_SIGNAL_SLAVES
  const maxCopySlaves = limits?.maxCopyTraderSlaves ?? maxCopyTraderSlaves(connections)
  const copyTraderSlaves = countCopyTraderSlaves(connections)
  const signalSlaves = countMtmSignalSlaves(connections)
  const totalActive = countTotalActive(connections)
  const underAccountCap = unlimited || totalActive < maxAccounts
  const canAddMaster = copyMethod === "master_slave" && !masterConn && underAccountCap
  const masterReady = isMasterReadyForCopySlaves(masterConn)
  const canAddSlave =
    underAccountCap &&
    (copyMethod === "master_slave"
      ? masterReady && copyTraderSlaves < maxCopySlaves
      : signalSlaves < maxSignalSlaves)
  const canAddAccount = unlimited || canAddMaster || canAddSlave

  const connectionsForMethod = useMemo(() => {
    if (copyMethod === "master_slave") {
      return connections.filter(
        (c) => c.account_role === "master" || connectionCopyMethod(c) === "master_slave",
      )
    }
    return connections.filter(
      (c) => c.account_role !== "master" && connectionCopyMethod(c) === copyMethod,
    )
  }, [connections, copyMethod])

  const defaultSelection: Selection =
    initialSelectionId ??
    (canAddAccount ? "new" : masterConn?.id ?? connections[0]?.id ?? "new")

  const [selectedId, setSelectedId] = useState<Selection>(defaultSelection)
  const selectedConn =
    selectedId === "new" ? null : connections.find((c) => c.id === selectedId) ?? null
  const isMasterSelected = selectedConn?.account_role === "master"
  const isNewMaster = selectedId === "new" && senderMode === "master_account" && !masterConn
  const isEditMode = Boolean(selectedConn?.id && selectedConn.mt5_status !== "disconnected")
  const selectedIsTradeLocker = selectedConn?.mt5_platform === "tradelocker"
  // Religar pela password é o caminho MetaApi; uma conta TradeLocker em erro apaga-se e liga-se de novo.
  const needsRelink =
    isEditMode &&
    !selectedIsTradeLocker &&
    (selectedConn?.mt5_status === "pending" || selectedConn?.mt5_status === "error")
  const showSlaveSettings = !isMasterSelected && !isNewMaster
  const isCopyTraderSlave = copyMethod === "master_slave" && showSlaveSettings

  const [accountLabel, setAccountLabel] = useState("")
  const [isAudited, setIsAudited] = useState(false)
  const [auditLabel, setAuditLabel] = useState("")
  const [telegramChannel, setTelegramChannel] = useState("")
  const [mt5Platform, setMt5Platform] = useState<"mt4" | "mt5">("mt5")
  /** Plataforma da conta NOVA: MetaTrader (MetaApi) ou TradeLocker (API própria). */
  const [plataformaNova, setPlataformaNova] = useState<"metatrader" | "tradelocker">("metatrader")
  const [mt5Login, setMt5Login] = useState("")
  const [mt5Password, setMt5Password] = useState("")
  const [mt5Server, setMt5Server] = useState("")
  const [symbolSuffix, setSymbolSuffix] = useState("")
  const [lotMode, setLotMode] = useState<MTMcopierConnection["lot_mode"]>("fixed")
  const [lotValue, setLotValue] = useState("0.01")
  const [maxRisk, setMaxRisk] = useState("1")
  const [symbolsInput, setSymbolsInput] = useState("")
  const [copySl, setCopySl] = useState(true)
  const [copyTp, setCopyTp] = useState(true)
  const [autoTrailing, setAutoTrailing] = useState(false)
  const [trailingPoints, setTrailingPoints] = useState("200")
  const [reverse, setReverse] = useState(false)
  const [telegramGroups, setTelegramGroups] = useState<MtmcopyTelegramGroup[]>(["premium"])
  const [strategyPick, setStrategyPick] = useState("")
  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [exitTp1, setExitTp1] = useState("33")
  const [exitTp2, setExitTp2] = useState("33")
  const [exitTp3, setExitTp3] = useState("34")
  const [propFirmType, setPropFirmType] = useState<"" | PropFirmType>("")

  const [provisioning, setProvisioning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [mounted, setMounted] = useState(false)
  const safari = isSafariBrowser()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  useEffect(() => {
    if (initialCopyMethod) setCopyMethod(initialCopyMethod)
  }, [initialCopyMethod])

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const res = await fetch("/api/mtmcopy/strategies", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (res.ok && data.strategies?.length) {
        setStrategies(data.strategies)
        if (!strategyPick) setStrategyPick(data.strategies[0].id)
      }
    })()
  }, [])

  useEffect(() => {
    const f = loadFormFromConnection(selectedConn)
    setAccountLabel(f.accountLabel)
    setIsAudited(f.isAudited)
    setAuditLabel(f.auditLabel)
    setTelegramChannel(f.telegramChannel)
    setMt5Server(f.mt5Server)
    setSymbolSuffix(f.symbolSuffix)
    setLotMode(f.lotMode)
    setLotValue(f.lotValue)
    setMaxRisk(f.maxRisk)
    setSymbolsInput(f.symbolsInput)
    setCopySl(f.copySl)
    setCopyTp(f.copyTp)
    setAutoTrailing(f.autoTrailing)
    setTrailingPoints(f.trailingPoints)
    setReverse(f.reverse)
    setTelegramGroups(parseGroupsFromConn(selectedConn))
    setStrategyPick(selectedConn?.copyfactory_strategy_pick ?? strategies[0]?.id ?? "")
    setExitTp1(String(selectedConn?.exit_pct_tp1 ?? 33))
    setExitTp2(String(selectedConn?.exit_pct_tp2 ?? 33))
    setExitTp3(String(selectedConn?.exit_pct_tp3 ?? 34))
    setPropFirmType(
      selectedConn?.prop_firm_type === "ftmo" || selectedConn?.prop_firm_type === "fundednext"
        ? selectedConn.prop_firm_type
        : "",
    )
    if (selectedConn?.copy_method) {
      setCopyMethod(selectedConn.copy_method)
    } else if (selectedConn?.account_role === "master") {
      setCopyMethod("master_slave")
    } else if (selectedConn) {
      setCopyMethod(
        selectedConn.sender_mode === "master_account" ? "master_slave" : "telegram_group",
      )
    }
    if (copyMethod === "master_slave" && selectedId === "new" && !isMasterSelected) {
      setLotMode("multiplier")
      setLotValue("1")
    }
    setMt5Login("")
    setMt5Password("")
    setError("")
  }, [selectedId, selectedConn, strategies, copyMethod, isMasterSelected])

  const toggleTelegramGroup = (id: MtmcopyTelegramGroup) => {
    setTelegramGroups((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((g) => g !== id)
        return next.length ? next : [id]
      }
      return [...prev, id]
    })
  }

  const handleCopyMethodChange = (method: MtmcopyCopyMethod) => {
    if (method === copyMethod) return
    setError("")
    setCopyMethod(method)

    if (method === "master_slave") {
      if (masterConn) setSelectedId(masterConn.id)
      else setSelectedId("new")
      return
    }

    const matching = connections.filter(
      (c) => c.account_role !== "master" && connectionCopyMethod(c) === method,
    )
    setSelectedId(matching[0]?.id ?? "new")
  }

  const pollProvisionStatus = async (token: string, connectionId: string, attempts = 45) => {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const st = await fetch(`/api/mtmcopy/provision?connection_id=${connectionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await st.json()
      const conn = data.connection
      if (conn?.mt5_status === "connected") return conn
      if (conn?.mt5_status === "error") {
        throw new Error(conn.last_error || "Falha ao ligar conta MT5")
      }
    }
    throw new Error("Timeout — a ligação está a demorar. Verifica o estado no painel dentro de alguns minutos.")
  }

  const applyPropFirmPreset = (type: PropFirmType) => {
    const p = PROP_FIRM_PRESETS[type]
    setPropFirmType(type)
    setIsAudited(true)
    setAuditLabel(`${p.label} · conta financiada`)
    setLotMode(p.lotMode)
    setLotValue(String(p.lotValue))
    setMaxRisk(String(p.maxRiskPercent))
    setCopySl(p.copySl)
    setCopyTp(p.copyTp)
    setExitTp1(String(p.exitPctTp1))
    setExitTp2(String(p.exitPctTp2))
    setExitTp3(String(p.exitPctTp3))
  }

  const buildSettingsPayload = () => {
    const symbols_whitelist = symbolsInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)

    const base = {
      account_label: accountLabel.trim() || null,
      is_audited: isAudited,
      audit_label: isAudited ? auditLabel.trim() || null : null,
      symbol_suffix: symbolSuffix.trim() || null,
    }

    if (!showSlaveSettings) {
      return { ...base, copy_method: copyMethod }
    }

    if (isCopyTraderSlave) {
      return {
        ...base,
        copy_method: "master_slave" as const,
        lot_mode: "multiplier" as const,
        lot_value: parseFloat(lotValue) || 1,
      }
    }

    return {
      ...base,
      telegram_channel:
        copyMethod === "strategy"
          ? null
          : senderMode === "telegram"
            ? normalizeTelegramChannel(telegramChannel)
            : null,
      lot_mode: lotMode,
      lot_value: parseFloat(lotValue) || 0.01,
      max_risk_percent: parseFloat(maxRisk) || 1,
      symbols_whitelist: symbols_whitelist.length ? symbols_whitelist : null,
      copy_sl: copySl,
      copy_tp: copyTp,
      auto_trailing_stop: autoTrailing,
      trailing_stop_points: parseInt(trailingPoints, 10) || 200,
      reverse_signals: reverse,
      telegram_groups: telegramGroups,
      telegram_group: telegramGroups[0] ?? null,
      exit_pct_tp1: parseFloat(exitTp1) || 33,
      exit_pct_tp2: parseFloat(exitTp2) || 33,
      exit_pct_tp3: parseFloat(exitTp3) || 34,
      copy_method: copyMethod,
      copyfactory_strategy_pick: copyMethod === "strategy" ? strategyPick || null : null,
      ...(propFirmType
        ? {
            prop_firm_type: propFirmType,
            apply_prop_firm_preset: true,
            copy_as_manual: true,
          }
        : { prop_firm_type: null }),
    }
  }

  const handleSave = async () => {
    setError("")

    if (!isEditMode && (!mt5Login.trim() || !mt5Password || !mt5Server.trim())) {
      setError("Preenche login, password e servidor da tua conta de trading.")
      return
    }

    if (showSlaveSettings && copyMethod === "telegram_group" && !telegramGroups.length) {
      setError("Escolhe pelo menos um grupo de sinais.")
      return
    }

    if (showSlaveSettings && copyMethod === "strategy" && !strategyPick) {
      setError("Escolhe uma estratégia MTM.")
      return
    }

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }

      if (isEditMode && selectedConn) {
        if (needsRelink) {
          if (!mt5Password) {
            setError("Introduz a password MT5 para religar a conta.")
            return
          }
          setProvisioning(true)
          const relink = await fetch("/api/mtmcopy/provision", {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              connection_id: selectedConn.id,
              mt5_password: mt5Password,
            }),
          })
          const relinkData = await relink.json()
          if (!relink.ok || relinkData.connection?.mt5_status === "error") {
            setError(relinkData.error || relinkData.message || relinkData.connection?.last_error || "Falha ao religar.")
            return
          }
          setMt5Password("")
        }

        const res = await fetch("/api/mtmcopy/connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            connection_id: selectedConn.id,
            ...buildSettingsPayload(),
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Não foi possível guardar a configuração.")
          return
        }
        onSaved()
        return
      }

      const accountRole: MtmcopyAccountRole = isNewMaster ? "master" : "slave"

      setProvisioning(true)
      const res = await fetch("/api/mtmcopy/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...buildSettingsPayload(),
          sender_mode: senderMode,
          account_role: accountRole,
          mt5_login: mt5Login.trim(),
          mt5_password: mt5Password,
          mt5_server: mt5Server.trim(),
          mt5_platform: mt5Platform,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Não foi possível ligar a conta.")
        return
      }

      setMt5Password("")
      const connId = data.connection?.id
      if (connId) await pollProvisionStatus(session.access_token, connId)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede. Tenta novamente.")
    } finally {
      setSaving(false)
      setProvisioning(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedConn || !isEditMode) return
    const label = accountTabLabel(selectedConn, connections.indexOf(selectedConn))
    const extra =
      selectedConn.account_role === "master"
        ? " As slaves deixarão de receber cópia até ligares nova mestre."
        : ""
    if (!confirm(`Apagar a conta "${label}"?${extra}`)) return

    setDeleting(true)
    setError("")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const res = await fetch(`/api/mtmcopy/connection?id=${selectedConn.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Não foi possível apagar a conta.")
        return
      }
      onSaved()
      if (connections.length <= 1) onClose()
    } catch {
      setError("Erro de rede ao apagar conta.")
    } finally {
      setDeleting(false)
    }
  }

  const newButtonLabel =
    copyMethod === "master_slave"
      ? canAddMaster
        ? "Conta mestre"
        : "Conta slave"
      : "Nova conta"

  const modal = (
    <div
      className={`fixed inset-0 flex items-start sm:items-center justify-center px-4 overflow-y-auto py-6 sm:py-8 ${
        safari ? "bg-black/95" : "bg-black/80 backdrop-blur-sm"
      }`}
      style={{ zIndex: MODAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mtmcopy-setup-title"
    >
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-xl p-6 relative my-auto shadow-2xl shadow-black/50 max-h-[min(92vh,92dvh)] overflow-y-auto overscroll-contain">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D2A63C]/50 to-transparent rounded-t-2xl" />
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#D2A63C]/15 border border-[#D2A63C]/30 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-[#D2A63C]" />
          </div>
          <div>
            <h3 id="mtmcopy-setup-title" className="text-xl font-bold text-white">Configurar MTM Copy</h3>
            <p className="text-xs text-gray-500">Liga a tua conta e escolhe como queres copiar</p>
          </div>
        </div>

        {copyMethod === "master_slave" && (
          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-1.5">
            <p className="font-semibold text-amber-300">Copy trader — 2 passos</p>
            <p>
              <span className="text-amber-400">1.</span> Liga a <strong>conta mestre</strong> (onde abres trades)
            </p>
            <p>
              <span className="text-amber-400">2.</span> Adiciona até {maxCopySlaves}{" "}
              <strong>contas slave</strong> que copiam automaticamente
            </p>
            {masterConn && (
              <p className={masterReady ? "text-green-400" : "text-amber-400"}>
                Mestre: {masterReady ? "✓ ligada — podes adicionar slaves" : "⏳ a ligar… aguarda estado ligada"}
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 mb-2">Método de cópia</label>
          <div className="grid gap-2">
            {COPY_METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={saving || deleting}
                onClick={() => handleCopyMethodChange(m.id)}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  copyMethod === m.id
                    ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                    : "border-gray-700 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {m.id === "strategy" && <LineChart className="w-4 h-4 mb-1" />}
                {m.id === "telegram_group" && <Send className="w-4 h-4 mb-1" />}
                {m.id === "master_slave" && <LineChart className="w-4 h-4 mb-1" />}
                <strong className="block">{m.title}</strong>
                <span className="text-xs opacity-80">{m.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {connectionsForMethod.map((conn, i) => (
            <button
              key={conn.id}
              type="button"
              onClick={() => setSelectedId(conn.id)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                selectedId === conn.id
                  ? conn.account_role === "master"
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                    : "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {accountTabLabel(conn, i)}
              {conn.mt5_platform === "tradelocker" && <TradeLockerBadge className="ml-1.5" />}
            </button>
          ))}
          {canAddAccount && (
            <button
              type="button"
              onClick={() => setSelectedId("new")}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
                selectedId === "new"
                  ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800"
              }`}
            >
              <Plus className="w-3 h-3" /> {newButtonLabel}
            </button>
          )}
        </div>

        <p className="text-sm text-gray-400 mb-5">
          {isNewMaster ? (
            <>Liga a tua <strong className="text-white">conta mestre</strong>. As trades que abrires aqui serão copiadas para as contas slave.</>
          ) : isMasterSelected ? (
            <>Conta mestre activa. Edita o nome ou apaga — as slaves copiam automaticamente as operações desta conta.</>
          ) : isEditMode ? (
            <>Ajusta lote, risco e opções desta conta. Não precisas de voltar a introduzir a password.</>
          ) : copyMethod === "master_slave" ? (
            <>Liga uma conta <strong className="text-white">slave</strong> que replica a tua conta mestre.</>
          ) : copyMethod === "strategy" ? (
            <>Liga a tua conta à estratégia MTM escolhida, com o teu risco e definições.</>
          ) : (
            <>Liga a tua conta aos grupos de sinais que escolheres abaixo.</>
          )}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome da conta (opcional)</label>
            <Input
              value={accountLabel}
              onChange={(e) => setAccountLabel(e.target.value)}
              placeholder={isNewMaster || isMasterSelected ? "ex: Conta mestre prop" : "ex: Slave IC Markets"}
              className="bg-gray-800 border-gray-700 text-white"
              disabled={saving || deleting}
            />
            {!isMasterSelected && !isNewMaster && (
              <p className="text-xs text-zinc-500 mt-1.5">
                Se deixares o nome vazio, mostramos o número da conta MT5.
              </p>
            )}
          </div>

          {showSlaveSettings && !isCopyTraderSlave && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAudited}
                  onChange={(e) => setIsAudited(e.target.checked)}
                  className="mt-1 rounded border-gray-600"
                  disabled={saving || deleting}
                />
                <span>
                  <span className="text-sm font-medium text-white block">Conta auditada (métricas transparentes)</span>
                  <span className="text-xs text-zinc-400">
                    Liga como MyFXBook — alimenta o journal e métricas pessoais sem misturar com a cópia automática.
                  </span>
                </span>
              </label>
              {isAudited && (
                <Input
                  value={auditLabel}
                  onChange={(e) => setAuditLabel(e.target.value)}
                  placeholder="ex: Conta prop FTMO · auditada"
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled={saving || deleting}
                />
              )}
            </div>
          )}

          {showSlaveSettings && (copyMethod === "strategy" || copyMethod === "telegram_group") && (
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/30 px-3 py-2 text-xs text-zinc-400">
              {copyMethod === "strategy"
                ? "Escolhe a estratégia MTM que esta conta vai copiar."
                : "Escolhe um ou ambos os grupos de sinais para esta conta."}
            </div>
          )}

          {copyMethod === "strategy" && showSlaveSettings && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Estratégia MTM *</label>
              <div className="grid gap-2">
                {strategies.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStrategyPick(s.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      strategyPick === s.id
                        ? "border-[#D2A63C]/50 bg-[#D2A63C]/10"
                        : "border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <p className="text-white text-sm font-semibold">{s.title}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.description}</p>
                  </button>
                ))}
                {!strategies.length && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    Nenhuma estratégia MTM disponível. O admin precisa de configurar as rotas em{" "}
                    <strong>/admin/mtmcopy</strong> (Senders → Provider).
                  </p>
                )}
              </div>
            </div>
          )}

          {copyMethod === "strategy" && showSlaveSettings && (
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-sky-300">Conta financiada (Prop Firm)</p>
              <p className="text-xs text-zinc-400">
                Presets conservadores para passar e manter a conta — trades a mercado, 1 posição com parciais nas saídas.
              </p>
              <div className="grid gap-2">
                {(Object.keys(PROP_FIRM_PRESETS) as PropFirmType[]).map((id) => {
                  const p = PROP_FIRM_PRESETS[id]
                  const active = propFirmType === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => applyPropFirmPreset(id)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? "border-sky-400/50 bg-sky-500/10"
                          : "border-gray-700 hover:border-gray-600"
                      }`}
                    >
                      <p className="text-white text-sm font-semibold">{p.label}</p>
                      <p className="text-xs text-gray-400 mt-1">{p.description}</p>
                      <p className="text-xs text-sky-300/80 mt-1">{p.consistencyHint}</p>
                    </button>
                  )
                })}
                {propFirmType && (
                  <button
                    type="button"
                    onClick={() => setPropFirmType("")}
                    className="text-xs text-gray-500 hover:text-white underline"
                  >
                    Remover preset prop firm
                  </button>
                )}
              </div>
            </div>
          )}

          {copyMethod === "telegram_group" && showSlaveSettings && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Grupos de sinais *</label>
                <p className="text-xs text-gray-500 mb-2">Escolhe um ou vários chats de sinais para esta conta copiar.</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setTelegramGroups([...MTMCOPY_TELEGRAM_GROUP_IDS])}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:border-[#D2A63C]/40"
                  >
                    Todos os sinais
                  </button>
                </div>
                <div className="grid gap-2">
                  {TELEGRAM_GROUPS.map((g) => {
                    const active = telegramGroups.includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleTelegramGroup(g.id)}
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          active
                            ? "border-[#D2A63C]/50 bg-[#D2A63C]/10"
                            : "border-gray-700 hover:border-gray-600"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            readOnly
                            checked={active}
                            className="w-4 h-4 rounded border-gray-600"
                          />
                          <p className="text-white text-sm font-semibold">{g.title}</p>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 ml-6">{g.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
              {telegramGroups.includes("premium") && (
                <>
                <p className="text-xs text-zinc-500 mb-2">
                  Percentagens de referência para o grupo Premium — a execução no provider segue a configuração admin.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Exit 1 %</label>
                    <Input value={exitTp1} onChange={(e) => setExitTp1(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Exit 2 %</label>
                    <Input value={exitTp2} onChange={(e) => setExitTp2(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Exit 3 % (fecha resto)</label>
                    <Input value={exitTp3} onChange={(e) => setExitTp3(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
                  </div>
                </div>
                </>
              )}
            </>
          )}

          {copyMethod === "master_slave" && (isNewMaster || isMasterSelected) && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-gray-300">
              <strong className="text-amber-400">Copy trader pessoal:</strong> opera nesta conta mestre e as slaves
              replicam as tuas trades em tempo real.
            </div>
          )}

          {isEditMode ? (
            <>
              <div
                className={`rounded-lg border p-3 text-xs text-gray-300 ${
                  needsRelink
                    ? "border-amber-500/25 bg-amber-500/5"
                    : "border-emerald-500/25 bg-emerald-500/5"
                }`}
              >
                {needsRelink ? (
                  <>
                    <strong className="text-amber-400">Religar conta:</strong>{" "}
                    {selectedConn?.mt5_status === "pending"
                      ? "A ligação da conta não completou. Introduz a password abaixo e guarda."
                      : selectedConn?.last_error || "Erro ao ligar a conta. Introduz a password para tentar de novo."}
                  </>
                ) : (
                  <>
                    <strong className="text-emerald-400">Conta ligada:</strong>{" "}
                    {isMasterSelected || isNewMaster
                      ? MTM_MASTER_LABEL
                      : selectedConn?.mt5_login_last4
                        ? `····${selectedConn.mt5_login_last4}`
                        : "activa"}
                  </>
                )}
                {!isMasterSelected && !isNewMaster && selectedConn?.mt5_server && (
                  <span className="block mt-1 text-gray-500">{selectedConn.mt5_server}</span>
                )}
                {selectedIsTradeLocker && (
                  <span className="block mt-1 text-sky-300/90">
                    <TradeLockerBadge /> Execução direta pela API TradeLocker.
                    {selectedConn?.mt5_status === "error" && " A conta está em erro: apaga-a e liga-a de novo com o login TradeLocker."}
                  </span>
                )}
              </div>
              {needsRelink && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password MT5 *</label>
                  <Input
                    type="password"
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    placeholder="Password para religar a conta"
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {!isNewMaster && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Plataforma da conta</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["metatrader", "tradelocker"] as const).map((p) => {
                      const bloqueada = p === "tradelocker" && copyMethod !== "telegram_group"
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => !bloqueada && setPlataformaNova(p)}
                          disabled={saving || bloqueada}
                          className={`text-sm py-2 rounded-lg border font-medium disabled:opacity-40 ${
                            plataformaNova === p && !bloqueada
                              ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                              : "border-gray-700 text-gray-400"
                          }`}
                        >
                          {p === "metatrader" ? "MetaTrader 5" : "TradeLocker"}
                        </button>
                      )
                    })}
                  </div>
                  {copyMethod !== "telegram_group" && (
                    <p className="text-xs text-zinc-500 mt-1.5">
                      TradeLocker só está disponível em <strong>Grupos de sinais</strong>: estratégias e copy trader pessoal
                      usam a CopyFactory, que é só MetaTrader.
                    </p>
                  )}
                </div>
              )}
              {!isNewMaster && plataformaNova === "tradelocker" && copyMethod === "telegram_group" ? (
                <TradeLockerConnectForm
                  purpose="mtmcopy"
                  getToken={async () => (await supabase.auth.getSession()).data.session?.access_token ?? null}
                  extraPayload={buildSettingsPayload}
                  validar={() => (showSlaveSettings && !telegramGroups.length ? "Escolhe pelo menos um grupo de sinais." : null)}
                  onConnected={() => onSaved()}
                />
              ) : (
              <>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-gray-300 space-y-1.5">
                <p>
                  <strong className="text-emerald-400">Segurança:</strong> a password é usada só para a ligação e não fica guardada no site.
                </p>
                <p>
                  <strong className="text-emerald-400">Demo ou real:</strong> pesquisa o servidor exacto do teu broker
                  (ex. <span className="font-mono text-zinc-400">ICMarketsSC-Demo</span> ou{" "}
                  <span className="font-mono text-zinc-400">TheTradingMaster-Live</span>).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Plataforma *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["mt5", "mt4"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMt5Platform(p)}
                      disabled={saving}
                      className={`text-sm py-2 rounded-lg border font-medium ${
                        mt5Platform === p
                          ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                          : "border-gray-700 text-gray-400"
                      }`}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Login *</label>
                  <Input
                    value={mt5Login}
                    onChange={(e) => setMt5Login(e.target.value.replace(/\D/g, ""))}
                    placeholder="12345678"
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={saving}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Password *</label>
                  <Input
                    type="password"
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    placeholder="Password MT4/MT5"
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={saving}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <BrokerServerSelect
                platform={mt5Platform}
                server={mt5Server}
                onServerChange={setMt5Server}
                disabled={saving}
              />
              <div className="space-y-1">
                <label className="text-sm text-gray-300">
                  Sufixo dos símbolos <span className="text-gray-500">(opcional)</span>
                </label>
                <Input
                  value={symbolSuffix}
                  onChange={(e) => setSymbolSuffix(e.target.value)}
                  placeholder="ex.: .s (PU Prime) · -STD (VT Markets) · vazio"
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled={saving}
                  autoComplete="off"
                />
                <p className="text-xs text-gray-500">
                  Sufixo do teu broker nos símbolos (ex.: no PU Prime o ouro é XAUUSD<strong>.s</strong>).
                  Usado para mapear as cópias — deixa vazio se os símbolos forem iguais aos nossos.
                </p>
              </div>
              </>
              )}
            </>
          )}

          {showSlaveSettings && isCopyTraderSlave && (
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/40 p-4 space-y-3">
              <p className="text-sm text-gray-300">
                Esta conta <strong className="text-white">copia tudo</strong> o que abrires na mestre. Ajusta só o multiplicador de volume.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Multiplicador de volume</label>
                <Input
                  value={lotValue}
                  onChange={(e) => setLotValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="1 = mesmo tamanho que a mestre"
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled={saving || deleting}
                />
                <p className="text-xs text-gray-500 mt-1">Ex: 0.5 = metade do lote · 2 = o dobro</p>
              </div>
            </div>
          )}

          {showSlaveSettings && !isCopyTraderSlave && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Modo de cálculo do lote</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: "fixed", label: "Lote fixo" },
                    { id: "risk_percent", label: "% de risco" },
                    { id: "multiplier", label: "Multiplicador" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setLotMode(opt.id)}
                      disabled={saving || deleting}
                      className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                        lotMode === opt.id
                          ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]"
                          : "border-gray-700 text-gray-400 hover:bg-gray-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {(selectedConn?.account_balance != null || selectedConn?.mt5_status === "connected") && (
                <div className="rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/5 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#D2A63C]/80">Saldo da conta MT5</p>
                    <p className="text-lg font-semibold text-white tabular-nums">
                      {formatMt5Money(selectedConn?.account_balance)}
                    </p>
                  </div>
                  {selectedConn?.account_equity != null &&
                    selectedConn.account_equity !== selectedConn.account_balance && (
                    <p className="text-xs text-zinc-500">
                      Equity {formatMt5Money(selectedConn.account_equity)}
                    </p>
                  )}
                  {lotMode === "risk_percent" && selectedConn?.account_balance != null && (
                    <p className="text-xs text-zinc-400 w-full">
                      {lotValue}% ≈{" "}
                      <strong className="text-zinc-200">
                        {formatMt5Money(
                          (selectedConn.account_balance * (parseFloat(lotValue) || 0)) / 100,
                        )}
                      </strong>{" "}
                      por trade (antes do SL)
                    </p>
                  )}
                </div>
              )}

              {lotMode === "risk_percent" && selectedConn?.mt5_status === "connected" && selectedConn?.account_balance == null && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  Saldo ainda não disponível. O teu % risco é aplicado assim que o saldo estiver sincronizado.
                </p>
              )}
              {lotMode === "risk_percent" && (
                <p className="text-xs text-zinc-500">
                  O % risco é aplicado ao volume copiado em cada trade.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {lotMode === "fixed" ? "Lote" : lotMode === "risk_percent" ? "% por operação" : "Multiplicador"}
                  </label>
                  <Input
                    value={lotValue}
                    onChange={(e) => setLotValue(e.target.value)}
                    inputMode="decimal"
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={saving || deleting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Risco máx. diário (%)</label>
                  <Input
                    value={maxRisk}
                    onChange={(e) => setMaxRisk(e.target.value)}
                    inputMode="decimal"
                    className="bg-gray-800 border-gray-700 text-white"
                    disabled={saving || deleting}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Filtro de símbolos (opcional)</label>
                <Input
                  value={symbolsInput}
                  onChange={(e) => setSymbolsInput(e.target.value)}
                  placeholder="XAUUSD, EURUSD — vazio = todos"
                  className="bg-gray-800 border-gray-700 text-white"
                  disabled={saving || deleting}
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
                {[
                  { label: "Copiar Stop Loss", value: copySl, set: setCopySl },
                  { label: "Copiar Take Profit", value: copyTp, set: setCopyTp },
                  { label: "Inverter sinais", value: reverse, set: setReverse },
                ].map(({ label, value, set }) => (
                  <label key={label} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => set(e.target.checked)}
                      disabled={saving || deleting}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-[#D2A63C]"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/40 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTrailing}
                    onChange={(e) => setAutoTrailing(e.target.checked)}
                    disabled={saving || deleting}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-[#D2A63C]"
                  />
                  <span>
                    <strong className="text-white">Auto trailing stop</strong>
                    <span className="block text-xs text-gray-500 mt-0.5">O stop loss acompanha o preço automaticamente.</span>
                  </span>
                </label>
                {autoTrailing && (
                  <Input
                    value={trailingPoints}
                    onChange={(e) => setTrailingPoints(e.target.value.replace(/\D/g, ""))}
                    placeholder="200"
                    className="bg-gray-800 border-gray-700 text-white h-9"
                    disabled={saving || deleting}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
        )}

        <div className="flex flex-col gap-2 mt-5">
          {/* Conta TradeLocker nova liga-se pelo botão do próprio formulário (login → escolher conta). */}
          {!(!isEditMode && !isNewMaster && plataformaNova === "tradelocker" && copyMethod === "telegram_group") && (
          <Button
            onClick={handleSave}
            disabled={saving || deleting}
            className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {provisioning ? "A ligar conta..." : "A guardar..."}
              </>
            ) : isEditMode ? (
              <>
                {needsRelink ? "Religar conta" : "Guardar alterações"}
                <Check className="ml-2 h-5 w-5" />
              </>
            ) : isNewMaster ? (
              <>Ligar conta mestre <ArrowRight className="ml-2 h-5 w-5" /></>
            ) : (
              <>Ligar conta e activar cópia <ArrowRight className="ml-2 h-5 w-5" /></>
            )}
          </Button>
          )}

          {isEditMode && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="w-full border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Apagar esta conta
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving || deleting}
            className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(modal, document.body)
}
