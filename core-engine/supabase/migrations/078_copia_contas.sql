-- 078 — CÓPIA ENTRE CONTAS (MTM Funded · MT4 · MT5 · TradeLocker → MT4 · MT5 · TradeLocker · MTM Funded)
--
-- Uma ROTA liga uma conta de origem a uma conta de destino do MESMO dono. O motor do VPS
-- (services/copia-contas) lê a origem, escreve os factos na outbox `copia_eventos` e decide, por
-- rota, o que faria no destino. Nesta entrega o motor corre SÓ EM SOMBRA: calcula e regista a acção
-- pretendida e não envia nada.
--
--   origem ──(trigger funded | streaming MetaApi | sondagem TradeLocker)──▶ copia_eventos ──▶ motor
--                                                                                  │
--                                                     copia_posicoes (ponte origem ↔ destino) ◀─┘
--
-- TRÊS FECHADURAS até uma ordem real sair (todas começam fechadas):
--   1. site_settings.copia_contas            {"ligado": false}        — interruptor global do admin
--   2. copia_rotas.ativa = false              + modo = 'shadow'        — interruptor e modo por rota
--   3. site_settings.copia_contas_live_desbloqueado = false            — sem isto a BASE recusa
--      modo='live' (trigger abaixo), mesmo que a API seja chamada com «LIGAR». E o serviço só envia
--      com COPIA_ESCRITA=1 no VPS.
--
-- Supabase sob carga (15/09): nada aqui escreve por segundo. Eventos só nascem de factos de trading
-- (abrir/modificar/parcial/fechar), chaves únicas deduplicam, cada consulta nova tem índice e a
-- limpeza (`copia_limpar`) apaga eventos processados com mais de 7 dias.
--
-- Compatibilidade: `funded_copiers` (068) e o serviço mtm-funded-copier continuam intactos. A vista
-- `copia_rotas_todas` mostra as rotas novas E as do copiador antigo no mesmo formato; o motor novo
-- ignora as antigas (quem as executa continua a ser o copiador 068) até o dono decidir migrá-las.
--
-- Aditiva e idempotente. Não aplicar sem rever.

begin;

-- ── 0. interruptores (começam fechados) ─────────────────────────────────────
insert into public.site_settings (key, value, description)
values
  ('copia_contas', '{"ligado": false}'::jsonb,
   'Cópia entre contas: interruptor global do motor (false = o serviço não liga fontes nem processa eventos)'),
  ('copia_contas_live_desbloqueado', 'false'::jsonb,
   'Cópia entre contas: enquanto false a base recusa qualquer rota em modo live (só sombra)')
on conflict (key) do nothing;

-- ── 1. rotas ─────────────────────────────────────────────────────────────────
create table if not exists public.copia_rotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- plataforma e referência da linha: 'site:<uuid>' (mtmcopy_connections) · 'auto:<uuid>'
  -- (mtmauto_accounts) · 'wt:<uuid>' (webtrader_contas_mt5) · 'funded:<uuid>' (mtm_trading_accounts)
  origem_tipo text not null check (origem_tipo in ('mtmfunded', 'mt4', 'mt5', 'tradelocker')),
  origem_ref text not null check (origem_ref ~ '^(site|auto|wt|funded):[0-9a-f-]{36}$'),
  -- identidade FÍSICA da conta (a mesma conta ligada em dois produtos tem a mesma chave):
  -- 'mt:<login>@<servidor>' · 'tl:<env>:<accountId>' · 'mtmfunded:<uuid>'. É nela que se detectam ciclos.
  origem_chave text not null,
  destino_tipo text not null check (destino_tipo in ('mtmfunded', 'mt4', 'mt5', 'tradelocker')),
  destino_ref text not null check (destino_ref ~ '^(site|auto|wt|funded):[0-9a-f-]{36}$'),
  destino_chave text not null,
  rotulo text,
  modo_lote text not null default 'multiplicador'
    check (modo_lote in ('multiplicador', 'fixo', 'risco_pct', 'proporcional_saldo')),
  -- multiplicador: × · fixo: lotes · risco_pct: % da equity do destino · proporcional_saldo: × extra (1 = igual)
  valor numeric not null default 1 check (valor > 0),
  -- {"XAUUSD": "GOLD"} — sobrepõe-se à resolução automática
  mapa_simbolos jsonb not null default '{}'::jsonb,
  -- vazio = todos
  filtro_simbolos text[] not null default '{}',
  filtro_direcao text not null default 'ambas' check (filtro_direcao in ('ambas', 'buy', 'sell')),
  lote_max numeric check (lote_max is null or lote_max > 0),
  max_abertas int check (max_abertas is null or max_abertas > 0),
  copiar_sl boolean not null default true,
  copiar_tp boolean not null default true,
  copiar_parciais boolean not null default true,
  copiar_modificacoes boolean not null default true,
  fechar_com_origem boolean not null default true,
  -- interruptor por rota (começa desligado) e modo (começa em sombra)
  ativa boolean not null default false,
  modo text not null default 'shadow' check (modo in ('shadow', 'live')),
  -- pedido (cliente pediu) → aprovada | recusada (admin)
  estado text not null default 'pedido' check (estado in ('pedido', 'aprovada', 'recusada')),
  pedido_pelo_cliente boolean not null default false,
  notas text,
  aprovada_por uuid,
  aprovada_em timestamptz,
  pausada_motivo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copia_rotas_mesma_conta check (origem_chave <> destino_chave and origem_ref <> destino_ref),
  constraint copia_rotas_live_so_aprovada check (modo = 'shadow' or estado = 'aprovada')
);

