-- 186 — Colunas de direitos em public.profiles deixam de ser escrevíveis pelo próprio utilizador
--
-- A FALHA
--   A única policy de UPDATE em profiles é `auth.uid() = id` e os papéis anon/authenticated têm
--   UPDATE em todas as colunas. Quem tem sessão podia fazer, pelo cliente do browser,
--   `update profiles set user_type = 'admin' where id = auth.uid()` e virar admin. O mesmo para
--   VIP, subscrição, datas de expiração, broker_verified, MLM, créditos, addons em profile_data…
--
-- A CORRECÇÃO
--   Um trigger BEFORE INSERT OR UPDATE que, quando a escrita chega pelo PostgREST com o token de
--   um utilizador (claim role = anon/authenticated), repõe o valor antigo em cada coluna
--   privilegiada (UPDATE) ou força o valor por omissão (INSERT). service_role, postgres, crons e
--   funções do servidor continuam a escrever tudo — é por aí que passam Stripe, Apple, admin, etc.
--   Mesmo modelo do primegate_proteger_perfil (184): ignora em silêncio, não rebenta o pedido, para
--   que um formulário legítimo que mande o perfil inteiro de volta continue a gravar o nome.
--
-- O QUE O CLIENTE CONTINUA A PODER ESCREVER (verificado no código a 06/10)
--   full_name, username, phone, whatsapp, avatar_url, broker_uid, preferred_language, updated_at,
--   e ainda bio, birth_date, social_media, jifu_id, jifu_affiliate_link, country, timezone,
--   detected_language, auto_translate, tradingview_username, onboarding_platform, last_login,
--   notification_preferences.
--   Duas descidas de direitos que o cliente faz sozinho continuam a valer:
--   is_active true → false e trial_expired false → true (contexts/auth-context.tsx, trial expirado).
--
-- ORDEM DOS TRIGGERS
--   O nome começa por "zz_" para correr DEPOIS dos outros BEFORE UPDATE (o Postgres corre-os por
--   ordem alfabética). Assim também desfaz o que o sync_subscription_access ou o
--   clear_activation_on_activate derivem de uma escrita forjada.
--
-- REVERTER
--   drop trigger if exists zz_profiles_colunas_protegidas on public.profiles;
--   drop function if exists public.profiles_colunas_protegidas();

create or replace function public.profiles_colunas_protegidas()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  -- Fonte única da lista. A guarda lib/__tests__/profiles-colunas-protegidas.check.ts lê-a daqui.
  -- PROTEGIDAS:INICIO
  protegidas constant text[] := array[
    -- papel e categoria
    'user_type', 'membership_level', 'package', 'member_category',
    -- activação
    'is_active', 'ativo', 'is_verified', 'trial_expires_at', 'trial_expired',
    'inactive_reason', 'inactive_since', 'access_revoked_at', 'conversion_deadline',
    -- MTM Auto
    'mtm_auto_requested', 'mtm_auto_requested_at', 'mtm_auto_enabled', 'mtm_auto_enabled_at',
    'mtm_auto_enabled_by', 'mtm_auto_admin',
    -- subscrição e pagamento
    'subscription_expires_at', 'subscription_auto_renew', 'subscription_auto_renews',
    'subscription_plan', 'subscription_billing_cycle', 'subscription_platform',
    'subscription_status', 'subscription_renewal_count', 'payment_failed_count',
    'last_payment_at', 'next_billing_at', 'checkout_source', 'coupon_code',
    'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
    'apple_original_transaction_id', 'apple_product_id', 'skool_member_id',
    'mtmcopy_subscription_active', 'mtmcopy_subscription_expires_at', 'contas_extra_pagas',
    -- corretora e PrimeGate
    'broker_verified', 'primegate_estado', 'primegate_confirmado_em',
    -- MLM, afiliados e referências
    'mlm_sponsor_username', 'mlm_rank_id', 'mlm_total_earned',
    'stripe_connect_account_id', 'stripe_connect_status', 'stripe_connect_onboarded_at',
    'referral_code', 'referred_by_code', 'referral_username', 'affiliate_code',
    -- identidade e ligações (email é a chave dos webhooks Stripe/Apple)
    'email', 'login_provider', 'iqonic_id', 'iqonic_validated_by', 'iqonic_validated_at',
    'metaapi_id', 'risco_percent', 'created_at',
    -- addons, ativação pendente, webtrader, marketplace… vivem aqui dentro
    'profile_data'
  ];
  -- PROTEGIDAS:FIM
  papel text;
  antigo jsonb;
  repor jsonb;
  omissao jsonb;
  email_auth text;
