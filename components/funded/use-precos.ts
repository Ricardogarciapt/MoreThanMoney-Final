"use client"

import { useEffect, useRef, useState } from "react"
import type { PrecoVivo } from "./api"

/**
 * PREÇOS AO VIVO só dos símbolos que estão no ecrã — UM pedido por página, por muitos que peçam.
 *
 * O catálogo vai ter centenas de símbolos; pedir todos a cada 1,5 s era descarregar o mercado
 * inteiro para mostrar seis linhas. Pede-se o que se vê (lista visível + gráfico + posições), e o
 * servidor aproveita o pedido para dizer ao motor que alguém está a olhar para eles.
 *
 * Partilhado (2026-09): antes cada componente com `usePrecos` tinha o seu intervalo — dois
 * gráficos, ou o trader e a faixa do scanner, eram dois polls à mesma rota. Agora há um só «fio» por
 * página: junta os símbolos de todos os subscritores (máx. 60), corre ao ritmo do mais rápido e
 * entrega a cada um só os seus (e só re-renderiza quem teve um preço a mudar). Pára com o separador
 * escondido e volta a pedir logo ao reaparecer. A ficha do símbolo (pre-carga.ts) semeia o primeiro
 * preço, por isso o bid/ask aparece antes do primeiro poll.
 */

type Ouvinte = () => void
const precosGlobais: Record<string, PrecoVivo> = {}
const subscritores = new Map<number, { symbols: string[]; intervaloMs: number }>()
const ouvintes = new Set<Ouvinte>()
let proximoId = 1
let temporizador: ReturnType<typeof setTimeout> | null = null
let emCurso = false
let ultimoErro: string | null = null
let visibilidadeLigada = false
let ultimaIda = 0
/** Duas idas seguidas nunca com menos disto (a lista visível muda a cada scroll). */
const FOLGA_MS = 400

function avisar() { ouvintes.forEach((o) => o()) }

// ── WebSocket do motor (VPS) — o caminho principal desde 2026-09 ─────────────
// MetaApi → motor → wss://stream.morethanmoney.pt/precos → browser. O poll abaixo passa a rede
// de segurança: só corre quando a WS não está viva (motor em baixo, rede a bloquear WS). Foi o
// poll por cliente a ler a Supabase que esgotou o egress a 19/09 — com a WS viva não há UMA
// leitura de preços à base por causa do WebTrader.
const WS_URL = process.env.NEXT_PUBLIC_FUNDED_WS_URL || ""
let ws: WebSocket | null = null
let wsTentativas = 0
let wsUltimaMsg = 0
let wsChaveEnviada = ""
let wsTimer: ReturnType<typeof setTimeout> | null = null
let avisoTimer: ReturnType<typeof setTimeout> | null = null

function wsVivo() { return !!ws && ws.readyState === 1 && Date.now() - wsUltimaMsg < 8000 }

/** Ticks chegam vários por segundo: os re-renders saem coalescidos a ~12/s. */
function avisarBreve() {
  if (avisoTimer) return
  avisoTimer = setTimeout(() => { avisoTimer = null; avisar() }, 80)
}

function wsAoPreco(p: { s: string; b: number; a: number; t: number }) {
  const vivo: PrecoVivo = { symbol: p.s, bid: p.b, ask: p.a, em: new Date(p.t).toISOString(), fresco: true }
  const antes = precosGlobais[p.s]
  if (!antes || Date.parse(vivo.em) >= Date.parse(antes.em)) precosGlobais[p.s] = vivo
}

function wsSincronizar() {
  if (!ws || ws.readyState !== 1) return
  const chave = chaveGlobal()
  if (chave === wsChaveEnviada) return
  wsChaveEnviada = chave
  try { ws.send(JSON.stringify({ sub: chave ? chave.split(",") : [] })) } catch { /* o onclose trata */ }
}

