/**
 * CORTE DA COPYFACTORY DE UMA ESTRATÉGIA — antes de pôr uma estratégia em live no motor, TODAS as
 * subscrições CopyFactory às estratégias equivalentes (ex.: GoldKiller = Wl1B e a antiga SDNb) têm de
 * sair das contas dos clientes; senão a mesma trade entra duas vezes (CopyFactory + motor).
 *
 * Lições da casa (copyfactory-desubscricao-partida):
 *  · o PUT de um subscritor exige o `name` que lá está — sem ele a CopyFactory devolve «Validation
 *    failed» e a desubscrição falha EM SILÊNCIO;
 *  · `unsubscribeFromStrategy` apaga TODAS as subscrições da conta — numa conta que copia duas
 *    estratégias só se tira a desta (PUT com as restantes);
 *  · a resposta de uma escrita não é prova: RELER o subscritor e confirmar.
 *  · há subscritores sem linha no site (ex.: conta MTM Auto «Mario Oliveira FXIFY» 9c7f56d3 a copiar
 *    Hvmg): o corte trabalha sobre a LISTA DA COPYFACTORY, não sobre mtmcopy_connections.
 *
 * Puro e testado (__tests__/mestres.check.ts). O script scripts/mestres/cortar-copyfactory.ts faz os
 * pedidos (em seco por omissão).
 */

export interface SubscricaoCf {
  strategyId: string
  removed?: boolean
  [k: string]: unknown
}

export interface SubscritorCf {
  _id: string
  name?: string
  subscriptions?: SubscricaoCf[]
  [k: string]: unknown
}

export type AccaoCorte =
  | { tipo: 'nada'; conta: string }
  | { tipo: 'manter_outras'; conta: string; nome: string; ficam: SubscricaoCf[]; saem: string[] }
  | { tipo: 'remover_todas'; conta: string; nome: string; saem: string[] }

export function vivas(s: SubscritorCf): SubscricaoCf[] {
  return (s.subscriptions ?? []).filter((x) => x && !x.removed && x.strategyId)
}

/** O que fazer a cada subscritor para que nenhum copie as estratégias `ids`. */
export function planoDeCorte(subscritores: SubscritorCf[], ids: string[]): AccaoCorte[] {
  const alvo = new Set(ids.map((i) => i.trim()).filter(Boolean))
  return subscritores.map((s) => {
    const todas = vivas(s)
    const saem = todas.filter((x) => alvo.has(x.strategyId)).map((x) => x.strategyId)
    if (!saem.length) return { tipo: 'nada', conta: s._id }
    const ficam = todas.filter((x) => !alvo.has(x.strategyId))
    // o nome é OBRIGATÓRIO no PUT; sem nome na CopyFactory usa-se o id (nunca se inventa um rótulo)
    const nome = String(s.name ?? '').trim() || s._id
    return ficam.length ? { tipo: 'manter_outras', conta: s._id, nome, ficam, saem } : { tipo: 'remover_todas', conta: s._id, nome, saem }
  })
}

/** Corpo do PUT /configuration/subscribers/{id} para uma acção de corte. */
export function corpoDoPut(a: Exclude<AccaoCorte, { tipo: 'nada' }>): { name: string; subscriptions: SubscricaoCf[] } {
  if (a.tipo === 'remover_todas') return { name: a.nome, subscriptions: [] }
  // devolve as que ficam sem campos só de leitura
  const limpa = a.ficam.map((x) => {
    const { removed: _r, ...resto } = x
    void _r
    return resto as SubscricaoCf
  })
  return { name: a.nome, subscriptions: limpa }
}

/** Depois de reler: nenhum subscritor copia `ids`? (404 do subscritor = não copia nada) */
export function corteConfirmado(relidos: Array<SubscritorCf | null>, ids: string[]): { ok: boolean; ainda: Array<{ conta: string; ids: string[] }> } {
  const alvo = new Set(ids)
  const ainda = relidos
    .filter((s): s is SubscritorCf => !!s)
    .map((s) => ({ conta: s._id, ids: vivas(s).map((x) => x.strategyId).filter((i) => alvo.has(i)) }))
    .filter((x) => x.ids.length > 0)
  return { ok: ainda.length === 0, ainda }
}

/**
 * Ids CopyFactory que o motor serve (estratégias com o corte feito): a re-sincronização do site
 * (connection-sync.syncMtmStrategyReplication) tira-os das subscrições, tal como faz às rotas
 * desligadas — assim nenhum GET/cron volta a subscrever o que foi cortado.
 */
export function idsServidosPeloMotor(linhas: Array<{ copyfactory_ids?: unknown; copyfactory_cortado_em?: unknown }>): Set<string> {
  const out = new Set<string>()
  for (const l of linhas) {
    if (!l.copyfactory_cortado_em || !Array.isArray(l.copyfactory_ids)) continue
    for (const id of l.copyfactory_ids as unknown[]) if (String(id).trim()) out.add(String(id).trim())
  }
  return out
}
