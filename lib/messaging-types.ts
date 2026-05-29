/**
 * Tipos unificados de mensagens (inspirados em Rocket.Chat) e helpers para Supabase.
 * Re-exporta tipos de data/rocketchat e adiciona mapeamento para as APIs do site.
 */

export type { RoomType } from '@/data/rocketchat/RoomType'
export {
  ROOM_TYPE_DIRECT,
  ROOM_TYPE_CHANNEL,
  ROOM_TYPE_PRIVATE_GROUP,
} from '@/data/rocketchat/RoomType'

export type {
  IRoom,
  IRoomBase,
  IDirectRoom,
  IGroupRoom,
} from '@/data/rocketchat/IRoom'
export { isDirectRoom, isGroupRoom } from '@/data/rocketchat/IRoom'

export type {
  IMessage,
  ISupabaseMessageRow,
} from '@/data/rocketchat/IMessage'
export { supabaseMessageToIMessage } from '@/data/rocketchat/IMessage'

/** Identificador único de uma sala no nosso sistema: id + tipo */
export interface RoomKey {
  id: string
  t: 'd' | 'c' | 'p'
}

export function roomKey(id: string, t: 'd' | 'c' | 'p'): RoomKey {
  return { id, t }
}

/** Filtro Realtime para mensagens por sala (conversation ou group) */
export function messagesRealtimeFilter(roomId: string, type: 'direct' | 'group') {
  return type === 'group'
    ? `group_id=eq.${roomId}`
    : `conversation_id=eq.${roomId}`
}
