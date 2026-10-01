-- CHAT DA SESSÃO AO VIVO: guardar QUEM escreveu.
--
-- `lms_stream_messages` guardava apenas `sender_name` (texto livre) e `sender_type`
-- ('student' | 'educator'). Consequências que se viam na sala:
--
--   • no chat de uma sessão não se distinguia um Premium de um membro comum nem da equipa —
--     tudo o que não era o educador era azul e igual;
--   • não havia como silenciar uma pessoa concreta, porque a mensagem não aponta para conta
--     nenhuma: só para um nome que o cliente manda;
--   • uma mensagem não era atribuível depois do facto (moderação, abuso, suporte).
--
-- As duas colunas são ADITIVAS e anuláveis de propósito: as mensagens do educador e todas as
-- que já estão gravadas ficam com NULL, e o ecrã não inventa etiqueta para quem não tem tier
-- gravado (ver `etiquetaDeAutor` em lib/live-chat-sala.ts). A app nativa, que insere direto em
-- PostgREST sem estas colunas, continua a funcionar sem alteração.

alter table public.lms_stream_messages
  add column if not exists sender_id uuid references auth.users(id) on delete set null;

alter table public.lms_stream_messages
  add column if not exists sender_tier text;

comment on column public.lms_stream_messages.sender_id is
  'Conta que escreveu (NULL = educador pela sessão de educador, ou mensagem anterior a esta coluna).';

comment on column public.lms_stream_messages.sender_tier is
  'Perfil de quem escreveu no instante do envio (chavePerfilUi: admin|vip|premium|iq|trial|membro). Congelado de propósito: se a pessoa deixar de ser Premium amanhã, o que ela disse ontem não se reescreve.';

-- Para silenciar/moderar por pessoa dentro de uma sala sem varrer a tabela.
create index if not exists idx_lms_stream_messages_autor
  on public.lms_stream_messages (stream_id, sender_id)
  where sender_id is not null;
