-- 068 — MTM Funded: COPIAR a conta simulada para a conta do próprio aluno (MT5 via MetaApi).
--
-- O aluno negoceia no WebTrader (conta `sim`) e quer ver as mesmas trades na sua conta MT5 — a
-- que já ligou no MTM Copy ou no MTM Auto. Não há conta nova nem vaga nova: o destino é uma das
-- contas que ele já tem, contada pelas regras de contas que já existem (lib/entitlements.ts).
--
-- Como passa a informação, e porquê assim:
--
--   funded_positions ──(trigger)──▶ funded_copy_events (OUTBOX) ──▶ serviço no VPS ──▶ MetaApi
--                                                                    │
--                                                                    └──▶ funded_copy_positions
--
-- · O trigger escreve o evento NA MESMA TRANSACÇÃO da posição. Se a posição existe, o evento
--   existe; se a escrita da posição falhou, não há evento. Um «avisa o copiador» feito pelo site
--   depois da escrita perdia-se sempre que a função serverless morresse entre as duas.
-- · `chave` única: o mesmo facto nunca entra duas vezes (um retry do site, dois triggers).
-- · O serviço reclama eventos com `for update skip locked` e um PRAZO (reclamado_ate): um
--   processo que morra a meio devolve os eventos à fila quando o prazo acaba.
-- · `funded_copy_positions` é a ponte posição simulada → posição na corretora. É ela que torna
--   tudo repetível sem duplicar: abrir duas vezes a mesma posição vê a linha e não abre.
--
-- As SAÍDAS (fecho, parcial, SL/TP) de posições já copiadas geram evento MESMO com o copiador em
-- pausa — pausar impede abrir coisas novas, nunca deixa uma posição órfã na conta real.

-- ── 1. copiadores: uma conta simulada → um destino ────────────────────────
create table if not exists public.funded_copiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  destino_tipo text not null check (destino_tipo in ('mtmcopy', 'mtmauto', 'tradelocker')),
  -- id da linha em mtmcopy_connections / mtmauto_accounts (tradelocker: fase 2)
  destino_id uuid not null,
  modo_lote text not null default 'proporcional_saldo'
    check (modo_lote in ('proporcional_saldo', 'multiplicador', 'fixo', 'risco_pct')),
  valor numeric,
  lote_max numeric check (lote_max is null or lote_max > 0),
  max_posicoes int check (max_posicoes is null or max_posicoes > 0),
  -- % da equity do destino no início do dia da corretora (22:00 UTC)
  perda_diaria_max numeric check (perda_diaria_max is null or perda_diaria_max > 0),
  copiar_sl boolean not null default true,
  copiar_tp boolean not null default true,
  -- vazio = todos os símbolos
  simbolos text[] not null default '{}',
  ativo boolean not null default true,
  pausado_motivo text,
  -- âncora da perda diária, mantida pelo serviço
  ancora_equity numeric,
  ancora_dia date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, destino_tipo, destino_id)
);
create index if not exists funded_copiers_conta_idx on public.funded_copiers (account_id) where ativo;
create index if not exists funded_copiers_user_idx on public.funded_copiers (user_id);

-- Só se copia a SUA conta para a SUA conta. Verificado na base, não só na API: uma linha escrita à
-- mão no painel com o destino de outra pessoa abriria ordens no dinheiro de outra pessoa.
create or replace function public.funded_copiers_dono() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_dono_conta uuid; v_dono_destino uuid;
begin
  select user_id into v_dono_conta from public.mtm_trading_accounts where id = new.account_id and motor = 'sim';
  if v_dono_conta is null then raise exception 'funded_copiers: a conta de origem tem de ser simulada e ter dono'; end if;
  if new.destino_tipo = 'mtmcopy' then
    select user_id into v_dono_destino from public.mtmcopy_connections where id = new.destino_id;
  elsif new.destino_tipo = 'mtmauto' then
    select user_id into v_dono_destino from public.mtmauto_accounts where id = new.destino_id;
  else
    raise exception 'funded_copiers: destino % ainda não suportado', new.destino_tipo;
  end if;
  if v_dono_destino is null or v_dono_destino <> v_dono_conta or new.user_id <> v_dono_conta then
    raise exception 'funded_copiers: a conta simulada e o destino têm de ser do mesmo utilizador';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists funded_copiers_dono_trg on public.funded_copiers;
