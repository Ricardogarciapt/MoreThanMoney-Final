import type { SupabaseClient } from '@supabase/supabase-js'
import { decidirApagarConta, refsDaConta, type DadosPendurados, type DecisaoApagar, type LinhaRota } from './apagar-conta'

/**
 * APAGAR UMA CONTA MTM FUNDED — o lado que lê a base e escreve.
 *
 * A decisão é pura e vive em ./apagar-conta.ts (testada à mão). Aqui só se recolhe o que está
 * pendurado na conta e, se a decisão deixar, se apaga pela ordem certa.
 *
 * A ORDEM importa. A base apaga em cascata tudo o que tem FK para a conta (funded_positions,
 * funded_orders, funded_diario, mtmcopy_connections, mtmauto_accounts, mtm_funded_credenciais_links…),
 * mas as rotas de cópia e as mestres guardam a conta por TEXTO — `copia_rotas.origem_chave` /
 * `destino_chave` (`mtmfunded:<id>`), `origem_ref` / `destino_ref` (`funded:<id>`),
 * `mestres_contas.conta_chave`. Dessas a base não sabe, e são elas que ficam a apontar para o
 * vazio com o motor a tentar executar em nada. Por isso:
 *
 *   1. lê-se QUE ligações vão cair em cascata (mtmcopy_connections / mtmauto_accounts), porque as
 *      rotas delas (`site:<id>` / `auto:<id>`) também têm de sair — é o órfão de segunda ordem;
 *   2. apagam-se as subscrições do MTM Auto presas a essas contas (a FK é SET NULL: sem isto
 *      ficava uma subscrição sem conta, que o motor lê como «conta por escolher»);
 *   3. apagam-se as rotas de cópia e as linhas de `mestres_contas` de TODAS essas referências;
 *   4. só então se apaga a conta, e a base leva o resto com ela.
 *
 * A conta MetaApi não se toca em passo nenhum. Fica lá — é dinheiro real numa corretora.
 */

/**
 * Uma contagem exacta sem trazer as linhas.
 *
 * `select('*')` e não `select('id')`: `mestres_contas` não tem coluna `id` (a chave é
 * `conta_chave`) e a contagem vinha a zero em silêncio — a linha ficava de fora do diálogo.
 */
async function contar(
  db: SupabaseClient,
  tabela: string,
  coluna: string,
  valor: string,
  filtro?: { coluna: string; valores: string[] },
): Promise<number> {
  let q = db.from(tabela).select('*', { count: 'exact', head: true }).eq(coluna, valor)
  if (filtro) q = q.in(filtro.coluna, filtro.valores)
  const { count } = await q
  return count ?? 0
}

export interface Pendurados {
  dados: DadosPendurados
  decisao: DecisaoApagar
  /** Ids das ligações que vão cair em cascata e cujas rotas têm de sair antes. */
  ligacoesT2TIds: string[]
  contasMtmAutoIds: string[]
  /** Referências de rota a limpar: a da conta e as das ligações arrastadas. */
  refsParaLimpar: string[]
  /** Chaves físicas a limpar (rotas e mestres_contas). */
  chavesParaLimpar: string[]
}

const COLUNAS_ROTA = 'id, ativa, modo, estrategia_slug, rotulo'

/** As rotas em que estas referências/chaves aparecem de um dos lados. */
async function rotasDoLado(db: SupabaseClient, lado: 'origem' | 'destino', refs: string[], chaves: string[]) {
  const [porRef, porChave] = await Promise.all([
    db.from('copia_rotas').select(COLUNAS_ROTA).in(`${lado}_ref`, refs).limit(500),
    db.from('copia_rotas').select(COLUNAS_ROTA).in(`${lado}_chave`, chaves).limit(500),
  ])
  const porId = new Map<string, Record<string, unknown>>()
  for (const r of [...(porRef.data ?? []), ...(porChave.data ?? [])]) porId.set(String(r.id), r)
  return [...porId.values()]
}

/**
 * O que está pendurado nesta conta, lido da base e passado pela decisão pura.
 *
 * `conta` é a linha de `mtm_trading_accounts` já lida pela rota (um `select('*')`).
 */
