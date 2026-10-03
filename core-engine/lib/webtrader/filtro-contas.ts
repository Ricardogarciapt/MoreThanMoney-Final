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

/**
 * O mínimo que esta lógica precisa de saber de uma entrada do seletor.
 *
 * `minha` nasceu porque «mestre» e «minha» NÃO são lados opostos (01/10). Até aqui calculava-se
 * `minhas = total − mestres` e filtrava-se por `Boolean(mestre) === querMestres`: uma conta mestre
 * nunca podia ser minha. As duas contas de portefólio do dono são as duas coisas — `tipo =
 * 'provider'` (mestres para quem as segue) e capital dele — e por isso o capital dele não aparecia
 * em «As minhas». Quem responde à pergunta é `ehContaMinha` em lib/mtmfunded/contas-da-casa.ts.
 *
 * `minha` em falta (`undefined`) continua a querer dizer «o contrário de mestre»: é o que todas as
 * outras contas sempre foram, e assim nenhuma chamada antiga muda de comportamento.
 */
export interface EntradaFiltravel {
  id: string
  mestre?: boolean | null
  minha?: boolean | null
}

/** «Esta entrada é minha?» — com a regra de omissão num sítio só, para os três usos abaixo. */
export function entradaEhMinha(e: EntradaFiltravel): boolean {
  return e.minha == null ? !e.mestre : e.minha === true
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
  ehContaMinha,
  ehContaPortefolioDaCasa,
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
  return entradas.some((e) => e.mestre) && entradas.some((e) => entradaEhMinha(e))
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
  // Cada botão PERGUNTA pelo seu lado em vez de negar o outro: uma conta que é mestre E minha
  // (as carteiras de portefólio do dono) fica nas duas listas, que é o que ele pediu.
  const cabe = filtro === 'mestres' ? (e: EntradaFiltravel) => Boolean(e.mestre) : entradaEhMinha
  return entradas.filter((e) => cabe(e) || e.id === escolhida)
}

/**
 * Quantas contas de cada lado — o número que vai a seguir ao nome de cada botão do filtro.
 *
 * `minhas + mestres` pode dar MAIS do que `todas`, e está certo: as contas de portefólio contam
 * nos dois botões porque aparecem nas duas listas. Um número que não batesse com a lista que o
 * botão abre era pior do que um número que não soma com o vizinho.
 */
export function contarPorTipo(entradas: EntradaFiltravel[]): { minhas: number; mestres: number; todas: number } {
  return {
    minhas: entradas.filter((e) => entradaEhMinha(e)).length,
    mestres: entradas.filter((e) => e.mestre).length,
    todas: entradas.length,
  }
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
