/**
 * TrendShot — o estudo calculado no gráfico do WebTrader (Lightweight), como o GoldKiller e o Sensei.
 *
 * Até aqui o WebTrader só desenhava as setas dos sinais que já tinham chegado pelo webhook: sem
 * sinal recente, o gráfico ficava vazio. Este motor faz o que o alerta do TradingView diz que o
 * Pine faz (lib/sinais/trendshot.ts):
 *
 *   · EMA20 (rápida), EMA50 (lenta) e EMA238 (longa) do fecho (ta.ema — lib/estudos/comum/ta.ts);
 *   · sinal no cruzamento confirmado (vela fechada): EMA20 passa por cima da EMA50 → BUY, por baixo → SELL;
 *   · só dentro do «Trade Clock» (TRADE_SESSION "0800-2100" do Pine). O Pine lê a hora do gráfico /
 *     da bolsa; aqui é a hora UTC da abertura da vela (o fuso das velas do WebTrader);
 *   · entrada = fecho da vela do cruzamento; SL e TP1–TP4 do modo AUTO, com a MESMA função que o
 *     servidor usa para as mensagens (niveisTrendshot) — o gráfico e o Telegram dizem o mesmo.
 *
 * Do Pine «Trendshot by MTM» (v6) fica de fora, por agora: o SL por estrutura (opcional, desligado
 * por omissão), suportes/resistências, estrelas, POC, a tabela multi-timeframe e o histograma.
 *
 * O sinal ativo é o último cruzamento enquanto não tocar no SL nem em todos os TPs (como o Sensei e o
 * GoldKiller): é ele que alimenta o «Usar este sinal».
 *
 * Puro: sem DOM, sem rede. Testes em __tests__/trendshot.check.ts.
 */
import { ema } from '../comum/ta'
import type { Vela } from '../comum/velas'
import { niveisTrendshot, type NiveisTrendshot } from '@/lib/sinais/trendshot'

export const EMA_RAPIDA = 20
export const EMA_LENTA = 50
export const EMA_LONGA = 238

export interface InputsTrendShot {
  simbolo: string
  /** Hora UTC (0–23) em que a sessão abre e fecha: [inicio, fim). Fim ≤ início atravessa a meia-noite. */
  sessaoInicio: number
  sessaoFim: number
  /** O último sinal pode ser o da vela ainda aberta? Não: o Pine só confirma ao fechar. */
  incluirVelaAberta: boolean
}

export const INPUTS_TRENDSHOT: Omit<InputsTrendShot, 'simbolo'> = { sessaoInicio: 8, sessaoFim: 21, incluirVelaAberta: false }

export interface SinalTrendShot extends NiveisTrendshot {
  /** Índice da vela do cruzamento e o seu tempo (segundos unix, abertura). */
  i: number
  t: number
  direcao: 'buy' | 'sell'
  entrada: number
}

export interface ResultadoTrendShot {
  emaRapida: number[]
  emaLenta: number[]
  emaLonga: number[]
  sinais: SinalTrendShot[]
  /** O último sinal e o que o preço lhe fez depois (velas seguintes, máximos e mínimos). */
  ultima: { sinal: SinalTrendShot; slTocado: boolean; tpTocado: [boolean, boolean, boolean, boolean] } | null
}

export function naSessao(t: number, inicio: number, fim: number): boolean {
  const h = new Date(t * 1000).getUTCHours()
  return inicio < fim ? h >= inicio && h < fim : h >= inicio || h < fim
}

export function calcularTrendShot(velas: Vela[], parcial: Partial<InputsTrendShot> & { simbolo: string }): ResultadoTrendShot {
  const inp: InputsTrendShot = { ...INPUTS_TRENDSHOT, ...parcial }
  const fechos = velas.map((v) => v.c)
  const emaRapida = ema(fechos, EMA_RAPIDA)
  const emaLenta = ema(fechos, EMA_LENTA)
  const emaLonga = ema(fechos, EMA_LONGA)
  const sinais: SinalTrendShot[] = []
  // A última vela está a formar-se: o cruzamento nela ainda pode desfazer-se.
  const fimSinais = inp.incluirVelaAberta ? velas.length - 1 : velas.length - 2
  for (let i = 1; i <= fimSinais; i++) {
    const a0 = emaRapida[i - 1], b0 = emaLenta[i - 1], a = emaRapida[i], b = emaLenta[i]
    if ([a0, b0, a, b].some(Number.isNaN)) continue
    const cimaAgora = a > b, cimaAntes = a0 > b0, baixoAgora = a < b, baixoAntes = a0 < b0
    const direcao = cimaAgora && !cimaAntes ? 'buy' : baixoAgora && !baixoAntes ? 'sell' : null
    if (!direcao || !naSessao(velas[i].t, inp.sessaoInicio, inp.sessaoFim)) continue
    const entrada = velas[i].c
    sinais.push({ i, t: velas[i].t, direcao, entrada, ...niveisTrendshot(inp.simbolo, direcao, entrada) })
  }
  const ultimo = sinais[sinais.length - 1]
  let ultima: ResultadoTrendShot['ultima'] = null
  if (ultimo) {
    const compra = ultimo.direcao === 'buy'
    let slTocado = false
    const tpTocado: [boolean, boolean, boolean, boolean] = [false, false, false, false]
    for (let j = ultimo.i + 1; j < velas.length && !slTocado; j++) {
      const v = velas[j]
      // Na mesma vela, o SL conta primeiro: sem ticks não se sabe a ordem, e assim não se promete lucro.
      if (compra ? v.l <= ultimo.sl : v.h >= ultimo.sl) { slTocado = true; break }
      ultimo.tps.forEach((tp, k) => { if (compra ? v.h >= tp : v.l <= tp) tpTocado[k] = true })
    }
    ultima = { sinal: ultimo, slTocado, tpTocado }
  }
  return { emaRapida, emaLenta, emaLonga, sinais, ultima }
}
