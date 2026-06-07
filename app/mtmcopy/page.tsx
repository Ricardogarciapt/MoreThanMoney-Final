"use client"

import { useEffect, useState } from "react"
import Breadcrumbs from "@/components/breadcrumbs"
import ParticleBackground from "@/components/particle-background"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight, Send, LineChart, ShieldCheck, Zap, Loader2, X, Check,
  AlertTriangle, RefreshCw, Power, Settings2,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface CopygramConnection {
  id: string
  telegram_channel: string | null
  telegram_status: "pending" | "connected" | "error" | "disconnected"
  mt5_login_last4: string | null
  mt5_server: string | null
  mt5_status: "pending" | "connected" | "error" | "disconnected"
  lot_mode: "fixed" | "risk_percent" | "multiplier"
  lot_value: number
  max_risk_percent: number | null
  copy_sl: boolean
  copy_tp: boolean
  reverse_signals: boolean
  is_active: boolean
  last_signal_at: string | null
  last_error: string | null
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  connected:    { label: "Ligado",      className: "bg-green-500/15 text-green-400 border-green-500/30" },
  pending:      { label: "Pendente",    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  error:        { label: "Erro",        className: "bg-red-500/15 text-red-400 border-red-500/30" },
  disconnected: { label: "Desligado",   className: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
}

// ---------------------------------------------------------------------------
// Modal de configuração
// ---------------------------------------------------------------------------

function SetupModal({
  initial, onClose, onSaved,
}: {
  initial: CopygramConnection | null
  onClose: () => void
  onSaved: (c: CopygramConnection) => void
}) {
  const [telegramChannel, setTelegramChannel] = useState(initial?.telegram_channel ?? "")
  const [mt5Server, setMt5Server] = useState(initial?.mt5_server ?? "")
  const [mt5Last4, setMt5Last4] = useState(initial?.mt5_login_last4 ?? "")
  const [lotMode, setLotMode] = useState<CopygramConnection["lot_mode"]>(initial?.lot_mode ?? "fixed")
  const [lotValue, setLotValue] = useState(String(initial?.lot_value ?? "0.01"))
  const [maxRisk, setMaxRisk] = useState(String(initial?.max_risk_percent ?? "1"))
  const [copySl, setCopySl] = useState(initial?.copy_sl ?? true)
  const [copyTp, setCopyTp] = useState(initial?.copy_tp ?? true)
  const [reverse, setReverse] = useState(initial?.reverse_signals ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    setError("")
    if (!telegramChannel.trim()) {
      setError("Indica o canal/grupo do Telegram de onde vamos ler os sinais.")
      return
    }
    if (!mt5Server.trim() || !/^\d{1,4}$/.test(mt5Last4.trim())) {
      setError("Indica o servidor MT5 e os últimos 4 dígitos da tua conta (apenas para identificação — nunca pedimos a password aqui).")
      return
    }

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }

      const res = await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          telegram_channel: telegramChannel.trim(),
          mt5_server: mt5Server.trim(),
          mt5_login_last4: mt5Last4.trim(),
          lot_mode: lotMode,
          lot_value: parseFloat(lotValue) || 0.01,
          max_risk_percent: parseFloat(maxRisk) || 1,
          copy_sl: copySl,
          copy_tp: copyTp,
          reverse_signals: reverse,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Não foi possível guardar a configuração.")
        setSaving(false)
        return
      }
      onSaved(data.connection)
    } catch {
      setError("Erro de rede. Tenta novamente.")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 overflow-y-auto py-8">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 relative my-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-white mb-1">Configurar o Copygram</h3>
        <p className="text-sm text-gray-400 mb-5">
          Estes dados ficam associados à tua ligação. As credenciais completas da tua conta MT5
          <strong className="text-white"> nunca</strong> são pedidas aqui — a equipa contacta-te
          para finalizar a ligação em segurança após o pagamento do addon.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Canal/Grupo do Telegram *</label>
            <Input value={telegramChannel} onChange={e => setTelegramChannel(e.target.value)}
              placeholder="@nome_do_canal ou link de convite" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Servidor MT5 *</label>
              <Input value={mt5Server} onChange={e => setMt5Server(e.target.value)}
                placeholder="ex: ICMarkets-Live05" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Últimos 4 dígitos da conta *</label>
              <Input value={mt5Last4} onChange={e => setMt5Last4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234" className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Modo de cálculo do lote</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "fixed", label: "Lote fixo" },
                { id: "risk_percent", label: "% de risco" },
                { id: "multiplier", label: "Multiplicador" },
              ] as const).map(opt => (
                <button key={opt.id} type="button" onClick={() => setLotMode(opt.id)} disabled={saving}
                  className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                    lotMode === opt.id ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#D2A63C]" : "border-gray-700 text-gray-400 hover:bg-gray-800"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {lotMode === "fixed" ? "Lote (ex: 0.01)" : lotMode === "risk_percent" ? "% por operação" : "Multiplicador"}
              </label>
              <Input value={lotValue} onChange={e => setLotValue(e.target.value)} inputMode="decimal"
                className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Risco máx. diário (%)</label>
              <Input value={maxRisk} onChange={e => setMaxRisk(e.target.value)} inputMode="decimal"
                className="bg-gray-800 border-gray-700 text-white" disabled={saving} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            {[
              { label: "Copiar Stop Loss", value: copySl, set: setCopySl },
              { label: "Copiar Take Profit", value: copyTp, set: setCopyTp },
              { label: "Inverter sinais", value: reverse, set: setReverse },
            ].map(({ label, value, set }) => (
              <label key={label} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={value} onChange={e => set(e.target.checked)} disabled={saving}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-[#D2A63C] focus:ring-[#D2A63C]/40" />
                {label}
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">{error}</div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full mt-5 bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold">
          {saving ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A guardar...</> : <>Guardar configuração <ArrowRight className="ml-2 h-5 w-5" /></>}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

const HOW_IT_WORKS = [
  { icon: Send, title: "1. Lemos o teu canal de sinais", text: "O Copygram liga-se ao canal/grupo do Telegram que escolheres e identifica os sinais de entrada (símbolo, direção, SL e TP)." },
  { icon: Settings2, title: "2. Aplicamos as tuas regras", text: "Lote fixo, percentagem de risco ou multiplicador — tu decides como cada sinal é dimensionado antes de chegar à tua conta." },
  { icon: LineChart, title: "3. Executamos no teu MT5", text: "As ordens são enviadas diretamente para a tua conta MetaTrader 5, com Stop Loss e Take Profit replicados automaticamente." },
  { icon: ShieldCheck, title: "4. Tu manténs o controlo", text: "Ativa, pausa ou desliga a cópia a qualquer momento. Define limites de risco diário para proteger a tua conta." },
]

export default function MtmCopyPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState<CopygramConnection | null | undefined>(undefined)
  const [showSetup, setShowSetup] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setConnection(null); return }
      try {
        const res = await fetch("/api/mtmcopy/connection", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (!cancelled) setConnection(data.connection ?? null)
      } catch {
        if (!cancelled) setConnection(null)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user?.id])

  const handleAddonCheckout = async () => {
    setError("")
    setCheckingOut(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = "/login?redirect=/mtmcopy"
        return
      }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ planId: "mtmcopy_addon_monthly" }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || "Erro ao iniciar o pagamento. Tenta novamente.")
        setCheckingOut(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError("Erro de rede. Tenta novamente.")
      setCheckingOut(false)
    }
  }

  return (
    <>
      {showSetup && (
        <SetupModal
          initial={connection ?? null}
          onClose={() => setShowSetup(false)}
          onSaved={(c) => { setConnection(c); setShowSetup(false) }}
        />
      )}

      <div className="relative min-h-screen bg-black overflow-hidden">
        <ParticleBackground />
        <Breadcrumbs />

        <main className="relative z-10 container mx-auto px-4 py-16 max-w-5xl">
          {/* Hero */}
          <div className="text-center max-w-2xl mx-auto mb-14">
            <Badge className="mb-4 bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">🔗 Addon · Copy Trading</Badge>
            <h1 className="text-3xl md:text-5xl font-black mb-4 text-white">
              <span className="text-[#D2A63C]">Copygram</span> — do Telegram direto para o teu MT5
            </h1>
            <p className="text-gray-400 text-lg">
              Liga o canal de sinais que segues à tua conta MetaTrader 5. Sem copiar e colar,
              sem ficar agarrado ao telemóvel — as tuas operações seguem o ritmo do mercado, em tempo real.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <span className="text-3xl font-black text-white">+20€</span>
              <span className="text-gray-400">/mês · addon sobre o teu Pack MTM</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button
                onClick={() => connection ? setShowSetup(true) : handleAddonCheckout()}
                disabled={checkingOut}
                size="lg"
                className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
              >
                {checkingOut ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
                ) : connection ? (
                  <><Settings2 className="mr-2 h-5 w-5" />Gerir a minha ligação</>
                ) : (
                  <>Ativar o Copygram <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </Button>
              {!connection && (
                <Button onClick={() => setShowSetup(true)} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                  Pré-configurar antes de pagar
                </Button>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400 mt-4 max-w-md mx-auto">{error}</p>
            )}
          </div>

          {/* Estado da ligação */}
          {connection && (
            <Card className="mb-14 bg-gray-900/60 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Power className="w-5 h-5 text-[#D2A63C]" /> A tua ligação Copygram
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Telegram</p>
                    <p className="text-white font-medium mb-2">{connection.telegram_channel || "—"}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABEL[connection.telegram_status]?.className}`}>
                      {STATUS_LABEL[connection.telegram_status]?.label}
                    </span>
                  </div>
                  <div className="rounded-xl bg-gray-800/50 border border-gray-700/50 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">MetaTrader 5</p>
                    <p className="text-white font-medium mb-2">
                      {connection.mt5_server || "—"} {connection.mt5_login_last4 ? `· ····${connection.mt5_login_last4}` : ""}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_LABEL[connection.mt5_status]?.className}`}>
                      {STATUS_LABEL[connection.mt5_status]?.label}
                    </span>
                  </div>
                </div>

                {(connection.telegram_status === "pending" || connection.mt5_status === "pending") && (
                  <div className="mt-4 flex items-start gap-2.5 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>A nossa equipa vai contactar-te para finalizar a ligação em segurança (autenticação Telegram e ligação à conta MT5). Isto demora normalmente até 24h úteis.</p>
                  </div>
                )}
                {connection.last_error && (
                  <div className="mt-4 flex items-start gap-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>{connection.last_error}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-5">
                  <Button onClick={() => setShowSetup(true)} variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
                    <Settings2 className="mr-2 h-4 w-4" /> Editar regras de cópia
                  </Button>
                  <Button variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-800" onClick={() => window.location.reload()}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar estado
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Como funciona */}
          <div className="mb-14">
            <h2 className="text-2xl font-bold text-white text-center mb-8">Como funciona</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {HOW_IT_WORKS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
                  <div className="w-10 h-10 rounded-lg bg-[#D2A63C]/10 flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5 text-[#D2A63C]" />
                  </div>
                  <h3 className="text-white font-bold mb-1.5">{title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Segurança */}
          <div className="rounded-2xl border border-[#D2A63C]/20 bg-gray-900/40 p-6 md:p-8 mb-14">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#D2A63C]" /> A tua segurança em primeiro lugar
            </h2>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-gray-300">
              {[
                "Nunca pedimos a password da tua conta MT5 por formulário — a ligação é feita pela equipa, em canal seguro",
                "Define limites de risco diário — o Copygram pára de copiar se o limite for atingido",
                "Ativa, pausa ou desliga a cópia a qualquer momento, sem perder a configuração",
                "Histórico completo de sinais recebidos e ordens executadas, sempre disponível para consulta",
                "Funciona como addon — precisas de ter um Pack MTM (Membro ou Premium) ativo",
                "Suporte dedicado para configurares o teu canal e a tua conta corretamente",
              ].map(point => (
                <li key={point} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#D2A63C] mt-0.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* CTA final */}
          <div className="text-center">
            <Button
              onClick={() => connection ? setShowSetup(true) : handleAddonCheckout()}
              disabled={checkingOut}
              size="lg"
              className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold"
            >
              {checkingOut ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
              ) : connection ? (
                <>Gerir a minha ligação <Settings2 className="ml-2 h-5 w-5" /></>
              ) : (
                <>Ativar o Copygram por +20€/mês <Zap className="ml-2 h-5 w-5" /></>
              )}
            </Button>
            <p className="text-xs text-gray-500 mt-3">Pagamento seguro via Stripe · cancela quando quiseres</p>
          </div>
        </main>
      </div>
    </>
  )
}
