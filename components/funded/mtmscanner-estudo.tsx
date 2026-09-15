"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, Settings2, X } from "lucide-react"
import { INPUTS_MTMSCANNER_DEFAULT } from "@/lib/estudos/mtmscanner/inputs"
import { calcularMTMScanner } from "@/lib/estudos/mtmscanner/motor"
import type { DadosExtraMS, InputsMTMScanner, ResultadoMTMScanner, Vela } from "@/lib/estudos/mtmscanner/tipos"
import type { PedidoMTMScanner, RespostaMTMScanner } from "@/lib/estudos/mtmscanner/mtmscanner.worker"
import { ESTUDOS_WEBTRADER } from "@/lib/scanners/estudos"
import { TV } from "./grafico-tipos"
import type { SinalEstudo } from "./use-sinais-estudos"

/**
 * O MTM SCANNER NO GRÁFICO DO WEBTRADER — as mesmas peças do GoldKiller (goldkiller-estudo.tsx):
 *
 *  · `useInputsMTMScanner`      — inputs da pessoa no localStorage, POR UTILIZADOR (só o que mudou);
 *  · `PopoverInputsMTMScanner`  — a roda dentada com os inputs do Pine;
 *  · `useCalculadoraMTMScanner` — `calcularMTMScanner` num Web Worker, com recurso à thread principal;
 *  · `sinalDoMTMScanner`        — o último B/S, no formato do «Usar este sinal».
 */

const chaveInputs = (userId: string | null | undefined) => `mtmfunded_mtmscanner_inputs:${userId ?? "anon"}`

