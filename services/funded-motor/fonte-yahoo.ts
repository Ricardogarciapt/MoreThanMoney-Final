/**
 * FOREX E METAIS SEM METAAPI — recurso do motor por poll ao Yahoo (forex) e à gold-api (ouro/prata).
 *
 * Irmão do fonte-binance.ts (ordem de 2026-09-21: o motor vive sem MetaApi). Mesmo contrato: só
 * INJETA quando o preço do feed principal está velho (>5 s); com a MetaApi viva não há duas fontes
 * a lutar pelo mesmo símbolo.
 *
 * O QUE ENTRA e porquê (atrasos medidos a 21/09):
 *   · forex `XXXYYY=X` no Yahoo: ~3 s de atraso, ao nível do spot → entra;
 *   · ouro/prata/platina/paládio à vista na gold-api.com: tempo real, ao nível do spot → entra;
 *   · futuros (GC=F, YM=F, NQ=F, CL=F…) ~10 min e ^GDAXI/^FTSE ~15 min de atraso → NÃO entram.
 *     Um preço negociável com 10 min de atraso numa conta de desafio é oferecer o futuro a quem
 *     tiver um gráfico em tempo real. Regra geral, não lista: cada cotação traz o seu instante e
 *     só se injeta se tiver menos de YAHOO_ATRASO_MAX_S (240 s). O instante do Yahoo só avança
 *     quando o preço MUDA (EURUSD calmo passa um minuto parado), por isso o limite fica entre o
 *     «calmo» (< 2 min) e o atraso fixo dos futuros (≥ 600 s). Mercado fechado → cotação velha →
 *     nada entra (não se fabricam ticks ao fim de semana). O tick entra com a hora da LEITURA: a
 *     fonte é de tempo real, um preço que não mudou continua a ser o preço de agora.
 * Outras classes (acções/índices à vista durante a sessão) só com YAHOO_CLASSES explícito, e as
 * que não estão ao nosso nível só entram reescaladas por um fator ancorado no último preço
 * conhecido (lib/mercado/referencias.ts → fatorAncorado).
 *
 * LIMITES: o Yahoo não publica quota. Balde de pedidos (YAHOO_MAX_PEDIDOS_MIN, 60/min), cada
 * símbolo no máximo a cada YAHOO_INTERVALO_MS (5 s), 4 em simultâneo, e só os símbolos que o motor
 * QUER (posições, ordens, alertas, quem está a ver) com o principal velho. Falhas seguidas → pausa
 * com recuo (1 → 15 min). O bid/ask faz-se com o spread do último preço conhecido (ou o do
 * catálogo): a referência só dá um preço.
 *
 * Env: YAHOO_FEED=0 desliga · YAHOO_CLASSES="forex,metal" · YAHOO_INTERVALO_MS · YAHOO_MAX_PEDIDOS_MIN
 *      · YAHOO_ATRASO_MAX_S.
 */
import { fatorAncorado, fatorValido, referenciasPara, type Ancora } from '../../lib/mercado/referencias'
import { cotacaoMetalSpot, cotacaoYahoo, velasAVoltaDe } from '../../lib/mercado/velas-referencia'

export interface InfoSimbolo { classe: string; digits: number; spread_pontos: number; moeda_lucro?: string | null }

export interface OpcoesYahoo {
  /** símbolos CANÓNICOS que o motor quer agora */
  simbolos: () => Iterable<string>
  info: (sym: string) => InfoSimbolo | null
  /** o principal está velho para este símbolo? (só então se injeta) */
  precisa: (sym: string) => boolean
  /** último bid/ask conhecido (para o spread) */
  ultimo: (sym: string) => { bid: number; ask: number } | null
  /** último preço nosso com instante — só para classes fora do nosso nível */
  ancora?: (sym: string) => Promise<Ancora | null>
  /**
   * `emMercado` = o instante que a própria cotação declara (`regularMarketTime` no Yahoo,
   * `updatedAt` na gold-api). É a hora do MERCADO e pode ser muito mais velha do que a leitura —
   * um EURUSD calmo passa um minuto com a mesma hora. É precisamente isso que quem lê precisa de
   * saber: antes disto o tick entrava carimbado a `Date.now()` e parecia fresco estando parado.
   * Reescalado por âncora (fora do nosso nível) → NULO: o factor vem de velas de outra hora.
   */
  injetar: (sym: string, bid: number, ask: number, emMs: number, emMercado: number | null, origem: string) => void
  log: (...a: unknown[]) => void
}

