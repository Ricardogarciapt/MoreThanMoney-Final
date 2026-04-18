/** Período após o qual o histórico do chat é limpo (mensagens antigas ou sessão encerrada). */
export const LMS_CHAT_RETENTION_HOURS = 24
export const LMS_CHAT_RETENTION_MS = LMS_CHAT_RETENTION_HOURS * 60 * 60 * 1000

/** Limite móvel: mensagens mais antigas que isto são removidas (sessão ainda ativa ou sem fim registado). */
export function getLmsChatRollingCutoffIso(): string {
  return new Date(Date.now() - LMS_CHAT_RETENTION_MS).toISOString()
}

/** @deprecated usar getLmsChatRollingCutoffIso */
export function getLmsChatRetentionCutoffIso(): string {
  return getLmsChatRollingCutoffIso()
}

/**
 * Quando a live terminou (`live_ended_at`), após 24h apaga-se todo o chat desse canal.
 */
export function shouldPurgeEntireStreamChat(liveEndedAt: string | null | undefined): boolean {
  if (liveEndedAt == null || liveEndedAt === "") return false
  const end = new Date(liveEndedAt).getTime()
  if (Number.isNaN(end)) return false
  return Date.now() - end >= LMS_CHAT_RETENTION_MS
}