export function useInputsMTMScanner(userId: string | null | undefined) {
  const [mudados, setMudados] = useState<Partial<InputsMTMScanner>>({})
  useEffect(() => {
    try {
      const v = localStorage.getItem(chaveInputs(userId))
      setMudados(v ? (JSON.parse(v) as Partial<InputsMTMScanner>) : {})
    } catch { setMudados({}) }
  }, [userId])
  const guardar = useCallback((novo: Partial<InputsMTMScanner>) => {
    setMudados(novo)
    try { localStorage.setItem(chaveInputs(userId), JSON.stringify(novo)) } catch { /* ok */ }
  }, [userId])
  const inputs: InputsMTMScanner = { ...INPUTS_MTMSCANNER_DEFAULT, ...mudados }
  const definir = (parcial: Partial<InputsMTMScanner>) => guardar({ ...mudados, ...parcial })
  const repor = () => guardar({})
  return { inputs, mudados, definir, repor }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo (Web Worker)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalculoMTMScanner { r: ResultadoMTMScanner; ms: number; onde: "worker" | "principal" }

/** Uma calculadora por gráfico; só a resposta do ÚLTIMO pedido resolve com resultado (as outras `null`). */
export function useCalculadoraMTMScanner() {
  const workerRef = useRef<Worker | null>(null)
  const pendentesRef = useRef(new Map<number, (c: CalculoMTMScanner | null) => void>())
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
      const w = new Worker(new URL("../../lib/estudos/mtmscanner/mtmscanner.worker.ts", import.meta.url), { type: "module" })
      w.onmessage = (e: MessageEvent<RespostaMTMScanner>) => {
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

  return useCallback((velas: Vela[], inputs: Partial<InputsMTMScanner>, extra: DadosExtraMS = {}): Promise<CalculoMTMScanner | null> => {
    const id = ++ultimoIdRef.current
    const w = typeof Worker !== "undefined" ? obterWorker() : null
    if (!w) {
      const t0 = performance.now()
      const r = calcularMTMScanner(velas, inputs, extra)
      return Promise.resolve({ r, ms: performance.now() - t0, onde: "principal" })
    }
    return new Promise((resolver) => {
      pendentesRef.current.set(id, resolver)
      const pedido: PedidoMTMScanner = { id, velas, inputs, extra }
      w.postMessage(pedido)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

// ─────────────────────────────────────────────────────────────────────────────
// «Usar este sinal»
// ─────────────────────────────────────────────────────────────────────────────

const ESTUDO_MS = ESTUDOS_WEBTRADER.find((e) => e.chave === "MTMScanner")!

/**
 * O sinal em jogo: o ÚLTIMO B/S (vela fechada) com os níveis do alerta do Pine — entrada = entry1
 * (fecho truncado ao tick), SL, TP = o primeiro de TP1/2/3 ainda por tocar. Deixa de se oferecer se o
 * SL já foi tocado depois do sinal, se os três alvos já foram tocados, ou se valid_sc era falso.
 */
export function sinalDoMTMScanner(r: ResultadoMTMScanner | null, symbol: string): SinalEstudo | null {
  const u = r?.ultima
  const s = u?.sinal
  if (!r || !u || !s || !s.valido || u.slTocado || u.tpTocado.every(Boolean)) return null
  const tps = [s.tp1, s.tp2, s.tp3]
  const tp = tps.find((p, k) => Number.isFinite(p) && !u.tpTocado[k]) ?? null
  return {
    id: `mtmscanner-local:${symbol}:${s.t}`,
    estudo: ESTUDO_MS,
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
  | { k: keyof InputsMTMScanner; rotulo: string; tipo: "bool"; nota?: string }
  | { k: keyof InputsMTMScanner; rotulo: string; tipo: "num"; min: number; max: number; passo: number; nota?: string }
  | { k: keyof InputsMTMScanner; rotulo: string; tipo: "opcoes"; opcoes: Array<[string | number, string]> }

const GRUPOS: Array<{ titulo: string; campos: Campo[] }> = [
  {
    titulo: "POC e fases",
    campos: [
      { k: "lengthPOC", rotulo: "Período do POC", tipo: "num", min: 1, max: 500, passo: 1 },
      { k: "bSh", rotulo: "Exibir Fases (momentum)", tipo: "opcoes", opcoes: [["Nenhum", "Nenhum"], ["Detalhado", "Detalhado"], ["Completo", "Completo"]] },
      { k: "mostrarReversao", rotulo: "Círculos «Reversão Possível»", tipo: "bool" },
    ],
  },
  {
    titulo: "Configuração ATR",
    campos: [
      { k: "useATR", rotulo: "Usar ATR para Risk-Reward", tipo: "bool", nota: "desligado = percentagens abaixo" },
      { k: "atrPeriod", rotulo: "Período do ATR", tipo: "num", min: 1, max: 200, passo: 1 },
      { k: "atrMultiplierSL", rotulo: "Multiplicador ATR (SL)", tipo: "num", min: 0.1, max: 20, passo: 0.1 },
      { k: "tp1RR", rotulo: "TP1 (1:X)", tipo: "num", min: 0.1, max: 50, passo: 0.1 },
      { k: "tp2RR", rotulo: "TP2 (1:X)", tipo: "num", min: 0.1, max: 50, passo: 0.1 },
      { k: "tp3RR", rotulo: "TP3 (1:X)", tipo: "num", min: 0.1, max: 50, passo: 0.1 },
      { k: "showTP1", rotulo: "Exibir TP1", tipo: "bool" },
      { k: "showTP2", rotulo: "Exibir TP2", tipo: "bool" },
      { k: "showTP3", rotulo: "Exibir TP3", tipo: "bool" },
    ],
  },
  {
    titulo: "Percentagens (sem ATR)",
    campos: [
      { k: "use_TPs", rotulo: "Usa níveis de TP", tipo: "bool" },
      { k: "slx", rotulo: "% para SL", tipo: "num", min: 0, max: 50, passo: 0.1 },
      { k: "tp1x", rotulo: "% para TP1", tipo: "num", min: 0, max: 50, passo: 0.1 },
      { k: "tp2x", rotulo: "% para TP2", tipo: "num", min: 0, max: 50, passo: 0.1 },
      { k: "tp3x", rotulo: "% para TP3", tipo: "num", min: 0, max: 50, passo: 0.1 },
      { k: "use_RR", rotulo: "Usa Risco Recompensa (esconde TP2/TP3)", tipo: "bool" },
    ],
  },
  {
    titulo: "Caixa da posição",
    campos: [
      { k: "entry_source", rotulo: "Fonte das entradas", tipo: "opcoes", opcoes: [["close", "Fecho"], ["open", "Abertura"], ["high", "Máximo"], ["low", "Mínimo"], ["hl2", "HL2"], ["hlc3", "HLC3"], ["ohlc4", "OHLC4"]] },
      { k: "box_length", rotulo: "Distância da posição (esq.)", tipo: "num", min: 1, max: 100, passo: 1 },
      { k: "box_length2", rotulo: "Distância da posição (dir.)", tipo: "num", min: 1, max: 100, passo: 1 },
    ],
  },
  {
    titulo: "Estruturas de mercado",
    campos: [
      { k: "len", rotulo: "Período CHoCH", tipo: "num", min: 2, max: 500, passo: 1 },
      { k: "shortLen", rotulo: "Período IDM", tipo: "num", min: 1, max: 100, passo: 1 },
      { k: "showChoch", rotulo: "Mostrar CHoCH", tipo: "bool" },
      { k: "showBos", rotulo: "Mostrar BOS", tipo: "bool" },
      { k: "showIdm", rotulo: "Mostrar IDM", tipo: "bool" },
      { k: "showSweeps", rotulo: "Mostrar sweeps (x)", tipo: "bool" },
      { k: "showCircles", rotulo: "Mostrar swings", tipo: "bool" },
    ],
  },
]

export function PopoverInputsMTMScanner({ inputs, definir, repor, cor }: {
  inputs: InputsMTMScanner
  definir: (p: Partial<InputsMTMScanner>) => void
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
        aria-label="Definições do MTM Scanner"
        title="Definições do MTM Scanner"
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
            <b style={{ color: cor }}>MTM Scanner · definições</b>
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
                      <input type="checkbox" checked={Boolean(valor)} onChange={(e) => definir({ [c.k]: e.target.checked } as Partial<InputsMTMScanner>)} className="h-3.5 w-3.5 accent-[#2962FF]" />
                    ) : c.tipo === "num" ? (
                      <input
                        type="number" min={c.min} max={c.max} step={c.passo} value={Number(valor)}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n)) definir({ [c.k]: Math.min(c.max, Math.max(c.min, n)) } as Partial<InputsMTMScanner>)
                        }}
                        className="w-16 rounded px-1.5 py-0.5 text-right"
                        style={{ background: TV.fundo, border: `1px solid ${TV.borda}`, color: TV.texto }}
                      />
                    ) : (
                      <select
                        value={String(valor)}
                        onChange={(e) => {
                          const escolhido = c.opcoes.find(([v]) => String(v) === e.target.value)
                          if (escolhido) definir({ [c.k]: escolhido[0] } as Partial<InputsMTMScanner>)
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
            o POC reinicia de lengthPOC em lengthPOC velas contadas desde o início do histórico carregado, por isso pode diferir do TradingView.
          </p>
        </div>
      )}
    </>
  )
}
