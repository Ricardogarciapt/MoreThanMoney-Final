/**
 * Interface de mensagem inspirada em Rocket.Chat IMessage (simplificada para Supabase).
 * Mapeia para a tabela messages (conversation_id OU group_id, sender_id, content, read, etc.).
 */
export interface IMessage {
  id: string;
  /** ID da sala: conversation_id ou group_id conforme o tipo */
  rid: string;
  /** Conteúdo de texto */
  msg: string;
  /** Timestamp (ts em Rocket.Chat) */
  ts: string; // ISO date
  /** Autor */
  u: {
    _id: string;
    username?: string;
    name?: string;
    avatar_url?: string;
  };
  read?: boolean;
  read_at?: string | null;
  /** Para mensagens de sistema (opcional) */
  t?: string;
  /** Anexos (opcional, para futuro) */
  attachments?: unknown[];
  /** Reações (opcional, para futuro) */
  reactions?: Record<string, { usernames: string[] }>;
}

/** Mensagem como vem da tabela Supabase messages */
export interface ISupabaseMessageRow {
  id: string;
  conversation_id: string | null;
  group_id: string | null;
  sender_id: string;
  content: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export function supabaseMessageToIMessage(
  row: ISupabaseMessageRow,
  sender?: { id: string; full_name?: string; username?: string; avatar_url?: string }
): IMessage {
  const rid = row.conversation_id ?? row.group_id ?? '';
  return {
    id: row.id,
    rid,
    msg: row.content,
    ts: row.created_at,
    u: {
      _id: row.sender_id,
      username: sender?.username,
      name: sender?.full_name,
      avatar_url: sender?.avatar_url,
    },
    read: row.read,
    read_at: row.read_at,
  };
}