export async function recolherPendurados(
  db: SupabaseClient,
  conta: Record<string, unknown> & { id: string },
): Promise<Pendurados> {
  const id = String(conta.id)
  const { chaveFisica, ref } = refsDaConta(id)
  const motor = String(conta.motor ?? '')

  const [
    ligacoes, contasAuto, mestres, providersConta, providersEspelho,
    abertas, pendentes, fechadas, levantamentos, certificados, participacoes, compras, mestresContas,
  ] = await Promise.all([
    db.from('mtmcopy_connections').select('id').eq('funded_account_id', id).limit(200),
    db.from('mtmauto_accounts').select('id').eq('funded_account_id', id).limit(200),
    db.from('mestres_estrategias').select('slug').eq('conta_mestre_id', id).limit(50),
    db.from('mtmauto_providers').select('slug').eq('funded_account_id', id).limit(50),
    db.from('mtmauto_providers').select('slug').eq('espelho_funded_account_id', id).limit(50),
    // Numa conta da corretora as posições vivem na MetaApi: aqui não se contam nem se decidem.
    motor === 'sim' ? contar(db, 'funded_positions', 'account_id', id, { coluna: 'estado', valores: ['aberta'] }) : Promise.resolve(0),
    motor === 'sim' ? contar(db, 'funded_orders', 'account_id', id, { coluna: 'estado', valores: ['pendente'] }) : Promise.resolve(0),
    contar(db, 'funded_positions', 'account_id', id, { coluna: 'estado', valores: ['fechada'] }),
    contar(db, 'mtm_funded_withdrawals', 'account_id', id, { coluna: 'estado', valores: ['pedido', 'em_analise', 'aprovado'] }),
    contar(db, 'mtm_certificates', 'account_id', id),
    contar(db, 'mtm_tournament_participants', 'account_id', id),
    contar(db, 'mtm_funded_purchases', 'account_id', id),
    contar(db, 'mestres_contas', 'conta_chave', chaveFisica),
  ])

  const ligacoesT2TIds = (ligacoes.data ?? []).map((l) => String(l.id))
  const contasMtmAutoIds = (contasAuto.data ?? []).map((l) => String(l.id))

  // As referências das ligações arrastadas: são elas que as rotas guardam quando a conta MTM
  // Funded está ligada no T2T (`site:<id>`) ou na app MTM Auto (`auto:<id>`).
  const refsParaLimpar = [ref, ...ligacoesT2TIds.map((x) => `site:${x}`), ...contasMtmAutoIds.map((x) => `auto:${x}`)]
  const chavesParaLimpar = [chaveFisica]

  const [linhasOrigem, linhasDestino, subscricoes] = await Promise.all([
    rotasDoLado(db, 'origem', refsParaLimpar, chavesParaLimpar),
    rotasDoLado(db, 'destino', refsParaLimpar, chavesParaLimpar),
    contasMtmAutoIds.length
      ? db.from('mtmauto_subscriptions').select('*', { count: 'exact', head: true }).in('conta_id', contasMtmAutoIds).then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ])

  const linha = (r: Record<string, unknown>, origem: boolean): LinhaRota => ({
    id: String(r.id), origem, ativa: r.ativa === true, modo: String(r.modo ?? ''),
    estrategiaSlug: (r.estrategia_slug as string) ?? null, rotulo: (r.rotulo as string) ?? null,
  })
  // Origem manda: uma rota que fosse os dois lados conta como origem (é a que bloqueia).
  const idsOrigem = new Set(linhasOrigem.map((r) => String(r.id)))
  const rotas: LinhaRota[] = [
    ...linhasOrigem.map((r) => linha(r, true)),
    ...linhasDestino.filter((r) => !idsOrigem.has(String(r.id))).map((r) => linha(r, false)),
  ]

  const dados: DadosPendurados = {
    conta: {
      id,
      login: (conta.mt5_login as string) ?? null,
      tipo: String(conta.tipo ?? ''),
      estado: String(conta.estado ?? ''),
      motor,
      contaRealDaCasa: conta.conta_real_casa === true,
      metaapiAccountId: (conta.metaapi_account_id as string) ?? null,
      saldo: conta.sim_saldo == null ? null : Number(conta.sim_saldo),
      saldoInicial: conta.saldo_inicial == null ? null : Number(conta.saldo_inicial),
    },
    abertas, pendentes, fechadas,
    mestreDe: (mestres.data ?? []).map((m) => String(m.slug)),
    providerDe: [...new Set([...(providersConta.data ?? []), ...(providersEspelho.data ?? [])].map((p) => String(p.slug)))],
    levantamentosAbertos: levantamentos,
    rotas,
    mestresContas,
    ligacoesT2T: ligacoesT2TIds.length,
    contasMtmAuto: contasMtmAutoIds.length,
    subscricoes,
    certificados, participacoes, compras,
  }

  return { dados, decisao: decidirApagarConta(dados), ligacoesT2TIds, contasMtmAutoIds, refsParaLimpar, chavesParaLimpar }
}

