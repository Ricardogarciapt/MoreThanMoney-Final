/**
 * AS CONTAS DA CASA — as que não são da pessoa para negociar.
 *
 * IGUAL nos dois repositórios (o separador de Histórico do site e o da app MTM Auto fazem a
 * mesma pergunta) — verificado por `lib/__tests__/paridade-repositorios.check.ts`.
 *
 * Puro de propósito: sem React, sem base, sem imports.
 */

/**
 * A conta é uma MESTRE?
 *
 * `tipo === 'provider'` — as mestres das estratégias do MTM Auto foram todas uniformizadas para
 * esse tipo (24/09). É o mesmo critério de lib/mtmfunded/aviso-conta.ts (que lhes põe o aviso
 * «mestre») e de estrategia-mestre.ts; não há segundo sítio a adivinhar. Contas reais
 * (TradeLocker, MT5) nunca são mestres: não têm `tipo`.
 */
export function ehContaMestre(conta: { tipo?: string | null } | null | undefined): boolean {
  return String(conta?.tipo ?? '').trim().toLowerCase() === 'provider'
}

/**
 * E é uma conta DA CASA — uma que não é da pessoa para negociar?
 *
 * O filtro do seletor do WebTrader nasceu com as MESTRES à vista, que era o que lá estorvava
 * (`tipo = 'provider'`). O separador de Histórico do dono mostrou que a família é maior: as
 * mestres, a conta-espelho de 10 000 e a «Todos os sinais» são todas instrumentos de MEDIÇÃO da
 * casa — existem para saber como cada estratégia se porta, e só aparecem na lista dele porque é
 * ele o dono delas. Somadas ao histórico, respondiam à pergunta errada: «como é que a casa mediu
 * o mês», e não «como é que a MINHA conta correu».
 *
 * Três marcas, e nenhuma delas chega sozinha:
 *  · `tipo = 'provider'` — a mestre (é o `ehContaMestre` acima, não uma segunda regra);
 *  · `conta_casa = true` — a marca que as contas de estratégia já trazem da migração que as cria
 *    (`lib/mtmfunded/estrategias-sinais/contas.ts`), e que é o critério mais directo de todos;
 *  · `recolhe_todos_sinais = true` — a conta-espelho (77661181) e a «Todos os sinais» (77549217)
 *    são `tipo = 'financiada'`/`'real'`: o que as distingue é recolherem TUDO o que passa.
 *
 * Isto NÃO apaga nem esconde nada da base: é o histórico que deixa de as SOMAR por omissão, e
 * um filtro — como no WebTrader — devolve-as a quem as quiser ver.
 */
export function ehContaDaCasa(
  conta: { tipo?: string | null; conta_casa?: boolean | null; recolhe_todos_sinais?: boolean | null } | null | undefined,
): boolean {
  if (!conta) return false
  return ehContaMestre(conta) || conta.conta_casa === true || conta.recolhe_todos_sinais === true
}

/** Os três estados do separador de Histórico. `minhas` é o de partida, como no WebTrader. */
export type EscopoContas = 'minhas' | 'casa' | 'todas'

export const ESCOPO_POR_OMISSAO: EscopoContas = 'minhas'

/** O escopo vindo do pedido, limpo. Qualquer lixo cai no de partida. */
export function normalizarEscopo(bruto: unknown): EscopoContas {
  const v = typeof bruto === 'string' ? bruto.trim().toLowerCase() : ''
  return v === 'casa' || v === 'todas' || v === 'minhas' ? v : ESCOPO_POR_OMISSAO
}