create unique index if not exists copia_rotas_par_unico
  on public.copia_rotas (origem_chave, destino_chave) where estado <> 'recusada';
create index if not exists copia_rotas_user_idx on public.copia_rotas (user_id, created_at desc);
-- o motor: rotas vivas por fonte
create index if not exists copia_rotas_fonte_ativa_idx
  on public.copia_rotas (origem_tipo, origem_ref) where ativa and estado = 'aprovada';
create index if not exists copia_rotas_origem_chave_idx on public.copia_rotas (origem_chave) where estado <> 'recusada';

comment on table public.copia_rotas is 'Cópia entre contas do mesmo dono. Motor: services/copia-contas. Lógica: lib/copia-contas.';

-- Dono, fan-out, ciclos e a fechadura do live — verificados NA BASE, não só na API.
create or replace function public.copia_rotas_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_fanout int;
  v_ciclo boolean;
  v_live jsonb;
  v_max_fanout constant int := 5;
begin
  new.updated_at := now();

  if new.estado <> 'recusada' then
    select count(*) into v_fanout from public.copia_rotas r
     where r.origem_chave = new.origem_chave and r.estado <> 'recusada' and r.id <> new.id;
    if v_fanout >= v_max_fanout then
      raise exception 'copia_rotas: a conta de origem já tem % destinos (máximo %)', v_fanout, v_max_fanout;
    end if;

    -- ciclo: do destino novo consegue-se voltar à origem nova pelas rotas existentes?
    with recursive caminho(chave, fundo) as (
      select new.destino_chave, 0
      union
      select r.destino_chave, c.fundo + 1
        from public.copia_rotas r join caminho c on r.origem_chave = c.chave
       where r.estado <> 'recusada' and r.id <> new.id and c.fundo < 32
    )
    select exists (select 1 from caminho where chave = new.origem_chave) into v_ciclo;
    if v_ciclo then
      raise exception 'copia_rotas: esta rota fecha um ciclo (a origem voltaria a copiar-se a si própria)';
    end if;
  end if;

  if new.modo = 'live' and (tg_op = 'INSERT' or old.modo is distinct from 'live') then
    select value into v_live from public.site_settings where key = 'copia_contas_live_desbloqueado';
    if v_live is distinct from 'true'::jsonb then
      raise exception 'copia_rotas: modo live bloqueado nesta instalação (copia_contas_live_desbloqueado=false)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists copia_rotas_guarda_trg on public.copia_rotas;
create trigger copia_rotas_guarda_trg before insert or update on public.copia_rotas
  for each row execute function public.copia_rotas_guarda();

-- ── 2. outbox / registo de eventos ──────────────────────────────────────────
create table if not exists public.copia_eventos (
  id bigserial primary key,
  rota_id uuid not null references public.copia_rotas(id) on delete cascade,
  origem_posicao_id text not null,
  tipo text not null check (tipo in ('open', 'modify', 'partial', 'close')),
  -- factos da origem: symbol, direcao, volume, volume_antes, preco, sl, tp, em
  payload jsonb not null default '{}'::jsonb,
  -- idempotência: '<rota>:<posição>:<tipo>:<discriminador>'
  chave text not null unique,
  -- quando a origem viu o facto (latência = processado_em - origem_em)
  origem_em timestamptz,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  -- sombra | ok | recusado | erro | saltado
  resultado text check (resultado is null or resultado in ('sombra', 'ok', 'recusado', 'erro', 'saltado')),
  acao_pretendida jsonb,
  acao_real jsonb,
  latencia_ms int,
  erro text,
  tentativas int not null default 0,
  proxima_em timestamptz,
  reclamado_ate timestamptz
);
create index if not exists copia_eventos_fila_idx on public.copia_eventos (id) where processado_em is null;
create index if not exists copia_eventos_rota_idx on public.copia_eventos (rota_id, id desc);
create index if not exists copia_eventos_pos_idx on public.copia_eventos (rota_id, origem_posicao_id, id);
create index if not exists copia_eventos_criado_idx on public.copia_eventos (criado_em desc);
create index if not exists copia_eventos_limpeza_idx on public.copia_eventos (processado_em) where processado_em is not null;

