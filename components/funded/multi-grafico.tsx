"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Maximize2 } from "lucide-react"
import type { SimboloFicha } from "./api"
import { lerFavoritos } from "./funded-watchlist"
import { semCripto, ehSimboloCripto } from "@/lib/ios-sem-cripto"
import { GraficoConta, ProvedorRascunho, type TraderBase } from "./trader-contexto"
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
/** App iOS: nenhuma célula em cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts. */
const SUBSTITUTOS = ["GBPUSD", "NAS100", "USDJPY"]
const semCriptoNasCelulas = (v: string[]) => {
  if (!semCripto()) return v
  let k = 0
  return v.map((c) => {
    if (!ehSimboloCripto(c)) return c
    while (k < SUBSTITUTOS.length - 1 && v.includes(SUBSTITUTOS[k])) k++
    return SUBSTITUTOS[k++] ?? "XAUUSD"
  })
}

export default function MultiGrafico({ t, layout, principal, recolhido = false }: { t: TraderBase; layout: Layout; principal: React.ReactNode; recolhido?: boolean }) {
  const [celulas, setCelulas] = useState<string[]>(() => semCriptoNasCelulas(PADRAO))
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CHAVE_CELULAS) || "null")
      setCelulas(semCriptoNasCelulas(Array.isArray(v) && v.length === 3 ? v : PADRAO))
    } catch { setCelulas(semCriptoNasCelulas(PADRAO)) }
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
  // Gráficos escondidos («Mostrar gráfico»): cada célula fica só com a sua barra — linhas à medida
  // do conteúdo e sem `h-full`, para quem está à volta (o painel de baixo) ficar com o espaço.
  const colunas = layout === "2h" || layout === "4" ? "grid-cols-2" : "grid-cols-1"
  return (
    <div className={recolhido ? `grid content-start gap-1 p-1 ${colunas}` : `grid h-full min-h-0 gap-1 p-1 ${grelha}`}>
      <div className="min-h-0 min-w-0">{principal}</div>
      {visiveis.map((sym, i) => (
        <Celula key={i} indice={i} t={t} symbol={sym} recolhido={recolhido} onMudar={(s) => mudar(i, s)} onPromover={() => promover(i)} />
      ))}
    </div>
  )
}

function Celula({ t, symbol, indice, recolhido, onMudar, onPromover }: { t: TraderBase; symbol: string; indice: number; recolhido: boolean; onMudar: (s: string) => void; onPromover: () => void }) {
  const [ficha, setFicha] = useState<SimboloFicha | null>(null)
  const [indisponivel, setIndisponivel] = useState(false)
  const [volume, setVolume] = useState(0.01)
  const [favoritos, setFavoritos] = useState<string[]>([])
  useEffect(() => { setFavoritos(lerFavoritos()) }, [])
  useEffect(() => {
    let vivo = true
    setIndisponivel(false)
    // Um símbolo guardado que já não existe (ou a rede) deixava a célula a girar para sempre.
    void t.obterFicha(symbol)
      .then((f) => { if (!vivo) return; if (f) { setFicha(f); setVolume(f.volume_min) } else setIndisponivel(true) })
      .catch(() => { if (vivo) setIndisponivel(true) })
    return () => { vivo = false }
  }, [symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = [...new Set([symbol, ...favoritos, ...t.posicoes.map((p) => p.symbol)])]
    .filter((o) => !semCripto() || !ehSimboloCripto(o))
  return (
    <div className={`flex min-w-0 flex-col ${recolhido ? "" : "min-h-0"}`}>
      <div className="flex shrink-0 items-center gap-1 pb-0.5">
        <select aria-label={`símbolo do gráfico ${indice + 2}`} value={symbol} onChange={(e) => onMudar(e.target.value)}
          className="h-7 rounded border border-[#2A2E39] bg-[#1E222D] px-1 text-[11px] text-white">
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={onPromover} title="Trocar com o gráfico principal" aria-label="trocar com o principal" className="grid h-7 w-7 place-items-center rounded border border-[#2A2E39] bg-[#1E222D] text-zinc-400 hover:text-white">
          <Maximize2 className="h-3 w-3" />
        </button>
        <span className="text-[10px] text-zinc-500">gráfico {indice + 2}</span>
      </div>
      {ficha && ficha.symbol === symbol ? (
        <div className={recolhido ? "" : "min-h-0 flex-1"}>
          <ProvedorRascunho t={t} ficha={ficha} volume={volume} setVolume={setVolume}>
            <GraficoConta t={t} ficha={ficha} chaveTf={`:celula${indice + 1}`} preencher={!recolhido} />
          </ProvedorRascunho>
        </div>
      ) : indisponivel ? (
        <div className={`grid place-items-center rounded-md border border-[#2A2E39] px-2 text-center text-[11px] text-zinc-500 ${recolhido ? "h-10" : "h-full"}`}>{symbol} indisponível — escolhe outro símbolo em cima.</div>
      ) : (
        <div className={`grid place-items-center rounded-md border border-[#2A2E39] ${recolhido ? "h-10" : "h-full"}`}><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
      )}
    </div>
  )
}