export interface FonteYahoo {
  parar(): void
  resumo(): { pedidosMin: number; injetados: number; simbolos: number; atrasados: string[]; pausaAte: string | null }
}

const METAIS_SPOT: Record<string, 'XAU' | 'XAG' | 'XPT' | 'XPD'> = { XAUUSD: 'XAU', XAGUSD: 'XAG', XPTUSD: 'XPT', XPDUSD: 'XPD' }

/** Como se obtém a cotação viva de um símbolo — ou null se não houver forma segura. Exportado para a verificação. */
export function planoVivo(sym: string, info: InfoSimbolo | null, classes: Set<string>): { tipo: 'metal'; metal: 'XAU' | 'XAG' | 'XPT' | 'XPD' } | { tipo: 'yahoo'; ticker: string; sameLevel: boolean } | null {
  const classe = info?.classe ?? ''
  if (!classes.has(classe)) return null
  if (METAIS_SPOT[sym]) return { tipo: 'metal', metal: METAIS_SPOT[sym] }
  if (classe === 'cripto') return null // é da fonte-binance.ts
  const ref = referenciasPara(sym, classe, info?.moeda_lucro ?? null).find((r) => r.kind === 'yahoo')
  return ref ? { tipo: 'yahoo', ticker: ref.symbol, sameLevel: ref.sameLevel } : null
}

/** bid/ask à volta de um preço-meio, com o spread conhecido e arredondado aos dígitos. Exportado para a verificação. */
export function bidAsk(meio: number, digits: number, spreadConhecido: number | null, spreadPontos: number): { bid: number; ask: number } {
  const ponto = 10 ** -digits
  let sp = spreadConhecido != null && spreadConhecido > 0 && spreadConhecido < meio * 0.01 ? spreadConhecido : spreadPontos * ponto
  if (!(sp >= ponto)) sp = ponto
  const bid = Number((meio - sp / 2).toFixed(digits))
  const ask = Number((bid + Math.round(sp / ponto) * ponto).toFixed(digits))
  return { bid, ask }
}

