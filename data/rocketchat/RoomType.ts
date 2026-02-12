/**
 * Tipos de sala inspirados em Rocket.Chat (core-typings).
 * Mapeamento no nosso Supabase:
 * - d = direct (conversas 1-1) → tabela conversations
 * - c = channel público → group_conversations com is_public = true
 * - p = private group → group_conversations com is_public = false
 */
export type RoomType = 'd' | 'c' | 'p';

export const ROOM_TYPE_DIRECT: RoomType = 'd';
export const ROOM_TYPE_CHANNEL: RoomType = 'c';
export const ROOM_TYPE_PRIVATE_GROUP: RoomType = 'p';
