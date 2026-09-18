"use client"

import type { PrecoVivo, SimboloFicha } from "./api"
import { bibliotecaTvDisponivel } from "./biblioteca-tv"
import { semearPrecos } from "./use-precos"
import { buscarRecentes, lerDisco, lerMemoria } from "./armazem-velas"
import { URL_FICHAS, tirarPreCarga } from "@/lib/webtrader/velas"
import { candidatosDeTicker } from "@/lib/mtmfunded/simulado/ordens"

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

const FICHAS_TTL_MS = 60_000
const fichas = new Map<string, { em: number; p: Promise<RespostaFichas> }>()

/** A ficha (specs) + o primeiro preço de uma lista de candidatos («GBPCAD» ou «XAUUSD,XAUUSDM»). */
export function pedirFichas(csv: string): Promise<RespostaFichas> {
  const chave = csv.toUpperCase()
  const c = fichas.get(chave)
  if (c && Date.now() - c.em < FICHAS_TTL_MS) return c.p
  // O script do HTML de /webtrader pode já ter este pedido a caminho (lib/webtrader/pre-carga-inline.ts).
  const url = URL_FICHAS(chave)
  const doHtml = tirarPreCarga<RespostaFichas>(url)
  // Uma resposta de erro (500, 502 em HTML) não fica 60 s em cache como «símbolo sem ficha».
  const rede = () => fetch(url).then((r) => { if (!r.ok) throw new Error(`fichas ${r.status}`); return r.json() as Promise<RespostaFichas> })
  const p = (doHtml ? doHtml.catch(rede) : rede())
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
  void fichaDe(csv).then((f) => {
    if (!f || lerMemoria(f.symbol, tf)) return
    // O disco primeiro (desenha já o que se viu da última vez); a rede junta as velas que faltam.
    void lerDisco(f.symbol, tf).catch(() => null)
    void buscarRecentes(f.symbol, tf, VELAS_PRIMEIRA_JANELA).catch(() => {})
  })
}

/**
 * Hover/toque num link ou separador do WebTrader: o código do trader e do gráfico começam a
 * descarregar, e a ficha + velas do símbolo do link também — ao clicar, já está (quase) tudo cá.
 */
export function aquecerWebtrader(ticker?: string | null) {
  if (typeof window === "undefined") return
  void import("./funded-trader").catch(() => {})
  preaquecerWebtrader(ticker ? candidatosDeTicker(ticker).join(",") : null)
}
