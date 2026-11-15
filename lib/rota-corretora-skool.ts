/**
 * ROTA CORRETORA → COMUNIDADE: o acesso à comunidade segue o Premium dado pela PU Prime.
 *
 * Pedido do Ricardo a 04/11/2026 (MTM Master Framework): quem valida a conta PU Prime activa o
 * mesmo acesso que um Premium pago — e o Premium traz a comunidade incluída. Até aqui só o Premium
 * pago por Stripe pedia esse acesso (`handlePremiumStripeSkoolGrant`); quem vinha pela rota da
 * corretora ficava com o Premium e sem a comunidade, sem ninguém dar por isso.
 *
 * A plataforma da comunidade não tem API para adicionar membros. Por isso isto faz o mesmo que o
 * caminho do Stripe: marca o perfil como PENDENTE e avisa os admins, que adicionam à mão e
 * confirmam em Utilizadores (que já filtra os pendentes). Quando o acesso pela corretora é
 * revogado, pede a remoção.
 *
 * Corre no cron diário `broker-gate-renew` — nunca no caminho dos webhooks/alertas.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type EventoRota = 'renovado' | 'revogado'
export type AccaoSkool = 'pedir_acesso' | 'pedir_remocao' | 'nada'

/**
 * Puro. Decide sem tocar na base, para a regra se poder provar:
 *  · renovado e nunca pedido nem dado → pedir acesso (uma vez; o cron corre todos os dias);
 *  · revogado e tinha acesso ou pedido pela corretora → pedir remoção;
 *  · o resto → nada. Um acesso que veio do Stripe nunca é removido por isto.
 */
export function decidirSkoolRotaCorretora(profileData: unknown, evento: EventoRota): AccaoSkool {
  const pd = (profileData && typeof profileData === 'object' ? profileData : {}) as Record<string, unknown>
  const pendente = pd.skool_access_pending === true
  const dado = typeof pd.skool_access_granted_at === 'string' && pd.skool_access_granted_at !== ''
  const daCorretora = pd.skool_pending_source === 'puprime'
  if (evento === 'renovado') return pendente || dado ? 'nada' : 'pedir_acesso'
  if (!daCorretora) return 'nada'
  return pendente || dado ? 'pedir_remocao' : 'nada'
}

/** Aplica a decisão: escreve no perfil e avisa os admins. Nunca lança — é um passo a mais do cron. */
export async function aplicarSkoolRotaCorretora(
  supabase: SupabaseClient,
  perfil: { id: string; email?: string | null },
  evento: EventoRota,
): Promise<AccaoSkool> {
  try {
    const { data: row } = await supabase.from('profiles').select('profile_data').eq('id', perfil.id).maybeSingle()
    const prev = ((row as { profile_data?: Record<string, unknown> } | null)?.profile_data ?? {}) as Record<string, unknown>
    const accao = decidirSkoolRotaCorretora(prev, evento)
    if (accao === 'nada') return accao

    const agora = new Date().toISOString()
    const novo =
      accao === 'pedir_acesso'
        ? { ...prev, skool_access_pending: true, skool_pending_since: agora, skool_pending_plan: 'rota_corretora', skool_pending_source: 'puprime' }
        : { ...prev, skool_access_pending: false, skool_remocao_pendente: true, skool_remocao_desde: agora }
    await supabase.from('profiles').update({ profile_data: novo, updated_at: agora }).eq('id', perfil.id)

    const { data: admins } = await supabase.from('profiles').select('id').eq('user_type', 'admin').eq('is_active', true)
    const quem = perfil.email || perfil.id
    const pedir = accao === 'pedir_acesso'
    const linhas = (admins ?? []).map((a: { id: string }) => ({
      user_id: a.id,
      type: pedir ? 'stripe_skool_pending' : 'stripe_skool_revoke',
      title: pedir ? '🏫 Comunidade — adicionar acesso (rota PU Prime)' : '🚫 Comunidade — remover acesso (rota PU Prime)',
      message: pedir
        ? `${quem} tem o Premium pela conta PU Prime validada. Adiciona-o à comunidade e confirma em Utilizadores.`
        : `${quem} perdeu o Premium da rota PU Prime (saldo abaixo do mínimo). Remove-o da comunidade.`,
      read: false,
      data: { url: `/admin?tab=users&userId=${perfil.id}`, memberUserId: perfil.id, email: perfil.email ?? null, plan: 'rota_corretora', action: pedir ? 'grant' : 'revoke' },
    }))
    if (linhas.length) await supabase.from('notifications').insert(linhas)
    return accao
  } catch (e) {
    console.error('[rota-corretora-skool]', e instanceof Error ? e.message : e)
    return 'nada'
  }
}