-- ── 3. ponte posição de origem → posição no destino ─────────────────────────
create table if not exists public.copia_posicoes (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.copia_rotas(id) on delete cascade,
  origem_posicao_id text not null,
  destino_posicao_id text,
  destino_simbolo text,
  direcao text check (direcao in ('buy', 'sell')),
  volume_origem_abertura numeric not null,
  volume_destino_abertura numeric,
  fechado_pct numeric not null default 0 check (fechado_pct >= 0 and fechado_pct <= 1),
  -- sombra (só calculada) · enviando → aberta → fechada | recusada | erro
  estado text not null default 'sombra' check (estado in ('sombra', 'enviando', 'aberta', 'fechada', 'recusada', 'erro')),
  client_id text,
  preco_origem numeric,
  preco_destino numeric,
  erro text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rota_id, origem_posicao_id)
);
create index if not exists copia_posicoes_abertas_idx on public.copia_posicoes (rota_id)
  where estado in ('sombra', 'enviando', 'aberta');

-- ── 4. pulso dos serviços do VPS (1 escrita por minuto por serviço) ─────────
create table if not exists public.servicos_pulso (
  servico text primary key,
  host text,
  versao text,
  estado jsonb not null default '{}'::jsonb,
  em timestamptz not null default now()
);

-- ── 5. fonte MTM Funded: o trigger escreve a outbox na mesma transacção ─────
-- Só para rotas APROVADAS e ACTIVAS com esta conta como origem (índice parcial acima). Sem rotas,
-- o custo é uma consulta por índice que não devolve nada.
create or replace function public.copia_funded_emitir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_ref text := 'funded:' || new.account_id;
  v_mae public.funded_positions%rowtype;
  v_pos text;
  v_tipo text;
  v_payload jsonb;
  v_disc text;
begin
  if tg_op = 'INSERT' and new.estado = 'aberta' and new.mae_id is null then
    v_tipo := 'open'; v_pos := new.id::text; v_disc := '0';
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume', new.volume,
      'preco', new.preco_entrada, 'sl', new.sl, 'tp', new.tp, 'origem', new.origem);
  elsif tg_op = 'INSERT' and new.estado = 'fechada' and new.mae_id is not null then
    select * into v_mae from public.funded_positions where id = new.mae_id;
    if not found then return null; end if;
    v_tipo := 'partial'; v_pos := new.mae_id::text; v_disc := new.id::text;
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume_fechado', new.volume,
      'volume', case when v_mae.estado = 'aberta' then v_mae.volume else 0 end, 'preco', new.preco_fecho);
  elsif tg_op = 'UPDATE' and old.estado = 'aberta' and new.estado = 'fechada' then
    v_tipo := 'close'; v_pos := new.id::text; v_disc := '0';
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'preco', new.preco_fecho, 'motivo', new.motivo_fecho);
  elsif tg_op = 'UPDATE' and old.estado = 'aberta' and new.estado = 'aberta'
        and (old.sl is distinct from new.sl or old.tp is distinct from new.tp) then
    v_tipo := 'modify'; v_pos := new.id::text; v_disc := txid_current()::text;
    v_payload := jsonb_build_object('symbol', new.symbol, 'direcao', new.direcao, 'volume', new.volume,
      'preco', new.preco_entrada, 'sl', new.sl, 'tp', new.tp);
  else
    return null;
  end if;

  for r in select id from public.copia_rotas
            where origem_tipo = 'mtmfunded' and origem_ref = v_ref and ativa and estado = 'aprovada'
  loop
    insert into public.copia_eventos (rota_id, origem_posicao_id, tipo, payload, chave, origem_em)
    values (r.id, v_pos, v_tipo, v_payload, r.id || ':' || v_pos || ':' || v_tipo || ':' || v_disc, now())
    on conflict (chave) do nothing;
  end loop;
  return null;
end $$;

drop trigger if exists copia_funded_emitir_trg on public.funded_positions;
create trigger copia_funded_emitir_trg after insert or update on public.funded_positions
  for each row execute function public.copia_funded_emitir();

