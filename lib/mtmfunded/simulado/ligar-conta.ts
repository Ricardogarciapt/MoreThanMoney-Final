/**
 * LIGAR UMA CONTA MTM FUNDED NAS APPS — a parte que toca na base. Regras em ./ligar-conta-regras.
 *
 * O que se grava numa ligação: SÓ a referência (`funded_account_id`) e se é só de leitura. A
 * password nunca é gravada, nunca é devolvida e nunca vai para logs.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { decifrar } from '@/lib/mtmfunded/credenciais'
import { estadoCurto, tipoCurto } from '@/lib/mtmfunded/etiquetas'
import { ehMtmFundedLigacao } from '@/lib/mtmcopy/destino-execucao'
import {
  decidirLigacao,
  tentativasEsgotadas,
  JANELA_TENTATIVAS_MS,
  type DecisaoLigacao,
  type Tentativa,
} from './ligar-conta-regras'
import { SERVIDOR_SIMULADO } from './motor'

// Sem a 074 aplicada (tabela em falta) o limite fica por instância, em memória.
const memoria: Tentativa[] = []

export async function bloqueadoPorTentativas(userId: string, login: string): Promise<boolean> {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - JANELA_TENTATIVAS_MS).toISOString()
  const { data, error } = await db
    .from('mtmfunded_ligacao_tentativas')
    .select('user_id, login, ok, criado_em')
    .or(`user_id.eq.${userId},login.eq.${login}`)
    .eq('ok', false)
    .gte('criado_em', desde)
    .limit(50)
  const lista = error ? memoria : ((data ?? []) as Tentativa[])
  return tentativasEsgotadas(lista, userId, login)
}

export async function registarTentativa(userId: string, login: string, ok: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('mtmfunded_ligacao_tentativas')
    .insert({ user_id: userId, login, ok, origem: 'site' })
  if (error) {
    memoria.push({ user_id: userId, login, ok, criado_em: Date.now() })
    const limite = Date.now() - JANELA_TENTATIVAS_MS
    while (memoria.length && new Date(memoria[0].criado_em).getTime() < limite) memoria.shift()
  }
}

const CAMPOS = 'id, user_id, motor, mt5_login, tipo, estado, metricas, pausada_em, saldo_inicial, sim_saldo, sim_equity, mt5_password_cifrada, mt5_investor_cifrada'

export type ContaFundedLida = {
  id: string
  user_id: string | null
  mt5_login: string | null
  tipo: string
  estado: string
  metricas: Record<string, unknown> | null
  /** `pausada_em` (migração 079): pausa do admin — a conta continua `ativa` para o motor gerir SL/TP. */
  pausada_em: string | null
  saldo_inicial: number | null
  sim_saldo: number | null
  sim_equity: number | null
}

/** Verifica login + password para ligar. Devolve a decisão e a conta (sem cifras). */
export async function verificarParaLigar(
  userId: string,
  login: string,
  password: string,
): Promise<{ decisao: DecisaoLigacao; conta: ContaFundedLida | null }> {
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select(CAMPOS)
    .eq('mt5_login', login)
    .eq('motor', 'sim')
    .maybeSingle()
  const linha = (data ?? null) as (ContaFundedLida & { mt5_password_cifrada: string | null; mt5_investor_cifrada: string | null }) | null
  const decisao = decidirLigacao({ conta: linha, password, userId, decifrar })
  if (!linha) return { decisao, conta: null }
  // As cifras não saem desta função.
  const { mt5_password_cifrada: _m, mt5_investor_cifrada: _i, ...conta } = linha
  void _m
  void _i
  return { decisao, conta: conta as ContaFundedLida }
}

export async function lerContaFunded(id: string): Promise<ContaFundedLida | null> {
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('id, user_id, motor, mt5_login, tipo, estado, metricas, saldo_inicial, sim_saldo, sim_equity')
    .eq('id', id)
    .eq('motor', 'sim')
    .maybeSingle()
  return (data ?? null) as ContaFundedLida | null
}

const numero = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * O que o dono da ligação vê da conta. Etiquetas F1/F2/Funded/Torneio/Real + Active/…; nunca «demo».
 *
 * Tem de dizer o MESMO que o WebTrader diz da mesma conta — a referência é `numerosDaConta`
 * (lib/mtmfunded/numeros-conta.ts). É por isso que o `pausada_em` entra: sem ele, uma conta
 * pausada pelo admin aparecia «Active» aqui e «Pause» no WebTrader, para a mesma conta.
 */
export function resumoDaConta(c: ContaFundedLida) {
  return {
    funded_account_id: c.id,
    login: c.mt5_login,
    servidor: SERVIDOR_SIMULADO,
    tipo: tipoCurto(c.tipo, c.metricas),
    estado: estadoCurto(c.estado, c.metricas, c.pausada_em ?? null),
    saldo: numero(c.sim_saldo),
    equity: numero(c.sim_equity ?? c.sim_saldo),
    saldo_inicial: numero(c.saldo_inicial),
    moeda: 'USD',
  }
}

/**
 * Preenche account_balance/account_equity das ligações MTM Funded de uma listagem do PRÓPRIO
 * utilizador (o attachConnectionBalances só conhece a MetaApi). Nunca para métricas públicas.
 */
export async function juntarSaldosMtmFunded<
  T extends { mt5_platform?: string | null; funded_account_id?: string | null; account_balance?: number | null; account_equity?: number | null },
>(ligacoes: T[]): Promise<T[]> {
  const ids = [...new Set(ligacoes.filter((c) => ehMtmFundedLigacao(c) && c.funded_account_id).map((c) => String(c.funded_account_id)))]
  if (!ids.length) return ligacoes
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('id, mt5_login, tipo, estado, metricas, saldo_inicial, sim_saldo, sim_equity, user_id')
    .in('id', ids)
    .eq('motor', 'sim')
  const porId = new Map(((data ?? []) as ContaFundedLida[]).map((c) => [c.id, c]))
  return ligacoes.map((c) => {
    if (!ehMtmFundedLigacao(c)) return c
    const conta = porId.get(String(c.funded_account_id ?? ''))
    if (!conta) return c
    const r = resumoDaConta(conta)
    return { ...c, account_balance: r.saldo, account_equity: r.equity, funded_tipo: r.tipo, funded_estado: r.estado }
  })
}

/**
 * Contas simuladas que o T2T deste utilizador pode abrir por LIGAÇÃO (além das `aceita_t2t` da
 * 070): ligação mtmfunded não pausada, NÃO só de leitura, e a conta continua a ser dele.
 */
export async function contasFundedLigadasParaT2T(userId: string, ligacoes?: Array<Record<string, unknown>>): Promise<string[]> {
  const db = getSupabaseAdmin()
  let linhas = ligacoes
  if (!linhas) {
    const { data } = await db.from('mtmcopy_connections').select('*').eq('user_id', userId).neq('mt5_status', 'disconnected')
    linhas = (data ?? []) as Array<Record<string, unknown>>
  }
  const candidatas = linhas
    .filter((c) => ehMtmFundedLigacao(c as { mt5_platform?: string | null }))
    .filter((c) => c.user_id === userId && c.funded_account_id && c.funded_somente_leitura !== true && c.is_active !== false)
    .map((c) => String(c.funded_account_id))
  if (!candidatas.length) return []
  // Segunda verificação de dono no momento de executar (a conta pode ter mudado de mãos).
  const { data } = await db.from('mtm_trading_accounts').select('id').in('id', candidatas).eq('user_id', userId).eq('motor', 'sim')
  return (data ?? []).map((c) => String(c.id))
}
