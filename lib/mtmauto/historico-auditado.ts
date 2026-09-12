import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * O HISTÓRICO ANTERIOR AO MOTOR — medido, mas noutro regime.
 *
 * O Premium tem dois passados e eles não são a mesma coisa. Houve um tempo em que as trades
 * eram lançadas À MÃO numa conta pessoal e só depois copiadas para clientes — com uma pessoa a
 * olhar para o ecrã, a decidir quando entrar e quando sair. Hoje é um motor que corre sozinho.
 *
 * Os dois números são reais. Somá-los é que não: dava uma média que não descreve nem um regime
 * nem o outro, e quem a lesse ficaria a pensar que o que está a comprar hoje rende o que rendia
 * quando havia alguém a conduzir. É a mesma razão por que uma estratégia que muda de conta e de
 * mercado recomeça a contagem (ver `MEDE_DESDE`).
 *
 * Por isso mostram-se LADO A LADO, cada um com a sua etiqueta e o seu período. O cliente vê o
 * percurso inteiro e vê onde é que ele muda de natureza — que é mais honesto do que esconder
 * metade e mais útil do que misturar as duas.
 *
 * Vive em `site_settings` e não no código: o dia em que um destes números for corrigido não pode
 * depender de um deploy, e a origem tem de poder ser reescrita por quem a conhece.
 */

export const CHAVE_HISTORICO = 'historico_auditado'

export interface HistoricoAuditado {
  /** Como foi obtido. Aparece ao cliente, por extenso — é o que separa este bloco do outro. */
  regime: string
  acertoPct: number | null
  trades: number | null
  pipsTotal: number | null
  /** O período que os números cobrem. Um número sem período envelhece sem se notar. */
  desde: string | null
  ate: string | null
  /** Uma linha em linguagem de gente sobre o que isto é — e o que já não é. */
  nota: string
}

/**
 * O que ficou registado, com os valores que o Ricardo confirmou a 2026-09-12.
 *
 * Serve de semente: escreve-se uma vez e passa a viver na base de dados. Não é um valor por
 * omissão que volte a aparecer se alguém o apagar — apagado, o bloco deixa de existir, que é o
 * comportamento certo para um número que já não se quer publicar.
 */
export const SEMENTE: Record<string, HistoricoAuditado> = {
  'premium-ouro': {
    regime: 'Conta pessoal auditada, com gestão manual',
    acertoPct: 68,
    trades: null,
    pipsTotal: null,
    desde: null,
    ate: '2026-06-30',
    nota:
      'As entradas eram lançadas à mão numa conta pessoal e só depois copiadas para os clientes, ' +
      'com alguém a decidir cada saída. É outro regime do que corre hoje — por isso está à parte, ' +
      'e não somado.',
  },
}

export async function lerHistoricoAuditado(): Promise<Record<string, HistoricoAuditado>> {
  const { data } = await getSupabaseAdmin()
    .from('site_settings')
    .select('value')
    .eq('key', CHAVE_HISTORICO)
    .maybeSingle()
  if (!data?.value) return {}
  try {
    const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    return (v ?? {}) as Record<string, HistoricoAuditado>
  } catch {
    return {}
  }
}

export async function guardarHistoricoAuditado(mapa: Record<string, HistoricoAuditado>): Promise<void> {
  await getSupabaseAdmin()
    .from('site_settings')
    .upsert(
      { key: CHAVE_HISTORICO, value: JSON.stringify(mapa), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}