create trigger funded_copiers_dono_trg before insert or update of account_id, destino_tipo, destino_id, user_id
  on public.funded_copiers for each row execute function public.funded_copiers_dono();

-- ── 2. outbox ─────────────────────────────────────────────────────────────
create table if not exists public.funded_copy_events (
  id bigserial primary key,
  account_id uuid not null,
  -- a posição MÃE (num parcial é a mae_id): é a chave de ordem da fila
  position_id uuid not null,
  tipo text not null check (tipo in ('open', 'modify', 'partial', 'close')),
  payload jsonb not null default '{}',
  chave text not null unique,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas int not null default 0,
  erro text,
  proxima_em timestamptz,
  reclamado_ate timestamptz
);
create index if not exists funded_copy_events_fila_idx on public.funded_copy_events (id) where processado_em is null;
create index if not exists funded_copy_events_pos_idx on public.funded_copy_events (position_id, id);
create index if not exists funded_copy_events_conta_idx on public.funded_copy_events (account_id, id desc);

-- ── 3. ponte posição simulada → posição no destino ────────────────────────
create table if not exists public.funded_copy_positions (
  id uuid primary key default gen_random_uuid(),
  copier_id uuid not null references public.funded_copiers(id) on delete cascade,
  funded_position_id uuid not null,
  dest_position_id text,
  dest_symbol text,
  -- lote da posição simulada e lote enviado ao destino, ambos À ABERTURA
  volume_origem numeric not null,
  dest_volume_origem numeric,
  -- fracção já fechada (0..1), acumulada parcial a parcial
  fechado_pct numeric not null default 0,
  -- enviando → aberta → fechada | recusada | erro
  estado text not null default 'enviando' check (estado in ('enviando', 'aberta', 'fechada', 'recusada', 'erro')),
  erro text,
  client_id text,
  preco_origem numeric,
  preco_destino numeric,
  latencia_ms int,
  parciais_aplicados text[] not null default '{}',
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (copier_id, funded_position_id)
);
create index if not exists funded_copy_positions_abertas_idx on public.funded_copy_positions (funded_position_id)
  where estado in ('enviando', 'aberta');

-- ── RLS: cada um lê o que é seu; escrever só pelo servidor ─────────────────
alter table public.funded_copiers enable row level security;
alter table public.funded_copy_events enable row level security;
alter table public.funded_copy_positions enable row level security;

drop policy if exists funded_copiers_ler on public.funded_copiers;
create policy funded_copiers_ler on public.funded_copiers for select to authenticated using (user_id = auth.uid());

drop policy if exists funded_copy_positions_ler on public.funded_copy_positions;
create policy funded_copy_positions_ler on public.funded_copy_positions for select to authenticated
  using (exists (select 1 from public.funded_copiers c where c.id = copier_id and c.user_id = auth.uid()));

revoke all on public.funded_copiers, public.funded_copy_events, public.funded_copy_positions from anon;
revoke insert, update, delete on public.funded_copiers, public.funded_copy_positions from authenticated;
revoke all on public.funded_copy_events from authenticated;

-- ── 4. o trigger que escreve a outbox ─────────────────────────────────────
create or replace function public.funded_copy_emitir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mae public.funded_positions%rowtype;
  v_pct numeric;
  v_copiado boolean;
  v_ativo boolean;
