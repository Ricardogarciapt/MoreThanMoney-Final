-- 184 · PrimeGate (aplicada em produção com o nome «183_primegate» a 06/10, antes da renumeração) (PrimeVerse) — verificar se um cliente está no ramo de IB do Ricardo.
--
-- API: POST hub.primeverse.ca/api/primegate/v1/registration { email, uid } com Bearer pg_ib_…
-- «confirmed» = o par email+UID da PU Prime está no upload de organização activo e no nosso ramo.
-- NÃO confirma KYC, depósitos nem trading. «undetermined» NUNCA é recusa: volta-se a verificar.
--
-- Tudo aditivo: três tabelas novas só do servidor (RLS ligado e SEM políticas → só a service role
-- lê e escreve), duas colunas novas em `profiles`, uma função de quota e um gatilho que protege
-- as colunas novas de escrita pelo próprio cliente.

-- ───────────────────────────── verificações (uma linha por par email+UID) ─────────────────────────────
create table if not exists public.primegate_verificacoes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.profiles(id) on delete set null,
  chat_id              text,                       -- lead do Telegram, quando veio de lá
  email                text not null,
  uid_puprime          text not null,
  estado               text not null default 'undetermined'
                         check (estado in ('confirmed', 'undetermined', 'erro')),
  motivo               text,                       -- porquê (texto curto, sem segredos)
  http_status          integer,
  corpo_cru            jsonb,                      -- SEMPRE o corpo devolvido, tal e qual
  origem               text,                       -- 'site' | 'telegram' | 'admin' | 'cron' | 'teste'
  tentativas           integer not null default 0,
  verificado_em        timestamptz,
  confirmado_em        timestamptz,
  proxima_tentativa_em timestamptz,                -- null = não há mais tentativas agendadas
  alerta_enviado_em    timestamptz,                -- alerta ao admin no fim das tentativas
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

create unique index if not exists primegate_verificacoes_par_idx
  on public.primegate_verificacoes (lower(email), uid_puprime);
create index if not exists primegate_verificacoes_proxima_idx
  on public.primegate_verificacoes (proxima_tentativa_em)
  where proxima_tentativa_em is not null;
create index if not exists primegate_verificacoes_user_idx on public.primegate_verificacoes (user_id);
create index if not exists primegate_verificacoes_chat_idx on public.primegate_verificacoes (chat_id);
create index if not exists primegate_verificacoes_verificado_idx
  on public.primegate_verificacoes (verificado_em desc nulls last);

alter table public.primegate_verificacoes enable row level security;

-- ───────────────────────────── quota partilhada entre instâncias ─────────────────────────────
-- Uma linha por janela: 'm:AAAA-MM-DDTHH:MI' (minuto UTC), 'd:AAAA-MM-DD' (dia UTC) e a linha
-- especial 'bloqueio' (quando a PrimeVerse responde 429 com Retry-After).
create table if not exists public.primegate_quota (
  janela        text primary key,
  contagem      integer not null default 0,
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.primegate_quota enable row level security;

-- ───────────────────────────── configuração (chave cifrada) ─────────────────────────────
-- NÃO vai para `site_settings`: essa tabela é legível por qualquer pessoa (política
-- «Anyone can read site settings»). Mesmo cifrada, a chave não tem nada que fazer num sítio público.
create table if not exists public.primegate_config (
  id             text primary key default 'primegate' check (id = 'primegate'),
  chave_cifrada  text,                -- AES-256-GCM (lib/mtmfunded/credenciais · MTMFUNDED_CRED_KEY)
  ultimos4       text,
  gravada_em     timestamptz,
  gravada_por    text,
  limite_minuto  integer not null default 10,
  limite_dia     integer not null default 1000,
  atualizado_em  timestamptz not null default now()
);
alter table public.primegate_config enable row level security;

-- ───────────────────────────── espelho no perfil ─────────────────────────────
-- O UID reutiliza `profiles.broker_uid` (já existe). Estas duas colunas só espelham a verdade,
-- que vive em `primegate_verificacoes`.
alter table public.profiles add column if not exists primegate_estado text
  check (primegate_estado is null or primegate_estado in ('confirmed', 'undetermined', 'erro'));
alter table public.profiles add column if not exists primegate_confirmado_em timestamptz;

-- O cliente pode editar o próprio perfil (política authenticated_users_update_own_profile).
-- Sem isto, bastava um PATCH para se dar a si mesmo «confirmed».
create or replace function public.primegate_proteger_perfil()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') in ('authenticated', 'anon')
     or coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') in ('authenticated', 'anon') then
    new.primegate_estado := old.primegate_estado;
    new.primegate_confirmado_em := old.primegate_confirmado_em;
  end if;
  return new;
end $$;

drop trigger if exists profiles_primegate_proteger on public.profiles;
create trigger profiles_primegate_proteger
  before update of primegate_estado, primegate_confirmado_em on public.profiles
  for each row execute function public.primegate_proteger_perfil();

-- ───────────────────────────── reservar um pedido (atómico) ─────────────────────────────
-- Devolve { ok, motivo?, minuto, dia, bloqueado_ate? }. Bloqueia ANTES de contar: o 11.º pedido
-- do minuto não chega a sair (e não gasta quota).
create or replace function public.primegate_reservar(p_max_minuto integer, p_max_dia integer)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  agora   timestamptz := now();
  j_min   text := 'm:' || to_char(agora at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI');
  j_dia   text := 'd:' || to_char(agora at time zone 'utc', 'YYYY-MM-DD');
  c_min   integer;
  c_dia   integer;
  bloq    timestamptz;
begin
  select bloqueado_ate into bloq from primegate_quota where janela = 'bloqueio';
  if bloq is not null and bloq > agora then
    return jsonb_build_object('ok', false, 'motivo', 'retry_after', 'bloqueado_ate', bloq);
  end if;

  insert into primegate_quota (janela, contagem) values (j_min, 0), (j_dia, 0)
    on conflict (janela) do nothing;
  -- Ordem fixa dos bloqueios (minuto e depois dia) para não haver impasse entre instâncias.
  select contagem into c_min from primegate_quota where janela = j_min for update;
  select contagem into c_dia from primegate_quota where janela = j_dia for update;

  if c_min >= p_max_minuto then
    return jsonb_build_object('ok', false, 'motivo', 'minuto', 'minuto', c_min, 'dia', c_dia);
  end if;
  if c_dia >= p_max_dia then
    return jsonb_build_object('ok', false, 'motivo', 'dia', 'minuto', c_min, 'dia', c_dia);
  end if;

  update primegate_quota set contagem = contagem + 1, atualizado_em = agora where janela in (j_min, j_dia);
  -- Limpeza barata: janelas de minuto com mais de 2 dias não servem para nada.
  delete from primegate_quota where janela like 'm:%' and atualizado_em < agora - interval '2 days';
  return jsonb_build_object('ok', true, 'minuto', c_min + 1, 'dia', c_dia + 1);
end $$;

-- Lição das RPC «definer abertas ao público»: só o servidor chama isto.
revoke all on function public.primegate_reservar(integer, integer) from public, anon, authenticated;
grant execute on function public.primegate_reservar(integer, integer) to service_role;
