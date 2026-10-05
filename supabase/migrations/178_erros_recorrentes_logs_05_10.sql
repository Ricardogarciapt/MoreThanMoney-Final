-- OS ERROS RECORRENTES DOS LOGS DE 05/10 (11:30–13:30 UTC) — a parte que é da base de dados.
--
-- ── 1. chat_messages_telegram_unique: o id do Telegram é único POR CHAT, não no mundo ──────────
--
-- O índice era `unique (telegram_message_id)` sem o canal. Os ids do Telegram contam por chat: o
-- canal `premium-ideas` já ia nos 10 945+ em Setembro e o `trade-ideas-setup` (o bot da casa) chegou
-- agora aos mesmos números. Cada sinal novo do bot tentava gravar o seu id no chat e o Postgres
-- recusava — «duplicate key … chat_messages_telegram_unique», 12 vezes em 2 h — por causa de uma
-- mensagem de OUTRO canal de 2 de Setembro. Sem o id gravado, editar/apagar a cópia do Telegram
-- deixa de ser possível (não há como a procurar).
--
-- Todas as deduplicações do código (webhook, webhook-aibot, relay-post, catchup-aibot) já procuram
-- por (channel_slug, telegram_message_id); só o índice estava desalinhado. Verificado antes de
-- aplicar: zero pares (channel_slug, telegram_message_id) repetidos.
--
-- ── 2. notifications_type_check: dois tipos legítimos que o sino já usa ────────────────────────
--
-- `trade_alert` é o tipo com que /api/notifications/send-push grava o sino «💡 Nova Ideia» (e que
-- lib/notification-preferences.ts e o próprio send-push já tratam); `mtmcopy_account_blocked` é o
-- que lib/mtmcopy/account-health-notice.ts escreve E lê de volta para não repetir o aviso. Nenhum
-- estava na constraint: 5 sinos perdidos em 2 h, em silêncio. `mentor` (rota /api/mentor/tasks) e
-- `renewal_email` (cron de renovações) falhavam da mesma maneira — a migração 111 já o notava.
--
-- ── 3. user_xp.level: a app nativa lê `level`, a coluna chama-se `current_level` ───────────────
--
-- A app iOS (UA «App/86 CFNetwork») pede `select=total_xp,level`. Uma coluna gerada a partir de
-- `current_level` serve a app publicada sem esperar por uma build nova; o site continua a escrever
-- `current_level` (uma coluna gerada não se escreve).

begin;

-- 1. índice único por canal
drop index if exists public.chat_messages_telegram_unique;
create unique index if not exists chat_messages_telegram_unique
  on public.chat_messages (channel_slug, telegram_message_id)
  where telegram_message_id is not null;

-- 2. tipos de notificação
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'dca_opportunity', 'dca_daily', 'dca', 'price_alert', 'system', 'portfolio', 'chat_message', 'chat',
    'social_post', 'social_interaction', 'social_mention', 'live_session', 'live_sessions', 'trade_ideas',
    'tap_to_trade', 'premium', 'sensei', 'telegram_forward', 'telegram_groups', 'mtmcopy_signal',
    'admin_notification', 'subscription_expiry', 'access_validation_pending', 'cron_marker',
    'stripe_skool_pending', 'stripe_skool_revoke', 'new_member', 'new_sale', 'new_client', 'new_affiliate',
    'team_renewal', 'rank_up',
    -- 05/10
    'trade_alert', 'mtmcopy_account_blocked', 'mentor', 'renewal_email'
  ])
);

-- 3. user_xp.level
alter table public.user_xp
  add column if not exists level integer generated always as (current_level) stored;

commit;
