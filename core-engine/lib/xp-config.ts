/** Tipos de acção gamificada MTM — valores por omissão se xp_config não existir na DB. */
export const XP_ACTION_DEFAULTS: Record<
  string,
  { amount: number; dailyCap?: number; cooldownMinutes?: number; label: string }
> = {
  onboarding_step_completed: { amount: 50, label: 'Passo Fast Start concluído' },
  fast_start_completed: { amount: 200, label: 'Fast Start 100% completo' },
  chat_message_sent: { amount: 5, dailyCap: 25, label: 'Mensagem no chat' },
  live_chat_message: { amount: 8, dailyCap: 20, label: 'Mensagem na live' },
  live_session_watch: { amount: 15, cooldownMinutes: 15, label: 'Assistir live' },
  social_create_post: { amount: 15, dailyCap: 10, label: 'Publicar no feed' },
  social_like_post: { amount: 3, dailyCap: 30, label: 'Like no feed' },
  social_create_comment: { amount: 8, dailyCap: 20, label: 'Comentário no feed' },
  login_daily: { amount: 10, dailyCap: 1, label: 'Login diário' },
}

export const XP_PER_LEVEL = 1000

export function levelFromXp(totalXp: number): number {
  return Math.max(1, Math.floor(totalXp / XP_PER_LEVEL) + 1)
}

export function xpProgressInLevel(totalXp: number): number {
  return totalXp % XP_PER_LEVEL
}
