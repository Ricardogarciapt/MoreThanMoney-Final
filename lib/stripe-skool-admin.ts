import type { SupabaseClient } from '@supabase/supabase-js'

export function isPremiumStripePlan(planId?: string | null): boolean {
  if (!planId) return false
  const p = planId.toLowerCase()
  return p === 'premium' || p.startsWith('premium_')
}

/** Marca perfil como pendente de acesso manual no Skool. Devolve true se era novo. */
export async function setSkoolAccessPending(
  supabase: SupabaseClient,
  userId: string,
  planId: string
): Promise<boolean> {
  const { data: row } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('id', userId)
    .single()

  const prev = (row?.profile_data as Record<string, unknown>) || {}
  if (prev.skool_access_pending === true) return false

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_data: {
        ...prev,
        skool_access_pending: true,
        skool_pending_since: new Date().toISOString(),
        skool_pending_plan: planId,
        skool_pending_source: 'stripe',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    console.error('[SKOOL-ADMIN] Erro ao marcar pendente:', error.message)
    return false
  }
  return true
}

/** Admin confirmou acesso Skool — limpa pendente e marca notificações como lidas. */
export async function clearSkoolAccessPending(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: row } = await supabase
    .from('profiles')
    .select('profile_data')
    .eq('id', userId)
    .single()

  const prev = (row?.profile_data as Record<string, unknown>) || {}
  await supabase
    .from('profiles')
    .update({
      profile_data: {
        ...prev,
        skool_access_pending: false,
        skool_access_granted_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)

  for (const admin of admins || []) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', admin.id)
      .in('type', ['stripe_skool_pending', 'stripe_skool_revoke'])
      .filter('data->>memberUserId', 'eq', userId)
      .then(undefined, () => {})
  }
}

export async function notifyAdminsStripeSkoolAction(
  supabase: SupabaseClient,
  params: {
    action: 'grant' | 'revoke'
    userId: string
    email: string
    fullName?: string | null
    username?: string | null
    planId?: string | null
  }
): Promise<void> {
  const { action, userId, email, fullName, username, planId } = params

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)

  if (!admins?.length) {
    console.warn('[SKOOL-ADMIN] Nenhum admin activo para notificar')
    return
  }

  const display = fullName || username || email
  const adminUrl = `/admin?tab=users&userId=${userId}`
  const isGrant = action === 'grant'

  const title = isGrant
    ? '🏫 Skool — adicionar acesso manual'
    : '🚫 Skool — remover acesso'
  const message = isGrant
    ? `${display} subscreveu Premium (65€) via Stripe. Adiciona o membro no Skool manualmente e confirma em Utilizadores.`
    : `${display} cancelou a subscrição Premium Stripe. Remove o acesso no Skool.`

  const inserts = admins.map((admin) => ({
    user_id: admin.id,
    type: isGrant ? 'stripe_skool_pending' : 'stripe_skool_revoke',
    title,
    message,
    read: false,
    data: {
      url: adminUrl,
      memberUserId: userId,
      email,
      plan: planId || 'premium',
      action,
    },
  }))

  const { error } = await supabase.from('notifications').insert(inserts)
  if (error) {
    console.error('[SKOOL-ADMIN] Erro ao inserir notificações:', error.message)
  }
}

export async function handlePremiumStripeSkoolGrant(
  supabase: SupabaseClient,
  userId: string,
  planId: string
): Promise<void> {
  const isNew = await setSkoolAccessPending(supabase, userId, planId)
  if (!isNew) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, username')
    .eq('id', userId)
    .single()

  if (!profile?.email) return

  await notifyAdminsStripeSkoolAction(supabase, {
    action: 'grant',
    userId,
    email: profile.email,
    fullName: profile.full_name,
    username: profile.username,
    planId,
  })
}
