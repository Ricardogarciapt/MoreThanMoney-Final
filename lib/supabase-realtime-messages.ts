import type { SupabaseClient } from '@supabase/supabase-js'
import { messagesRealtimeFilter } from './messaging-types'

/**
 * Subscreve a novas mensagens e atualizações numa sala (conversation ou group).
 * Usado pela página de mensagens e pela app-mobile para Realtime via Supabase.
 * Inspirado no modelo de salas do Rocket.Chat; dados em public.messages.
 *
 * @param supabase - Cliente Supabase (browser)
 * @param roomId - ID da conversation ou do group
 * @param type - 'direct' | 'group'
 * @param onInsert - chamado quando há INSERT em messages
 * @param onUpdate - opcional, chamado quando há UPDATE (ex.: read)
 * @returns função para cancelar a subscrição
 */
export function subscribeToRoomMessages(
  supabase: SupabaseClient,
  roomId: string,
  type: 'direct' | 'group',
  onInsert: () => void,
  onUpdate?: () => void
): () => void {
  const filter = messagesRealtimeFilter(roomId, type)
  const channelName = `messages-${type}-${roomId}`

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter,
      },
      () => onInsert()
    )

  if (onUpdate) {
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter,
      },
      () => onUpdate()
    )
  }

  channel.subscribe(() => {})

  return () => {
    supabase.removeChannel(channel)
  }
}
