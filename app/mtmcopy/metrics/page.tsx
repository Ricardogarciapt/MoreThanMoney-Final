"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Breadcrumbs from "@/components/breadcrumbs"
import ParticleBackground from "@/components/particle-background"
import { Button } from "@/components/ui/button"
import { ArrowLeft, BarChart3, Loader2, Server, Target, TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import TradingDashboard from "@/components/mtmcopy/trading-dashboard"

export default function MtmcopyMetricsPage() {
  const { isAdmin } = useAuth()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) {
          setLoading(false)
          window.location.href = "/login?redirect=/mtmcopy/metrics"
        }
        return
      }
      setAccessToken(session.access_token)
      const accessRes = await fetch("/api/mtmcopy/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const accessData = await accessRes.json()
      if (!cancelled) {
        setSubscribed(Boolean(accessData.subscribed))
        setLoading(false)
        if (!accessData.hasAccess) window.location.href = "/mtmcopy"
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#D2A63C] animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0c] overflow-hidden">
      <ParticleBackground />
      <Breadcrumbs />

      <main className="relative z-10 container mx-auto px-4 py-10 max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/mtmcopy" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white mb-3">
              <ArrowLeft className="w-4 h-4" /> Voltar ao MTMcopier
            </Link>
            <h1 className="text-3xl md:text-4xl font-black text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-[#D2A63C]" />
              Terminal de performance
            </h1>
            <p className="text-zinc-400 mt-2 max-w-xl">
              Cópia automática, trading journal e plano de trading — interligado com{" "}
              <a href="/scanner-access" className="text-[#D2A63C] hover:underline">scanner-access</a>.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-center min-w-[120px]">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Estado</p>
              <p className={`text-sm font-bold ${subscribed ? "text-emerald-400" : "text-amber-400"}`}>
                {subscribed ? "Subscrição activa" : "Aguarda pagamento"}
              </p>
            </div>
            <div className="rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 px-4 py-3 text-center min-w-[120px]">
              <Target className="w-4 h-4 text-[#D2A63C] mx-auto mb-1" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Objectivo</p>
              <p className="text-sm font-bold text-white">Consistência</p>
            </div>
          </div>
        </div>

        {accessToken && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-1">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 text-xs text-zinc-500">
              <TrendingUp className="w-3.5 h-3.5 text-[#D2A63C]" />
              MTMcopier · Métricas em tempo real
            </div>
            <div className="p-4 md:p-6">
              <TradingDashboard accessToken={accessToken} variant="broker" />
            </div>
          </div>
        )}

        {/* Quadros «Desempenho das estratégias ativas / Provider» removidos (pedido Ricardo
            2026-08-19) — informação duplicada; o terminal mostra a performance das contas do membro. */}

        {isAdmin && (
          <Link
            href="/admin/mtmcopy"
            className="mt-8 flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-zinc-950/40 px-5 py-4 hover:border-emerald-500/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm text-emerald-400">
              <Server className="w-4 h-4" />
              Admin · Consola MTMcopier completa
            </span>
            <span className="text-xs text-zinc-500">Abrir →</span>
          </Link>
        )}

        {!subscribed && (
          <div className="mt-8 text-center rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <p className="text-amber-200/90 mb-4">
              A cópia automática só arranca após activares a subscrição MTMcopier (+20€/mês).
            </p>
            <Button asChild className="bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold">
              <Link href="/mtmcopy">Activar subscrição</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