export function iniciarFonteYahoo(o: OpcoesYahoo): FonteYahoo | null {
  if (process.env.YAHOO_FEED === '0') return null
  const classes = new Set((process.env.YAHOO_CLASSES || 'forex,metal').split(',').map((s) => s.trim()).filter(Boolean))
  const intervaloMs = Math.max(2000, Number(process.env.YAHOO_INTERVALO_MS) || 5000)
  const porMinuto = Math.max(6, Number(process.env.YAHOO_MAX_PEDIDOS_MIN) || 60)
  const atrasoMaxS = Math.max(10, Number(process.env.YAHOO_ATRASO_MAX_S) || 240)
  const EM_SIMULTANEO = 4

  const ultimoPedido = new Map<string, number>()
  const ultimaCotacao = new Map<string, number>() // sym → emSeg da última injetada
  const atrasadoAte = new Map<string, number>()
  const fatores = new Map<string, { f: number | null; em: number }>()
  let fichas = 5
  let emCurso = 0
  let falhasSeguidas = 0
  let pausaAte = 0
  let pausas = 0
  let injetados = 0
  let pedidosMin = 0
  let pedidosNoMinuto = 0
  let parado = false

  const fator = async (sym: string, ticker: string): Promise<number | null> => {
    const g = fatores.get(sym)
    if (g && Date.now() - g.em < 30 * 60_000) return g.f
    let f: number | null = null
    const a = o.ancora ? await o.ancora(sym).catch(() => null) : null
    if (a) {
      const { velas } = await velasAVoltaDe({ kind: 'yahoo', symbol: ticker, sameLevel: false }, a.emSeg)
      const x = fatorAncorado(velas, a, 3 * 3600)
      f = fatorValido(x) ? x : null
    }
    fatores.set(sym, { f, em: Date.now() })
    return f
  }

  const pedir = async (sym: string, info: InfoSimbolo) => {
    const plano = planoVivo(sym, info, classes)
    if (!plano) return
    emCurso++
    ultimoPedido.set(sym, Date.now())
    pedidosNoMinuto++
    try {
      const c = plano.tipo === 'metal' ? await cotacaoMetalSpot(plano.metal) : await cotacaoYahoo(plano.ticker)
      if (!c) {
        if (++falhasSeguidas >= 5) {
          const espera = Math.min(15, 2 ** pausas++) * 60_000
          pausaAte = Date.now() + espera
          falhasSeguidas = 0
          o.log(`[yahoo] 5 falhas seguidas — pausa de ${Math.round(espera / 60_000)} min`)
        }
        return
      }
      falhasSeguidas = 0
      pausas = 0
      const atraso = Date.now() / 1000 - c.emSeg
      if (atraso > atrasoMaxS) {
        // Mercado fechado ou fonte atrasada (futuros): não se injeta, e não se insiste durante 1 min.
        if (!atrasadoAte.has(sym)) o.log(`[yahoo] ${sym} com ${Math.round(atraso)} s de atraso — não entra`)
        atrasadoAte.set(sym, Date.now() + 60_000)
        return
      }
      atrasadoAte.delete(sym)
      let meio = c.preco
      // A cotação declara a sua hora: é essa que vale como hora de mercado.
      let emMercado: number | null = c.emSeg * 1000
      if (plano.tipo === 'yahoo' && !plano.sameLevel) {
        const f = await fator(sym, plano.ticker)
        if (f == null) return // fora do nosso nível e sem âncora: melhor nada
        meio *= f
        // Preço reescalado por um factor tirado de velas de outra hora: já não é o preço que o
        // mercado fez naquele instante, e dizer que é seria inventar. Fica sem hora de mercado.
        emMercado = null
      }
      if (!o.precisa(sym)) return
      const u = o.ultimo(sym)
      const { bid, ask } = bidAsk(meio, info.digits, u ? u.ask - u.bid : null, info.spread_pontos)
      ultimaCotacao.set(sym, c.emSeg)
      injetados++
      o.injetar(sym, bid, ask, Date.now(), emMercado, plano.tipo === 'metal' ? 'gold-api' : 'yahoo')
    } catch {
      // uma cotação má não derruba o recurso
    } finally {
      emCurso--
    }
  }

  const ciclo = () => {
    if (parado) return
    fichas = Math.min(5, fichas + porMinuto / 60)
    if (Date.now() < pausaAte) return
    const agora = Date.now()
    const candidatos: Array<{ sym: string; info: InfoSimbolo; ultimo: number }> = []
    for (const sym of o.simbolos()) {
      const info = o.info(sym)
      if (!info || !planoVivo(sym, info, classes)) continue
      if ((atrasadoAte.get(sym) ?? 0) > agora) continue
      const ultimo = ultimoPedido.get(sym) ?? 0
      if (agora - ultimo < intervaloMs || !o.precisa(sym)) continue
      candidatos.push({ sym, info, ultimo })
    }
    candidatos.sort((a, b) => a.ultimo - b.ultimo)
    for (const c of candidatos) {
      if (fichas < 1 || emCurso >= EM_SIMULTANEO) break
      fichas--
      void pedir(c.sym, c.info)
    }
  }

  const tCiclo = setInterval(ciclo, 1000)
  const tMinuto = setInterval(() => { pedidosMin = pedidosNoMinuto; pedidosNoMinuto = 0 }, 60_000)
  o.log(`[yahoo] recurso ligado · classes ${[...classes].join(',')} · ${porMinuto} pedidos/min · atraso máx ${atrasoMaxS}s`)

  return {
    parar() { parado = true; clearInterval(tCiclo); clearInterval(tMinuto) },
    resumo: () => ({
      pedidosMin, injetados, simbolos: ultimaCotacao.size,
      atrasados: [...atrasadoAte.entries()].filter(([, ate]) => ate > Date.now()).map(([s]) => s).slice(0, 20),
      pausaAte: pausaAte > Date.now() ? new Date(pausaAte).toISOString() : null,
    }),
  }
}
