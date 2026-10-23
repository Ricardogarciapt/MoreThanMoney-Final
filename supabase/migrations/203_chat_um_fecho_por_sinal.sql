-- 203 · UM FECHO POR SINAL NO CHAT (pedido do dono, 23/10/2026)
--
-- O problema: vários motores anunciam o fecho da mesma trade (webhook TradingView, monitor de preço
-- T2T, signal-tracker, monitor de perps, publicador da mestre). Uma trade que fechava no trailing
-- aparecia «🏁 Posição fechada +357» e horas depois «🛑 Stop loss −335», porque outro caminho
-- avaliava o SL original sem saber que a posição já tinha saído antes do Alvo 1.
-- Medido de 23/09 a 23/10: 28 sinais com dois fechos (scanner 16, aurum-flow 7, premium 5).
--
-- A regra, na base para valer em TODOS os caminhos: um sinal (reply_to_id) tem no máximo UM
-- anúncio de fecho de posição (🏁 Alvo final · 🏁 Posição fechada · 🛑 Stop loss · 🔒 Stop protegido).
-- O primeiro ganha; os seguintes não entram e ficam registados em `chat_fechos_suprimidos`.
-- «🗑️ Ideia descartada» / «❌ Sinal cancelado» NÃO contam como fecho: o sinal pode voltar a armar
-- e a trade real que se segue tem de aparecer com o resultado que teve.
--
-- Reverter: drop trigger chat_um_fecho_por_sinal on chat_messages;

create table if not exists public.chat_fechos_suprimidos (
  id bigserial primary key,
  reply_to_id uuid not null,
  channel_slug text,
  content text,
  fecho_existente uuid,
  criado_em timestamptz not null default now()
);
alter table public.chat_fechos_suprimidos enable row level security;

create or replace function public.chat_um_fecho_por_sinal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  re constant text := '^\s*(🏁 (Alvo final|Posição fechada)|🛑 Stop loss|🔒 Stop protegido)';
  existente uuid;
begin
  if new.reply_to_id is null or coalesce(new.is_deleted, false) or new.content is null or new.content !~ re then
    return new;
  end if;
  -- dois motores no mesmo segundo: serializa por sinal
  perform pg_advisory_xact_lock(hashtext('chat-fecho:' || new.reply_to_id::text));
  select id into existente from chat_messages
   where reply_to_id = new.reply_to_id and not coalesce(is_deleted, false) and content ~ re
   limit 1;
  if existente is null then
    return new;
  end if;
  insert into chat_fechos_suprimidos (reply_to_id, channel_slug, content, fecho_existente)
  values (new.reply_to_id, new.channel_slug, left(new.content, 500), existente);
  return null;
end $$;

drop trigger if exists chat_um_fecho_por_sinal on public.chat_messages;
create trigger chat_um_fecho_por_sinal before insert on public.chat_messages
  for each row execute function public.chat_um_fecho_por_sinal();