function wsLigar() {
  if (!WS_URL || typeof window === "undefined" || ws || !subscritores.size) return
  try { ws = new WebSocket(WS_URL) } catch { ws = null; return }
  ws.onopen = () => { wsTentativas = 0; wsUltimaMsg = Date.now(); wsChaveEnviada = ""; wsSincronizar() }
  ws.onmessage = (ev) => {
    wsUltimaMsg = Date.now()
    try {
      const m = JSON.parse(String(ev.data))
      if (m?.tipo === "snap") { for (const p of m.precos ?? []) wsAoPreco(p); avisar(); return }
      if (m?.s) { wsAoPreco(m); avisarBreve() }
    } catch { /* mensagem estranha não derruba o fio */ }
  }
  ws.onerror = () => { try { ws?.close() } catch { /* onclose trata */ } }
  ws.onclose = () => {
    ws = null
    wsChaveEnviada = ""
    if (!subscritores.size) return
    const espera = Math.min(30_000, 1000 * 2 ** wsTentativas++)
    if (wsTimer) clearTimeout(wsTimer)
    wsTimer = setTimeout(wsLigar, espera)
    pedirJa() // o poll cobre o buraco no mesmo instante
  }
}

function wsFechar() {
  if (wsTimer) { clearTimeout(wsTimer); wsTimer = null }
  const w = ws
  ws = null
  try { w?.close() } catch { /* já fechada */ }
}

/** Preços que chegaram por outro caminho (a ficha do símbolo) — só se forem mais recentes. */
export function semearPrecos(lista: PrecoVivo[]) {
  let mudou = false
  for (const p of lista) {
    const antes = precosGlobais[p.symbol]
    if (!antes || new Date(p.em).getTime() >= new Date(antes.em).getTime()) { precosGlobais[p.symbol] = p; mudou = true }
  }
  if (mudou) avisar()
}

function chaveGlobal() {
  const todos = new Set<string>()
  for (const s of subscritores.values()) s.symbols.forEach((x) => todos.add(x))
  return [...todos].sort().slice(0, 60).join(",")
}
function intervaloGlobal() {
  let min = Infinity
  for (const s of subscritores.values()) min = Math.min(min, s.intervaloMs)
  return Number.isFinite(min) ? min : 1500
}

