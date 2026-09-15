"use client"

import type { PrecoVivo, SimboloFicha } from "./api"
import { bibliotecaTvDisponivel } from "./biblioteca-tv"
import { semearPrecos } from "./use-precos"

/**
 * PRÉ-CARGA DO WEBTRADER — o que é público pede-se logo, sem esperar pela sessão nem pelas contas.
 *
 * Antes (2026-09) o gráfico ficava no fim de uma cascata: token → contas → contas reais → estado
 * da conta → ficha do símbolo → HEAD da biblioteca TradingView → import do Lightweight Charts →
 * velas (3000, ~9 s a frio na MetaApi) → primeiro preço. Tudo o que NÃO é da pessoa (a ficha do
 * símbolo, o primeiro preço, as velas recentes, o código do gráfico) não depende de nada disso e
 * arranca aqui, no primeiro render de /webtrader — e do deep link dos scanners, com o símbolo do link.
 *
 * Cada pedido fica numa promessa partilhada: quem chegar depois (FundedTrader, o gráfico, a
 * CorretoraTrader) apanha a mesma resposta em vez de repetir o pedido. Nada disto escreve na base;
 * as rotas são as mesmas e têm cache na CDN.
 */

interface RespostaFichas { simbolos?: SimboloFicha[]; precos?: PrecoVivo[] }
export interface VelaApi { t: number; o: number; h: number; l: number; c: number; v?: number }
interface RespostaVelas { velas?: VelaApi[] }

const FICHAS_TTL_MS = 60_000
const VELAS_TTL_MS = 15_000
const fichas = new Map<string, { em: number; p: Promise<RespostaFichas> }>()
const velas = new Map<string, { em: number; p: Promise<RespostaVelas> }>()

/** A ficha (specs) + o primeiro preço de uma lista de candidatos («GBPCAD» ou «XAUUSD,XAUUSDM»). */
export function pedirFichas(csv: string): Promise<RespostaFichas> {
  const chave = csv.toUpperCase()
  const c = fichas.get(chave)
  if (c && Date.now() - c.em < FICHAS_TTL_MS) return c.p
  const p = fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(chave)}&specs=1`)
    .then((r) => r.json() as Promise<RespostaFichas>)
    .then((d) => {
      // O primeiro preço vem nesta mesma resposta: o bid/ask aparece antes do primeiro poll.
      if (d.precos?.length) semearPrecos(d.precos)
      return d
    })
    .catch(() => { fichas.delete(chave); return {} as RespostaFichas })
  fichas.set(chave, { em: Date.now(), p })
  return p
}

/** A ficha escolhida de uma lista de candidatos: o primeiro que existe, pela ordem do link. */
export async function fichaDe(csv: string): Promise<SimboloFicha | null> {
  const d = await pedirFichas(csv)
  const lista = d.simbolos ?? []
  return csv.toUpperCase().split(",").map((c) => lista.find((s) => s.symbol === c)).find(Boolean) ?? null
}

export function pedirVelas(symbol: string, tf: string, limite: number): Promise<RespostaVelas> {
  const chave = `${symbol}:${tf}:${limite}`
  const c = velas.get(chave)
  if (c && Date.now() - c.em < VELAS_TTL_MS) return c.p
  const p = fetch(`/api/mtmfunded/simulado/velas?symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limite}`)
    .then((r) => r.json() as Promise<RespostaVelas>)
    .catch(() => { velas.delete(chave); return { velas: [] } as RespostaVelas })
  velas.set(chave, { em: Date.now(), p })
  if (velas.size > 40) velas.delete(velas.keys().next().value as string)
  return p
}

/** A janela recente que o gráfico pede primeiro (a CDN guarda-a 15 s). */
export const VELAS_PRIMEIRA_JANELA = 300

let lwAquecido = false
/**
 * Arranca tudo o que é público para o símbolo que vai abrir: ficha + preço, velas recentes no
 * timeframe guardado, o código do Lightweight Charts e o teste da biblioteca TradingView.
 * Pode chamar-se várias vezes — os pedidos repetidos são a mesma promessa.
 */
export function preaquecerWebtrader(candidatos: string | null) {
  if (typeof window === "undefined") return
  if (!lwAquecido) {
    lwAquecido = true
    void import("lightweight-charts").catch(() => { lwAquecido = false })
    void bibliotecaTvDisponivel()
  }
  let tf = "M5"
  try {
    const v = JSON.parse(localStorage.getItem("mtmfunded_tf") || "null")
    if (typeof v === "string" && /^(M1|M5|M15|H1|H4|D1)$/.test(v)) tf = v
  } catch { /* ok */ }
  const csv = candidatos || "XAUUSD"
  void fichaDe(csv).then((f) => { if (f) void pedirVelas(f.symbol, tf, VELAS_PRIMEIRA_JANELA) })
}
