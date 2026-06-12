"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { adminApiCall } from "@/lib/admin-helpers"
import { Loader2, FlaskConical, Send, TrendingUp } from "lucide-react"

interface ProviderOption {
  id: string
  label: string
  accountId: string
  channel: "premium-signals" | "trade-ideas"
}

interface MetaOverview {
  strategies: Array<{ id: string; name: string; accountId: string }>
  accounts: Array<{ id: string; name: string; login: string }>
}

const PREMIUM_ACCOUNT = "c17a8c46-7fe7-40cf-acb4-41678d42f9a9"
const TRADE_IDEAS_ACCOUNT = "fbeeafeb-96a9-4133-bc6c-194cc281b6e0"

const SAMPLE_PREMIUM = `XAUUSD SELL NOW
Gold Sell Zone 2650 - 2655
SL: 2660
TP1: 2645
TP2: 2640
TP3: 2635`

const SAMPLE_TRADE_IDEAS = `Moeda: AUDUSD
Ação: Buy
Stoploss: 0.6520
Takeprofit: 0.6580`

export default function MtmcopyTestPanel() {
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [selectedProvider, setSelectedProvider] = useState("")
  const [tradeSymbol, setTradeSymbol] = useState("XAUUSD")
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("sell")
  const [orderType, setOrderType] = useState<"market" | "limit">("market")
  const [volume, setVolume] = useState("")
  const [entry, setEntry] = useState("")
  const [sl, setSl] = useState("")
  const [tp, setTp] = useState("")
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradeResult, setTradeResult] = useState<string | null>(null)

  const [tgChannel, setTgChannel] = useState<"premium-signals" | "trade-ideas">("premium-signals")
  const [tgText, setTgText] = useState(SAMPLE_PREMIUM)
  const [tgSend, setTgSend] = useState(true)
  const [tgPipeline, setTgPipeline] = useState(true)
  const [tgLoading, setTgLoading] = useState(false)
  const [tgResult, setTgResult] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    const [routesRes, metaRes] = await Promise.all([
      adminApiCall<{ config: { provider_routes?: Array<{ id: string; label?: string; account_id: string; sender_channel?: string; enabled?: boolean }> } }>(
        "/api/admin/mtmcopy/telegram-sources",
      ),
      adminApiCall<MetaOverview>("/api/admin/mtmcopy/metaapi"),
    ])

    const opts: ProviderOption[] = [
      {
        id: "premium-default",
        label: "MTM Auto — Premium",
        accountId: PREMIUM_ACCOUNT,
        channel: "premium-signals",
      },
      {
        id: "trade-default",
        label: "MTM Auto — Trade Ideas",
        accountId: TRADE_IDEAS_ACCOUNT,
        channel: "trade-ideas",
      },
    ]

    for (const r of routesRes.data?.config?.provider_routes ?? []) {
      if (!r.enabled || !r.account_id) continue
      opts.push({
        id: r.id,
        label: r.label || r.account_id.slice(0, 8),
        accountId: r.account_id,
        channel: (r.sender_channel as ProviderOption["channel"]) || "premium-signals",
      })
    }

    for (const s of metaRes.data?.strategies ?? []) {
      if (opts.some((o) => o.accountId === s.accountId)) continue
      const ch = s.name.toLowerCase().includes("trade") ? "trade-ideas" : "premium-signals"
      opts.push({
        id: `strategy-${s.id}`,
        label: s.name,
        accountId: s.accountId,
        channel: ch,
      })
    }

    setProviders(opts)
    setSelectedProvider((prev) => prev || opts[0]?.id || "")
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    setTgText(tgChannel === "premium-signals" ? SAMPLE_PREMIUM : SAMPLE_TRADE_IDEAS)
    if (tgChannel === "premium-signals") {
      setTradeSymbol("XAUUSD")
      setTradeDirection("sell")
    } else {
      setTradeSymbol("AUDUSD")
      setTradeDirection("buy")
    }
  }, [tgChannel])

  const currentProvider = providers.find((p) => p.id === selectedProvider)

  async function runProviderTest() {
    if (!currentProvider) return
    setTradeLoading(true)
    setTradeResult(null)
    const res = await adminApiCall("/api/admin/mtmcopy/test-provider-trade", {
      method: "POST",
      body: JSON.stringify({
        account_id: currentProvider.accountId,
        channel: currentProvider.channel,
        symbol: tradeSymbol,
        direction: tradeDirection,
        order_type: orderType,
        volume: volume ? Number(volume) : undefined,
        entry: entry ? Number(entry) : undefined,
        sl: sl ? Number(sl) : undefined,
        tp: tp ? Number(tp) : undefined,
        comment: "MTM-ADMIN-TEST",
      }),
    })
    setTradeLoading(false)
    const d = res.data as { ok?: boolean; message?: string; orderId?: string; volume?: number; error?: string } | undefined
    if (res.success && d && d.ok !== false) {
      setTradeResult(
        `✅ ${d.message ?? "Trade enviada"}${d.orderId ? ` · #${d.orderId}` : ""}${d.volume ? ` · ${d.volume} lot` : ""}`,
      )
    } else {
      setTradeResult(`❌ ${d?.error ?? res.error ?? "Erro ao enviar trade"}`)
    }
  }

  async function runTelegramTest() {
    setTgLoading(true)
    setTgResult(null)
    const res = await adminApiCall("/api/admin/mtmcopy/test-telegram", {
      method: "POST",
      body: JSON.stringify({
        channel: tgChannel,
        text: tgText,
        send_to_telegram: tgSend,
        run_pipeline: tgPipeline,
      }),
    })
    setTgLoading(false)
    const d = res.data as {
      ok?: boolean
      message?: string
      telegram_message_id?: number
      pipeline?: boolean
      error?: string
    } | undefined
    if (res.success && d && d.ok !== false) {
      const pipe = d.pipeline ? " · pipeline OK" : ""
      setTgResult(`✅ ${d.message ?? "Enviado"}${d.telegram_message_id ? ` · msg ${d.telegram_message_id}` : ""}${pipe}`)
    } else {
      setTgResult(`❌ ${d?.error ?? res.error ?? "Erro no teste Telegram"}`)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-500/25 bg-zinc-950/80">
      <div className="border-b border-violet-500/20 px-6 py-4">
        <h2 className="text-lg font-semibold text-violet-400 flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          Testes · Provider & Telegram
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Envia trades de teste às contas MTM Auto ou publica sinais nos canais via @MoreThanMoney_aibot.
        </p>
      </div>

      <div className="p-6 grid lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="font-medium text-white">Trade na conta provider</h3>
            <Badge variant="outline" className="text-xs border-zinc-700">Método 2</Badge>
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue placeholder="Escolher provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label} · {p.accountId.slice(0, 8)}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Símbolo</Label>
              <Input value={tradeSymbol} onChange={(e) => setTradeSymbol(e.target.value)} className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label>Direcção</Label>
              <Select value={tradeDirection} onValueChange={(v) => setTradeDirection(v as "buy" | "sell")}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={orderType} onValueChange={(v) => setOrderType(v as "market" | "limit")}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="limit">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lotes (opcional)</Label>
              <Input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="perfil" className="bg-zinc-900 border-zinc-700" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Entry</Label>
              <Input value={entry} onChange={(e) => setEntry(e.target.value)} className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label>SL</Label>
              <Input value={sl} onChange={(e) => setSl(e.target.value)} className="bg-zinc-900 border-zinc-700" />
            </div>
            <div>
              <Label>TP</Label>
              <Input value={tp} onChange={(e) => setTp(e.target.value)} className="bg-zinc-900 border-zinc-700" />
            </div>
          </div>

          <Button
            onClick={runProviderTest}
            disabled={tradeLoading || !currentProvider}
            className="w-full bg-emerald-600 hover:bg-emerald-500"
          >
            {tradeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
            Enviar trade de teste
          </Button>
          {tradeResult && <p className="text-sm text-zinc-300">{tradeResult}</p>}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-sky-400" />
            <h3 className="font-medium text-white">Sinal no canal Telegram</h3>
            <Badge variant="outline" className="text-xs border-zinc-700">Método 1+2</Badge>
          </div>

          <div>
            <Label>Canal</Label>
            <Select value={tgChannel} onValueChange={(v) => setTgChannel(v as typeof tgChannel)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="premium-signals">Premium · @MTMgold</SelectItem>
                <SelectItem value="trade-ideas">Trade Ideas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Texto do sinal</Label>
            <Textarea
              value={tgText}
              onChange={(e) => setTgText(e.target.value)}
              rows={8}
              className="bg-zinc-900 border-zinc-700 font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <Switch checked={tgSend} onCheckedChange={setTgSend} />
              Publicar no Telegram
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <Switch checked={tgPipeline} onCheckedChange={setTgPipeline} />
              Correr pipeline MTMcopy
            </label>
          </div>

          <Button
            onClick={runTelegramTest}
            disabled={tgLoading}
            className="w-full bg-sky-600 hover:bg-sky-500"
          >
            {tgLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar teste
          </Button>
          {tgResult && <p className="text-sm text-zinc-300">{tgResult}</p>}
        </div>
      </div>
    </section>
  )
}