export interface ResultadoApagar {
  apagada: true
  login: string | null
  /** As linhas tiradas à mão ANTES de apagar a conta — as de texto, que a base não vê. */
  limpou: { rotas: number; mestresContas: number; subscricoes: number }
  /** O que a base levou em cascata (contado antes de apagar). */
  emCascata: Array<{ tabela: string; quantas: number }>
  /** A conta MetaApi que ficou por tocar, se havia. */
  metaapiPorTocar: string | null
}

/**
 * Apaga a conta e tudo o que ficaria pendurado nela. Lança se a decisão não deixar.
 *
 * Não há transação por cima disto (o PostgREST não a dá), por isso a ordem é a que deixa o sistema
 * seguro se falhar a meio: primeiro tiram-se as rotas — o motor deixa de ter por onde executar — e
 * só no fim é que a conta sai. Uma rota apagada sem a conta é chato; uma conta apagada com rotas
 * vivas é o incidente de 23/09.
 */
export async function apagarContaComTudo(db: SupabaseClient, p: Pendurados): Promise<ResultadoApagar> {
  if (!p.decisao.pode) throw new Error(p.decisao.bloqueios.join(' '))
  const { dados, refsParaLimpar, chavesParaLimpar, contasMtmAutoIds } = p
  const id = dados.conta.id

  // 1. subscrições do MTM Auto presas às contas que vão cair (a FK é SET NULL, não apaga).
  let subscricoes = 0
  if (contasMtmAutoIds.length) {
    const { data } = await db.from('mtmauto_subscriptions').delete().in('conta_id', contasMtmAutoIds).select('id')
    subscricoes = data?.length ?? 0
  }

  // 2. rotas de cópia, dos dois lados e pelas duas formas (copia_posicoes/eventos caem com elas).
  const apagadas = await Promise.all([
    db.from('copia_rotas').delete().in('origem_ref', refsParaLimpar).select('id'),
    db.from('copia_rotas').delete().in('destino_ref', refsParaLimpar).select('id'),
    db.from('copia_rotas').delete().in('origem_chave', chavesParaLimpar).select('id'),
    db.from('copia_rotas').delete().in('destino_chave', chavesParaLimpar).select('id'),
  ])
  const rotas = new Set(apagadas.flatMap((r) => (r.data ?? []).map((x) => String(x.id)))).size

  // 3. regras do motor das mestres para esta conta.
  const { data: mc } = await db.from('mestres_contas').delete().in('conta_chave', chavesParaLimpar).select('conta_chave')
  const mestresContas = mc?.length ?? 0

  // 4. a conta. A base leva o resto (posições, ordens, diário, ligações, links de credenciais…).
  const { data: apagada, error } = await db.from('mtm_trading_accounts').delete().eq('id', id).select('id')
  if (error) throw new Error(`não foi possível apagar a conta: ${error.message}`)
  if (!apagada?.length) throw new Error('a conta já não existia — actualiza o painel')

  return {
    apagada: true,
    login: dados.conta.login,
    limpou: { rotas, mestresContas, subscricoes },
    emCascata: [
      { tabela: 'funded_positions', quantas: dados.fechadas + dados.abertas },
      { tabela: 'mtmcopy_connections', quantas: dados.ligacoesT2T },
      { tabela: 'mtmauto_accounts', quantas: dados.contasMtmAuto },
    ].filter((x) => x.quantas > 0),
    metaapiPorTocar: dados.conta.metaapiAccountId,
  }
}
