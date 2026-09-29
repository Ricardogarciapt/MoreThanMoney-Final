/**
 * CONTAS DAS ESTRATÉGIAS POR SINAIS E CONTAS DO DONO — criação idempotente.
 *
 *  · CASA (uma por estratégia Edge/King/Wolf): a mestre. MTM Funded simulada, tipo `provider`,
 *    10 000 USD (dá parciais a 0,10), `conta_casa`, `sem_regras`, ligada em
 *    `mtmauto_providers.funded_account_id`. Dono = utilizador da casa (o mesmo das contas provider MT5).
 *  · DONO (ricardogarciapt@proton.me): 7 contas de 1 000 USD, uma por estratégia (segue_estrategia),
 *    e 1 «Todos os sinais» (`recolhe_todos_sinais`). Todas `sem_regras` + `conta_casa` (contam para a
 *    equidade da MTM), `aceita_t2t`, e ligadas como contas pessoais: T2T/MTM Copy
 *    (mtmcopy_connections mtmfunded) e MTM System/MTM Auto (mtmauto_accounts mtmfunded) — as checks
 *    da 074 (funded_account_id preenchido, sem conta MetaApi) cumprem-se aqui.
 *
 * As passwords nascem cifradas (camposDeContaSimulada → credenciaisNovas) e NUNCA saem daqui: nem na
 * resposta, nem em logs, nem por email. Vêem-se no painel/admin com sessão.
 */
import { ESTRATEGIAS_PRIMEVERSE_VIVAS } from './calculo'

/** = SERVIDOR_SIMULADO de ../simulado/motor (não importado para este ficheiro continuar puro nos testes). */
const SERVIDOR_SIMULADO = 'MTM Funded'

export const SALDO_CASA = 10_000
export const SALDO_DONO = 1_000

/** As estratégias do dono, pela ordem pedida. Slugs como estão em mtmauto_providers. */
export const ESTRATEGIAS_DO_DONO: Array<{ slug: string; nome: string }> = [
  { slug: 'premium-ouro', nome: 'MTM Auto Premium' },
  { slug: 'sensei', nome: 'MTM Auto Sensei' },
  { slug: 'aurum-flow', nome: 'MTM Auto Aurum Flow' },
  { slug: 'Goldkiller', nome: 'MTM Auto GoldKiller' },
  ...ESTRATEGIAS_PRIMEVERSE_VIVAS.map((e) => ({ slug: e.slug, nome: e.nome })),
]

export const ROTULO_TODOS = 'Todos os sinais'

export interface ContaPlaneada {
  papel: 'estrategia' | 'todos_os_sinais' | 'casa'
  slug: string | null
  rotulo: string
  saldo: number
  tipo: 'financiada' | 'provider'
  colunas: Record<string, unknown>
  ligarNasApps: boolean
  subscrever: boolean
}

export interface ContaExistente {
  id: string
  segue_estrategia: string | null
  provider_slug: string | null
  recolhe_todos_sinais?: boolean | null
  tipo: string
}

/** O que falta criar para o dono (puro — é o que o dry-run mostra). */
export function planoContasDoDono(existentes: ContaExistente[]): { criar: ContaPlaneada[]; jaExistem: Array<{ rotulo: string; id: string }> } {
  const criar: ContaPlaneada[] = []
  const jaExistem: Array<{ rotulo: string; id: string }> = []
  for (const e of ESTRATEGIAS_DO_DONO) {
    const ja = existentes.find((x) => x.tipo !== 'provider' && String(x.segue_estrategia ?? '').toLowerCase() === e.slug.toLowerCase())
    const rotulo = `MTM Funded · ${e.nome}`
    if (ja) { jaExistem.push({ rotulo, id: ja.id }); continue }
    criar.push({
      papel: 'estrategia', slug: e.slug, rotulo, saldo: SALDO_DONO, tipo: 'financiada', ligarNasApps: true, subscrever: true,
      colunas: { segue_estrategia: e.slug, aceita_t2t: true, sem_regras: true, conta_casa: true, recolhe_todos_sinais: false },
    })
  }
  const todos = existentes.find((x) => x.recolhe_todos_sinais === true)
  if (todos) jaExistem.push({ rotulo: `MTM Funded · ${ROTULO_TODOS}`, id: todos.id })
  else criar.push({
    papel: 'todos_os_sinais', slug: null, rotulo: `MTM Funded · ${ROTULO_TODOS}`, saldo: SALDO_DONO, tipo: 'financiada', ligarNasApps: true, subscrever: false,
    colunas: { segue_estrategia: null, aceita_t2t: true, sem_regras: true, conta_casa: true, recolhe_todos_sinais: true },
  })
  return { criar, jaExistem }
}

