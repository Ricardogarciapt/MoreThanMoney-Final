"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Activity, ArrowLeft, ArrowLeftRight, Command as IconeComando, Cpu, ListTree, Loader2, Radio, Search, Users, Wallet,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { SECCOES, destinoDeSeccaoAntiga, ehSeccao, type SeccaoCentro } from "@/lib/admin-centro/regras"
import { Contexto, lerAlvo, type Alvo, type CentroCtx } from "@/components/admin/centro/contexto"
import Gavetas from "@/components/admin/centro/gavetas"
import Paleta from "@/components/admin/centro/paleta"
import SeccaoCockpit from "@/components/admin/centro/seccoes/cockpit"
import SeccaoSinais from "@/components/admin/centro/seccoes/sinais"
import SeccaoEstrategias from "@/components/admin/centro/seccoes/estrategias"
import SeccaoContas from "@/components/admin/centro/seccoes/contas"
import SeccaoCopia from "@/components/admin/centro/seccoes/copia"
import SeccaoUtilizadores from "@/components/admin/centro/seccoes/utilizadores"

/**
 * «Centro de Controlo MTM Auto» — o sítio único para execução e cópia (substitui /admin/mtmcopy
 * quando a paridade estiver fechada: docs/admin-centro-paridade.md).
 *
 * URL: ?s=<secção>&g=<tipo>:<id>&<filtros>. Tudo interligado: uma conta, estratégia, utilizador ou
 * sinal abre SEMPRE a mesma gaveta, venha de onde vier. Atalhos: ⌘/Ctrl+K ou / paleta · 1–8
 * secções · R reler · Esc fecha · ? ajuda.
 */

const ICONE: Record<SeccaoCentro, typeof Activity> = {
  cockpit: Activity, sinais: Radio, estrategias: ListTree, contas: Wallet, copia: ArrowLeftRight, utilizadores: Users,
}
const DESCRICAO: Record<SeccaoCentro, string> = {
  cockpit: "Saúde em tempo real: pipeline de sinais, execução, MetaApi, streaming, base, VPS, crons e alertas com runbook.",
  sinais: "Todos os sinais das últimas 24 h e o fan-out de cada um: quem executou, quem saltou e porquê, erros.",
  estrategias: "Estratégias da casa e das equipas: fonte mestre/espelho, seguidores, desempenho, divergências e afinações.",
  contas: "Todas as contas (MT4/MT5/TradeLocker/MTM Funded; clientes, casa, seguidoras, equipas) com dono, direito, quota e estado — e, no fim, os programas e o gestor MTM Funded.",
  copia: "O quadro de controlo de cópias: quem copia o quê, rotas, sombra vs live, latência, pedidos a aprovar — e a sincronização com a MetaApi e a auditoria do admin.",
  utilizadores: "Matriz de direitos MTM Auto, legado MTM Copy, quota MetaApi, contas e Tap to Trade por pessoa.",
}
const RESERVADOS = new Set(["s", "g"])

const carregar = <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" /></div>

