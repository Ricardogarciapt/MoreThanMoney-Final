/**
 * Interface de sala inspirada em Rocket.Chat IRoom (simplificada para o nosso modelo Supabase).
 * Uma "room" no frontend pode ser uma conversation (DM) ou um group_conversation (canal/grupo).
 */
import type { RoomType } from './RoomType';

export interface IRoomBase {
  _id: string;
  t: RoomType;
  name?: string;
  /** Timestamp da última mensagem (lm em Rocket.Chat) */
  lm?: string; // ISO date
  /** Número de mensagens (opcional) */
  msgs?: number;
  /** Contagem de utilizadores (para grupos) */
  usersCount?: number;
  /** Última mensagem resumida para lista */
  lastMessage?: {
    content: string;
    created_at: string;
  };
  unread?: number;
}

/** Sala de mensagem direta (1-1): mapeia para conversations */
export interface IDirectRoom extends IRoomBase {
  t: 'd';
  /** IDs dos dois utilizadores (user1_id, user2_id) */
  uids: [string, string];
  /** Outro utilizador (para exibir nome/avatar na lista) */
  otherUser?: {
    id: string;
    full_name?: string;
    username?: string;
    avatar_url?: string;
    email?: string;
  };
}

/** Sala de canal ou grupo: mapeia para group_conversations */
export interface IGroupRoom extends IRoomBase {
  t: 'c' | 'p';
  /** Nome do grupo/canal */
  name: string;
  description?: string;
  avatar_url?: string;
  is_public?: boolean;
  is_mobile_visible?: boolean;
  created_by?: string;
  /** Se o utilizador atual pode publicar (regras Trade/Crypto/Social) */
  can_post?: boolean;
  is_member?: boolean;
  member_count?: number;
}

export type IRoom = IDirectRoom | IGroupRoom;

export function isDirectRoom(room: IRoom): room is IDirectRoom {
  return room.t === 'd';
}

export function isGroupRoom(room: IRoom): room is IGroupRoom {
  return room.t === 'c' || room.t === 'p';
}
