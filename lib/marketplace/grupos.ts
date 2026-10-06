/**
 * VARIANTES AGRUPADAS (195) — um cartão por produto na montra, e a escolha da opção na ficha.
 *
 * Cada variante continua a ser uma linha de `marketplace_produtos` com o seu id, o seu preço, o seu
 * Stripe e os seus direitos. Isto só decide o que se DESENHA: quais linhas são o mesmo produto, qual
 * é a principal, o preço «desde» e a poupança. O checkout recebe sempre o id da variante escolhida.
 *
 * Funções puras, sem rede: a guarda (`grupos.check.ts`) prende-as.
 */

/**
 * O mínimo para decidir QUE CARTÕES há: quem é de que grupo e por que ordem. Sem preço — é o que
 * deixa a tira de vendedores contar cartões com a mesma função que os desenha (`cartoesDe`).
 */
export type Agrupavel = {
  id?: string | null
  grupo?: string | null
  variante_ordem?: number | null
}

/** O mínimo que estas funções precisam de saber de um produto já com o preço decidido pela rota. */
export type Variante = Agrupavel & {
  id: string
  slug: string
  variante_nome?: string | null
  /** 196 — a frase do cartão de grupo (sem periodicidade). Igual em todas as variantes do grupo. */
  grupo_subtitulo?: string | null
  subtitulo?: string | null
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

const ordem = (v: Agrupavel) => Number(v.variante_ordem ?? 0) || 0

export type Cartao<T extends Agrupavel> = { chave: string; principal: T; variantes: T[] }

/**
 * OS CARTÕES — a única função que decide o agrupamento. A montra (`agruparMontra`), a loja do
 * vendedor e a contagem da tira de vendedores (`vendedoresDaMontra`) passam todas por aqui, por isso
 * o número ao lado do nome do vendedor é sempre o número de cartões que se vêem na loja dele.
 *
 * Mantém a ordem que a rota deu (destaques primeiro, etc.), e um grupo ocupa o lugar da sua
 * variante PRINCIPAL — não o da primeira que aparecer. Um produto sem grupo fica igual.
 */
export function cartoesDe<T extends Agrupavel>(produtos: T[]): Cartao<T>[] {
  const porGrupo = new Map<string, T[]>()
  for (const p of produtos) {
    const g = (p.grupo ?? '').trim()
    if (!g) continue
    const l = porGrupo.get(g) ?? []
    l.push(p)
    porGrupo.set(g, l)
  }
  const saida: Cartao<T>[] = []
  for (const p of produtos) {
    const g = (p.grupo ?? '').trim()
    if (!g) {
      saida.push({ chave: String(p.id ?? ''), principal: p, variantes: [p] })
      continue
    }
    const variantes = [...(porGrupo.get(g) as T[])].sort((a, b) => ordem(a) - ordem(b))
    if (variantes[0] !== p) continue // o grupo entra no lugar da principal
    saida.push({ chave: `grupo:${g}`, principal: variantes[0], variantes })
  }
  return saida
}

/** A montra agrupada: os cartões de `cartoesDe`, cada um com a variante que dá o «desde». */
export function agruparMontra<T extends Variante>(produtos: T[]): Entrada<T>[] {
  return cartoesDe(produtos).map((c) => ({ ...c, maisBarata: maisBarataDe(c.variantes) }))
}

// ── O SUBTÍTULO DO CARTÃO DE GRUPO (196) ─────────────────────────────────────────────────────
//
// Num cartão de grupo, o subtítulo da principal soa mal ao lado do «desde X»: o do Pack de Scanners
// dizia «… por mês» por cima de um preço que também cobre o vitalício. O cartão de grupo usa a frase
// do GRUPO (`grupo_subtitulo`) e, sem ela, nada que fale de período.

/** Palavras de periodicidade. Uma frase de grupo que as tenha está a falar de UMA das opções. */
export const PERIODICIDADE_RE =
  /(?:\bpor\s+|\bao\s+|\/\s*)(?:m[eê]s|ano|semana|dia)\b|\bmensa(?:l|is)\b|\banua(?:l|is)\b|\bsemestra(?:l|is)\b|\btrimestra(?:l|is)\b|\bmeses\b|\bvital[ií]ci[oa]s?\b|\buma vez\b|\bpara sempre\b|\bpagamento (?:único|só)/i

export function temPeriodicidade(texto: string | null | undefined): boolean {
  return PERIODICIDADE_RE.test(String(texto ?? ''))
}

/**
 * A frase por baixo do título de um cartão.
 *
 *   · produto sozinho → o subtítulo dele, como sempre;
 *   · grupo → o `grupo_subtitulo` (da principal, ou da primeira variante que o tenha), se não falar
 *     de período; senão, o subtítulo da principal SE for neutro; senão, nenhum (null).
 *
 * Nunca devolve, num grupo, uma frase com periodicidade — a guarda prende isto.
 */
export function subtituloDoCartao<T extends Variante>(c: { principal: T; variantes: T[] }): string | null {
  if (c.variantes.length <= 1) return c.principal.subtitulo ?? null
  const candidatas = [c.principal, ...c.variantes].map((v) => (v.grupo_subtitulo ?? '').trim())
  const doGrupo = candidatas.find((t) => t && !temPeriodicidade(t))
  if (doGrupo) return doGrupo
  const daPrincipal = (c.principal.subtitulo ?? '').trim()
  return daPrincipal && !temPeriodicidade(daPrincipal) ? daPrincipal : null
}

/**
 * O slug de um grupo, como a 195 o aceita (`^[a-z0-9][a-z0-9-]{0,59}$`). Sem acentos, minúsculas,
 * tudo o resto vira hífen. Vazio → null (sem grupo).
 */
export function slugDoGrupo(texto: unknown): string | null {
  const s = String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return s || null
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
