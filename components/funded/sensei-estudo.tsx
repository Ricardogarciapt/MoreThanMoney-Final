"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, Settings2, X } from "lucide-react"
import { INPUTS_SENSEI_DEFAULT } from "@/lib/estudos/sensei/inputs"
import { calcularSensei } from "@/lib/estudos/sensei/motor"
import type { DadosExtra, InputsSensei, ResultadoSensei, Vela } from "@/lib/estudos/sensei/tipos"
import type { PedidoSensei, RespostaSensei } from "@/lib/estudos/sensei/sensei.worker"
import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import { TV, TIMEFRAMES, type Tf } from "./grafico-tipos"
import type { SinalEstudo } from "./use-sinais-estudos"

/**
 * O MTM SENSEI NO GRÁFICO DO WEBTRADER — as peças que o gráfico (grafico-leve.tsx) e a barra
 * (funded-grafico.tsx) partilham:
 *
 *  · `useInputsSensei`   — os inputs da pessoa, guardados no localStorage POR UTILIZADOR;
 *  · `PopoverInputsSensei` — a roda dentada com os inputs principais;
 *  · `useCalculadoraSensei` — corre `calcularSensei` num Web Worker (ver sensei.worker.ts para as
 *    medições que o justificam), com recurso à thread principal se o browser não der workers;
 *  · `carregarExtrasSensei` — as velas H4 (filtro EMA 200 do HTF) e M1 (order flow) em paralelo;
 *  · `sinalDoSensei`     — o sinal em jogo do cálculo local, no formato do «Usar este sinal».
 *
 * O Sensei é o único estudo portado: GoldKiller e MTM Scanner continuam como setas dos sinais que
 * vêm dos alertas (use-sinais-estudos.ts) até serem portados.
 */

/**
 * Defaults no WebTrader = os do Pine (inputs.ts), com UMA exceção: o tema. O Pine abre em «Light»
 * porque o gráfico do TradingView da pessoa costuma ser claro; o nosso gráfico é o escuro do
 * TradingView, e os painéis claros em cima dele ficavam a gritar.
 */
export const INPUTS_SENSEI_WEBTRADER: Partial<InputsSensei> = { themeMode: "Dark" }

const chaveInputs = (userId: string | null | undefined) => `mtmfunded_sensei_inputs:${userId ?? "anon"}`

