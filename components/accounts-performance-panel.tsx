"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Wallet, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

/**
 * Painel de DESEMPENHO DAS CONTAS no journaling do trading plan: equidade, P&L do dia e do mês,
 * win rate e profit factor por conta ligada do utilizador. Alimentado pelo snapshot diário
 * (/api/mtmcopy/my-accounts-performance) — o journal deixa de ser só o que escreveste e passa a
 * mostrar o que as contas fizeram de facto.
 */
interface Acc {
  label: string
  accountId: string
  equity: number | null
  pnlToday: number
  pnlMonth: number
  trades: number | null
  winRatePct: number | null
  profitFactor: number | null
  ok: boolean
  note?: string
}
interface Totals { equity: number; pnlToday: number; pnlMonth: number; trades: number }

const nf = (n: number, d = 2) =>
  new Intl.NumberFormat("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
const sign = (n: number) => (n >= 0 ? `+${nf(n)}` : nf(n))
const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-gray-400")

export default function AccountsPerformancePanel() {
  const [accounts, setAccounts] = useState<Acc[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) return
        const res = await fetch("/api/mtmcopy/my-accounts-performance", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        const j = await res.json()
        if (cancelled || !j?.ok) return
        setAccounts(j.accounts ?? [])
        setTotals(j.totals ?? null)
        setDate(j.date ?? null)
      } catch {
        /* silencioso — o journal continua a funcionar sem isto */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card className="bg-gray-900 border-gray-700 mb-4">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
        </CardContent>
      </Card>
    )
  }
  if (!accounts.length) return null

  const live = accounts.filter((a) => a.ok)

  return (
    <Card className="bg-gray-900 border-gray-700 mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-gray-200 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#D2A63C]" />
          Desempenho das tuas contas
          {date && <span className="ml-auto text-xs font-normal text-gray-500">{date}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {totals && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-950/60 border border-gray-800 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Equidade</p>
              <p className="text-white font-semibold tabular-nums">{nf(totals.equity)}</p>
            </div>
            <div className="rounded-lg bg-gray-950/60 border border-gray-800 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Hoje</p>
              <p className={`font-semibold tabular-nums ${tone(totals.pnlToday)}`}>{sign(totals.pnlToday)}</p>
            </div>
            <div className="rounded-lg bg-gray-950/60 border border-gray-800 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Mês</p>
              <p className={`font-semibold tabular-nums ${tone(totals.pnlMonth)}`}>{sign(totals.pnlMonth)}</p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {live.map((a) => (
            <div key={a.accountId} className="flex items-center gap-3 rounded-lg bg-gray-950/40 border border-gray-800 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">{a.label}</p>
                <p className="text-[11px] text-gray-500 tabular-nums">
                  {a.trades ?? 0} trades
                  {a.winRatePct != null && ` · ${Math.round(a.winRatePct)}% acerto`}
                  {a.profitFactor != null && ` · PF ${nf(a.profitFactor)}`}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-semibold tabular-nums flex items-center gap-1 justify-end ${tone(a.pnlToday)}`}>
                  {a.pnlToday >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {sign(a.pnlToday)}
                </p>
                <p className="text-[11px] text-gray-500 tabular-nums">eq. {nf(a.equity ?? 0)}</p>
              </div>
            </div>
          ))}
        </div>

        {accounts.some((a) => !a.ok) && (
          <p className="text-[11px] text-gray-500">
            {accounts.filter((a) => !a.ok).length} conta(s) sem métricas nesta leitura (ociosas — reaparecem com atividade).
          </p>
        )}
      </CardContent>
    </Card>
  )
}
