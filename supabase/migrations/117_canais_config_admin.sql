-- 117 — CANAIS DO CHAT CONFORME O ADMIN: ícone, cor, etiqueta, regras e permissões por canal.
--
-- PORQUÊ
-- O nome, a descrição, a ordem e o «escondido» já vinham da tabela `chat_channels`. O resto não:
--   * ícone / cor / etiqueta / regras → CHANNEL_META no código da web; no iOS nativo o ícone era
--     adivinhado pelo NOME («gold» → 🥇); no Android nativo nem isso;
--   * quem lê e quem escreve → listas fixas em lib/chat-channel-permissions.ts (web) e, à parte,
--     nas políticas RLS 110/111 (que as apps nativas usam, porque inserem directo na base). As duas
--     já tinham divergido: a RLS deixava qualquer membro activo ler o Sensei e o GoldKiller, que a
--     web tranca ao Premium; e deixava escrever no aurum-flow e nos t2t-*, que a web fecha.
-- Um canal novo criado no admin nascia sem ícone, sem regras e fechado à escrita na web — mas
-- aberto na RLS. O que o admin configura tem de ser o que as três apps mostram e aplicam.
--
-- O QUE MUDA
--   1. colunas novas em chat_channels (todas nulas por defeito = «usar a regra de sempre»):
--        icone, cor, etiqueta, regras[], leitura (membros|premium|admin),
--        escrita (membros|vip|ninguem), exige_uid_corretora
--   2. preenchimento com as regras que a web já aplica hoje (nada muda para quem usa a web);
--   3. as políticas RLS de leitura e de escrita passam a LER estas colunas — a mesma regra para
--      a web (lib/chat-channel-permissions.ts), o iOS nativo e o Android nativo.
--
-- ⚠️ Efeito para quem usa o iOS nativo: o Sensei e o GoldKiller passam a exigir Premium/VIP/IQ
-- também na leitura directa pela base (como a web já exigia). Quem não tem esse pack deixa de
-- ler esses dois canais no iPhone — que é a regra do produto; até aqui era uma fuga.
--
-- Os VIP contam pelos DOIS campos (user_type = 'vip' OU member_category = 'vip') — ver
-- memória «VIP vive em dois campos». A política antiga do premium-ideas só olhava para o segundo.
--
-- Aditiva e idempotente. NÃO APLICAR sem rever. Ordem: 116 → 117 → (deploy do ramo
-- chats-sinais-t2t) → 118 (dados dos canais de sinais).

begin;

-- ── 1. colunas ───────────────────────────────────────────────────────────────
alter table public.chat_channels
  add column if not exists icone text,
  add column if not exists cor text,
  add column if not exists etiqueta text,
  add column if not exists regras text[],
  add column if not exists leitura text,
  add column if not exists escrita text,
  add column if not exists exige_uid_corretora boolean;

alter table public.chat_channels drop constraint if exists chat_channels_leitura_check;
alter table public.chat_channels add constraint chat_channels_leitura_check
  check (leitura is null or leitura in ('membros', 'premium', 'admin'));
alter table public.chat_channels drop constraint if exists chat_channels_escrita_check;
alter table public.chat_channels add constraint chat_channels_escrita_check
  check (escrita is null or escrita in ('membros', 'vip', 'ninguem'));
alter table public.chat_channels drop constraint if exists chat_channels_cor_check;
alter table public.chat_channels add constraint chat_channels_cor_check
  check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.chat_channels.icone is 'emoji do canal nas apps (null = o de sempre, CHANNEL_META)';
comment on column public.chat_channels.cor is 'cor de destaque #RRGGBB (null = a de sempre)';
comment on column public.chat_channels.etiqueta is 'etiqueta curta ao lado do nome (Premium, IA, Aberto…)';
comment on column public.chat_channels.regras is 'regras mostradas na ficha do canal';
comment on column public.chat_channels.leitura is 'quem lê: membros | premium (Premium/VIP/IQ/admin) | admin. null = regra de sempre';
comment on column public.chat_channels.escrita is 'quem publica: membros | vip (VIP/admin) | ninguem (só o sistema). null = regra de sempre';
comment on column public.chat_channels.exige_uid_corretora is 'pede o UID da corretora antes de abrir o canal (web)';

-- ── 2. as regras que a web já aplica, escritas na tabela ─────────────────────
-- Só preenche o que está a null: se o admin já mexeu, fica o que ele escolheu.
update public.chat_channels set leitura = 'premium'
 where leitura is null and slug in ('premium-ideas', 'sensei-scanner', 'sinais-goldkiller');
update public.chat_channels set leitura = 'membros'
 where leitura is null;

update public.chat_channels set escrita = 'vip'
 where escrita is null and slug in ('premium-ideas', 'sensei-scanner', 'trade-ideas');
update public.chat_channels set escrita = 'membros'
 where escrita is null and slug in ('geral', 'trading', 'cripto', 'etf-stocks', 'social-ugc', 'ia',
                                     'fitness', 'mindset', 'lideranca');
-- Canais de sinais alimentados pelo sistema (webhooks, relays, motores): ninguém publica à mão.
update public.chat_channels set escrita = 'ninguem'
 where escrita is null
   and (slug in ('trade-ideas-setup', 'ideias-e-sinais', 'sinais-goldkiller', 'sinais-scanner-mtm',
                 'cripto-perps', 'aurum-flow', 'golden-moves')
        or slug like 't2t-%');

update public.chat_channels set exige_uid_corretora = true
 where exige_uid_corretora is null
   and slug in ('trade-ideas', 'trade-ideas-setup', 'premium-ideas', 'sinais-scanner-mtm');