async function correr() {
  temporizador = null
  if (!subscritores.size) return
  const escondido = typeof document !== "undefined" && document.visibilityState === "hidden"
  // WS viva → zero polls; fica só um batimento a verificar que ela continua a dar sinal.
  if (wsVivo()) {
    wsSincronizar()
    tapaBuracos(escondido)
    if (!escondido && !temporizador) temporizador = setTimeout(correr, 5000)
    return
  }
  const chave = chaveGlobal()
  if (chave && !escondido && !emCurso) {
    emCurso = true
    ultimaIda = Date.now()
    try {
      const r = await fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(chave)}`, { cache: "no-store" })
      // O estado primeiro: uma página de erro em HTML (502) dava um SyntaxError em vez de «indisponíveis».
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) throw new Error(d?.error || "preços indisponíveis")
      for (const p of d.precos as PrecoVivo[]) precosGlobais[p.symbol] = p
      ultimoErro = null
    } catch (e) {
      ultimoErro = (e as Error).message
    } finally {
      emCurso = false
    }
    avisar()
  }
  // Escondido: não se agenda — o visibilitychange acorda o fio.
  if (subscritores.size && !escondido && !temporizador) temporizador = setTimeout(correr, intervaloGlobal())
}

/**
 * WS viva mas o motor não publica um símbolo (21/09: sem MetaApi, só o cripto e o que os recursos
 * cobrem): sem isto esse símbolo ficava SEM preço nenhum no ecrã, nem o último guardado. Pede-se
 * à rota só o que falta ou está velho, no máximo de 20 em 20 s — nunca o poll inteiro de volta.
 */
const BURACO_MS = 20_000
let ultimoBuraco = 0
function tapaBuracos(escondido: boolean) {
  if (escondido || emCurso || Date.now() - ultimoBuraco < BURACO_MS) return
  const agora = Date.now()
  const faltam = chaveGlobal().split(",").filter((s) => {
    if (!s) return false
    const p = precosGlobais[s]
    return !p || agora - Date.parse(p.em) > 30_000
  })
  if (!faltam.length) return
  ultimoBuraco = agora
  void fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(faltam.join(","))}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d?.precos) semearPrecos(d.precos as PrecoVivo[]) })
    .catch(() => { /* a WS continua; volta-se a tentar no próximo buraco */ })
}

function pedirJa() {
  if (temporizador) { clearTimeout(temporizador); temporizador = null }
  const espera = FOLGA_MS - (Date.now() - ultimaIda)
  if (emCurso || espera > 0) {
    // Há um pedido a meio (ou acabou de sair): o próximo ciclo sai logo a seguir, com a lista nova.
    temporizador = setTimeout(correr, Math.max(50, espera))
    return
  }
  void correr()
}

function ligarVisibilidade() {
  if (visibilidadeLigada || typeof document === "undefined") return
  visibilidadeLigada = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" && subscritores.size) pedirJa()
  })
}

function subconjunto(chave: string): Record<string, PrecoVivo> {
  const out: Record<string, PrecoVivo> = {}
  if (chave) for (const s of chave.split(",")) if (precosGlobais[s]) out[s] = precosGlobais[s]
  return out
}
/** Os preços `novos` já estão todos iguais em `antes`? (então não há re-render) */
function jaTem(antes: Record<string, PrecoVivo>, novos: Record<string, PrecoVivo>) {
  return Object.keys(novos).every((k) => {
    const a = antes[k], b = novos[k]
    return a && a.em === b.em && a.bid === b.bid && a.ask === b.ask && a.fresco === b.fresco
  })
}

export function usePrecos(symbols: string[], intervaloMs = 1500) {
  const chave = [...new Set(symbols.filter(Boolean))].sort().slice(0, 60).join(",")
  const [precos, setPrecos] = useState<Record<string, PrecoVivo>>(() => subconjunto(chave))
  const [erro, setErro] = useState<string | null>(null)
  const chaveRef = useRef(chave)
  chaveRef.current = chave

  useEffect(() => {
    const ouvir = () => {
      const novo = subconjunto(chaveRef.current)
      setPrecos((antes) => (jaTem(antes, novo) ? antes : { ...antes, ...novo }))
      setErro((e) => (e === ultimoErro ? e : ultimoErro))
    }
    ouvintes.add(ouvir)
    ouvir()
    return () => { ouvintes.delete(ouvir) }
  }, [])

  useEffect(() => {
    if (!chave) return
    ligarVisibilidade()
    const id = proximoId++
    const antes = chaveGlobal()
    subscritores.set(id, { symbols: chave.split(","), intervaloMs })
    const novo = subconjunto(chave)
    if (Object.keys(novo).length) setPrecos((a) => ({ ...a, ...novo }))
    wsLigar()
    wsSincronizar()
    const escondido = typeof document !== "undefined" && document.visibilityState === "hidden"
    if (escondido) {
      // Um ecrã aberto em segundo plano não deve voltar sem preços: uma ida, sem agendar.
      void fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(chave)}`, { cache: "no-store" })
        .then((r) => r.json()).then((d) => semearPrecos((d?.precos ?? []) as PrecoVivo[])).catch(() => {})
    } else if (chaveGlobal() !== antes || !temporizador) {
      // Símbolo novo → pede já, sem esperar pelo próximo ciclo (com WS viva, o correr sincroniza e
      // tapa logo os buracos do símbolo novo, sem esperar os 20 s).
      if (chaveGlobal() !== antes) ultimoBuraco = 0
      pedirJa()
    }
    return () => {
      subscritores.delete(id)
      if (!subscritores.size) {
        if (temporizador) { clearTimeout(temporizador); temporizador = null }
        wsFechar()
      }
    }
  }, [chave, intervaloMs])

  return { precos, erro }
}
