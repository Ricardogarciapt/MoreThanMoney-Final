-- 067 · Aurum Flow: o slug herdado «golden-moves» passa a «aurum-flow».
--
-- APLICAR SÓ DEPOIS DO DEPLOY do código da branch limpeza-estrategias. O código novo lê os dois
-- slugs (alias de 30 dias, até 2026-10-14); o código antigo só conhece «golden-moves».
--
-- O histórico não se perde: as mensagens do chat mudam de canal dentro da mesma transacção e as
-- linhas de mtmcopy_signal_tracking com channel_slug antigo continuam a ser lidas pelo alias.

begin;

-- 1) Estratégia MTM Auto (provider 37a59fc6).
update mtmauto_providers
   set slug = 'aurum-flow', updated_at = now()
 where id = '37a59fc6-c315-45b0-af3a-25f2bc043a80'
   and slug = 'golden-moves';

-- 2) Conta provider MTM Funded/motor (lida por lib/mtmcopy/aurum-conta-mestre.ts).
update mtm_trading_accounts
   set provider_slug = 'aurum-flow', updated_at = now()
 where provider_slug = 'golden-moves';

-- 3) Canal de chat. chat_messages.channel_slug → chat_channels.slug é FK sem ON UPDATE CASCADE,
--    por isso: cria o canal novo, move as mensagens (e sub-canais), apaga o antigo.
insert into chat_channels (slug, name, description, parent_slug, position, hidden)
select 'aurum-flow', name, description, parent_slug, position, hidden
  from chat_channels
 where slug = 'golden-moves'
on conflict (slug) do nothing;

update chat_messages set channel_slug = 'aurum-flow' where channel_slug = 'golden-moves';
update chat_channels set parent_slug = 'aurum-flow' where parent_slug = 'golden-moves';

-- Só apaga o antigo se ficou vazio (ON DELETE CASCADE levaria mensagens que tivessem escapado).
delete from chat_channels c
 where c.slug = 'golden-moves'
   and not exists (select 1 from chat_messages m where m.channel_slug = 'golden-moves')
   and not exists (select 1 from chat_channels f where f.parent_slug = 'golden-moves');

-- 4) Chave do grupo de sinais gravada nas ligações dos clientes (golden_moves → aurum_flow).
--    Hoje (2026-09-14) não há nenhuma; fica por segurança.
update mtmcopy_connections
   set telegram_group = 'aurum_flow'
 where telegram_group = 'golden_moves';

update mtmcopy_connections
   set telegram_groups = array_replace(telegram_groups, 'golden_moves', 'aurum_flow')
 where 'golden_moves' = any(telegram_groups);

-- 5) Registo de sinais: o slug do canal nas linhas novas passa a ser o novo; as antigas ficam
--    (são histórico e o alias lê-as).

commit;
