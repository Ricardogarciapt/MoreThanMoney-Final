/**
 * QUEM FICA COM ESTE LEAD — atribuição automática pelas funções do backoffice (23/11/2026).
 *
 * Pedido do Ricardo: «deves auto atribuir leads pelas funções dos users no backoffice». As tarefas
 * que o funil de conversa cria (quer uma pessoa, seguimento esgotado, chamada de onboarding) saem
 * já com dono: a pessoa com esse papel em `backoffice_papeis` com MENOS tarefas abertas (empate →
 * quem tem o papel há mais tempo). Sem ninguém no papel, cai no team leader — a mesma regra do
 * motor do dia (`lib/backoffice-dia-motor.ts`). O negócio ganha essa pessoa na coluna do papel,
 * só se a coluna estiver vazia: nunca se rouba um lead a quem já o trabalha.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const COLUNA: Record<string, string> = { setter: 'setter_id', closer: 'closer_id', prospector: 'prospector_id', team_leader: 'team_leader_id' }

export async function donoPorPapel(db: SupabaseClient, papel: 'setter' | 'closer' | 'prospector'): Promise<{ userId: string; papel: string } | null> {
  for (const p of [papel, 'team_leader'] as const) {
    const { data } = await db.from('backoffice_papeis').select('user_id, atribuido_at').eq('papel', p).is('retirado_at', null).order('atribuido_at', { ascending: true })
    const pessoas = [...new Set((data ?? []).map((r) => String((r as { user_id: string }).user_id)))]
    if (!pessoas.length) continue
    if (pessoas.length === 1) return { userId: pessoas[0], papel: p }
    const { data: abertas } = await db.from('vendas_tarefas').select('responsavel_id').eq('estado', 'aberta').in('responsavel_id', pessoas)
    const carga = new Map<string, number>(pessoas.map((u) => [u, 0]))
    for (const t of abertas ?? []) {
      const u = String((t as { responsavel_id: string }).responsavel_id)
      carga.set(u, (carga.get(u) ?? 0) + 1)
    }
    pessoas.sort((a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0))
    return { userId: pessoas[0], papel: p }
  }
  return null
}

/** Põe a pessoa na coluna do papel do negócio, só se estiver vazia. */
export async function marcarDonoNoNegocio(db: SupabaseClient, negocioId: string, dono: { userId: string; papel: string }): Promise<void> {
  const coluna = COLUNA[dono.papel]
  if (!coluna) return
  await db.from('vendas_negocios').update({ [coluna]: dono.userId }).eq('id', negocioId).is(coluna, null)
}
