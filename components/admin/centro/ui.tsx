"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, Loader2, RefreshCw, X } from "lucide-react"
import { adminApiCall } from "@/lib/admin-helpers"
import { cn } from "@/lib/utils"
import type { Tom } from "@/lib/admin-centro/regras"

/**
 * Peças visuais do Centro de Controlo. Tema do admin (escuro, ouro #D2A63C) levado a painel de
 * métricas: azulejos densos com sparkline, pílulas de estado vivas, faixas de severidade.
 */

export const OURO = "#D2A63C"

// ── dados ───────────────────────────────────────────────────────────────────────────────────────

export async function pedirCentro<T>(url: string, init?: { method?: string; body?: unknown }) {
  return adminApiCall<T>(url, {
    method: init?.method ?? "GET",
    retries: 0,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
}

/**
 * Lê um endpoint e relê a cada `intervaloMs` (mínimo 15 s), PAUSANDO com o separador escondido
 * e relendo logo que volta a ficar visível (se a última leitura já passou do intervalo).
 */
export function useCentro<T>(url: string | null, intervaloMs = 20_000) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [lidoEm, setLidoEm] = useState<number | null>(null)
  const emCurso = useRef(false)
  const ultima = useRef(0)

  const recarregar = useCallback(async () => {
    if (!url || emCurso.current) return
    emCurso.current = true
    setACarregar(true)
    const r = await pedirCentro<T>(url)
    if (r.success && r.data) { setDados(r.data); setErro(null) } else setErro(r.error ?? "falhou")
    ultima.current = Date.now()
    setLidoEm(Date.now())
    setACarregar(false)
    emCurso.current = false
  }, [url])

  useEffect(() => {
    if (!url) return
    void recarregar()
    const passo = Math.max(15_000, intervaloMs)
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void recarregar()
    }, passo)
    const vis = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima.current > passo) void recarregar()
    }
    document.addEventListener("visibilitychange", vis)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis) }
  }, [url, intervaloMs, recarregar])

  return { dados, erro, aCarregar, recarregar, lidoEm }
}

/** Palavra escrita antes de uma acção com consequências (o servidor volta a exigi-la). */
export function pedirPalavra(texto: string, palavra: string): string | null {
  const r = typeof window !== "undefined" ? window.prompt(`${texto}\n\nEscreve ${palavra} para confirmar.`) : null
  return r && r.trim() === palavra ? palavra : null
}

// ── formatos ────────────────────────────────────────────────────────────────────────────────────