-- ── 6. reclamar trabalho (ordem por posição, prazo, skip locked) ────────────
create or replace function public.copia_reclamar(n int default 50, p_prazo_s int default 120)
returns setof public.copia_eventos
language plpgsql security definer set search_path = public as $$
begin
  return query
  with alvo as (
    select e.id from public.copia_eventos e
     where e.processado_em is null
       and (e.proxima_em is null or e.proxima_em <= now())
       and (e.reclamado_ate is null or e.reclamado_ate <= now())
       and not exists (select 1 from public.copia_eventos a
                        where a.rota_id = e.rota_id and a.origem_posicao_id = e.origem_posicao_id
                          and a.id < e.id and a.processado_em is null)
     order by e.id
     limit greatest(1, least(n, 500))
     for update skip locked
  )
  update public.copia_eventos e
     set reclamado_ate = now() + make_interval(secs => p_prazo_s)
    from alvo where e.id = alvo.id
  returning e.*;
end $$;

-- ── 7. retenção: eventos processados há mais de 7 dias ──────────────────────
create or replace function public.copia_limpar(p_dias int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  delete from public.copia_eventos
   where processado_em is not null and processado_em < now() - make_interval(days => greatest(1, p_dias));
  get diagnostics v = row_count;
  delete from public.copia_posicoes
   where estado in ('fechada', 'recusada', 'erro') and updated_at < now() - make_interval(days => greatest(7, p_dias * 4));
  return v;
end $$;

-- ── 8. vista de compatibilidade: rotas novas + copiador MTM Funded (068) ────
create or replace view public.copia_rotas_todas as
select r.id, 'copia_contas'::text as sistema, r.user_id, r.origem_tipo, r.origem_ref, r.origem_chave,
       r.destino_tipo, r.destino_ref, r.destino_chave, r.modo_lote, r.valor, r.lote_max, r.max_abertas,
       r.copiar_sl, r.copiar_tp, r.filtro_simbolos, r.ativa, r.modo, r.estado, r.created_at, r.updated_at
  from public.copia_rotas r
union all
select c.id, 'funded_copier'::text, c.user_id, 'mtmfunded', 'funded:' || c.account_id, 'mtmfunded:' || c.account_id,
       case c.destino_tipo when 'tradelocker' then 'tradelocker' else 'mt5' end,
       case c.destino_tipo when 'mtmauto' then 'auto:' else 'site:' end || c.destino_id,
       c.destino_tipo || ':' || c.destino_id,
       case c.modo_lote when 'proporcional_saldo' then 'proporcional_saldo' when 'multiplicador' then 'multiplicador'
                        when 'fixo' then 'fixo' else 'risco_pct' end,
       coalesce(c.valor, 1), c.lote_max, c.max_posicoes, c.copiar_sl, c.copiar_tp, c.simbolos, c.ativo,
       -- o copiador 068 escreve a sério só com COPIER_ESCRITA=1 no VPS; aqui mostra-se o que a linha pede
       'live', 'aprovada', c.created_at, c.updated_at
  from public.funded_copiers c;

-- ── 9. Realtime: DESLIGADO na aplicação de 2026-09-15 (BD frágil); o motor sonda a cada 10 s ──

-- ── RLS: o dono lê as suas rotas e cópias; escrever só pelo servidor ────────
alter table public.copia_rotas enable row level security;
alter table public.copia_eventos enable row level security;
alter table public.copia_posicoes enable row level security;
alter table public.servicos_pulso enable row level security;

drop policy if exists copia_rotas_ler on public.copia_rotas;
create policy copia_rotas_ler on public.copia_rotas for select to authenticated using (user_id = auth.uid());
drop policy if exists copia_posicoes_ler on public.copia_posicoes;
create policy copia_posicoes_ler on public.copia_posicoes for select to authenticated
  using (exists (select 1 from public.copia_rotas r where r.id = rota_id and r.user_id = auth.uid()));

revoke all on public.copia_rotas, public.copia_eventos, public.copia_posicoes, public.servicos_pulso from anon;
revoke insert, update, delete on public.copia_rotas, public.copia_posicoes from authenticated;
revoke all on public.copia_eventos, public.servicos_pulso from authenticated;
revoke all on public.copia_rotas_todas from anon, authenticated;

revoke all on function public.copia_rotas_guarda() from public, anon, authenticated;
revoke all on function public.copia_funded_emitir() from public, anon, authenticated;
revoke all on function public.copia_reclamar(int, int) from public, anon, authenticated;
revoke all on function public.copia_limpar(int) from public, anon, authenticated;
grant execute on function public.copia_reclamar(int, int) to service_role;
grant execute on function public.copia_limpar(int) to service_role;

commit;
