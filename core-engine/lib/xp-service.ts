import type { SupabaseClient } from '@supabase/supabase-js'
import { XP_ACTION_DEFAULTS, levelFromXp } from './xp-config'

export interface AwardXpOptions {
  actionDescription?: string
  /** Se definido, só premia uma vez por utilizador (match exacto na descrição). */
  oncePerDescription?: boolean
  /** Ignorar se já houve prémio deste tipo nos últimos N minutos (mesma descrição opcional). */
  cooldownMinutes?: number
  /** Máximo de prémios deste tipo por dia (UTC). */
  dailyCap?: number
}

export interface AwardXpResult {
  awarded: boolean
  xp_gained: number
  total_xp: number
  level: number
  reason?: string
}

async function resolveXpAmount(
  supabase: SupabaseClient,
  actionType: string,
): Promise<number> {
  const defaults = XP_ACTION_DEFAULTS[actionType]
  try {
    const { data } = await supabase
      .from('xp_config')
      .select('xp_amount')
      .eq('action_type', actionType)
      .maybeSingle()
    if (data?.xp_amount != null) return data.xp_amount
  } catch {
    /* tabela opcional */
  }
  return defaults?.amount ?? 10
}

async function countRecentAwards(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  sinceIso: string,
  actionDescription?: string,
): Promise<number> {
  let q = supabase
    .from('xp_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .gte('created_at', sinceIso)

  if (actionDescription) {
    q = q.eq('action_description', actionDescription)
  }

  const { count } = await q
  return count ?? 0
}

export async function awardXp(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  options: AwardXpOptions = {},
): Promise<AwardXpResult> {
  const defaults = XP_ACTION_DEFAULTS[actionType]
  const description = options.actionDescription?.trim() || defaults?.label || actionType
  const dailyCap = options.dailyCap ?? defaults?.dailyCap
  const cooldownMinutes = options.cooldownMinutes ?? defaults?.cooldownMinutes

  if (options.oncePerDescription && description) {
    const { count } = await supabase
      .from('xp_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action_type', actionType)
      .eq('action_description', description)

    if ((count ?? 0) > 0) {
      const existing = await getUserXp(supabase, userId)
      return {
        awarded: false,
        xp_gained: 0,
        total_xp: existing.total_xp,
        level: existing.level,
        reason: 'already_awarded',
      }
    }
  }

  if (cooldownMinutes && cooldownMinutes > 0) {
    const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()
    const recent = await countRecentAwards(supabase, userId, actionType, since, description)
    if (recent > 0) {
      const existing = await getUserXp(supabase, userId)
      return {
        awarded: false,
        xp_gained: 0,
        total_xp: existing.total_xp,
        level: existing.level,
        reason: 'cooldown',
      }
    }
  }

  if (dailyCap && dailyCap > 0) {
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const todayCount = await countRecentAwards(
      supabase,
      userId,
      actionType,
      startOfDay.toISOString(),
    )
    if (todayCount >= dailyCap) {
      const existing = await getUserXp(supabase, userId)
      return {
        awarded: false,
        xp_gained: 0,
        total_xp: existing.total_xp,
        level: existing.level,
        reason: 'daily_cap',
      }
    }
  }

  const xpAmount = await resolveXpAmount(supabase, actionType)
  if (xpAmount <= 0) {
    const existing = await getUserXp(supabase, userId)
    return {
      awarded: false,
      xp_gained: 0,
      total_xp: existing.total_xp,
      level: existing.level,
      reason: 'zero_amount',
    }
  }

  const { data: existingXP } = await supabase
    .from('user_xp')
    .select('total_xp, current_level')
    .eq('user_id', userId)
    .maybeSingle()

  const newTotalXP = (existingXP?.total_xp ?? 0) + xpAmount
  const newLevel = levelFromXp(newTotalXP)

  if (existingXP) {
    await supabase
      .from('user_xp')
      .update({
        total_xp: newTotalXP,
        current_level: newLevel,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  } else {
    await supabase.from('user_xp').insert({
      user_id: userId,
      total_xp: newTotalXP,
      current_level: newLevel,
    })
  }

  await supabase.from('xp_log').insert({
    user_id: userId,
    xp_amount: xpAmount,
    action_type: actionType,
    action_description: description,
  })

  return {
    awarded: true,
    xp_gained: xpAmount,
    total_xp: newTotalXP,
    level: newLevel,
  }
}

export async function getUserXp(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ total_xp: number; level: number }> {
  const { data } = await supabase
    .from('user_xp')
    .select('total_xp, current_level')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    total_xp: data?.total_xp ?? 0,
    level: data?.current_level ?? 1,
  }
}
