-- 116 — MESTRES NOSSAS: as contas-mestre das estratégias passam a ser contas simuladas da casa
-- (MTM Funded, motor `sim`) e o NOSSO motor (serviço VPS mtm-copia-contas) envia directamente para as
-- contas dos clientes — entradas, parciais, BE, trailing e saídas — sem CopyFactory.
--
--   sinal ──▶ conta mestre SIM (funded_positions; gestão = sinais_config da estratégia, motor VPS)
--                │ trigger 078/083 (copia_funded_emitir) — 1 evento por facto × rota
--                ▼
--          copia_eventos ──▶ mtm-copia-contas ──▶ decisão (esta migração) ──▶ MT4/MT5 (REST /trade)
--                                                                         └─▶ TradeLocker (API)
--
-- Nada aqui liga ordens reais. TODAS as fechaduras começam fechadas:
--   1. site_settings.mestres_motor = {"ligado": false, "kill": false, "live_desbloqueado": false}
--      · ligado=false  → o serviço não processa rotas `mestres` (ficam na fila, nada é enviado)
--      · kill=true     → PÁRA TUDO em ≤ 2 s (o serviço relê este valor de 2 em 2 s e verifica-o
--                        outra vez imediatamente antes de cada escrita)
--      · live_desbloqueado=false → a BASE recusa pôr uma estratégia ou uma conta em live
--   2. mestres_estrategias.modo: desligado | sombra | live   (por estratégia; nasce desligado)
--   3. mestres_contas.modo:      sombra | live               (por conta; nasce sombra)
--   4. MESTRES_ESCRITA=1 no processo do VPS (sem isto, tudo é sombra)
-- Uma ordem só sai com as quatro abertas E a CopyFactory da estratégia cortada e reverificada
-- (copyfactory_cortado_em, gravado só pelo script scripts/mestres/cortar-copyfactory.ts).
--
-- Aditiva e idempotente. NÃO APLICAR sem rever.

begin;

-- ── 0. interruptor global + kill-switch ─────────────────────────────────────
insert into public.site_settings (key, value, description)
values ('mestres_motor', '{"ligado": false, "kill": false, "live_desbloqueado": false}'::jsonb,
        'Mestres nossas: interruptor global (ligado), kill-switch (kill) e desbloqueio do live. Serviço mtm-copia-contas relê de 2 em 2 s.')
on conflict (key) do nothing;