/** Inputs da pessoa (só o que ela mudou fica guardado; o resto segue os defaults se mudarem). */
export function useInputsSensei(userId: string | null | undefined) {
  const [mudados, setMudados] = useState<Partial<InputsSensei>>({})
  useEffect(() => {
    try {
      const v = localStorage.getItem(chaveInputs(userId))
      setMudados(v ? (JSON.parse(v) as Partial<InputsSensei>) : {})
    } catch { setMudados({}) }
  }, [userId])
  const guardar = useCallback((novo: Partial<InputsSensei>) => {
    setMudados(novo)
    try { localStorage.setItem(chaveInputs(userId), JSON.stringify(novo)) } catch { /* ok */ }
  }, [userId])
  const inputs: InputsSensei = { ...INPUTS_SENSEI_DEFAULT, ...INPUTS_SENSEI_WEBTRADER, ...mudados }
  const definir = (parcial: Partial<InputsSensei>) => guardar({ ...mudados, ...parcial })
  const repor = () => guardar({})
  return { inputs, mudados, definir, repor }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo (Web Worker)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculoSensei { r: ResultadoSensei; ms: number; onde: "worker" | "principal" }

/**
 * Uma calculadora por gráfico. Pedidos sobrepostos: só a resposta do ÚLTIMO pedido resolve com
 * resultado; as anteriores resolvem `null` (o gráfico ignora-as — o símbolo ou as velas mudaram).
 */
export function useCalculadoraSensei() {
  const workerRef = useRef<Worker | null>(null)
  const pendentesRef = useRef(new Map<number, (c: CalculoSensei | null) => void>())
  const ultimoIdRef = useRef(0)
  const semWorkerRef = useRef(false)

  useEffect(() => {
    const pendentes = pendentesRef.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      for (const [, resolver] of pendentes) resolver(null)
      pendentes.clear()
    }
  }, [])

  const obterWorker = (): Worker | null => {
    if (workerRef.current || semWorkerRef.current) return workerRef.current
    try {
      const w = new Worker(new URL("../../lib/estudos/sensei/sensei.worker.ts", import.meta.url), { type: "module" })
      w.onmessage = (e: MessageEvent<RespostaSensei>) => {
        const d = e.data
        const resolver = pendentesRef.current.get(d.id)
        if (!resolver) return
        pendentesRef.current.delete(d.id)
        if ("erro" in d || d.id !== ultimoIdRef.current) return resolver(null)
        resolver({ r: d.r, ms: d.ms, onde: "worker" })
      }
      w.onerror = () => {
        // Worker partido (CSP, bundler): passa à thread principal e não volta a tentar.
        semWorkerRef.current = true
        workerRef.current = null
        for (const [, resolver] of pendentesRef.current) resolver(null)
        pendentesRef.current.clear()
      }
      workerRef.current = w
    } catch {
      semWorkerRef.current = true
    }
    return workerRef.current
  }

  return useCallback((velas: Vela[], inputs: Partial<InputsSensei>, extra: DadosExtra): Promise<CalculoSensei | null> => {
    const id = ++ultimoIdRef.current
    const w = typeof Worker !== "undefined" ? obterWorker() : null
    if (!w) {
      const t0 = performance.now()
      const r = calcularSensei(velas, inputs, extra)
      return Promise.resolve({ r, ms: performance.now() - t0, onde: "principal" })
    }
    return new Promise((resolver) => {
      pendentesRef.current.set(id, resolver)
      const pedido: PedidoSensei = { id, velas, inputs, extra }
      w.postMessage(pedido)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

// ─────────────────────────────────────────────────────────────────────────────
// Velas auxiliares (HTF / LTF)
// ─────────────────────────────────────────────────────────────────────────────

const tfDeMinutos = (min: number): Tf | null => TIMEFRAMES.find((t) => t.seg === min * 60)?.chave ?? null

async function buscarVelas(symbol: string, tf: Tf, limite: number): Promise<Vela[] | undefined> {
  try {
    const r = await fetch(`/api/mtmfunded/simulado/velas?symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limite}`)
    if (!r.ok) return undefined
    const d = await r.json()
    const velas = (d.velas ?? []) as Vela[]
    return velas.length ? velas : undefined
  } catch {
    return undefined
  }
}

/**
 * H4 (ou o `htfTF` escolhido) para o filtro EMA 200 e M1 (`ltfRes`) para o delta real do order flow,
 * pedidos em paralelo. O HTF cobre o período do gráfico + 300 velas de aquecimento da EMA; o LTF só
 * se pede se for MENOR do que o timeframe do gráfico (senão não há «dentro da vela» para medir).
 * Sem estas velas o motor reamostra o próprio gráfico / usa o proxy — funciona, com menos rigor.
 */
export async function carregarExtrasSensei(symbol: string, tfSegGrafico: number, inputs: InputsSensei, velas: Vela[]): Promise<DadosExtra> {
  const extra: DadosExtra = {}
  if (!velas.length) return extra
  const periodo = velas[velas.length - 1].t - velas[0].t
  const htf = inputs.useHTF ? tfDeMinutos(inputs.htfTF) : null
  const ltf = inputs.useLTFOF ? tfDeMinutos(inputs.ltfRes) : null
  const [velasHTF, velasLTF] = await Promise.all([
    htf && inputs.htfTF * 60 > tfSegGrafico
      ? buscarVelas(symbol, htf, Math.min(3000, Math.max(500, Math.ceil(periodo / (inputs.htfTF * 60)) + 300)))
      : Promise.resolve(undefined),
    ltf && inputs.ltfRes * 60 < tfSegGrafico ? buscarVelas(symbol, ltf, 3000) : Promise.resolve(undefined),
  ])
  if (velasHTF) extra.velasHTF = velasHTF
  if (velasLTF) extra.velasLTF = velasLTF
  return extra
}

// ─────────────────────────────────────────────────────────────────────────────
// «Usar este sinal»
// ─────────────────────────────────────────────────────────────────────────────

const ESTUDO_SENSEI = ESTUDOS_WEBTRADER.find((e) => e.chave === "Sensei")!

/**
 * O sinal em jogo do cálculo local: a trade ATIVA do Sensei na última vela (entrada, SL efetivo —
 * já com BE/trailing — e o primeiro alvo ainda por atingir). Sem trade ativa não há sinal: um sinal
 * antigo cujo SL já bateu não se oferece para pré-preencher.
 */
export function sinalDoSensei(r: ResultadoSensei | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  if (!r || !u || !u.tradeAtiva || !u.curPos || !u.niveis) return null
  const lado = u.curPos
  const origem = [...r.sinais].reverse().find((s) => s.lado === lado)
  const tps = [u.niveis.tp1, u.niveis.tp2, u.niveis.tp3, u.niveis.tp4]
  const tp = tps.find((p, k) => Number.isFinite(p) && !u.tpHit[k]) ?? null
  return {
    id: `sensei-local:${symbol}:${origem?.t ?? u.barra}`,
    estudo: ESTUDO_SENSEI,
    direcao: lado === "BUY" ? "buy" : "sell",
    entrada: Number.isFinite(u.entry) ? u.entry : null,
    sl: Number.isFinite(u.effSl) ? u.effSl : null,
    tp,
    em: origem?.t ?? Math.floor(Date.now() / 1000),
    ativo: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roda dentada dos inputs
// ─────────────────────────────────────────────────────────────────────────────

type Campo =
  | { k: keyof InputsSensei; rotulo: string; tipo: "bool" }
  | { k: keyof InputsSensei; rotulo: string; tipo: "num"; min: number; max: number; passo: number; nota?: string }
  | { k: keyof InputsSensei; rotulo: string; tipo: "opcoes"; opcoes: Array<[string | number, string]> }

const GRUPOS: Array<{ titulo: string; campos: Campo[] }> = [
  {
    titulo: "Estilo",
    campos: [
      { k: "themeMode", rotulo: "Tema", tipo: "opcoes", opcoes: [["Dark", "Escuro"], ["Classic", "Clássico"], ["Light", "Claro"], ["Pop", "Pop"]] },
      { k: "tradeStyle", rotulo: "Estilo de trading", tipo: "opcoes", opcoes: [["Agressivo", "Agressivo"], ["Scalp", "Scalp"], ["Intraday", "Intraday"], ["Swing", "Swing"], ["Conservador", "Conservador"], ["Personalizado", "Personalizado"]] },
      { k: "autoOpt", rotulo: "Sensei otimizado (auto por símbolo/TF)", tipo: "bool" },
      { k: "minScore", rotulo: "Score mínimo", tipo: "num", min: 1, max: 20, passo: 1, nota: "só com estilo Personalizado" },
      { k: "signalDisplay", rotulo: "Sinais", tipo: "opcoes", opcoes: [["Mostrar Ativo", "Só o ativo"], ["Mostrar Tudo", "Todos + eventos"]] },
    ],
  },
  {
    titulo: "Filtros",
    campos: [
      { k: "allowBuy", rotulo: "Permitir compras", tipo: "bool" },
      { k: "allowSell", rotulo: "Permitir vendas", tipo: "bool" },
      { k: "useHTF", rotulo: "Filtro HTF (EMA 200)", tipo: "bool" },
      { k: "htfTF", rotulo: "Timeframe HTF", tipo: "opcoes", opcoes: [[60, "1h"], [240, "4h"], [1440, "1D"]] },
      { k: "useChop", rotulo: "Anti-chop (ADX)", tipo: "bool" },
      { k: "useLTFOF", rotulo: "Order flow real (M1)", tipo: "bool" },
    ],
  },
  {
    titulo: "Risco",
    campos: [
      { k: "riskMode", rotulo: "Stop por", tipo: "opcoes", opcoes: [["ATR", "ATR"], ["Percent", "Percentagem"]] },
      { k: "slMult", rotulo: "Multiplicador ATR", tipo: "num", min: 0.5, max: 6, passo: 0.1 },
      { k: "slPct", rotulo: "Stop %", tipo: "num", min: 0.05, max: 5, passo: 0.05 },
      { k: "trailMode", rotulo: "Trailing", tipo: "opcoes", opcoes: [["Off", "Desligado"], ["ATR", "ATR"]] },
    ],
  },
  {
    titulo: "Desenho",
    campos: [
      { k: "showDEMA", rotulo: "DEMAs 15/50/238", tipo: "bool" },
      { k: "showCloud", rotulo: "Cloud", tipo: "bool" },
      { k: "showBands", rotulo: "Bandas", tipo: "bool" },
      { k: "showPOC", rotulo: "POC", tipo: "bool" },
      { k: "showOB", rotulo: "Order blocks", tipo: "bool" },
      { k: "showChoch", rotulo: "CHoCH", tipo: "bool" },
      { k: "showBos", rotulo: "BOS", tipo: "bool" },
      { k: "showIdm", rotulo: "IDM", tipo: "bool" },
      { k: "showSweeps", rotulo: "Sweeps", tipo: "bool" },
      { k: "showCircles", rotulo: "Swings", tipo: "bool" },
    ],
  },
  {
    titulo: "Painéis",
    campos: [
      { k: "showConfPanel", rotulo: "Confirmações", tipo: "bool" },
      { k: "showSetupRules", rotulo: "Checklist", tipo: "bool" },
      { k: "showTradePanel", rotulo: "Trade panel", tipo: "bool" },
      { k: "showStats", rotulo: "Estatísticas (WR/R)", tipo: "bool" },
    ],
  },
]

export function PopoverInputsSensei({ inputs, definir, repor, cor }: {
  inputs: InputsSensei
  definir: (p: Partial<InputsSensei>) => void
  repor: () => void
  cor: string
}) {
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!aberto) return
    // Posição FIXA calculada pelo botão: a barra dos estudos tem overflow-x (cortava um absolute).
    const b = botaoRef.current?.getBoundingClientRect()
    if (b) setPos({ top: b.bottom + 6, left: Math.max(8, Math.min(b.left, window.innerWidth - 300)) })
    const fora = (e: PointerEvent) => {
      if (!caixaRef.current?.contains(e.target as Node) && !botaoRef.current?.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false) }
    document.addEventListener("pointerdown", fora)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc) }
  }, [aberto])

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label="Definições do Sensei"
        title="Definições do Sensei"
        className="grid h-6 w-6 shrink-0 place-items-center rounded border"
        style={{ borderColor: aberto ? cor : TV.borda, color: aberto ? cor : TV.textoFraco }}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>
      {aberto && pos && (
        <div
          ref={caixaRef}
          className="fixed z-[60] max-h-[70vh] w-[288px] overflow-y-auto rounded-md p-2.5 text-[11.5px] shadow-2xl"
          style={{ top: pos.top, left: pos.left, background: TV.painel, border: `1px solid ${TV.borda}`, color: TV.texto }}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <b style={{ color: cor }}>MTM Sensei · definições</b>
            <div className="flex items-center gap-1">
              <button type="button" onClick={repor} title="Repor predefinições" className="grid h-6 w-6 place-items-center rounded hover:bg-white/5" style={{ color: TV.textoFraco }}>
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="grid h-6 w-6 place-items-center rounded hover:bg-white/5" style={{ color: TV.textoFraco }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {GRUPOS.map((g) => (
            <fieldset key={g.titulo} className="mb-2 border-t pt-1.5" style={{ borderColor: TV.borda }}>
              <legend className="pr-1 text-[10px] uppercase tracking-wide" style={{ color: TV.textoFraco }}>{g.titulo}</legend>
              {g.campos.map((c) => {
                const valor = inputs[c.k]
                return (
                  <label key={c.k} className="flex min-h-[26px] items-center justify-between gap-2">
                    <span className="leading-tight">
                      {c.rotulo}
                      {c.tipo === "num" && c.nota && <span className="block text-[9.5px]" style={{ color: TV.textoFraco }}>{c.nota}</span>}
                    </span>
                    {c.tipo === "bool" ? (
                      <input type="checkbox" checked={Boolean(valor)} onChange={(e) => definir({ [c.k]: e.target.checked } as Partial<InputsSensei>)} className="h-3.5 w-3.5 accent-[#2962FF]" />
                    ) : c.tipo === "num" ? (
                      <input
                        type="number" min={c.min} max={c.max} step={c.passo} value={Number(valor)}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n)) definir({ [c.k]: Math.min(c.max, Math.max(c.min, n)) } as Partial<InputsSensei>)
                        }}
                        className="w-16 rounded px-1.5 py-0.5 text-right"
                        style={{ background: TV.fundo, border: `1px solid ${TV.borda}`, color: TV.texto }}
                      />
                    ) : (
                      <select
                        value={String(valor)}
                        onChange={(e) => {
                          const escolhido = c.opcoes.find(([v]) => String(v) === e.target.value)
                          if (escolhido) definir({ [c.k]: escolhido[0] } as Partial<InputsSensei>)
                        }}
                        className="rounded px-1 py-0.5"
                        style={{ background: TV.fundo, border: `1px solid ${TV.borda}`, color: TV.texto }}
                      >
                        {c.opcoes.map(([v, r]) => <option key={String(v)} value={String(v)}>{r}</option>)}
                      </select>
                    )}
                  </label>
                )
              })}
            </fieldset>
          ))}
          <p className="text-[10px] leading-snug" style={{ color: TV.textoFraco }}>
            Guardado neste browser para a tua conta. O cálculo corre no teu dispositivo com as velas do WebTrader.
          </p>
        </div>
      )}
    </>
  )
}
