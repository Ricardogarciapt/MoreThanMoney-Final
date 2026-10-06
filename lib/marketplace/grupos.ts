/**
 * VARIANTES AGRUPADAS (195) — um cartão por produto na montra, e a escolha da opção na ficha.
 *
 * Cada variante continua a ser uma linha de `marketplace_produtos` com o seu id, o seu preço, o seu
 * Stripe e os seus direitos. Isto só decide o que se DESENHA: quais linhas são o mesmo produto, qual
 * é a principal, o preço «desde» e a poupança. O checkout recebe sempre o id da variante escolhida.
 *
 * Funções puras, sem rede: a guarda (`grupos.check.ts`) prende-as.
 */

/** O mínimo que estas funções precisam de saber de um produto já com o preço decidido pela rota. */
export type Variante = {
  id: string
  slug: string
  grupo?: string | null
  variante_nome?: string | null
  variante_ordem?: number | null
  recorrente?: boolean | null
  periodicidade?: string | null
  preco: { cents: number; baseCents: number; moeda: string }
}

export type Entrada<T extends Variante> = {
  /** A chave do cartão: o grupo, ou o id de um produto sozinho. */
  chave: string
  /** A variante de `variante_ordem` mais baixa: dá o título, a capa, o destaque e o lugar. */
  principal: T
  /** Todas as variantes visíveis, pela ordem do selector. Um produto sozinho tem uma. */
  variantes: T[]
  /** A variante mais barata — é ela que dá o «desde». */
  maisBarata: T
}

const ordem = (v: Variante) => Number(v.variante_ordem ?? 0) || 0

/**
 * A montra agrupada. Mantém a ordem que a rota deu (destaques primeiro, etc.), e um grupo ocupa o
 * lugar da sua variante PRINCIPAL — não o da primeira que aparecer. Um produto sem grupo fica igual.
 */
export function agruparMontra<T extends Variante>(produtos: T[]): Entrada<T>[] {
  const porGrupo = new Map<string, T[]>()
  for (const p of produtos) {
    const g = (p.grupo ?? '').trim()
    if (!g) continue
    const l = porGrupo.get(g) ?? []
    l.push(p)
    porGrupo.set(g, l)
  }
  const saida: Entrada<T>[] = []
  for (const p of produtos) {
    const g = (p.grupo ?? '').trim()
    if (!g) {
      saida.push({ chave: p.id, principal: p, variantes: [p], maisBarata: p })
      continue
    }
    const variantes = [...(porGrupo.get(g) as T[])].sort((a, b) => ordem(a) - ordem(b))
    if (variantes[0].id !== p.id) continue // o grupo entra no lugar da principal
    saida.push({ chave: `grupo:${g}`, principal: variantes[0], variantes, maisBarata: maisBarataDe(variantes) })
  }
  return saida
}

/** A variante com o preço efectivo (`preco.cents`, já com campanha) mais baixo. Empate: a primeira. */
export function maisBarataDe<T extends Variante>(variantes: T[]): T {
  return variantes.reduce((m, v) => (v.preco.cents < m.preco.cents ? v : m), variantes[0])
}

/** As variantes de uma ficha, pela ordem do selector. */
export function ordenarVariantes<T extends Variante>(variantes: T[]): T[] {
  return [...variantes].sort((a, b) => ordem(a) - ordem(b))
}

/** Entrar pelo slug de uma variante abre a ficha com ESSA variante escolhida; senão, a principal. */
export function varianteInicial<T extends Variante>(variantes: T[], slug: string): T | undefined {
  const ord = ordenarVariantes(variantes)
  return ord.find((v) => v.slug === slug) ?? ord[0]
}

const MESES: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }

/** Quantos meses cobre UMA cobrança desta variante, ou null se não se sabe (pagamento único). */
export function mesesDaCobranca(v: Pick<Variante, 'recorrente' | 'periodicidade'>): number | null {
  if (v.recorrente !== true) return null
  return MESES[String(v.periodicidade ?? '')] ?? null
}

/**
 * A poupança desta variante face à variante recorrente mais curta do mesmo grupo (ex.: Anual vs
 * Mensal), em % inteira ARREDONDADA PARA BAIXO — nunca se anuncia mais do que se poupa.
 *
 * Só existe quando as duas são subscrições com período conhecido e na mesma moeda: um vitalício ou
 * um «6 meses» pago de uma vez não têm termo de comparação mensal que não seja inventado.
 */
export function poupancaPct<T extends Variante>(v: T, variantes: T[]): number | null {
  const mv = mesesDaCobranca(v)
  if (!mv || v.preco.cents <= 0) return null
  const refs = variantes
    .filter((x) => x.id !== v.id && x.preco.moeda === v.preco.moeda && x.preco.cents > 0)
    .map((x) => ({ x, m: mesesDaCobranca(x) }))
    .filter((r): r is { x: T; m: number } => r.m !== null && r.m < mv)
    .sort((a, b) => a.m - b.m)
  const ref = refs[0]
  if (!ref) return null
  // Em inteiros, para 20% não sair 19% por erro de vírgula flutuante:
  // poupança = (o que custaria em cobranças curtas − o que custa) / o que custaria em cobranças curtas.
  const custaria = ref.x.preco.cents * mv
  const custa = v.preco.cents * ref.m
  const pct = Math.floor((100 * (custaria - custa)) / custaria)
  return pct >= 1 ? pct : null
}