export const fmtIdade = (s: number | null | undefined) => {
  if (s == null) return "—"
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86_400) return `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`
  return `${Math.round(s / 86_400)}d`
}
export const idadeDe = (iso: string | null | undefined) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)) : null)
export const fmtMs = (v: number | null | undefined) => (v == null ? "—" : v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`)
export const fmtNum = (v: number | null | undefined, casas = 0) => (v == null ? "—" : v.toLocaleString("pt-PT", { maximumFractionDigits: casas, minimumFractionDigits: casas }))
export const fmtQuando = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
export const curto = (id: string | null | undefined, n = 8) => (id ? String(id).slice(0, n) : "—")

// ── peças ───────────────────────────────────────────────────────────────────────────────────────

const COR_TOM: Record<Tom, { texto: string; fundo: string; borda: string; ponto: string; traco: string }> = {
  ok: { texto: "text-emerald-300", fundo: "bg-emerald-500/10", borda: "border-emerald-500/30", ponto: "bg-emerald-400", traco: "#34d399" },
  aviso: { texto: "text-amber-300", fundo: "bg-amber-500/10", borda: "border-amber-500/30", ponto: "bg-amber-400", traco: "#fbbf24" },
  grave: { texto: "text-rose-300", fundo: "bg-rose-500/10", borda: "border-rose-500/40", ponto: "bg-rose-500", traco: "#fb7185" },
  info: { texto: "text-sky-300", fundo: "bg-sky-500/10", borda: "border-sky-500/30", ponto: "bg-sky-400", traco: "#38bdf8" },
  neutro: { texto: "text-zinc-300", fundo: "bg-zinc-800/60", borda: "border-zinc-700/60", ponto: "bg-zinc-500", traco: OURO },
}

export function Pilula({ tom = "neutro", vivo, children, title }: { tom?: Tom; vivo?: boolean; children: ReactNode; title?: string }) {
  const c = COR_TOM[tom]
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide whitespace-nowrap", c.texto, c.fundo, c.borda)}>
      <span className="relative flex h-1.5 w-1.5">
        {vivo && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", c.ponto)} />}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", c.ponto)} />
      </span>
      {children}
    </span>
  )
}

export function Sparkline({ serie, tom = "neutro", altura = 28, barras }: { serie: number[]; tom?: Tom; altura?: number; barras?: boolean }) {
  const max = Math.max(1, ...serie)
  const n = serie.length
  if (!n) return null
  const w = 100
  const cor = COR_TOM[tom].traco
  if (barras) {
    const bw = w / n
    return (
      <svg viewBox={`0 0 ${w} ${altura}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
        {serie.map((v, i) => {
          const h = v === 0 ? 1 : Math.max(2, (v / max) * (altura - 2))
          return <rect key={i} x={i * bw + bw * 0.15} y={altura - h} width={bw * 0.7} height={h} rx={0.6} fill={cor} opacity={v === 0 ? 0.18 : 0.85} />
        })}
      </svg>
    )
  }
  const pts = serie.map((v, i) => `${(i / Math.max(1, n - 1)) * w},${altura - 2 - (v / max) * (altura - 4)}`)
  const id = `g${Math.abs(serie.reduce((a, v, i) => a + v * (i + 1), 0)) % 99991}${tom}`
  return (
    <svg viewBox={`0 0 ${w} ${altura}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity={0.35} />
          <stop offset="100%" stopColor={cor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${altura} ${pts.join(" ")} ${w},${altura}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Azulejo({ rotulo, valor, sub, tom, serie, barras, onClick, className }: {
  rotulo: string; valor: ReactNode; sub?: ReactNode; tom?: Tom; serie?: number[]; barras?: boolean; onClick?: () => void; className?: string
}) {
  const t = tom ?? "neutro"
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-3 text-left transition-colors",
        t === "grave" ? "border-rose-500/40" : t === "aviso" ? "border-amber-500/30" : "border-white/[0.06]",
        onClick && "hover:border-[#D2A63C]/40 cursor-pointer",
        className,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-px", t === "grave" ? "bg-rose-500/70" : t === "aviso" ? "bg-amber-400/60" : t === "ok" ? "bg-emerald-400/40" : "bg-[#D2A63C]/30")} />
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{rotulo}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tabular-nums leading-none", COR_TOM[t].texto === "text-zinc-300" ? "text-white" : COR_TOM[t].texto)}>{valor}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-zinc-500">{sub}</p>}
      {serie && serie.length > 0 && <div className="mt-2 -mb-1"><Sparkline serie={serie} tom={t} barras={barras} /></div>}
    </Comp>
  )
}

export function Painel({ titulo, icone, accao, children, className, sub }: { titulo: ReactNode; icone?: ReactNode; accao?: ReactNode; children: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-white/[0.06] bg-zinc-950/70 backdrop-blur-sm", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.05] px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{icone}{titulo}</h3>
          {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
        </div>
        {accao}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Linha com faixa de severidade à esquerda. */
export function Faixa({ tom = "neutro", children, onClick, className }: { tom?: Tom; children: ReactNode; onClick?: () => void; className?: string }) {
  const cor = tom === "grave" ? "before:bg-rose-500" : tom === "aviso" ? "before:bg-amber-400" : tom === "info" ? "before:bg-sky-400" : tom === "ok" ? "before:bg-emerald-400" : "before:bg-zinc-700"
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick() } : undefined}
      className={cn("relative rounded-lg bg-zinc-900/50 py-2 pl-4 pr-3 before:absolute before:inset-y-1.5 before:left-1.5 before:w-[3px] before:rounded-full", cor, onClick && "cursor-pointer hover:bg-zinc-800/60", className)}
    >
      {children}
    </div>
  )
}

export function Tabela({ children, min = 760 }: { children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full text-left text-xs" style={{ minWidth: min }}>{children}</table>
    </div>
  )
}
export const th = "sticky top-0 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-900/95 border-b border-white/[0.06] whitespace-nowrap"
export const td = "px-3 py-2 align-top border-b border-white/[0.04] text-zinc-300"
export const trClic = "cursor-pointer hover:bg-[#D2A63C]/[0.04] transition-colors"

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-500">{children}</p>
}

export function Aviso({ tom = "aviso", children }: { tom?: "aviso" | "grave" | "info"; children: ReactNode }) {
  const c = tom === "grave" ? "border-rose-500/30 bg-rose-500/10 text-rose-200" : tom === "info" ? "border-sky-500/25 bg-sky-500/[0.07] text-sky-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"
  return <div className={cn("rounded-lg border px-3 py-2 text-xs leading-relaxed", c)}>{children}</div>
}

export function BotaoLer({ onClick, aCarregar, lidoEm }: { onClick: () => void; aCarregar: boolean; lidoEm?: number | null }) {
  const [, forcar] = useState(0)
  useEffect(() => { const t = setInterval(() => forcar((x) => x + 1), 5000); return () => clearInterval(t) }, [])
  return (
    <button type="button" onClick={onClick} disabled={aCarregar} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 hover:border-[#D2A63C]/40 hover:text-white disabled:opacity-50" title="Reler (R)">
      {aCarregar ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      {lidoEm ? `há ${fmtIdade(Math.round((Date.now() - lidoEm) / 1000))}` : "ler"}
    </button>
  )
}

export function Chip({ activo, onClick, children }: { activo?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-2.5 py-1 text-[11px] transition-colors", activo ? "border-[#D2A63C]/50 bg-[#D2A63C]/15 text-[#E9C46A]" : "border-white/10 text-zinc-400 hover:text-white")}>
      {children}
    </button>
  )
}

export function Botao({ onClick, children, tom = "neutro", disabled, title }: { onClick: () => void; children: ReactNode; tom?: "neutro" | "ouro" | "perigo"; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
        tom === "ouro" ? "border-[#D2A63C]/50 bg-[#D2A63C]/10 text-[#E9C46A] hover:bg-[#D2A63C]/20" : tom === "perigo" ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10" : "border-white/10 text-zinc-300 hover:bg-zinc-800",
      )}
    >
      {children}
    </button>
  )
}

/** Gaveta lateral (mesma para conta, estratégia, utilizador e sinal). Esc fecha. */
export function Gaveta({ aberta, titulo, sub, aoFechar, children, largura = "max-w-2xl" }: { aberta: boolean; titulo: ReactNode; sub?: ReactNode; aoFechar: () => void; children: ReactNode; largura?: string }) {
  useEffect(() => {
    if (!aberta) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [aberta, aoFechar])
  if (!aberta) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={aoFechar} />
      <aside className={cn("relative flex h-full w-full flex-col border-l border-[#D2A63C]/20 bg-zinc-950 shadow-2xl", largura)} role="dialog" aria-modal="true">
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-white">{titulo}</div>
            {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white" title="Fechar (Esc)"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  )
}

export function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{rotulo}</p>
      <div className="mt-0.5 break-words text-xs text-zinc-200">{children}</div>
    </div>
  )
}

/**
 * Secção recolhível dos painéis clássicos embebidos. Vivia em mtmauto-copia/estrategias.tsx e era
 * importada por CINCO secções do Centro: apagar a página antiga partia o Centro inteiro. A peça
 * partilhada tem de viver no sítio partilhado — a página antiga passa a importá-la daqui.
 */
export function Recolhivel({ titulo, descricao, children, aberto = false, etiqueta }: {
  titulo: string; descricao?: string; children: ReactNode; aberto?: boolean; etiqueta?: ReactNode
}) {
  const [a, setA] = useState(aberto)
  return (
    <section className="rounded-xl border border-zinc-800">
      <button type="button" onClick={() => setA(!a)} aria-expanded={a} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-200">{titulo}</span>
          {descricao && <span className="block text-[11px] text-zinc-500">{descricao}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {etiqueta}
          <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", a && "rotate-180")} />
        </span>
      </button>
      {a && <div className="border-t border-zinc-800 p-4">{children}</div>}
    </section>
  )
}

/** Grupo de recolhíveis com um título de secção — para não deixar doze acordeões seguidos. */
export function Grupo({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2 px-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">{titulo}</h4>
        {nota && <p className="text-[11px] text-zinc-500">{nota}</p>}
      </div>
      {children}
    </div>
  )
}

// ── lista comum ─────────────────────────────────────────────────────────────────────────────────

/**
 * Barra de filtros das listas (pesquisa + filtros + contagem + botão de reler). Contas,
 * Utilizadores e MTM Funded escreviam esta mesma barra cada uma à sua maneira, e a contagem
 * aparecia em sítios diferentes.
 */
export function Filtros({ q, aoMudarQ, exemplo, children, contagem, total, accao }: {
  q?: string; aoMudarQ?: (v: string) => void; exemplo?: string; children?: ReactNode
  contagem?: number; total?: number; accao?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {aoMudarQ && (
        <input
          value={q ?? ""} onChange={(e) => aoMudarQ(e.target.value)} placeholder={exemplo ?? "Procurar…"}
          className="w-60 rounded-md border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-white placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none"
        />
      )}
      {children}
      <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500">
        {contagem != null && <span>{total != null && total !== contagem ? `${fmtNum(contagem)} de ${fmtNum(total)}` : fmtNum(contagem)}</span>}
        {accao}
      </span>
    </div>
  )
}

/**
 * Corpo de uma lista, com os MESMOS quatro estados em todo o Centro: a ler · erro · sem dados ·
 * filtro sem resultados. Antes cada secção decidia a sua ordem, e havia listas que mostravam
 * «Nenhuma conta» quando o que tinha acontecido era a leitura falhar.
 */
export function Lista({ dados, erro, avisos, vazio, textoVazio, filtrada, children }: {
  /** `null`/`undefined` = ainda não chegou nada da API. */
  dados: unknown
  erro?: string | null
  avisos?: string[] | null
  /** Não há mesmo nada na base. */
  vazio?: boolean
  textoVazio?: ReactNode
  /** Há linhas, mas os filtros deixaram zero — é MUITO diferente de «não há nada». */
  filtrada?: boolean
  children: ReactNode
}) {
  return (
    <>
      {erro && <div className="mb-2"><Aviso tom="grave">{erro}</Aviso></div>}
      {avisos?.length ? <div className="mb-2"><Aviso>{avisos.join(" · ")}</Aviso></div> : null}
      {dados == null
        ? <Vazio>{erro ? "Sem dados para mostrar — corrige o erro acima e volta a ler." : "A ler…"}</Vazio>
        : vazio ? <Vazio>{textoVazio ?? "Não há nada aqui."}</Vazio>
        : filtrada ? <Vazio>Nada com estes filtros. Limpa-os para ver tudo.</Vazio>
        : children}
    </>
  )
}