begin
  select exists (select 1 from public.funded_copiers c where c.account_id = new.account_id and c.ativo) into v_ativo;

  -- ABRIR: só com um copiador activo.
  if tg_op = 'INSERT' and new.estado = 'aberta' then
    if not v_ativo then return null; end if;
    insert into public.funded_copy_events (account_id, position_id, tipo, payload, chave)
    values (new.account_id, new.id, 'open', jsonb_build_object(
      'symbol', new.symbol, 'direcao', new.direcao, 'volume', new.volume, 'preco_entrada', new.preco_entrada,
      'sl', new.sl, 'tp', new.tp, 'origem', new.origem, 'aberta_em', new.aberta_em), 'open:' || new.id)
    on conflict (chave) do nothing;
    return null;
  end if;

  -- PARCIAL: nasce uma filha fechada. pct = o que fechou ÷ o que havia antes do parcial.
  if tg_op = 'INSERT' and new.estado = 'fechada' and new.mae_id is not null then
    select exists (select 1 from public.funded_copy_positions p where p.funded_position_id = new.mae_id
                   and p.estado in ('enviando', 'aberta')) into v_copiado;
    if not (v_ativo or v_copiado) then return null; end if;
    select * into v_mae from public.funded_positions where id = new.mae_id;
    if not found then return null; end if;
    -- a mãe já está reduzida (funded_fechar_parcial reduz antes de inserir a filha)
    v_pct := new.volume / nullif(new.volume + case when v_mae.estado = 'aberta' then v_mae.volume else 0 end, 0);
    insert into public.funded_copy_events (account_id, position_id, tipo, payload, chave)
    values (new.account_id, new.mae_id, 'partial', jsonb_build_object(
      'symbol', new.symbol, 'direcao', new.direcao, 'volume_fechado', new.volume,
      'volume_restante', case when v_mae.estado = 'aberta' then v_mae.volume else 0 end,
      'pct', v_pct, 'preco_fecho', new.preco_fecho, 'filha_id', new.id), 'partial:' || new.id)
    on conflict (chave) do nothing;
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select exists (select 1 from public.funded_copy_positions p where p.funded_position_id = new.id
                   and p.estado in ('enviando', 'aberta')) into v_copiado;
    if not (v_ativo or v_copiado) then return null; end if;

    -- FECHAR
    if old.estado = 'aberta' and new.estado = 'fechada' then
      insert into public.funded_copy_events (account_id, position_id, tipo, payload, chave)
      values (new.account_id, new.id, 'close', jsonb_build_object(
        'symbol', new.symbol, 'direcao', new.direcao, 'preco_fecho', new.preco_fecho,
        'motivo', new.motivo_fecho), 'close:' || new.id)
      on conflict (chave) do nothing;
      return null;
    end if;

    -- MODIFICAR SL/TP (a chave leva a transacção: duas mudanças iguais em momentos diferentes são dois factos)
    if old.estado = 'aberta' and new.estado = 'aberta'
       and (old.sl is distinct from new.sl or old.tp is distinct from new.tp) then
      insert into public.funded_copy_events (account_id, position_id, tipo, payload, chave)
      values (new.account_id, new.id, 'modify', jsonb_build_object(
        'symbol', new.symbol, 'direcao', new.direcao, 'preco_entrada', new.preco_entrada,
        'sl', new.sl, 'tp', new.tp), 'modify:' || new.id || ':' || txid_current())
      on conflict (chave) do nothing;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists funded_copy_emitir_trg on public.funded_positions;
create trigger funded_copy_emitir_trg after insert or update on public.funded_positions
  for each row execute function public.funded_copy_emitir();

