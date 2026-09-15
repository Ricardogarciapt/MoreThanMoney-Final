"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Maximize2 } from "lucide-react"
import type { SimboloFicha } from "./api"
import { lerFavoritos } from "./funded-watchlist"
import { GraficoConta, ProvedorRascunho, type Trader } from "./trader-contexto"
import type { Layout } from "./atalhos"

/**
 * MULTI-GRÁFICO (PRO) — 1, 2 (lado a lado ou em pilha) ou 4 gráficos.
 *
 * O primeiro é o PRINCIPAL: segue a lista e partilha o rascunho com o ticket. Os outros têm cada
 * um o seu símbolo, o seu timeframe (guardado por posição) e o seu próprio rascunho — pode-se
 * arrastar SL/TP e usar a ferramenta de posição em qualquer um. «⤢» troca-o com o principal.
 * Os estudos MTM (Sensei, GoldKiller, MTM Scanner) funcionam em todos: é o mesmo FundedGrafico.
 * Mais gráficos = mais velas pedidas e mais Web Workers dos estudos; por isso o 4 é escolha, não defeito.
 */

const CHAVE_CELULAS = "mtmfunded_pro_celulas"
const PADRAO = ["EURUSD", "US30", "BTCUSD"]

export default function MultiGrafico({ t, layout, principal }: { t: Trader; layout: Layout; principal: React.ReactNode }) {
  const [celulas, setCelulas] = useState<string[]>(PADRAO)
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(CHAVE_CELULAS) || "null"); if (Array.isArray(v) && v.length === 3) setCelulas(v) } catch { /* ok */ }
  }, [])
  const n = layout === "1" ? 0 : layout === "4" ? 3 : 1
  const visiveis = useMemo(() => celulas.slice(0, n), [celulas, n])
  // Os outros gráficos precisam de preço ao vivo.
  useEffect(() => { t.setExtras(visiveis) }, [visiveis.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (i: number, symbol: string) => {
    const novo = celulas.map((c, j) => (j === i ? symbol : c))
    setCelulas(novo)
    try { localStorage.setItem(CHAVE_CELULAS, JSON.stringify(novo)) } catch { /* ok */ }
  }
  const promover = (i: number) => {
    const atual = t.simbolo?.symbol
    const alvo = celulas[i]
    if (atual) mudar(i, atual)
    void t.selecionarPorNome(alvo)
  }

  const grelha = layout === "1" ? "grid-cols-1 grid-rows-1" : layout === "2h" ? "grid-cols-2 grid-rows-1" : layout === "2v" ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-2"
  return (
    <div className={`grid h-full min-h-0 gap-1 p-1 ${grelha}`}>
      <div className="min-h-0 min-w-0">{principal}</div>
      {visiveis.map((sym, i) => (
        <Celula key={i} indice={i} t={t} symbol={sym} onMudar={(s) => mudar(i, s)} onPromover={() => promover(i)} />
      ))}
    </div>
  )
}

function Celula({ t, symbol, indice, onMudar, onPromover }: { t: Trader; symbol: string; indice: number; onMudar: (s: string) => void; onPromover: () => void }) {
  const [ficha, setFicha] = useState<SimboloFicha | null>(null)
  const [volume, setVolume] = useState(0.01)
  const [favoritos, setFavoritos] = useState<string[]>([])
  useEffect(() => { setFavoritos(lerFavoritos()) }, [])
  useEffect(() => {
    let vivo = true
    void t.obterFicha(symbol).then((f) => { if (vivo && f) { setFicha(f); setVolume(f.volume_min) } })
    return () => { vivo = false }
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = [...new Set([symbol, ...favoritos, ...t.dados.posicoes.map((p) => String(p.symbol))])]
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 pb-0.5">
        <select aria-label={`símbolo do gráfico ${indice + 2}`} value={symbol} onChange={(e) => onMudar(e.target.value)}
          className="h-6 rounded border border-[#2A2E39] bg-[#1E222D] px-1 text-[11px] text-white">
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={onPromover} title="Trocar com o gráfico principal" aria-label="trocar com o principal" className="grid h-6 w-6 place-items-center rounded border border-[#2A2E39] bg-[#1E222D] text-zinc-400 hover:text-white">
          <Maximize2 className="h-3 w-3" />
        </button>
        <span className="text-[10px] text-zinc-500">gráfico {indice + 2}</span>
      </div>
      {ficha && ficha.symbol === symbol ? (
        <div className="min-h-0 flex-1">
          <ProvedorRascunho t={t} ficha={ficha} volume={volume} setVolume={setVolume}>
            <GraficoConta t={t} ficha={ficha} chaveTf={`:celula${indice + 1}`} preencher />
          </ProvedorRascunho>
        </div>
      ) : (
        <div className="grid h-full place-items-center rounded-md border border-[#2A2E39]"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      )}
    </div>
  )
}
