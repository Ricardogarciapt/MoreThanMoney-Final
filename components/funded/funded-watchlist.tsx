"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Star, Loader2 } from "lucide-react"
import { type SimboloFicha, type PrecoVivo, px, NOME_CLASSE } from "./api"

/**
 * A LISTA DE SÍMBOLOS — pesquisa, classes e favoritos.
 *
 * O catálogo vai crescer para o da PU Prime inteiro (centenas), por isso não é uma lista fixa: a
 * pesquisa e as classes vão ao servidor, e os favoritos (guardados no dispositivo) abrem primeiro —
 * quem negoceia ouro não tem de o procurar todos os dias.
 *
 * A lista diz ao pai que símbolos estão VISÍVEIS; só esses recebem preço ao vivo.
 */

const CHAVE_FAV = "mtmfunded_favoritos"
const FAV_INICIAIS = ["XAUUSD", "EURUSD", "GBPUSD", "US30", "NAS100", "BTCUSD"]

export function lerFavoritos(): string[] {
  try {
    const f = JSON.parse(localStorage.getItem(CHAVE_FAV) || "null")
    return Array.isArray(f) ? f : FAV_INICIAIS
  } catch {
    return FAV_INICIAIS
  }
}

export default function FundedWatchlist(props: {
  precos: Record<string, PrecoVivo>
  selecionado: string | null
  onSelecionar: (s: SimboloFicha) => void
  onVisiveis: (symbols: string[]) => void
}) {
  const [q, setQ] = useState("")
  const [classe, setClasse] = useState("fav")
  const [classes, setClasses] = useState<string[]>([])
  const [lista, setLista] = useState<SimboloFicha[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [aCarregar, setACarregar] = useState(false)
  const [favoritos, setFavoritos] = useState<string[]>([])
  const pedidoRef = useRef(0)

  useEffect(() => { setFavoritos(lerFavoritos()) }, [])

  useEffect(() => {
    const id = ++pedidoRef.current
    const t = setTimeout(async () => {
      setACarregar(true)
      try {
        let simbolos: SimboloFicha[] = []
        let tot = 0
        if (classe === "fav" && !q) {
          const favs = lerFavoritos()
          if (favs.length) {
            const r = await fetch(`/api/mtmfunded/simulado/precos?symbols=${favs.join(",")}&specs=1`)
            const d = await r.json()
            simbolos = favs.map((f) => (d.simbolos ?? []).find((x: SimboloFicha) => x.symbol === f)).filter(Boolean)
            tot = simbolos.length
          }
          if (!classes.length) {
            const r2 = await fetch(`/api/mtmfunded/simulado/precos?porPagina=1`)
            const d2 = await r2.json()
            if (id === pedidoRef.current) setClasses(d2.classes ?? [])
          }
        } else {
          const params = new URLSearchParams({ q, pagina: String(pagina), porPagina: "40" })
          if (classe !== "fav" && classe !== "todas") params.set("classe", classe)
          const r = await fetch(`/api/mtmfunded/simulado/precos?${params}`)
          const d = await r.json()
          simbolos = pagina > 0 ? [...lista, ...(d.simbolos ?? [])] : (d.simbolos ?? [])
          tot = d.total ?? 0
          if (d.classes) setClasses(d.classes)
        }
        if (id !== pedidoRef.current) return
        setLista(simbolos)
        setTotal(tot)
      } catch {
        if (id === pedidoRef.current) setLista([])
      } finally {
        if (id === pedidoRef.current) setACarregar(false)
      }
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, classe, pagina, favoritos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPagina(0) }, [q, classe])

  // Visíveis = os primeiros 40 da lista (o que cabe num ecrã com scroll curto).
  const visiveis = useMemo(() => lista.slice(0, 40).map((s) => s.symbol), [lista])
  useEffect(() => { props.onVisiveis(visiveis) }, [visiveis.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const alternarFav = (symbol: string) => {
    const novo = favoritos.includes(symbol) ? favoritos.filter((f) => f !== symbol) : [...favoritos, symbol]
    setFavoritos(novo)
    try { localStorage.setItem(CHAVE_FAV, JSON.stringify(novo)) } catch { /* ok */ }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d0d0d]">
      <div className="space-y-2 border-b border-white/10 p-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black px-2">
          <Search className="h-4 w-4 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar símbolo" className="h-9 w-full bg-transparent text-[13px] text-white outline-none" />
          {aCarregar && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />}
        </div>
        <div className="flex gap-1 overflow-x-auto text-[11px]">
          {["fav", "todas", ...classes].map((c) => (
            <button key={c} onClick={() => setClasse(c)} className={`shrink-0 rounded-full border px-2.5 py-1 ${classe === c ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-white/10 text-zinc-400"}`}>
              {c === "fav" ? "★ Favoritos" : c === "todas" ? "Todos" : NOME_CLASSE[c] ?? c}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1 text-[10px] uppercase text-zinc-500">
        <span>Símbolo</span><span className="text-right">Bid</span><span className="text-right">Ask</span>
      </div>
      <div className="max-h-[52vh] overflow-y-auto">
        {lista.length === 0 && !aCarregar && (
          <p className="p-4 text-center text-[12px] text-zinc-500">{classe === "fav" && !q ? "Sem favoritos — procura um símbolo e toca na estrela." : "Nenhum símbolo encontrado."}</p>
        )}
        {lista.map((s) => {
          const p = props.precos[s.symbol]
          const ativo = props.selecionado === s.symbol
          return (
            <div key={s.symbol} onClick={() => props.onSelecionar(s)} className={`grid cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-2 py-2 text-[12.5px] ${ativo ? "bg-[#D2A63C]/10" : "hover:bg-white/5"}`}>
              <button onClick={(e) => { e.stopPropagation(); alternarFav(s.symbol) }} aria-label="favorito">
                <Star className={`h-3.5 w-3.5 ${favoritos.includes(s.symbol) ? "fill-[#D2A63C] text-[#D2A63C]" : "text-zinc-600"}`} />
              </button>
              <div className="min-w-0">
                <p className="font-semibold text-white">{s.symbol}</p>
                <p className="truncate text-[10px] text-zinc-500">{s.nome}</p>
              </div>
              <span className={`text-right font-mono ${p?.fresco ? "text-rose-300" : "text-zinc-600"}`}>{px(p?.bid, s.digits)}</span>
              <span className={`text-right font-mono ${p?.fresco ? "text-emerald-300" : "text-zinc-600"}`}>{px(p?.ask, s.digits)}</span>
            </div>
          )
        })}
        {classe !== "fav" && lista.length < total && (
          <button onClick={() => setPagina((x) => x + 1)} className="w-full py-2 text-[12px] text-[#D2A63C]">Mais ({total - lista.length})</button>
        )}
      </div>
    </div>
  )
}