-- ── 5. reclamar trabalho (o serviço do VPS) ───────────────────────────────
-- Um evento só sai se nenhum evento ANTERIOR da mesma posição estiver por processar: o fecho
-- nunca passa à frente da abertura que ainda está à espera do retry.
create or replace function public.funded_copy_reclamar(n int default 50, p_prazo_s int default 120)
returns setof public.funded_copy_events
language plpgsql security definer set search_path = public as $$
begin
  return query
  with alvo as (
    select e.id from public.funded_copy_events e
     where e.processado_em is null
       and (e.proxima_em is null or e.proxima_em <= now())
       and (e.reclamado_ate is null or e.reclamado_ate <= now())
       and not exists (select 1 from public.funded_copy_events a
                        where a.position_id = e.position_id and a.id < e.id and a.processado_em is null)
     order by e.id
     limit greatest(1, least(n, 500))
     for update skip locked
  )
  update public.funded_copy_events e
     set reclamado_ate = now() + make_interval(secs => p_prazo_s)
    from alvo where e.id = alvo.id
  returning e.*;
end $$;

revoke all on function public.funded_copy_reclamar(int, int) from public, anon, authenticated;
grant execute on function public.funded_copy_reclamar(int, int) to service_role;
revoke all on function public.funded_copy_emitir() from public, anon, authenticated;
revoke all on function public.funded_copiers_dono() from public, anon, authenticated;

-- ── 6. fecho PARCIAL atómico ──────────────────────────────────────────────
-- O site fazia três escritas (reduzir a mãe, inserir a filha, somar o saldo). Um motor a fechar
-- a mesma posição pelo SL entre a primeira e a segunda deixava meia posição sem registo — e o
-- copiador lia um parcial que nunca aconteceu. Numa função: tudo ou nada, e a mãe fica trancada.
-- Devolve o id da filha, ou null se a posição já não estava aberta com volume suficiente.
create or replace function public.funded_fechar_parcial(
  p_mae uuid, p_volume numeric, p_preco numeric, p_pnl numeric, p_tick jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare m public.funded_positions%rowtype; v_filha uuid; v_com numeric; v_swap numeric;
begin
  select * into m from public.funded_positions where id = p_mae and estado = 'aberta' for update;
  if not found or p_volume <= 0 or p_volume >= m.volume then return null; end if;
  -- os mesmos arredondamentos de planearFecho (lib/mtmfunded/simulado/ordens.ts)
  v_com := round(m.comissao * (p_volume / m.volume), 2);
  v_swap := round(coalesce(m.swap, 0) * (p_volume / m.volume), 2);
  update public.funded_positions
     set volume = round(m.volume - p_volume, 2), comissao = round(m.comissao - v_com, 2),
         swap = round(coalesce(m.swap, 0) - v_swap, 2)
   where id = m.id;
  insert into public.funded_positions
    (account_id, symbol, direcao, volume, preco_entrada, sl, tp, comissao, swap, estado, preco_fecho, pnl,
     motivo_fecho, origem, ideia_ref, tick_entrada, tick_fecho, mae_id, aberta_em, fechada_em)
  values
    (m.account_id, m.symbol, m.direcao, p_volume, m.preco_entrada, m.sl, m.tp, v_com, v_swap, 'fechada', p_preco, p_pnl,
     'manual', m.origem, m.ideia_ref, m.tick_entrada, p_tick, m.id, m.aberta_em, now())
  returning id into v_filha;
  update public.mtm_trading_accounts set sim_saldo = coalesce(sim_saldo, 0) + p_pnl, updated_at = now()
   where id = m.account_id;
  return v_filha;
end $$;

revoke all on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.funded_fechar_parcial(uuid, numeric, numeric, numeric, jsonb) to service_role;

-- ── 7. Realtime (o serviço acorda ao evento; a sondagem de 2 s é a rede) ──
do $$ begin
  alter publication supabase_realtime add table public.funded_copy_events;
exception when duplicate_object or undefined_object then null; end $$;

-- ── 8. interruptor dos destinos reais (começa desligado: só demo, excepto admin) ──
insert into public.site_settings (key, value, description)
values ('funded_copier_reais', 'false'::jsonb, 'MTM Funded → cópia para contas REAIS (false = só demo, excepto admin)')
on conflict (key) do nothing;
