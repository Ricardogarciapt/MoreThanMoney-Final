/**
 * PAGINAÇÃO E FILTROS do backoffice — puro, sem base de dados e sem `next/*`.
 *
 * PORQUÊ ISTO EXISTE
 * As listas do backoffice nasceram com um `.limit(500)` (negócios e tarefas) e `.limit(2000)`
 * (extracto) e mais nada. Um limite sem paginação não é uma protecção, é uma MENTIRA SILENCIOSA:
 * ao chegar à linha 501 a lista continua a mostrar 500 linhas, com o mesmo aspecto de estar
 * completa, e o negócio que não aparece não dá erro nenhum. Quem olha conclui que não existe.
 *
 * Por isso a regra aqui é uma só: **pede-se sempre uma linha a mais do que se mostra**. Se ela
 * vier, há mais página — e a página DIZ que há. Um `count` exacto era outra ida à base para
 * responder a uma pergunta que ninguém faz («são 1 342 ou 1 343?»); saber se falta ver mais é a
 * pergunta que se faz sempre.
 *
 * Ser PURO é o que permite provar os limites sem base semeada:
 * `npx tsx lib/backoffice-paginacao.check.ts`.
 */

/** Quantas linhas por página, por omissão. Cabe num ecrã sem obrigar a rolar às cegas. */
export const POR_PAGINA = 50

/**
 * O tecto do que se serve numa página. Existe para que `?por_pagina=100000` não passe a ser a
 * maneira de descarregar a base inteira num pedido — o limite não é do ecrã, é da casa.
 */
export const POR_PAGINA_MAX = 200

export interface Pagina {
  /** 1 é a primeira. Contar de 1 porque é assim que se lê no ecrã e no endereço. */
  pagina: number
  porPagina: number
  /** O intervalo para o `.range(desde, ate)` do PostgREST, com a linha extra já incluída. */
  desde: number
  ate: number
}

/** Um número de uma query string, com chão, tecto e um valor por omissão quando vem lixo. */
function inteiro(v: unknown, omissao: number, min: number, max: number): number {
  const n = Array.isArray(v) ? v[0] : v
  const i = typeof n === 'string' || typeof n === 'number' ? Math.floor(Number(n)) : NaN
  if (!Number.isFinite(i)) return omissao
  return Math.min(Math.max(i, min), max)
}

/**
 * A página pedida, lida do endereço. `?pagina=&por_pagina=`.
 *
 * `ate` pede UMA LINHA A MAIS de propósito (ver o topo do ficheiro): é ela que responde «há mais?»
 * sem uma segunda consulta e sem um `count` que o PostgREST cobra em tempo.
 */
export function lerPagina(
  params: Record<string, string | string[] | undefined> | undefined,
  omissaoPorPagina = POR_PAGINA,
): Pagina {
  const pagina = inteiro(params?.pagina, 1, 1, 10_000)
  const porPagina = inteiro(params?.por_pagina, omissaoPorPagina, 1, POR_PAGINA_MAX)
  const desde = (pagina - 1) * porPagina
  return { pagina, porPagina, desde, ate: desde + porPagina }
}

/**
 * Corta o resultado à medida da página e diz se sobrou.
 *
 * A linha extra NÃO se mostra — ela só existe para se saber que existe. Mostrá-la fazia a última
 * página ter uma linha a mais do que as outras, e o «há mais» deixava de bater com o que se vê.
 */
export function fatiar<T>(linhas: readonly T[], pagina: Pagina): { linhas: T[]; haMais: boolean } {
  const haMais = linhas.length > pagina.porPagina
  return { linhas: linhas.slice(0, pagina.porPagina), haMais }
}

/** O texto que descreve a página a quem olha. Um «1–50» sozinho não diz se falta ver mais. */
export function descreverPagina(pagina: Pagina, mostradas: number, haMais: boolean): string {
  if (mostradas === 0) return pagina.pagina > 1 ? 'Esta página já não tem linhas.' : 'Sem linhas.'
  const primeira = pagina.desde + 1
  const ultima = pagina.desde + mostradas
  return haMais
    ? `A mostrar ${primeira}–${ultima}. Há mais.`
    : `A mostrar ${primeira}–${ultima}. É tudo.`
}

/**
 * O endereço da página seguinte/anterior, mantendo os filtros que já estavam lá.
 *
 * Reconstruir o endereço à mão em cada página perdia o filtro no momento em que se virava a
 * página — e uma lista filtrada que se desfiltra ao paginar dá números diferentes para a mesma
 * pergunta, o que é pior do que não paginar.
 */
export function enderecoDaPagina(
  base: string,
  params: Record<string, string | string[] | undefined> | undefined,
  pagina: number,
): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k === 'pagina' || v === undefined) continue
    q.set(k, Array.isArray(v) ? (v[0] ?? '') : v)
  }
  if (pagina > 1) q.set('pagina', String(pagina))
  const cauda = q.toString()
  return cauda ? `${base}?${cauda}` : base
}

// ═══════════════════════ FILTROS ═══════════════════════

/**
 * UM DIA, ou nada. Serve o filtro por data do extracto (`?desde=`, `?ate=`).
 *
 * Aceita-se só `AAAA-MM-DD` e não um instante: quem escreve uma data num filtro quer o dia todo, e
 * aceitar `2026-09-25T14:33` deixava o utilizador a perguntar-se porque é que faltavam movimentos
 * da manhã. O `até` é o FIM do dia (ver `fimDoDia`) pela mesma razão.
 */
export function lerDia(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? s : null
}

/** O instante a partir do qual um dia conta. */
export function inicioDoDia(dia: string | null): string | null {
  return dia ? `${dia}T00:00:00.000Z` : null
}

/**
 * O fim do dia. `2026-09-25` como «até» tem de INCLUIR o dia 25 inteiro — um `lte` sobre
 * `2026-09-25T00:00:00` escondia tudo o que aconteceu nesse dia menos a meia-noite, e o filtro
 * parecia estar a perder linhas por avaria.
 */
export function fimDoDia(dia: string | null): string | null {
  return dia ? `${dia}T23:59:59.999Z` : null
}

/**
 * O texto de procura, limpo.
 *
 * Tira-se o que tem significado nos filtros do PostgREST (`%`, `*`, `,`, `(`, `)`) em vez de o
 * escapar: o valor vem de uma caixa de texto de quem vende, não de uma linguagem de consulta, e
 * ninguém procura um cliente chamado `%`. Escapar obrigava a manter um escape correcto para
 * sempre; tirar não tem como correr mal.
 */
export function lerProcura(v: string | string[] | undefined, max = 60): string | null {
  const s = Array.isArray(v) ? v[0] : v
  if (typeof s !== 'string') return null
  const limpo = s.replace(/[%*,()\\]/g, ' ').trim().slice(0, max)
  return limpo.length > 0 ? limpo : null
}

/** Um valor de um catálogo fechado, ou `null`. O que não está no catálogo não filtra nada. */
export function lerDoCatalogo<T extends string>(
  v: string | string[] | undefined,
  catalogo: readonly T[],
): T | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && (catalogo as readonly string[]).includes(s) ? (s as T) : null
}