-- ── 3. funções da RLS (avaliadas UMA vez por consulta via `(select …)`) ───────
-- Nível efectivo — a mesma tabela de defaults que lib/chat-channel-permissions.ts.
create or replace function public.chat_nivel_leitura(p_slug text, p_leitura text)
returns text language sql immutable as $$
  select coalesce(nullif(p_leitura, ''),
                  case when p_slug = 'premium-ideas' then 'premium' else 'membros' end)
$$;

create or replace function public.chat_nivel_escrita(p_slug text, p_escrita text)
returns text language sql immutable as $$
  select coalesce(nullif(p_escrita, ''),
    case
      when p_slug in ('premium-ideas', 'sensei-scanner', 'trade-ideas') then 'vip'
      when p_slug in ('trade-ideas-setup', 'ideias-e-sinais', 'sinais-goldkiller', 'sinais-scanner-mtm') then 'ninguem'
      else 'membros'
    end)
$$;

-- Canais (slugs) com um certo nível de leitura. Canais sem linha na tabela ficam de fora → membros.
create or replace function public.chat_canais_com_leitura(p_nivel text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.slug), '{}')
    from public.chat_channels c
   where public.chat_nivel_leitura(c.slug, c.leitura) = p_nivel
$$;

create or replace function public.chat_canais_com_escrita(p_nivel text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s.slug), '{}') from (
    select c.slug from public.chat_channels c
     where public.chat_nivel_escrita(c.slug, c.escrita) = p_nivel
    union
    -- Os slugs das regras de sempre contam mesmo que a linha não exista na tabela.
    select x from unnest(
      case p_nivel
        when 'vip' then array['premium-ideas', 'sensei-scanner', 'trade-ideas']
        when 'ninguem' then array['trade-ideas-setup', 'ideias-e-sinais', 'sinais-goldkiller', 'sinais-scanner-mtm']
        else array[]::text[]
      end) as x
     where not exists (select 1 from public.chat_channels c2 where c2.slug = x)
  ) s
$$;

-- Premium para efeitos do chat: activo e (Premium ou IQ ou VIP pelos dois campos ou admin).
create or replace function public.chat_eh_premium()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active = true
       and (
         -- a mesma regra dos sinais pagos (lib/direito-sinais.ts, migração 115): quem paga Premium
         -- ou Fundador em qualquer campo, VIP em qualquer campo, IQ, ou direito MTM Auto
         lower(coalesce(p.user_type, '')) in ('admin', 'vip')
         or lower(coalesce(p.member_category, '')) in ('vip', 'iq')
         or lower(coalesce(p.membership_level, '')) = 'vip'
         or lower(coalesce(p.member_category, '')) like any (array['%premium%', '%fundador%'])
         or lower(coalesce(p.membership_level, '')) like any (array['%premium%', '%founder%', '%fundador%'])
         or lower(coalesce(p.subscription_plan, '')) like any (array['%premium%', '%founder%', '%fundador%'])
         or coalesce((select d.tem from public.direito_mtm_auto(p.id, true) d limit 1), false))
  )
$$;

create or replace function public.chat_eh_vip_ou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.is_active = true
       and (p.user_type in ('admin', 'vip') or p.member_category = 'vip')
  )
$$;

create or replace function public.chat_eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
$$;

revoke all on function public.chat_canais_com_leitura(text) from public, anon;
revoke all on function public.chat_canais_com_escrita(text) from public, anon;
revoke all on function public.chat_eh_premium() from public, anon;
revoke all on function public.chat_eh_vip_ou_admin() from public, anon;
revoke all on function public.chat_eh_admin() from public, anon;
grant execute on function public.chat_canais_com_leitura(text) to authenticated;
grant execute on function public.chat_canais_com_escrita(text) to authenticated;
grant execute on function public.chat_eh_premium() to authenticated;
grant execute on function public.chat_eh_vip_ou_admin() to authenticated;
grant execute on function public.chat_eh_admin() to authenticated;

-- ── 4. políticas ─────────────────────────────────────────────────────────────
-- Leitura: a mesma forma da 110 (InitPlans), agora com os níveis vindos da tabela.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using (
    (is_deleted = false) and
    case
      when channel_slug = any (coalesce((select public.chat_canais_com_leitura('premium')), '{}'::text[])) then (select public.chat_eh_premium())
      when channel_slug = any (coalesce((select public.chat_canais_com_leitura('admin')), '{}'::text[])) then (select public.chat_eh_admin())
      else (select public.is_active_member())
    end
  );

-- Escrita: as colunas protegidas da 111 ficam iguais; o acesso ao canal passa a vir da tabela.
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and telegram_sender is null
    and telegram_message_id is null
    and outcome is null
    and coalesce(is_deleted, false) = false
    and coalesce(message_type, 'text') in ('text', 'image', 'video', 'link', 'document')
    -- quem não lê o canal também não escreve nele
    and case
      when channel_slug = any (coalesce((select public.chat_canais_com_leitura('premium')), '{}'::text[])) then (select public.chat_eh_premium())
      when channel_slug = any (coalesce((select public.chat_canais_com_leitura('admin')), '{}'::text[])) then (select public.chat_eh_admin())
      else (select public.is_active_member())
    end
    and case
      when channel_slug = any (coalesce((select public.chat_canais_com_escrita('vip')), '{}'::text[])) then (select public.chat_eh_vip_ou_admin())
      when channel_slug = any (coalesce((select public.chat_canais_com_escrita('ninguem')), '{}'::text[])) then false
      else true
    end
  );

commit;

-- Verificação (correr à parte, com a sessão de um membro sem Premium no SQL editor não dá —
-- usar a app): select slug, leitura, escrita, icone from chat_channels order by position;
