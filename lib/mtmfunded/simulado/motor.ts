import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'

/**
 * O MOTOR DE UMA CONTA — onde ela vive.
 *
 * `mt5` é a conta criada na corretora externa pela fila e pelo agente do MT5, seguida pela
 * MetaApi. `sim` é a conta emitida por nós: nasce na hora, sem fila, e negoceia no nosso motor
 * de simulação.
 *
 * Migração HÍBRIDA (decisão do mapa, 2026-09-14): as duas convivem na mesma tabela, e o
 * torneio, os levantamentos, os certificados e o painel continuam a ler as duas da mesma forma.
 *
 * ── a regra de continuidade ──────────────────────────────────────────────────
 *
 * Contas NOVAS (compra, oferta) seguem o lançamento: antes de o Ricardo lançar no admin, `mt5`;
 * depois, `sim`. Contas que CONTINUAM outra (fase 2, financiada, renovação após levantamento)
 * herdam o motor da anterior — um desafio começado na corretora acaba na corretora, e mudar a
 * meio mudava as regras do jogo a quem já está a jogá-lo.
 */

export type MotorConta = 'mt5' | 'sim'

export const SERVIDOR_SIMULADO = 'MTM-Simulado'

export async function motorDeNovasContas(): Promise<MotorConta> {
  const cfg = await getMtmFundedConfig()
  return cfg.sim_lancado_em ? 'sim' : 'mt5'
}

export async function motorDaConta(accountId: string): Promise<MotorConta> {
  const { data } = await getSupabaseAdmin()
    .from('mtm_trading_accounts').select('motor').eq('id', accountId).maybeSingle()
  return data?.motor === 'sim' ? 'sim' : 'mt5'
}

/**
 * Os campos com que uma conta simulada nasce: activa já, saldo = equity = âncora = pico.
 *
 * `estado: 'ativa'` logo à nascença é o ponto todo — não há fila à espera de ninguém.
 */
export function camposDeContaSimulada(saldo: number): Record<string, unknown> {
  const agora = new Date().toISOString()
  return {
    motor: 'sim',
    servidor: SERVIDOR_SIMULADO,
    estado: 'ativa',
    sim_saldo: saldo,
    sim_equity: saldo,
    sim_margem: 0,
    sim_ancora_dia: saldo,
    sim_ancora_em: agora,
    sim_pico_equity: saldo,
    sim_dias_negociados: 0,
  }
}

/** Campos de uma conta na corretora externa, como sempre foram. */
export function camposDeContaMt5(servidor?: string | null): Record<string, unknown> {
  return { motor: 'mt5', servidor: servidor ?? 'TheTradingMaster-Live', estado: 'pedida' }
}

/**
 * O que falta para se poder lançar aos clientes.
 *
 * O interruptor do admin só deixa lançar com tudo verde: lançar sem preços a correr ou sem
 * WebTrader dava contas a quem pagou, sem sítio onde negociar.
 */
export interface Prontidao {
  simbolos: number
  precosFrescos: number
  webtrader: boolean
  pronto: boolean
  faltas: string[]
}

/** Muda para `true` quando o WebTrader (M3) estiver em produção. */
export const WEBTRADER_DISPONIVEL = false

export async function prontidaoDoLancamento(): Promise<Prontidao> {
  const db = getSupabaseAdmin()
  const doisMinutos = new Date(Date.now() - 2 * 60_000).toISOString()
  const [{ count: simbolos }, { count: precosFrescos }] = await Promise.all([
    db.from('funded_symbols').select('symbol', { count: 'exact', head: true }).eq('ativo', true),
    db.from('funded_precos').select('symbol', { count: 'exact', head: true }).gte('em', doisMinutos),
  ])
  const faltas: string[] = []
  if (!simbolos) faltas.push('não há símbolos activos')
  if (!precosFrescos) faltas.push('o motor de preços não está a correr (M2)')
  if (!WEBTRADER_DISPONIVEL) faltas.push('o WebTrader ainda não está em produção (M3)')
  return {
    simbolos: simbolos ?? 0,
    precosFrescos: precosFrescos ?? 0,
    webtrader: WEBTRADER_DISPONIVEL,
    pronto: faltas.length === 0,
    faltas,
  }
}
