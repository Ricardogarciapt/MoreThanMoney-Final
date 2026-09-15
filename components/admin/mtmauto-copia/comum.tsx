"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"
import { cn } from "@/lib/utils"

/** Peças partilhadas das tabs de «MTM Auto · Cópia». */

export async function pedirAdmin<T>(url: string, init?: { method?: string; body?: unknown }) {
  return adminApiCall<T>(url, {
    method: init?.method ?? "GET",
    retries: 0,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}

export function useDadosAdmin<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const recarregar = useCallback(async () => {
    if (!url) return
    setACarregar(true)
    const r = await pedirAdmin<T>(url)
    if (r.success && r.data) { setDados(r.data); setErro(null) } else setErro(r.error ?? "falhou")
    setACarregar(false)
  }, [url])
  useEffect(() => { void recarregar() }, [recarregar])
  return { dados, erro, aCarregar, recarregar, setDados }
}

export function BotaoRecarregar({ onClick, aCarregar, texto = "Actualizar" }: { onClick: () => void; aCarregar: boolean; texto?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={aCarregar} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
      {aCarregar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {texto}
    </button>
  )
}

export function Etiqueta({ children, tom = "neutro", title }: { children: ReactNode; tom?: "neutro" | "ok" | "aviso" | "grave" | "info" | "ouro"; title?: string }) {
  const cores = {
    neutro: "bg-zinc-800 text-zinc-300",
    ok: "bg-emerald-500/15 text-emerald-300",
    aviso: "bg-amber-500/15 text-amber-300",
    grave: "bg-rose-500/15 text-rose-300",
    info: "bg-sky-500/15 text-sky-300",
    ouro: "bg-[#D2A63C]/15 text-[#D2A63C]",
  }
  return <span title={title} className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", cores[tom])}>{children}</span>
}

export function Cartao({ titulo, valor, nota, tom }: { titulo: string; valor: ReactNode; nota?: ReactNode; tom?: "ok" | "aviso" | "grave" }) {
  return (
    <div className={cn("rounded-xl border bg-zinc-900/60 p-3", tom === "grave" ? "border-rose-500/30" : tom === "aviso" ? "border-amber-500/30" : "border-zinc-800")}>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-white tabular-nums">{valor}</p>
      {nota && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{nota}</p>}
    </div>
  )
}

export function Aviso({ children, tom = "aviso" }: { children: ReactNode; tom?: "aviso" | "grave" | "info" }) {
  const c = tom === "grave" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : tom === "info" ? "border-sky-500/30 bg-sky-500/10 text-sky-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"
  return <div className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", c)}>{children}</div>
}

/** Tabela com scroll horizontal próprio (a página nunca faz scroll lateral). */
export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[720px] text-left text-xs">{children}</table>
    </div>
  )
}
export const th = "px-3 py-2 font-medium text-zinc-500 bg-zinc-900/80 border-b border-zinc-800 whitespace-nowrap"
export const td = "px-3 py-2 align-top border-b border-zinc-800/60 text-zinc-300"

export const quando = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
export const ms = (v: number | null | undefined) => (v == null ? "—" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`)

/** Pede uma palavra escrita antes de uma acção com consequências. */
export function confirmarEscrita(texto: string, palavra: string): string | null {
  const r = typeof window !== "undefined" ? window.prompt(`${texto}\n\nEscreve ${palavra} para confirmar.`) : null
  return r && r.trim() === palavra ? palavra : null
}
