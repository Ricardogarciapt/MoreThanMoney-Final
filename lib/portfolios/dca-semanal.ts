/**
 * O DCA SEMANAL DAS CONTAS DE PORTEFÓLIO (PORTF-CRIPTO e PORTF-ETF) — às sextas, sozinho.
 *
 * Pedido do Ricardo (05/11/2026): ele reforça as carteiras reais todas as sextas e as contas da
 * casa têm de acompanhar. Até aqui o reforço era escrito à mão e ficou 5–6 semanas por escrever.
 *
 * O plano é o que as contas já faziam até 25/09/2026, sem invenções:
 *  · ETF: 50 $ por semana, a divisão de sempre desde Março de 2024.
 *  · Cripto: só os 5 activos que sobreviveram à limpeza de 01/10/2026, com os mesmos valores por
 *    activo (15,38 $). Os 13 vendidos deixaram de ser reforçados — decisão do Ricardo a 05/11.
 *
 * O preço é o FECHO DIÁRIO DE SEXTA (Binance 1d às 00:00 UTC de sexta; Yahoo, sessão de sexta).
 * O valor de mercado da carteira = Σ unidades × fecho + Σ produto das vendas (o dinheiro da
 * limpeza ficou na conta, que é como a curva o contava a 01/10).
 *
 * Puro: sem rede e sem base. Testado em lib/portfolios/dca-semanal.check.ts.
 */

export type FontePreco = 'binance' | 'yahoo'

export interface PlanoDca {
  login: 'PORTF-CRIPTO' | 'PORTF-ETF'
  fonte: FontePreco
  /** símbolo → dólares por semana */
  reforco: Record<string, number>
}

export const PLANOS_DCA: PlanoDca[] = [
  {
    login: 'PORTF-CRIPTO',
    fonte: 'binance',
    reforco: { XRPUSDT: 5.77, LINKUSDT: 3.85, HBARUSDT: 1.92, ONDOUSDT: 1.92, AEROUSDT: 1.92 },
  },
  {
    login: 'PORTF-ETF',
    fonte: 'yahoo',
    reforco: { SPY: 10, ARKK: 7.5, BLOK: 6, CIBR: 6, EEM: 6, BOTZ: 5, ARKX: 4, ICLN: 3, IGF: 2.5 },
  },
]

export const MOTIVO_DCA = 'DCA semanal · sexta'

const r2 = (x: number) => Math.round(x * 100) / 100

export function totalDoPlano(p: PlanoDca): number {
  return r2(Object.values(p.reforco).reduce((a, b) => a + b, 0))
}

/** A sexta-feira (YYYY-MM-DD, UTC) mais recente que já FECHOU em `agora` — nunca a de hoje. */
export function ultimaSextaFechada(agora: Date): string {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
  // getUTCDay: 5 = sexta. Hoje sexta → a anterior (os mercados ainda não fecharam).
  let recuo = (d.getUTCDay() - 5 + 7) % 7
  if (recuo === 0) recuo = 7
  d.setUTCDate(d.getUTCDate() - recuo)
  return d.toISOString().slice(0, 10)
}

export interface CompraDca { symbol: string; unidades: number; preco: number; valor: number }

/** As compras da semana, ou `null` se faltar UMA cotação: nunca se grava uma semana a meio. */
export function comprasDaSemana(p: PlanoDca, fecho: Record<string, number | null | undefined>): CompraDca[] | null {
  const out: CompraDca[] = []
  for (const [symbol, valor] of Object.entries(p.reforco)) {
    const preco = Number(fecho[symbol])
    if (!Number.isFinite(preco) || preco <= 0) return null
    out.push({ symbol, unidades: Math.round((valor / preco) * 1e10) / 1e10, preco, valor })
  }
  return out
}

export interface MovimentoMin { symbol: string; tipo: string; unidades: number | string | null; valor: number | string | null }

/** Unidades em carteira por símbolo (compras − vendas); poeira < 1e-8 conta como zero. */
export function carteira(movs: MovimentoMin[]): Record<string, number> {
  const h: Record<string, number> = {}
  for (const m of movs) {
    const u = Number(m.unidades) || 0
    const t = String(m.tipo).toLowerCase()
    if (t === 'compra') h[m.symbol] = (h[m.symbol] ?? 0) + u
    else if (t === 'venda') h[m.symbol] = (h[m.symbol] ?? 0) - u
  }
  for (const k of Object.keys(h)) if (Math.abs(h[k]) < 1e-8) delete h[k]
  return h
}

/** Dinheiro em conta: o produto das vendas (não reinvestido). */
export function liquidez(movs: MovimentoMin[]): number {
  return r2(movs.filter((m) => String(m.tipo).toLowerCase() === 'venda').reduce((a, m) => a + (Number(m.valor) || 0), 0))
}

/** Valor de mercado, ou `null` se algum activo em carteira não tiver cotação. */
export function valorDeMercado(h: Record<string, number>, fecho: Record<string, number | null | undefined>, caixa: number): number | null {
  let v = caixa
  for (const [s, u] of Object.entries(h)) {
    const p = Number(fecho[s])
    if (!Number.isFinite(p) || p <= 0) return null
    v += u * p
  }
  return r2(v)
}
