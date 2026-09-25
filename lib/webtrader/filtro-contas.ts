import { ehContaMestre } from '../mtmfunded/contas-da-casa'

/**
 * AS CONTAS MESTRE À PARTE DAS DO DONO, no seletor do WebTrader (pedido do dono, 24/09).
 *
 * Desde que as estratégias do MTM Auto passaram a ter conta própria, o seletor do dono ganhou
 * SETE linhas que não são dele para negociar — as mestres (contas MTM Funded de 10 000 USD,
 * `tipo = 'provider'`, «Mestre · MTM Auto …»). Misturadas com as contas pessoais, escondiam-nas:
 * abrir o seletor para trocar de conta passou a ser procurar a dele no meio das da casa.
 *
 * O filtro tem três estados — **As minhas** (o de partida), **Mestres** e **Todas** — e fica
 * gravado na CONTA da pessoa, ao lado da ordem e da favorita (`profile_data.webtrader`), por isso
 * segue para o telemóvel como elas.
 *
 * Duas regras que isto tem de respeitar, e que os testes prendem:
 *
 *  · **Só existe para quem tem dos dois tipos.** Quem só tem contas próprias (toda a gente menos
 *    o dono e os educadores) não vê filtro nenhum, e um filtro guardado de outros tempos não lhe
 *    esconde nada — sem os dois tipos, `filtrarEntradas` devolve a lista inteira.
 *  · **A conta ESCOLHIDA manda sempre.** Se o filtro a esconderia, ela fica na lista à mesma: uma
 *    pessoa que não vê em que conta está é uma pessoa que não sabe onde vai abrir a ordem. Isto
 *    trata também a favorita — ela só precisa de lugar garantido quando é a escolhida.
 *
 * Puro: sem React, sem browser, sem base. Testado em lib/webtrader/__tests__/filtro-contas.check.ts.
 */

/** Os três estados do filtro. `minhas` é o de partida — as mestres começam escondidas. */
export type FiltroContas = 'minhas' | 'mestres' | 'todas'

export const FILTRO_POR_OMISSAO: FiltroContas = 'minhas'

/** O mínimo que esta lógica precisa de saber de uma entrada do seletor. */
export interface EntradaFiltravel {
  id: string
  mestre?: boolean | null
}

/**
 * O que é uma conta MESTRE, e o que é uma conta DA CASA, mora em `lib/mtmfunded/contas-da-casa.ts`
 * — o mesmo ficheiro que a app MTM Auto tem (guardado por `paridade-repositorios.check.ts`).
 * Aqui só se reexporta: o seletor do WebTrader e o separador de Histórico têm de responder à
 * mesma pergunta com a mesma resposta, e uma segunda cópia da regra divergia no primeiro dia.
 */
export {
  ehContaDaCasa,
  ehContaMestre,
  normalizarEscopo,
  ESCOPO_POR_OMISSAO,
  type EscopoContas,
} from '../mtmfunded/contas-da-casa'

/** O filtro vindo da base/do corpo de um pedido, limpo. Qualquer lixo cai no de partida. */
export function normalizarFiltro(bruto: unknown): FiltroContas {
  const v = typeof bruto === 'string' ? bruto.trim().toLowerCase() : ''
  return v === 'mestres' || v === 'todas' || v === 'minhas' ? v : FILTRO_POR_OMISSAO
}

/**
 * Mostra-se o filtro? Só a quem tem contas dos DOIS tipos. Uma barra a dizer «As minhas» a quem
 * só tem as suas é uma pergunta sem resposta possível — e uma linha a menos no seletor de toda a
 * gente é uma linha a menos.
 */
export function temDoisTipos(entradas: EntradaFiltravel[]): boolean {
  return entradas.some((e) => e.mestre) && entradas.some((e) => !e.mestre)
}

/**
 * A lista que fica no ecrã. `escolhida` é a conta aberta: nunca sai da lista, esteja o filtro em
 * que estado estiver. A ordem das que ficam é a que entrou (o filtro não arruma nada — quem
 * arruma é ordem-contas.ts).
 */
export function filtrarEntradas<T extends EntradaFiltravel>(
  entradas: T[],
  filtro: FiltroContas,
  escolhida?: string | null,
): T[] {
  // Sem os dois tipos não há filtro no ecrã — e o que está guardado não pode esconder nada.
  if (filtro === 'todas' || !temDoisTipos(entradas)) return entradas
  const querMestres = filtro === 'mestres'
  return entradas.filter((e) => Boolean(e.mestre) === querMestres || e.id === escolhida)
}

/** Quantas contas de cada lado — o número que vai a seguir ao nome de cada botão do filtro. */
export function contarPorTipo(entradas: EntradaFiltravel[]): { minhas: number; mestres: number; todas: number } {
  const mestres = entradas.filter((e) => e.mestre).length
  return { minhas: entradas.length - mestres, mestres, todas: entradas.length }
}

/**
 * A ORDEM INTEIRA depois de um arrasto feito DENTRO da lista filtrada.
 *
 * Arrastar com o filtro ligado só mexe no que está à vista, mas o que se grava é a ordem de TODAS
 * as contas — senão arrumar as próprias com as mestres escondidas apagava-as da lista guardada, e
 * elas voltavam todas para o fim da próxima vez que o filtro fosse a «Todas».
 *
 * Como: as contas escondidas ficam no LUGAR onde estavam (não se mexem nem uma casa) e os lugares
 * das visíveis recebem-nas pela ordem nova. `todasIds` é a lista completa como está no ecrã;
 * `visiveisNova` é o que saiu de `moverConta` sobre a parte filtrada.
 */
export function juntarOrdemFiltrada(todasIds: string[], visiveisNova: string[]): string[] {
  const completa = new Set(todasIds)
  const porColocar = visiveisNova.filter((id) => completa.has(id))
  const visiveis = new Set(porColocar)
  let i = 0
  const out = todasIds.map((id) => (visiveis.has(id) ? porColocar[i++] : id))
  // Um id que nem estava na lista completa (conta acabada de abrir) não se perde: entra no fim.
  for (const id of visiveisNova) if (!completa.has(id)) out.push(id)
  return out
}
