/**
 * MTM Premium Scanner — o estudo calculado no gráfico do WebTrader (Lightweight), como o TrendShot.
 *
 * Faz o que o Pine docs/pine/mtm-premium-scanner.pine faz, com os valores por omissão:
 *
 *   · sessões UTC: Ásia 00–06, Londres 07–11, Nova Iorque 13–16 (hora da abertura da vela);
 *   · voto de 5 no fecho: preço vs abertura da sessão, vs há 4 velas, vs há 16 velas, vs EMA200 e
 *     vs EMA9. Modo «Maioria» (o sinal do voto); pausa de 2 velas e no máximo 6 sinais por sessão;
 *   · zona de 5 $ com o meio 4 $ contra o preço, SL 5 $ para lá da zona, TP1/TP2/TP3 a 5/10/15 $
 *     da borda da zona e TP4 a 20 $.
 *
 * As distâncias são em dólares do ouro, por isso só há sinais em símbolos XAU. As velas contam como
 * no Pine: o estudo foi calibrado em 15 minutos.
 *
 * O sinal ativo é o último enquanto a ordem limite (4 velas) não expirar sem entrar e, depois de
 * entrar, enquanto não tocar no SL nem em todos os TPs: é ele que alimenta o «Usar este sinal».
 *
 * Puro: sem DOM, sem rede.
 */
import { ema } from '../comum/ta'
import type { Vela } from '../comum/velas'

export const RECUO = 4
export const LARGURA_ZONA = 5
export const DIST_SL = 5
export const DIST_TPS = [5, 10, 15, 20] as const
const CURTO = 4
const LONGO = 16
const PAUSA = 2
const MAX_SESSAO = 6
const VALIDADE = 4

const SESSOES: { nome: 'ASIA' | 'LDN' | 'NY'; de: number; ate: number }[] = [
  { nome: 'ASIA', de: 0, ate: 6 },
  { nome: 'LDN', de: 7, ate: 11 },
  { nome: 'NY', de: 13, ate: 16 },
]

export function sessaoDe(t: number): 'ASIA' | 'LDN' | 'NY' | null {
  const h = new Date(t * 1000).getUTCHours()
  return SESSOES.find((s) => h >= s.de && h < s.ate)?.nome ?? null
}

export function eOuro(simbolo: string): boolean {
  return /XAU/i.test(simbolo)
}

export interface SinalPremium {
  i: number
  t: number
  sessao: 'ASIA' | 'LDN' | 'NY'
  direcao: 'buy' | 'sell'
  /** Meio da zona: a ordem limite. */
  entrada: number
  zona: [number, number]
  sl: number
  tps: [number, number, number, number]
}

export interface ResultadoPremium {
  sinais: SinalPremium[]
  ultima: { sinal: SinalPremium; entrou: boolean; expirou: boolean; slTocado: boolean; tpTocado: [boolean, boolean, boolean, boolean] } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function niveisPremium(direcao: 'buy' | 'sell', fecho: number) {
  const sg = direcao === 'buy' ? 1 : -1
  const meio = fecho - sg * RECUO
  const perto = meio + (sg * LARGURA_ZONA) / 2
  const longe = meio - (sg * LARGURA_ZONA) / 2
  return {
    entrada: r2(meio),
    zona: [r2(Math.min(perto, longe)), r2(Math.max(perto, longe))] as [number, number],
    sl: r2(longe - sg * DIST_SL),
    tps: DIST_TPS.map((d) => r2(perto + sg * d)) as [number, number, number, number],
  }
}

export function calcularPremium(velas: Vela[], simbolo: string, incluirVelaAberta = false): ResultadoPremium {
  const sinais: SinalPremium[] = []
  if (!eOuro(simbolo)) return { sinais, ultima: null }
  const fechos = velas.map((v) => v.c)
  const e200 = ema(fechos, 200)
  const e9 = ema(fechos, 9)
  const fim = incluirVelaAberta ? velas.length - 1 : velas.length - 2
  let abertura = NaN
  let nSessao = 0
  let ultimo = -1000
  let sessaoAntes: string | null = null
  for (let i = 0; i <= fim; i++) {
    const s = sessaoDe(velas[i].t)
    if (s && s !== sessaoAntes) { abertura = velas[i].o; nSessao = 0 }
    sessaoAntes = s
    if (!s || i < LONGO || Number.isNaN(e200[i]) || Number.isNaN(e9[i])) continue
    if (nSessao >= MAX_SESSAO || i - ultimo < PAUSA) continue
    const c = fechos[i]
    const voto = [c > abertura, c > fechos[i - CURTO], c > fechos[i - LONGO], c > e200[i], c > e9[i]].reduce((a, x) => a + (x ? 1 : -1), 0)
    const direcao = voto > 0 ? 'buy' : 'sell'
    nSessao++
    ultimo = i
    sinais.push({ i, t: velas[i].t, sessao: s, direcao, ...niveisPremium(direcao, c) })
  }
  const u = sinais[sinais.length - 1]
  let ultima: ResultadoPremium['ultima'] = null
  if (u) {
    const compra = u.direcao === 'buy'
    let entrou = false, expirou = false, slTocado = false
    const tpTocado: [boolean, boolean, boolean, boolean] = [false, false, false, false]
    for (let j = u.i + 1; j < velas.length; j++) {
      const v = velas[j]
      if (!entrou) {
        if (compra ? v.l <= u.entrada : v.h >= u.entrada) entrou = true
        else if (j - u.i >= VALIDADE) { expirou = true; break }
        else continue
      }
      // Na mesma vela, o SL conta primeiro: sem ticks não se sabe a ordem.
      if (compra ? v.l <= u.sl : v.h >= u.sl) { slTocado = true; break }
      u.tps.forEach((tp, k) => { if (compra ? v.h >= tp : v.l <= tp) tpTocado[k] = true })
    }
    ultima = { sinal: u, entrou, expirou, slTocado, tpTocado }
  }
  return { sinais, ultima }
}
