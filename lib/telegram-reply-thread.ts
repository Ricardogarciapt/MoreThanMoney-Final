import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Traduz o REPLY do Telegram para o threading do chat da app.
 * No Telegram, os follow-ups (HIT TP1, "Trade active and running", BE, fecho) são REPLIES à mensagem
 * do setup. As nossas rotas de ingestão gravavam só `telegram_message_id` e nunca o `reply_to_id` →
 * as mensagens apareciam TODAS ao mesmo nível no chat da app (sem thread). Este helper resolve o
 * `chat_messages.id` do PAI a partir do `reply_to_message_id` de origem.
 *
 * Devolve null se não houver reply ou se o pai ainda não estiver no chat (ex.: mensagem anterior à
 * ligação do canal) — nesse caso a mensagem entra ao nível de topo, como antes.
 */
export async function resolveReplyToChatMessageId(
  channelSlug: string | null | undefined,
  telegramReplyToMessageId: number | null | undefined,
): Promise<string | null> {
  if (!channelSlug || !telegramReplyToMessageId) return null
  try {
    const { data } = await getSupabaseAdmin()
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', channelSlug)
      .eq('telegram_message_id', telegramReplyToMessageId)
      .maybeSingle()
    return (data?.id as string | undefined) ?? null
  } catch {
    return null
  }
}
