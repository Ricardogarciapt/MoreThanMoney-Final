"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CornerDownLeft, Search } from "lucide-react"
import { SECCOES, type SeccaoCentro } from "@/lib/admin-centro/regras"
import { useCentroCtx } from "./contexto"
import { pedirCentro } from "./ui"

type Resultado = { tipo: "estrategia" | "conta" | "utilizador"; id: string; titulo: string; sub: string }
type Item = { chave: string; grupo: string; titulo: string; sub?: string; atalho?: string; correr: () => void }

const ROTAS: { titulo: string; href: string; sub: string }[] = [
  { titulo: "Admin geral", href: "/admin", sub: "/admin" },
  { titulo: "MTM Auto · Cópia (página antiga)", href: "/admin/mtmcopy", sub: "/admin/mtmcopy" },
  { titulo: "MTM Funded (admin)", href: "/admin?tab=mtmfunded", sub: "/admin?tab=mtmfunded" },
  { titulo: "Gestão de utilizadores", href: "/admin?tab=users", sub: "/admin?tab=users" },
  { titulo: "Página cliente MTM Auto", href: "/mtmauto", sub: "/mtmauto" },
  { titulo: "WebTrader", href: "/webtrader", sub: "/webtrader" },
]

/** Paleta de comandos (Ctrl/⌘+K): secções, rotas, contas, utilizadores, estratégias. */
export default function Paleta({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const ctx = useCentroCtx()
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Resultado[]>([])
  const [sel, setSel] = useState(0)
  const [aLer, setALer] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (aberta) { setQ(""); setRes([]); setSel(0); setTimeout(() => input.current?.focus(), 10) } }, [aberta])
  useEffect(() => {
    if (!aberta || q.trim().length < 2) { setRes([]); return }
    const t = setTimeout(async () => {
      setALer(true)
      const r = await pedirCentro<{ resultados: Resultado[] }>(`/api/admin/centro/pesquisa?q=${encodeURIComponent(q.trim())}`)
      setALer(false)
      if (r.success && r.data) setRes(r.data.resultados)
    }, 220)
    return () => clearTimeout(t)
  }, [q, aberta])

  const itens = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase()
    const bate = (s: string) => !t || s.toLowerCase().includes(t)
    const fechar = (fn: () => void) => () => { fn(); aoFechar() }
    return [
      ...SECCOES.filter((s) => bate(s.nome)).map((s) => ({ chave: `s:${s.id}`, grupo: "Secções", titulo: s.nome, atalho: s.atalho, correr: fechar(() => ctx.irPara(s.id as SeccaoCentro)) })),
      ...res.map((r) => ({ chave: `${r.tipo}:${r.id}`, grupo: r.tipo === "conta" ? "Contas" : r.tipo === "estrategia" ? "Estratégias" : "Utilizadores", titulo: r.titulo, sub: r.sub, correr: fechar(() => ctx.abrir({ tipo: r.tipo, id: r.id })) })),
      ...ROTAS.filter((r) => bate(r.titulo) || bate(r.href)).map((r) => ({ chave: `r:${r.href}`, grupo: "Rotas", titulo: r.titulo, sub: r.sub, correr: fechar(() => { window.location.href = r.href }) })),
    ]
  }, [q, res, ctx, aoFechar])

  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, itens.length - 1))) }, [itens.length])

  if (!aberta) return null
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); itens[sel]?.correr() }
    else if (e.key === "Escape") { e.preventDefault(); aoFechar() }
  }
  let grupoAnterior = ""
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={aoFechar} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[#D2A63C]/25 bg-zinc-950 shadow-[0_0_60px_-15px_rgba(210,166,60,0.35)]" role="dialog" aria-modal="true">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4">
          <Search className="h-4 w-4 text-[#D2A63C]" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} onKeyDown={teclas} placeholder="Ir para secção, conta (login/email/id), utilizador, estratégia, rota…" className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" />
          {aLer && <span className="text-[10px] text-zinc-500">a procurar…</span>}
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {itens.length === 0 ? <p className="px-3 py-6 text-center text-xs text-zinc-500">{q.trim().length < 2 ? "Escreve pelo menos 2 letras para procurar contas e pessoas." : "Nada encontrado."}</p> : itens.map((it, i) => {
            const cabecalho = it.grupo !== grupoAnterior ? it.grupo : null
            grupoAnterior = it.grupo
            return (
              <div key={it.chave}>
                {cabecalho && <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{cabecalho}</p>}
                <button type="button" onMouseEnter={() => setSel(i)} onClick={it.correr} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${i === sel ? "bg-[#D2A63C]/12 text-white ring-1 ring-[#D2A63C]/30" : "text-zinc-300"}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{it.titulo}</span>
                    {it.sub && <span className="block truncate text-[11px] text-zinc-500">{it.sub}</span>}
                  </span>
                  {it.atalho ? <kbd className="rounded border border-white/10 px-1.5 text-[10px] text-zinc-500">{it.atalho}</kbd> : i === sel ? <CornerDownLeft className="h-3.5 w-3.5 text-[#D2A63C]" /> : null}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex gap-3 border-t border-white/[0.06] px-4 py-2 text-[10px] text-zinc-600">
          <span>↑↓ navegar</span><span>↵ abrir</span><span>Esc fechar</span><span className="ml-auto">1–8 secções · / procurar · R reler · ? ajuda</span>
        </div>
      </div>
    </div>
  )
}
