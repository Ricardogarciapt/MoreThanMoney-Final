"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, Settings2, X } from "lucide-react"
import { INPUTS_GOLDKILLER_DEFAULT } from "@/lib/estudos/goldkiller/inputs"
import { calcularGoldKiller } from "@/lib/estudos/goldkiller/motor"
import type { DadosExtraGK, InputsGoldKiller, ResultadoGoldKiller, Vela } from "@/lib/estudos/goldkiller/tipos"
import type { PedidoGoldKiller, RespostaGoldKiller } from "@/lib/estudos/goldkiller/goldkiller.worker"
import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import { TV } from "./grafico-tipos"
import type { SinalEstudo } from "./use-sinais-estudos"

/**
 * O MTM GOLDKILLER NO GRÁFICO DO WEBTRADER — as mesmas peças do Sensei (sensei-estudo.tsx):
 *
 *  · `useInputsGoldKiller`     — inputs da pessoa no localStorage, POR UTILIZADOR (só o que mudou);
 *  · `PopoverInputsGoldKiller` — a roda dentada com os inputs do Pine;
 *  · `useCalculadoraGoldKiller` — `calcularGoldKiller` num Web Worker, com recurso à thread principal;
 *  · `sinalDoGoldKiller`       — a viragem em jogo, no formato do «Usar este sinal».
 *
 * Ao contrário do Sensei, o GoldKiller não precisa de velas de outros timeframes.
 */

const chaveInputs = (userId: string | null | undefined) => `mtmfunded_goldkiller_inputs:${userId ?? "anon"}`