begin
  papel := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );

  -- service_role, postgres, crons, supabase_auth_admin: passam sem toque.
  if papel not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    antigo := to_jsonb(old);
    select coalesce(jsonb_object_agg(k, antigo -> k), '{}'::jsonb)
      into repor
      from unnest(protegidas) as k
     where antigo ? k;

    -- Descidas de direitos que o próprio cliente faz (trial expirado em contexts/auth-context.tsx).
    -- Nota: se alguém forjar subscription_status='canceled', o sync_subscription_access (corre antes)
    -- põe is_active=false e essa descida fica; o subscription_status volta ao antigo. Só se prejudica
    -- a si próprio.
    if old.is_active is distinct from false and new.is_active is false then
      repor := repor - 'is_active';
    end if;
    if old.trial_expired is distinct from true and new.trial_expired is true then
      repor := repor - 'trial_expired';
    end if;

    new := jsonb_populate_record(new, repor);
    return new;
  end if;

  -- INSERT: ninguém nasce admin. Força os valores por omissão das colunas.
  omissao := jsonb_build_object(
    'membership_level', 'basic', 'package', 'basic', 'member_category', 'standard',
    'ativo', true, 'is_verified', false, 'trial_expires_at', null, 'trial_expired', false,
    'inactive_reason', null, 'inactive_since', null, 'access_revoked_at', null,
    'conversion_deadline', null,
    'mtm_auto_requested', false, 'mtm_auto_requested_at', null, 'mtm_auto_enabled', false,
    'mtm_auto_enabled_at', null, 'mtm_auto_enabled_by', null, 'mtm_auto_admin', false,
    'subscription_expires_at', null, 'subscription_auto_renew', true,
    'subscription_auto_renews', true, 'subscription_plan', null,
    'subscription_billing_cycle', 'monthly', 'subscription_platform', null,
    'subscription_status', 'active', 'subscription_renewal_count', 0,
    'payment_failed_count', 0, 'last_payment_at', null, 'next_billing_at', null
  ) || jsonb_build_object(  -- partido em dois: uma função aceita no máximo 100 argumentos
    'checkout_source', 'stripe', 'coupon_code', null,
    'stripe_customer_id', null, 'stripe_subscription_id', null, 'stripe_price_id', null,
    'apple_original_transaction_id', null, 'apple_product_id', null, 'skool_member_id', null,
    'mtmcopy_subscription_active', false, 'mtmcopy_subscription_expires_at', null,
    'contas_extra_pagas', 0,
    'broker_verified', false, 'primegate_estado', null, 'primegate_confirmado_em', null,
    'mlm_sponsor_username', null, 'mlm_rank_id', 0, 'mlm_total_earned', 0,
    'stripe_connect_account_id', null, 'stripe_connect_status', 'not_started',
    'stripe_connect_onboarded_at', null,
    'referral_code', null, 'referred_by_code', null, 'referral_username', null,
    'affiliate_code', null,
    'login_provider', null, 'iqonic_id', null, 'iqonic_validated_by', null,
    'iqonic_validated_at', null, 'metaapi_id', null, 'risco_percent', 2.0,
    'created_at', now(),
    'profile_data', '{}'::jsonb
  );
  new := jsonb_populate_record(new, omissao);

  -- user_type: o registo do cliente usa 'member' ou 'pending' (lib/member-profile.ts,
  -- contexts/auth-context.tsx). Qualquer outro valor cai para 'pending'.
  if new.user_type is null then
    new.user_type := 'member';
  elsif new.user_type not in ('member', 'pending') then
    new.user_type := 'pending';
  end if;
  -- is_active fica como o cliente mandou (o default da coluna já é true); null → true.
  new.is_active := coalesce(new.is_active, true);

  -- email: o da conta de autenticação manda, não o que vem no pedido.
  select u.email into email_auth from auth.users u where u.id = new.id;
  if email_auth is not null then
    new.email := email_auth;
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_colunas_protegidas() from public, anon, authenticated;

drop trigger if exists zz_profiles_colunas_protegidas on public.profiles;
create trigger zz_profiles_colunas_protegidas
  before insert or update on public.profiles
  for each row execute function public.profiles_colunas_protegidas();

comment on function public.profiles_colunas_protegidas() is
  '186: repõe as colunas de direitos (papel, VIP, subscrição, broker, MLM, créditos…) quando a escrita vem com token anon/authenticated. Reverter: drop trigger zz_profiles_colunas_protegidas on public.profiles.';