function Centro() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || "/admin/centro"
  const sp = useSearchParams()
  const [montado, setMontado] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [versao, setVersao] = useState(0)
  const [relogio, setRelogio] = useState("")

  const seccao: SeccaoCentro = ehSeccao(sp.get("s")) ? (sp.get("s") as SeccaoCentro) : "cockpit"
  const alvo = lerAlvo(sp.get("g"))
  const filtro = useMemo(() => {
    const f: Record<string, string> = {}
    sp.forEach((v, k) => { if (!RESERVADOS.has(k)) f[k] = v })
    return f
  }, [sp])

  // Links guardados para secções que saíram (?s=funded, ?s=sincronizacao) → a secção que as absorveu.
  useEffect(() => {
    const atual: Record<string, string> = {}
    sp.forEach((v, k) => { atual[k] = v })
    const novo = destinoDeSeccaoAntiga(atual)
    if (novo) router.replace(`${pathname}?${new URLSearchParams(novo).toString()}`, { scroll: false })
  }, [sp, router, pathname])

  const escrever = useCallback((p: URLSearchParams) => {
    const qs = p.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname])

  const ctx: CentroCtx = useMemo(() => ({
    seccao, filtro, versao,
    irPara: (s, f) => {
      const p = new URLSearchParams()
      if (s !== "cockpit") p.set("s", s)
      for (const [k, v] of Object.entries(f ?? {})) if (v) p.set(k, v)
      escrever(p)
    },
    abrir: (a: Alvo) => {
      const p = new URLSearchParams(sp.toString())
      p.set("g", `${a.tipo}:${a.id}`)
      escrever(p)
    },
    fechar: () => {
      const p = new URLSearchParams(sp.toString())
      p.delete("g")
      escrever(p)
    },
    depoisDeAcao: () => setVersao((v) => v + 1),
  }), [seccao, filtro, versao, escrever, sp])

  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    if (!montado || isLoading) return
    if (!user) { router.replace(`/login?redirect=${pathname}`); return }
    if (!isAdmin) router.replace("/member-area")
  }, [montado, isLoading, user, isAdmin, router, pathname])

  useEffect(() => {
    const t = () => setRelogio(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }))
    t()
    const i = setInterval(t, 1000)
    return () => clearInterval(i)
  }, [])

  // ── atalhos ──
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const alvoEl = e.target as HTMLElement | null
      const aEscrever = alvoEl && (alvoEl.tagName === "INPUT" || alvoEl.tagName === "TEXTAREA" || alvoEl.tagName === "SELECT" || alvoEl.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta((x) => !x); return }
      if (aEscrever || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "/") { e.preventDefault(); setPaleta(true); return }
      if (e.key === "?") { setAjuda((x) => !x); return }
      if (e.key.toLowerCase() === "r") { setVersao((v) => v + 1); return }
      if (e.key === "Escape") { setAjuda(false); return }
      const s = SECCOES.find((x) => x.atalho === e.key)
      if (s && !paleta) ctx.irPara(s.id)
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [ctx, paleta])

  if (!montado || isLoading) return carregar
  if (!user || !isAdmin) return null

  const Icone = ICONE[seccao]
  const nome = SECCOES.find((s) => s.id === seccao)?.nome ?? ""

  return (
    <Contexto.Provider value={ctx}>
      <div className="flex min-h-screen bg-black text-white [background-image:radial-gradient(ellipse_at_top_right,rgba(210,166,60,0.07),transparent_45%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] [background-size:auto,32px_32px,32px_32px]">
        <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col border-r border-[#D2A63C]/15 bg-zinc-950/85 backdrop-blur lg:flex">
          <div className="border-b border-white/[0.05] p-4">
            <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-[#D2A63C]"><ArrowLeft className="h-3 w-3" /> Admin</Link>
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/30"><Cpu className="h-4 w-4 text-[#D2A63C]" /></div>
              <div>
                <p className="text-[13px] font-semibold leading-tight">Centro de Controlo</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#D2A63C]/80">MTM Auto</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {SECCOES.map((s) => {
              const I = ICONE[s.id]
              const activa = s.id === seccao
              return (
                <button key={s.id} type="button" onClick={() => ctx.irPara(s.id)} className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${activa ? "bg-[#D2A63C]/12 text-[#E9C46A] ring-1 ring-[#D2A63C]/25" : "text-zinc-400 hover:bg-white/[0.03] hover:text-white"}`}>
                  <I className={`h-4 w-4 ${activa ? "text-[#D2A63C]" : "text-zinc-600 group-hover:text-zinc-300"}`} />
                  <span className="flex-1 truncate">{s.nome}</span>
                  <kbd className="rounded border border-white/10 px-1 text-[9px] text-zinc-600">{s.atalho}</kbd>
                </button>
              )
            })}
          </nav>
          <div className="space-y-1 border-t border-white/[0.05] p-3 text-[11px]">
            <Link href="/admin/mtmcopy" className="block rounded px-2 py-1 text-zinc-500 hover:text-white">Página antiga (MTM Auto · Cópia)</Link>
            <Link href="/mtmauto" className="block rounded px-2 py-1 text-zinc-500 hover:text-white">Página cliente MTM Auto</Link>
            <Link href="/webtrader" className="block rounded px-2 py-1 text-zinc-500 hover:text-white">WebTrader</Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-[#D2A63C]/15 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#D2A63C]/80">Centro de Controlo · MTM Auto</p>
                <h1 className="flex items-center gap-2 text-lg font-semibold"><Icone className="h-5 w-5 text-[#D2A63C]" /> {nome}</h1>
              </div>
              <button type="button" onClick={() => setPaleta(true)} className="ml-auto flex min-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-500 hover:border-[#D2A63C]/40 hover:text-zinc-300">
                <Search className="h-3.5 w-3.5" /> Procurar conta, pessoa, estratégia…
                <kbd className="ml-auto flex items-center gap-0.5 rounded border border-white/10 px-1.5 text-[10px]"><IconeComando className="h-2.5 w-2.5" />K</kbd>
              </button>
              <span className="hidden font-mono text-xs tabular-nums text-zinc-500 sm:inline">{relogio} UTC</span>
            </div>
            <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto lg:hidden">
              {SECCOES.map((s) => (
                <button key={s.id} type="button" onClick={() => ctx.irPara(s.id)} className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs ${s.id === seccao ? "bg-[#D2A63C]/15 text-[#E9C46A]" : "text-zinc-400"}`}>{s.nome}</button>
              ))}
            </nav>
            <p className="mt-1 hidden text-[11px] text-zinc-500 md:block">{DESCRICAO[seccao]}</p>
          </header>

          <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
            {seccao === "cockpit" && <SeccaoCockpit />}
            {seccao === "sinais" && <SeccaoSinais />}
            {seccao === "estrategias" && <SeccaoEstrategias />}
            {seccao === "contas" && <SeccaoContas />}
            {seccao === "copia" && <SeccaoCopia />}
            {seccao === "utilizadores" && <SeccaoUtilizadores />}
          </div>
        </main>

        <Gavetas alvo={alvo} />
        <Paleta aberta={paleta} aoFechar={() => setPaleta(false)} />
        {ajuda && (
          <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-[#D2A63C]/25 bg-zinc-950/95 p-4 text-xs text-zinc-300 shadow-2xl">
            <p className="mb-2 font-semibold text-[#E9C46A]">Atalhos</p>
            {[["⌘/Ctrl K ou /", "paleta de comandos"], ["1 – 8", "secções"], ["R", "reler tudo"], ["Esc", "fechar gaveta"], ["?", "esta ajuda"]].map(([k, v]) => (
              <p key={k} className="flex justify-between py-0.5"><kbd className="rounded border border-white/10 px-1.5 text-[10px]">{k}</kbd><span className="text-zinc-500">{v}</span></p>
            ))}
          </div>
        )}
      </div>
    </Contexto.Provider>
  )
}

export default function PaginaCentro() {
  return (
    <Suspense fallback={carregar}>
      <Centro />
    </Suspense>
  )
}