/** As contas da casa que faltam (puro). `ligadas` = slug → funded_account_id já no provider. */
export function planoContasCasa(ligadas: Record<string, string | null>): ContaPlaneada[] {
  return ESTRATEGIAS_PRIMEVERSE_VIVAS.filter((e) => !ligadas[e.slug]).map((e) => ({
    papel: 'casa' as const, slug: e.slug, rotulo: `Casa · ${e.nome}`, saldo: SALDO_CASA, tipo: 'provider' as const,
    ligarNasApps: false, subscrever: false,
    colunas: { provider_slug: e.slug, segue_estrategia: null, aceita_t2t: false, sem_regras: true, conta_casa: true, recolhe_todos_sinais: false },
  }))
}

/** Linha de mtmcopy_connections (T2T / MTM Copy) para uma conta simulada do próprio dono. */
export function ligacaoT2T(userId: string, conta: { id: string; mt5_login: string | null; saldo_inicial: number }, rotulo: string): Record<string, unknown> {
  return {
    user_id: userId, account_role: 'slave', sender_mode: 'telegram', copy_method: 'telegram_group', purpose: 'tap_to_trade',
    mt5_platform: 'mtmfunded', mt5_login: null, metaapi_account_id: null,
    mt5_login_last4: String(conta.mt5_login ?? '').slice(-4), mt5_server: SERVIDOR_SIMULADO, mt5_status: 'connected',
    telegram_status: 'pending', account_label: rotulo, is_active: true, t2t_enabled: true,
    funded_account_id: conta.id, funded_somente_leitura: false,
    lot_mode: 'risk_percent', lot_value: 1, t2t_lot_mode: 'risk_percent', t2t_lot_value: 1,
    baseline_balance: conta.saldo_inicial, updated_at: new Date().toISOString(),
  }
}

/** Linha de mtmauto_accounts (MTM System / MTM Auto) para a mesma conta. */
export function contaMtmAuto(userId: string, conta: { id: string; mt5_login: string | null }, rotulo: string): Record<string, unknown> {
  return {
    user_id: userId, funded_account_id: conta.id, plataforma: 'mtmfunded', metaapi_account_id: null,
    login: conta.mt5_login, servidor: SERVIDOR_SIMULADO, corretora: 'MTM Funded', estado: 'connected',
    copia_ativa: true, demo: false, paga: false, principal: false, rotulo, nome_exibicao: rotulo,
    funded_somente_leitura: false, funded_ligada_pelo_cliente: false,
  }
}

export interface ResultadoConta {
  rotulo: string
  accountId: string | null
  login: string | null
  nova: boolean
  t2t: 'criada' | 'existente' | 'n/a' | 'erro'
  mtmauto: 'criada' | 'existente' | 'n/a' | 'erro'
  subscricao: 'criada' | 'existente_mantida' | 'n/a' | 'erro'
  erro?: string
}

async function programa(saldo: number): Promise<string | null> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const { data } = await getSupabaseAdmin().from('mtm_funded_programs').select('id, slug, saldo, fases')
  const p = (data ?? []).find((x) => x.slug === `${Math.round(saldo / 1000)}k-1f`) ?? (data ?? []).find((x) => Number(x.saldo) === saldo && Number(x.fases) === 1)
  return p ? String(p.id) : null
}

