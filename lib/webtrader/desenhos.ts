/**
 * DESENHOS NO GRÁFICO DO WEBTRADER — linha horizontal, linha de tendência, Fibonacci e texto, como
 * no MT5 e no TradeLocker. Guardam-se no browser, por símbolo (não vão ao servidor).
 *
 * Um ponto guarda o tempo da vela (segundos unix) e o preço: assim o desenho fica no sítio ao mudar
 * de timeframe ou ao carregar mais histórico. Puro; testes em __tests__/desenhos.check.ts.
 */
export type FerramentaDesenho = 'horizontal' | 'tendencia' | 'fibo' | 'texto'

export interface PontoDesenho { t: number; p: number }

export type Desenho =
  | { id: string; tipo: 'horizontal'; p: number }
  | { id: string; tipo: 'tendencia' | 'fibo'; a: PontoDesenho; b: PontoDesenho }
  | { id: string; tipo: 'texto'; a: PontoDesenho; texto: string }

/** Quantos cliques cada ferramenta pede. */
export const CLIQUES: Record<FerramentaDesenho, 1 | 2> = { horizontal: 1, tendencia: 2, fibo: 2, texto: 1 }

/** Os níveis clássicos da retração de Fibonacci (0 = ponto B, 1 = ponto A). */
export const NIVEIS_FIBO = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

/** Preço de cada nível entre A (início do movimento) e B (fim). */
export function niveisFibo(a: number, b: number): Array<{ nivel: number; preco: number }> {
  return NIVEIS_FIBO.map((nivel) => ({ nivel, preco: b - (b - a) * nivel }))
}

let seq = 0
const novoId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

/** O desenho que os cliques dados completam, ou null se ainda faltam cliques. */
export function criarDesenho(ferramenta: FerramentaDesenho, pontos: PontoDesenho[], texto = ''): Desenho | null {
  if (pontos.length < CLIQUES[ferramenta]) return null
  const [a, b] = pontos
  if (ferramenta === 'horizontal') return { id: novoId(), tipo: 'horizontal', p: a.p }
  if (ferramenta === 'texto') return texto.trim() ? { id: novoId(), tipo: 'texto', a, texto: texto.trim().slice(0, 80) } : null
  return { id: novoId(), tipo: ferramenta, a, b }
}

const chave = (symbol: string) => `mtm_desenhos:${symbol}`

/** Lê os desenhos guardados; um valor estragado dá lista vazia, nunca um gráfico partido. */
export function lerDesenhos(symbol: string, armazem: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Desenho[] {
  try {
    const v = JSON.parse(armazem?.getItem(chave(symbol)) ?? '[]')
    return Array.isArray(v) ? v.filter(valido) : []
  } catch { return [] }
}

export function guardarDesenhos(symbol: string, desenhos: Desenho[], armazem: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { armazem?.setItem(chave(symbol), JSON.stringify(desenhos.slice(-200))) } catch { /* cheio ou bloqueado */ }
}

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const ponto = (x: unknown) => !!x && num((x as PontoDesenho).t) && num((x as PontoDesenho).p)
function valido(d: unknown): d is Desenho {
  const x = d as Desenho
  if (!x || typeof x.id !== 'string') return false
  if (x.tipo === 'horizontal') return num(x.p)
  if (x.tipo === 'tendencia' || x.tipo === 'fibo') return ponto(x.a) && ponto(x.b)
  if (x.tipo === 'texto') return ponto(x.a) && typeof x.texto === 'string'
  return false
}
