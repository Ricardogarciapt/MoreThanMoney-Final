"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import MTMcopierManager from "@/components/admin/mtmcopier-manager"
import MtmcopyOpsHub from "@/components/admin/mtmcopy-ops-hub"
import MtmcopyTestPanel from "@/components/admin/mtmcopy-test-panel"
import MtmcopySenderLog from "@/components/admin/mtmcopy-sender-log"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft, Bot, Loader2, Shield, Radio, RefreshCw, ExternalLink,
} from "lucide-react"
import { PipelineFlow } from "@/components/mtmcopy/mtmcopy-shared"

export default function AdminMtmcopyPage() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const highlightUserId = searchParams.get("userId")
  const highlightRouteId = searchParams.get("routeId")
  const [mounted, setMounted] = useState(false)
  const [webhookInfo, setWebhookInfo] = useState<Record<string, unknown> | null>(null)
  const [botUsername, setBotUsername] = useState("MoreThanMoney_aibot")

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!user) {
      router.replace("/login?redirect=/admin/mtmcopy")
      return
    }
    if (!isAdmin) {
      router.replace("/member-area")
    }
  }, [mounted, isLoading, user, isAdmin, router])

  const loadSystem = useCallback(async () => {
    try {
      const [wh, defs] = await Promise.all([
        fetch("/api/telegram/webhook").then((r) => r.json()),
        fetch("/api/mtmcopy/telegram/defaults").then((r) => r.json()),
      ])
      setWebhookInfo(wh)
      if (defs.bot_username) setBotUsername(defs.bot_username)
    } catch {
      setWebhookInfo(null)
    }
  }, [])

  useEffect(() => {
    if (mounted && isAdmin) loadSystem()
  }, [mounted, isAdmin, loadSystem])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <aside className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-zinc-950/90 p-4">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="w-full justify-start text-zinc-400 hover:text-[#D2A63C] mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Admin
          </Button>
        </Link>
        <div className="flex items-center gap-2 px-1 mb-6">
          <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25">
            <Shield className="h-4 w-4 text-[#D2A63C]" />
          </div>
          <span className="font-semibold text-sm">MTMcopier Ops</span>
        </div>
        <nav className="space-y-1 text-sm">
          <span className="block px-3 py-2 rounded-lg bg-[#D2A63C]/15 text-[#D2A63C] border-l-2 border-[#D2A63C]">
            Consola
          </span>
          <Link href="/admin?tab=users" className="block px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50">
            Utilizadores
          </Link>
          <Link href="/mtmcopy" className="block px-3 py-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50">
            Página cliente
          </Link>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="border-b border-[#D2A63C]/15 bg-black/40 px-6 py-4 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#D2A63C] mb-1">
                <Radio className="w-3 h-3" /> Admin · Operações
              </div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Bot className="w-6 h-6 text-[#D2A63C]" />
                Consola MTMcopier
              </h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadSystem} className="border-zinc-700">
                <RefreshCw className="w-4 h-4 mr-1.5" /> Sistema
              </Button>
              <Button asChild variant="outline" size="sm" className="border-zinc-700">
                <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> @{botUsername}
                </a>
              </Button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 space-y-6 max-w-7xl">
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <div className="h-px bg-gradient-to-r from-transparent via-[#D2A63C]/40 to-transparent" />
            <CardContent className="pt-2 pb-4">
              <PipelineFlow botUsername={botUsername} />
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="bg-zinc-900/60 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Webhook</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-emerald-400">
                  {(webhookInfo as { status?: string })?.status ?? "—"}
                </p>
                <p className="text-xs text-zinc-600 mt-1 truncate">
                  {(webhookInfo as { bot?: string })?.bot ?? `@${botUsername}`}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/60 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Stack</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-white">Bot API · Vercel</p>
                <p className="text-xs text-zinc-600 mt-1">Sem VPS / FastAPI</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/60 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-widest text-zinc-500">Modo cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-white">Grupos MTM + canal opcional</p>
                <p className="text-xs text-zinc-600 mt-1">Config em /mtmcopy</p>
              </CardContent>
            </Card>
          </div>

          <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-950/80">
            <div className="border-b border-emerald-500/15 px-6 py-4">
              <h2 className="text-lg font-semibold text-emerald-400">Log de sinais · Senders Telegram</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Últimas trades e tentativas dos canais MTM — validação IA (mín. 35% confiança), erros de mercado e parser.
              </p>
            </div>
            <div className="p-6">
              <MtmcopySenderLog />
            </div>
          </section>

          <MtmcopyTestPanel />

          <MtmcopyOpsHub initialRouteId={highlightRouteId} />

          <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-zinc-950/80 backdrop-blur-sm">
            <div className="border-b border-[#D2A63C]/15 px-6 py-4">
              <h2 className="text-lg font-semibold text-[#D2A63C]">Gestão individual · Utilizadores + MTMcopier</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Ligação à base de dados de utilizadores. Configura MetaAPI, Telegram, MT5 e histórico de sinais por pessoa.
              </p>
            </div>
            <div className="p-6">
              <MTMcopierManager highlightUserId={highlightUserId} />
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
