# Referência Rocket.Chat → Supabase (Sistema de Mensagens)

Este diretório contém tipos e conceitos inspirados no projeto [Rocket.Chat](https://github.com/RocketChat/Rocket.Chat), adaptados ao nosso modelo de dados na **Supabase**.

## Mapeamento de conceitos

| Rocket.Chat | Nosso Supabase | Descrição |
|-------------|----------------|-----------|
| **RoomType** `d` (direct) | `conversations` | Conversas 1-1 entre dois utilizadores |
| **RoomType** `c` (channel) | `group_conversations` com `is_public = true` | Canais públicos (ex.: Trade Chat, Crypto Chat) |
| **RoomType** `p` (private group) | `group_conversations` com `is_public = false` | Grupos privados |
| **IRoom** | Conversa ou grupo + metadados (lastMessage, unread, can_post) | Sala unificada no frontend |
| **IMessage** | Tabela `messages` (conversation_id ou group_id, sender_id, content, read) | Mensagem única para DM e grupos |
| **ISubscription** | `group_members` (para grupos) ou participação implícita (para DMs) | “Subscrição” do utilizador à sala |

## Tabelas Supabase utilizadas

- **conversations** – Pares (user1_id, user2_id), last_message_at
- **messages** – conversation_id **ou** group_id, sender_id, content, read, read_at
- **group_conversations** – name, description, is_public, is_mobile_visible, created_by
- **group_members** – group_id, user_id, role (admin | moderator | member)

## Uso no projeto

- **Tipos**: usar `RoomType`, `IRoom`, `IMessage` de `@/data/rocketchat/*` ou da lib `@/lib/messaging-types`.
- **API unificada**: `GET /api/messages/rooms` devolve todas as “salas” (DMs + grupos) do utilizador com `t: 'd' | 'c' | 'p'`.
- **Realtime**: Supabase Realtime na tabela `messages` (filter por `conversation_id` ou `group_id`) para atualização em tempo real na página de mensagens e na app-mobile.

## Fonte

Tipos baseados em:

- `Rocket.Chat-develop/packages/core-typings/src/RoomType.ts`
- `Rocket.Chat-develop/packages/core-typings/src/IRoom.ts`
- `Rocket.Chat-develop/packages/core-typings/src/IMessage/IMessage.ts`
- `Rocket.Chat-develop/packages/core-typings/src/ISubscription.ts`

Simplificados para o nosso caso de uso (sem livechat, federação, E2E, etc.).