-- ── 1. estratégias com mestre nossa ─────────────────────────────────────────
create table if not exists public.mestres_estrategias (
  provider_id uuid primary key references public.mtmauto_providers(id) on delete cascade,
  slug text not null unique,
  -- a conta simulada da casa que é a MESTRE (mtm_trading_accounts, motor sim)
  conta_mestre_id uuid not null references public.mtm_trading_accounts(id),
  -- propagação mestre → contas dos clientes
  modo text not null default 'desligado' check (modo in ('desligado', 'sombra', 'live')),
  -- sinal → mestre SIM directamente (GoldKiller/Sensei; Edge/King/Wolf já entram assim pelo pv-relay)
  sinal_modo text not null default 'desligado' check (sinal_modo in ('desligado', 'sombra', 'live')),
  -- Tap to Trade executado pelo motor (gestão posterior pela mestre da mesma estratégia)
  t2t_modo text not null default 'desligado' check (t2t_modo in ('desligado', 'sombra', 'live')),
  -- contas do MTM Auto (mtmauto_accounts) como destino. Em live só depois de o mtm-auto deixar de
  -- executar esta estratégia (mtmauto_providers.espelhar=false confirmado → mtmauto_cortado_em).
  incluir_mtmauto boolean not null default false,
  mtmauto_cortado_em timestamptz,
  -- estratégias CopyFactory que copiam o mesmo sinal (ex.: GoldKiller Wl1B/SDNb, Sensei hbKq/Oca7).
  -- Live só com o corte feito E relido (script cortar-copyfactory.ts): senão, ordens em dobro.
  copyfactory_ids text[] not null default '{}',
  copyfactory_cortado_em timestamptz,
  copyfactory_verificacao jsonb,
  -- uma abertura mais velha do que isto (fila parada, kill-switch levantado) é recusada
  max_atraso_abertura_s int not null default 30 check (max_atraso_abertura_s between 5 and 600),
  notas text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create or replace function public.mestres_estrategias_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_live boolean;
begin
  new.updated_at := now();
  -- mudar a lista de estratégias CopyFactory invalida o corte verificado
  if tg_op = 'UPDATE' and new.copyfactory_ids is distinct from old.copyfactory_ids
     and new.copyfactory_cortado_em is not distinct from old.copyfactory_cortado_em then
    new.copyfactory_cortado_em := null;
    new.copyfactory_verificacao := null;
  end if;
  v_live := new.modo = 'live' or new.sinal_modo = 'live' or new.t2t_modo = 'live';
  if v_live then
    select value into v_cfg from public.site_settings where key = 'mestres_motor';
    if coalesce((v_cfg ->> 'live_desbloqueado')::boolean, false) is not true then
      raise exception 'mestres_estrategias: live bloqueado (site_settings.mestres_motor.live_desbloqueado=false)';
    end if;
    if new.modo = 'live' and cardinality(new.copyfactory_ids) > 0 and new.copyfactory_cortado_em is null then
      raise exception 'mestres_estrategias: % tem estratégias CopyFactory (%) por cortar — correr scripts/mestres/cortar-copyfactory.ts',
        new.slug, array_to_string(new.copyfactory_ids, ',');
    end if;
    if new.modo = 'live' and new.incluir_mtmauto and new.mtmauto_cortado_em is null then
      raise exception 'mestres_estrategias: % inclui contas MTM Auto mas o mtm-auto ainda executa esta estratégia (mtmauto_cortado_em vazio)', new.slug;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mestres_estrategias_guarda_trg on public.mestres_estrategias;
create trigger mestres_estrategias_guarda_trg before insert or update on public.mestres_estrategias
  for each row execute function public.mestres_estrategias_guarda();

-- ── 2. contas dos clientes (modo, limites, falhas) ──────────────────────────
create table if not exists public.mestres_contas (
  -- identidade FÍSICA (lib/copia-contas/regras.chaveFisica): 'mt:<login>@<servidor>' · 'tl:<env>:<id>'
  conta_chave text primary key,
  conta_ref text not null check (conta_ref ~ '^(site|auto|wt):[0-9a-f-]{36}$'),
  user_id uuid,
  modo text not null default 'sombra' check (modo in ('sombra', 'live')),
  -- contas com bónus (ex.: Monaxa 20X): lote FIXO, nunca risco % sobre um saldo inflacionado
  lote_fixo_forcado numeric check (lote_fixo_forcado is null or (lote_fixo_forcado > 0 and lote_fixo_forcado <= 5)),
  -- limite de exposição (somado entre TODAS as estratégias nesta conta)
  max_posicoes int not null default 10 check (max_posicoes between 1 and 200),
  max_risco_total_pct numeric not null default 6 check (max_risco_total_pct > 0 and max_risco_total_pct <= 50),
  max_lote_total numeric check (max_lote_total is null or max_lote_total > 0),
  -- falhas seguidas (o serviço incrementa; um sucesso põe a 0)
  falhas_seguidas int not null default 0,
  ultima_falha_em timestamptz,
  ultima_falha text,
  alerta_em timestamptz,
  -- bloqueada = não ABRE (as saídas continuam, para proteger o que está aberto)
  bloqueada_em timestamptz,
  bloqueio_motivo text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.mestres_contas_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb;
begin
  new.updated_at := now();
  if new.modo = 'live' and (tg_op = 'INSERT' or old.modo is distinct from 'live') then
    select value into v_cfg from public.site_settings where key = 'mestres_motor';
    if coalesce((v_cfg ->> 'live_desbloqueado')::boolean, false) is not true then
      raise exception 'mestres_contas: live bloqueado (site_settings.mestres_motor.live_desbloqueado=false)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mestres_contas_guarda_trg on public.mestres_contas;
create trigger mestres_contas_guarda_trg before insert or update on public.mestres_contas
  for each row execute function public.mestres_contas_guarda();

-- ── 3. registo de CADA ordem (pedido, resposta, latência) ───────────────────
create table if not exists public.mestres_ordens (
  id bigserial primary key,
  -- chave do evento na cópia (copia_eventos.chave = '<rota>:<posição>:<tipo>:<disc>') — a rota já é
  -- mestre × conta, por isso a chave é evento × conta. Um sufixo ':reancorar' marca o ajuste de SL/TP.
  chave text not null,
  evento_id bigint,
  rota_id uuid,
  estrategia text,
  conta_chave text,
  conta_ref text,
  tipo text not null check (tipo in ('abrir', 'modificar', 'parcial', 'fechar', 'nada')),
  modo text not null check (modo in ('sombra', 'live')),
  estado text not null check (estado in ('sombra', 'enviando', 'ok', 'recusado', 'erro', 'bloqueado', 'saltado')),
  pedido jsonb,
  resposta jsonb,
  erro text,
  latencia_corretora_ms int,
  -- facto na mestre → resposta da corretora
  latencia_total_ms int,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- NUNCA duas ordens live do mesmo evento na mesma conta: a linha 'enviando' é gravada ANTES da ordem
create unique index if not exists mestres_ordens_live_unica on public.mestres_ordens (chave) where modo = 'live';
create index if not exists mestres_ordens_conta_idx on public.mestres_ordens (conta_chave, criado_em desc);
create index if not exists mestres_ordens_estrategia_idx on public.mestres_ordens (estrategia, criado_em desc);
create index if not exists mestres_ordens_criado_idx on public.mestres_ordens (criado_em desc);

-- ── 4. anti-duplicação ENTRE CAMINHOS (cópia da estratégia × T2T × legado) ─
-- O mesmo trade (par + direcção + balde de entrada + hora, lib/mtmfunded/estrategias-sinais
-- impressaoDoTrade) só abre UMA vez por conta física, venha por onde vier.
create table if not exists public.mestres_execucoes_conta (
  conta_chave text not null,
  impressao text not null,
  origem text not null check (origem in ('estrategia', 't2t', 'legado')),
  ref text,
  criado_em timestamptz not null default now(),
  primary key (conta_chave, impressao)
);
create index if not exists mestres_execucoes_conta_criado_idx on public.mestres_execucoes_conta (criado_em);

-- ── 5. Tap to Trade pelo motor: o aceite de UM cliente numa posição da mestre ─
create table if not exists public.mestres_t2t_aceites (
  rota_id uuid not null references public.copia_rotas(id) on delete cascade,
  origem_posicao_id text not null,
  user_id uuid not null,
  chat_message_id text,
  aceite_em timestamptz not null default now(),
  primary key (rota_id, origem_posicao_id)
);

-- ── 6. sinal → mestre SIM (sombra: o que abriria; live: o que abriu) ─────────
create table if not exists public.mestres_sinais (
  id bigserial primary key,
  estrategia text not null,
  chave text not null,
  modo text not null check (modo in ('sombra', 'live')),
  symbol text, direcao text, entrada numeric, sl numeric, tps numeric[],
  resultado jsonb,
  criado_em timestamptz not null default now(),
  unique (estrategia, chave, modo)
);

-- ── 7. alertas (conta que falha N vezes, corte por fazer, kill accionado) ───
create table if not exists public.mestres_alertas (
  id bigserial primary key,
  tipo text not null,
  conta_chave text,
  estrategia text,
  mensagem text not null,
  criado_em timestamptz not null default now(),
  visto_em timestamptz
);
create index if not exists mestres_alertas_novos_idx on public.mestres_alertas (criado_em desc) where visto_em is null;

-- ── 8. rotas da cópia: marca das rotas do motor e tipo ──────────────────────
alter table public.copia_rotas
  add column if not exists mestres boolean not null default false,
  add column if not exists tipo_rota text not null default 'conta',
  add column if not exists estrategia_slug text;
alter table public.copia_rotas drop constraint if exists copia_rotas_tipo_rota_check;
alter table public.copia_rotas add constraint copia_rotas_tipo_rota_check check (tipo_rota in ('conta', 'estrategia', 't2t'));
-- a mesma conta pode seguir a estratégia E aceitar T2T da mesma mestre: o par passa a incluir o tipo
drop index if exists public.copia_rotas_par_unico;
create unique index if not exists copia_rotas_par_unico
  on public.copia_rotas (origem_chave, destino_chave, tipo_rota) where estado <> 'recusada';
create index if not exists copia_rotas_mestres_idx on public.copia_rotas (estrategia_slug, tipo_rota) where mestres;
create index if not exists copia_rotas_mestres_destino_idx on public.copia_rotas (destino_chave) where mestres;
-- risco em % da equity de cada cópia aberta (limite de exposição somado por conta)
alter table public.copia_posicoes add column if not exists risco_pct numeric;

-- ── 9. limpeza (chamada pelo serviço 1×/h) ──────────────────────────────────
create or replace function public.mestres_limpar(p_dias int default 30) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  delete from public.mestres_ordens where criado_em < now() - make_interval(days => greatest(7, p_dias));
  get diagnostics v = row_count;
  delete from public.mestres_execucoes_conta where criado_em < now() - interval '3 days';
  delete from public.mestres_sinais where criado_em < now() - make_interval(days => greatest(7, p_dias));
  return v;
end $$;

-- ── 10. semente: as estratégias ACTIVAS, todas DESLIGADAS ──────────────────
-- Mestre = conta simulada da casa que já existe (nada se cria aqui):
--   Edge/King/Wolf → mtmauto_providers.funded_account_id (já são mestres SIM, sinais pelo pv-relay)
--   GoldKiller/Sensei → espelho 10K (espelho_funded_account_id), que passa a receber o sinal directo
-- Premium (desligado pelo dono a 17/09), Aurum Flow (inactivo) e MTM Scanner (nunca executa) ficam fora.
insert into public.mestres_estrategias (provider_id, slug, conta_mestre_id, copyfactory_ids, notas)
select p.id, p.slug,
       coalesce(p.funded_account_id, p.espelho_funded_account_id),
       case p.slug when 'Goldkiller' then array['Wl1B', 'SDNb'] when 'sensei' then array['hbKq', 'Oca7'] else '{}'::text[] end,
       'semente 116 — desligada'
  from public.mtmauto_providers p
 where p.apagado_em is null and p.ativo
   and p.slug in ('Goldkiller', 'sensei', 'mtm-auto-edge', 'mtm-auto-king', 'mtm-auto-wolf')
   and coalesce(p.funded_account_id, p.espelho_funded_account_id) is not null
on conflict (provider_id) do nothing;

-- ── RLS: só o servidor (service role) lê e escreve ──────────────────────────
alter table public.mestres_estrategias enable row level security;
alter table public.mestres_contas enable row level security;
alter table public.mestres_ordens enable row level security;
alter table public.mestres_execucoes_conta enable row level security;
alter table public.mestres_t2t_aceites enable row level security;
alter table public.mestres_sinais enable row level security;
alter table public.mestres_alertas enable row level security;
revoke all on public.mestres_estrategias, public.mestres_contas, public.mestres_ordens, public.mestres_execucoes_conta,
  public.mestres_t2t_aceites, public.mestres_sinais, public.mestres_alertas from anon, authenticated;
revoke all on function public.mestres_estrategias_guarda() from public, anon, authenticated;
revoke all on function public.mestres_contas_guarda() from public, anon, authenticated;
revoke all on function public.mestres_limpar(int) from public, anon, authenticated;
grant execute on function public.mestres_limpar(int) to service_role;

commit;