export function useInputsGoldKiller(userId: string | null | undefined) {
  const [mudados, setMudados] = useState<Partial<InputsGoldKiller>>({})
  useEffect(() => {
    try {
      const v = localStorage.getItem(chaveInputs(userId))
      setMudados(v ? (JSON.parse(v) as Partial<InputsGoldKiller>) : {})
    } catch { setMudados({}) }
  }, [userId])
  const guardar = useCallback((novo: Partial<InputsGoldKiller>) => {
    setMudados(novo)
    try { localStorage.setItem(chaveInputs(userId), JSON.stringify(novo)) } catch { /* ok */ }
  }, [userId])
  const inputs: InputsGoldKiller = { ...INPUTS_GOLDKILLER_DEFAULT, ...mudados }
  const definir = (parcial: Partial<InputsGoldKiller>) => guardar({ ...mudados, ...parcial })
  const repor = () => guardar({})
  return { inputs, mudados, definir, repor }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo (Web Worker)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculoGoldKiller { r: ResultadoGoldKiller; ms: number; onde: "worker" | "principal" }

/** Uma calculadora por gráfico; só a resposta do ÚLTIMO pedido resolve com resultado (as outras `null`). */
export function useCalculadoraGoldKiller() {
  const workerRef = useRef<Worker | null>(null)
  const pendentesRef = useRef(new Map<number, (c: CalculoGoldKiller | null) => void>())
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
      const w = new Worker(new URL("../../lib/estudos/goldkiller/goldkiller.worker.ts", import.meta.url), { type: "module" })
      w.onmessage = (e: MessageEvent<RespostaGoldKiller>) => {
        const d = e.data
        const resolver = pendentesRef.current.get(d.id)
        if (!resolver) return
        pendentesRef.current.delete(d.id)
        if ("erro" in d || d.id !== ultimoIdRef.current) return resolver(null)
        resolver({ r: d.r, ms: d.ms, onde: "worker" })
      }
      w.onerror = () => {
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

  return useCallback((velas: Vela[], inputs: Partial<InputsGoldKiller>, extra: DadosExtraGK = {}): Promise<CalculoGoldKiller | null> => {
    const id = ++ultimoIdRef.current
    const w = typeof Worker !== "undefined" ? obterWorker() : null
    if (!w) {
      const t0 = performance.now()
      const r = calcularGoldKiller(velas, inputs, extra)
      return Promise.resolve({ r, ms: performance.now() - t0, onde: "principal" })
    }
    return new Promise((resolver) => {
      pendentesRef.current.set(id, resolver)
      const pedido: PedidoGoldKiller = { id, velas, inputs, extra }
      w.postMessage(pedido)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

// ─────────────────────────────────────────────────────────────────────────────
// «Usar este sinal»
// ─────────────────────────────────────────────────────────────────────────────

const ESTUDO_GK = ESTUDOS_WEBTRADER.find((e) => e.chave === "Goldkiller")!

/**
 * A viragem em jogo: a ÚLTIMA viragem (vela fechada) com os níveis do alerta do Pine — entrada =
 * Center Line, SL = Drawdown 50, TP = o primeiro de Gain 50/75/100 ainda por tocar. Deixa de se
 * oferecer se o SL já foi tocado depois da viragem, se os três alvos já foram tocados, ou se os
 * níveis não existiam (valid_gk falso: ainda não havia pernas desse lado).
 */
export function sinalDoGoldKiller(r: ResultadoGoldKiller | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  const s = u?.sinal
  if (!r || !u || !s || !s.valido || u.slTocado || u.tpTocado.every(Boolean)) return null
  const tps = [s.tp1, s.tp2, s.tp3]
  const tp = tps.find((p, k) => Number.isFinite(p) && !u.tpTocado[k]) ?? null
  return {
    id: `goldkiller-local:${symbol}:${s.t}`,
    estudo: ESTUDO_GK,
    direcao: s.lado === "BUY" ? "buy" : "sell",
    entrada: s.entry,
    sl: s.sl,
    tp,
    em: s.t,
    ativo: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Roda dentada dos inputs
// ─────────────────────────────────────────────────────────────────────────────

type Campo =
  | { k: keyof InputsGoldKiller; rotulo: string; tipo: "bool"; nota?: string }
  | { k: keyof InputsGoldKiller; rotulo: string; tipo: "num"; min: number; max: number; passo: number; nota?: string }
  | { k: keyof InputsGoldKiller; rotulo: string; tipo: "opcoes"; opcoes: Array<[string | number, string]> }

const GRUPOS: Array<{ titulo: string; campos: Campo[] }> = [
  {
    titulo: "Supertrend",
    campos: [
      { k: "source", rotulo: "Fonte (Source)", tipo: "opcoes", opcoes: [["HLCC4", "HLCC4"], ["Smooth", "Suavizada"], ["Close", "Fecho"], ["Open", "Abertura"], ["High", "Máximo"], ["Low", "Mínimo"], ["Hl2", "HL2"], ["HLC3", "HLC3"], ["OHLC4", "OHLC4"]] },
      { k: "mult", rotulo: "Multiplicador", tipo: "num", min: 0.1, max: 20, passo: 0.1 },
      { k: "atr", rotulo: "Período do ATR", tipo: "num", min: 1, max: 200, passo: 1 },
    ],
  },
  {
    titulo: "Níveis",
    campos: [
      { k: "show", rotulo: "Níveis (Levels)", tipo: "num", min: -5, max: 5, passo: 1, nota: "−4: 50/75/90/100 · 5: todos · 1: só 25" },
      { k: "scale", rotulo: "Escala (Scale)", tipo: "num", min: 1, max: 100, passo: 1, nota: "percentis = 25/50/75/90/100 × escala" },
      { k: "window", rotulo: "Janela de pernas", tipo: "num", min: 0, max: 1000, passo: 1, nota: "0 = histórico inteiro" },
      { k: "unique", rotulo: "Únicos (Unique)", tipo: "bool" },
      { k: "average", rotulo: "Nível próprio", tipo: "opcoes", opcoes: [["Disabled", "Desligado"], ["Average", "Média"], ["Average + STDEV", "Média + desvio"], ["Percentile", "Percentil"]] },
      { k: "rank", rotulo: "Percentil próprio", tipo: "num", min: 0, max: 100, passo: 1, nota: "só com «Percentil»" },
    ],
  },
]

export function PopoverInputsGoldKiller({ inputs, definir, repor, cor }: {
  inputs: InputsGoldKiller
  definir: (p: Partial<InputsGoldKiller>) => void
  repor: () => void
  cor: string
}) {
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!aberto) return
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
        aria-label="Definições do GoldKiller"
        title="Definições do GoldKiller"
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
            <b style={{ color: cor }}>MTM GoldKiller · definições</b>
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
                      {c.tipo !== "opcoes" && c.nota && <span className="block text-[9.5px]" style={{ color: TV.textoFraco }}>{c.nota}</span>}
                    </span>
                    {c.tipo === "bool" ? (
                      <input type="checkbox" checked={Boolean(valor)} onChange={(e) => definir({ [c.k]: e.target.checked } as Partial<InputsGoldKiller>)} className="h-3.5 w-3.5 accent-[#2962FF]" />
                    ) : c.tipo === "num" ? (
                      <input
                        type="number" min={c.min} max={c.max} step={c.passo} value={Number(valor)}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n)) definir({ [c.k]: Math.min(c.max, Math.max(c.min, n)) } as Partial<InputsGoldKiller>)
                        }}
                        className="w-16 rounded px-1.5 py-0.5 text-right"
                        style={{ background: TV.fundo, border: `1px solid ${TV.borda}`, color: TV.texto }}
                      />
                    ) : (
                      <select
                        value={String(valor)}
                        onChange={(e) => {
                          const escolhido = c.opcoes.find(([v]) => String(v) === e.target.value)
                          if (escolhido) definir({ [c.k]: escolhido[0] } as Partial<InputsGoldKiller>)
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
            Guardado neste browser para a tua conta. O cálculo corre no teu dispositivo com as velas do WebTrader;
            os níveis dependem das pernas passadas, por isso mais histórico = níveis mais estáveis.
          </p>
        </div>
      )}
    </>
  )
}
