/** Mensagens do chat são apagadas da base após este período (pedido explícito + purge em leituras). */
export const LMS_CHAT_RETENTION_HOURS = 24

export function getLmsChatRetentionCutoffIso(): string {
  return new Date(Date.now() - LMS_CHAT_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
}