/** Cria UMA conta planeada (+ ligações e subscrição). Idempotente pelas ligações. Nunca devolve passwords. */
export async function criarContaPlaneada(userId: string, c: ContaPlaneada, criadoPor = 'script'): Promise<ResultadoConta> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const { camposDeContaSimulada } = await import('../simulado/motor')
  const db = getSupabaseAdmin()
  const r: ResultadoConta = { rotulo: c.rotulo, accountId: null, login: null, nova: true, t2t: 'n/a', mtmauto: 'n/a', subscricao: 'n/a' }
  try {
    const { data: criada, error } = await db.from('mtm_trading_accounts').insert({
      user_id: userId, tipo: c.tipo, program_id: c.tipo === 'provider' ? null : await programa(c.saldo),
      saldo_inicial: c.saldo, alavancagem: 100,
      ...(await camposDeContaSimulada(c.saldo)),
      ...c.colunas,
      metricas: { analise: true, papel: c.papel, estrategia: c.slug, rotulo: c.rotulo, atribuidaEm: new Date().toISOString(), atribuidaPor: criadoPor },
    }).select('id, mt5_login, saldo_inicial').single()
    if (error || !criada) throw new Error(`conta: ${error?.message ?? 'sem linha'}`)
    r.accountId = String(criada.id)
    r.login = (criada.mt5_login as string) ?? null
    await ligarContaExistente(userId, { id: r.accountId, mt5_login: r.login, saldo_inicial: Number(criada.saldo_inicial) }, c, r)
  } catch (e) {
    r.erro = e instanceof Error ? e.message : String(e)
  }
  return r
}

/** Ligações nas apps + subscrição para uma conta que já existe (usado também para repor as que faltam). */
export async function ligarContaExistente(userId: string, conta: { id: string; mt5_login: string | null; saldo_inicial: number }, c: ContaPlaneada, r: ResultadoConta): Promise<void> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const db = getSupabaseAdmin()
  if (c.ligarNasApps) {
    const { data: lig } = await db.from('mtmcopy_connections').select('id').eq('user_id', userId).eq('funded_account_id', conta.id).neq('mt5_status', 'disconnected').maybeSingle()
    if (lig) r.t2t = 'existente'
    else {
      const { error } = await db.from('mtmcopy_connections').insert(ligacaoT2T(userId, conta, c.rotulo))
      r.t2t = error ? (error.code === '23505' ? 'existente' : 'erro') : 'criada'
      if (error && error.code !== '23505') r.erro = `mtmcopy_connections: ${error.message}`
    }
    const { data: auto } = await db.from('mtmauto_accounts').select('id').eq('user_id', userId).eq('funded_account_id', conta.id).maybeSingle()
    let autoId = auto ? String(auto.id) : null
    if (auto) r.mtmauto = 'existente'
    else {
      const { data: a, error } = await db.from('mtmauto_accounts').insert(contaMtmAuto(userId, conta, c.rotulo)).select('id').single()
      r.mtmauto = error ? 'erro' : 'criada'
      if (error) r.erro = `mtmauto_accounts: ${error.message}`
      autoId = a ? String(a.id) : null
    }
    if (c.subscrever && c.slug && autoId) {
      const { data: prov } = await db.from('mtmauto_providers').select('id').ilike('slug', c.slug).limit(1).maybeSingle()
      if (!prov) { r.subscricao = 'erro'; r.erro = `estratégia ${c.slug} não existe (092 por aplicar?)`; return }
      // unique (user_id, provider_id): uma subscrição que já aponta a uma conta REAL fica como está —
      // mudá-la desviava as trades reais do dono (a conta simulada segue na mesma pelo motor).
      const { data: sub } = await db.from('mtmauto_subscriptions').select('id').eq('user_id', userId).eq('provider_id', prov.id).maybeSingle()
      if (sub) r.subscricao = 'existente_mantida'
      else {
        const { error } = await db.from('mtmauto_subscriptions').insert({ user_id: userId, provider_id: prov.id, ativo: true, auto_aceitar: false, modo_risco: 'conta', conta_id: autoId })
        r.subscricao = error ? (error.code === '23505' ? 'existente_mantida' : 'erro') : 'criada'
      }
    }
  }
  if (c.papel === 'casa' && c.slug) {
    const { error } = await db.from('mtmauto_providers').update({ funded_account_id: conta.id, updated_at: new Date().toISOString() }).ilike('slug', c.slug).is('funded_account_id', null)
    if (error) r.erro = `mtmauto_providers: ${error.message}`
  }
}
