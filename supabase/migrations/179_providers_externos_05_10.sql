-- PROVIDERS EXTERNOS (05/10/2026) — modelo único para estratégias que nascem no admin da MTM Auto
-- ou no Centro do site: metaapi (id colado/escolhido), telegram (chat id + bot), mt5 (conta directa,
-- credenciais cifradas) — além dos tipos que já existiam.
--
-- ── 1. mtmauto_providers.tipo aceita 'mt5' ────────────────────────────────────────────────────
-- 'mt5' = conta MetaTrader ligada DIRECTAMENTE, sem MetaApi (regra do dono 21/09: a MetaApi não se
-- gasta com fontes). A casa ainda não tem caminho de produção para ler uma conta MT5 arbitrária sem
-- MetaApi, por isso o registo nasce em `mt5_estado = 'por_ligar'` e o admin vê o aviso.
alter table public.mtmauto_providers drop constraint if exists mtmauto_providers_tipo_check;
alter table public.mtmauto_providers add constraint mtmauto_providers_tipo_check
  check (tipo = any (array['mtm_t2t','metaapi','telegram','mtmfunded','tradelocker','mt5']));

-- ── 2. colunas novas ──────────────────────────────────────────────────────────────────────────
alter table public.mtmauto_providers
  -- password de trading da conta MT5 directa, cifrada como as outras credenciais da casa
  -- (AES-256-GCM, chave MTMFUNDED_CRED_KEY — a mesma de mtm_trading_accounts.mt5_password_cifrada)
  add column if not exists mt5_password_cifrada text,
  -- 'por_ligar' | 'ligada' | 'erro' — só para tipo mt5
  add column if not exists mt5_estado text check (mt5_estado is null or mt5_estado in ('por_ligar','ligada','erro')),
  -- título do chat Telegram escrito à mão (quando o bot ainda não o listou em mtmauto_telegram_chats)
  add column if not exists telegram_chat_titulo text,
  -- canal de chat da app onde os sinais desta estratégia aparecem (cartões T2T). Vazio = derivado
  -- (canalChatDoProvider: fonte MTM de sempre, senão sinais-<slug>).
  add column if not exists canal_chat text,
  -- fonte desligada (ex.: pv-relay do Edge a 04/10): a estratégia fica, as subscrições pausam
  add column if not exists fonte_desligada_em timestamptz,
  add column if not exists fonte_desligada_motivo text;

comment on column public.mtmauto_providers.canal_chat is 'slug de chat_channels onde os sinais T2T desta estratégia aparecem; o site deriva canal→estratégia daqui (lib/mestres/canal-t2t.ts)';
comment on column public.mtmauto_providers.fonte_desligada_em is 'a fonte de sinais deixou de existir/entregar; subscrições pausadas, histórico intacto';

-- ── 3. chaves de site_settings em desuso (F2) — lista, não apagamento ─────────────────────────
insert into public.site_settings (key, value, description)
values ('chaves_em_desuso',
  '{"desde":"2026-10-05","chaves":["forex_swings_execution","primeverse_execution","telegram_relay_alcy","perps_monitor_state"],"nota":"config preservada; os caminhos que as liam estão desligados (410/off). Não apagar sem decisão do dono."}'::jsonb,
  'Chaves de configuração que já nada lê em produção (05/10/2026). Ficam para história.')
on conflict (key) do update set value = excluded.value, description = excluded.description;
