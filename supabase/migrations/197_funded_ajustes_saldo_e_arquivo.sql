-- 197 — MTM Funded: histórico de ajustes de saldo (com referência), transferências entre contas,
-- reposição de saldo negativo, arquivo reversível de contas e lote mínimo por conta (07/10).
--
-- Regra de sempre: o saldo simulado só se mexe por funções atómicas. Nada aqui lê o saldo na
-- aplicação para depois o escrever: o «antes» e o «depois» saem da MESMA instrução UPDATE
-- (funded_somar_saldo devolve o depois; antes = depois − delta), e a transferência tranca as duas
-- linhas por ordem de id dentro de uma só transacção.
--
-- O formato da referência é o dos créditos de 23/09 (mtm_funded_admin_audit):
--   <ORIGEM><AAMMDD>-<INICIAIS>-<VALOR>   ex.: PP260923-PG-200 (PU Prime), DL261007-PG-195 (divisão de lucros)
-- e a variante longa MTM-CAP-260923-RR-6000 / PAMM-VT-260923-NM-1200. Ver lib/mtmfunded/referencia-ajuste.ts.

-- ── 1. histórico de ajustes ─────────────────────────────────────────────────────────────────────
create table if not exists public.mtm_funded_ajustes_saldo (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  -- 'ajuste' (crédito/débito à mão), 'transferencia_saida'/'transferencia_entrada' (as duas pernas),
  -- 'reposicao' (saldo negativo reposto a um valor).
  tipo text not null default 'ajuste' check (tipo in ('ajuste', 'transferencia_saida', 'transferencia_entrada', 'reposicao')),
  -- 'preparado' = rascunho pronto a clicar (não mexeu em nada); 'aplicado' = o saldo mudou.
  estado text not null default 'aplicado' check (estado in ('preparado', 'aplicado', 'anulado')),
  delta numeric(14,2) not null check (delta <> 0),
  saldo_antes numeric(14,2),
  saldo_depois numeric(14,2),
  referencia text not null check (char_length(btrim(referencia)) between 4 and 80 and referencia !~ '[<>]'),
  observacao text check (observacao is null or char_length(observacao) <= 400),
  transferencia_id uuid,
  conta_contraparte uuid references public.mtm_trading_accounts(id) on delete set null,
  admin_id uuid,
  admin_email text,
  chave text,
  email_enviado_em timestamptz,
  email_estado text check (email_estado is null or email_estado in ('enviado', 'falhou', 'sem_email')),
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz,
  constraint mtm_funded_ajustes_aplicado_ck check (estado <> 'aplicado' or (saldo_antes is not null and saldo_depois is not null))
);
create unique index if not exists mtm_funded_ajustes_saldo_chave_uk on public.mtm_funded_ajustes_saldo (chave) where chave is not null;
create index if not exists mtm_funded_ajustes_saldo_conta_ix on public.mtm_funded_ajustes_saldo (account_id, criado_em desc);
create index if not exists mtm_funded_ajustes_saldo_transf_ix on public.mtm_funded_ajustes_saldo (transferencia_id) where transferencia_id is not null;
alter table public.mtm_funded_ajustes_saldo enable row level security;
-- Sem políticas: só o service role (rotas de admin) lê e escreve.

-- ── 2. arquivo reversível + lote mínimo ────────────────────────────────────────────────────────
alter table public.mtm_trading_accounts
  add column if not exists arquivada_em timestamptz,
  add column if not exists arquivada_por uuid,
  add column if not exists arquivo_motivo text,
  add column if not exists arquivo_antes jsonb,
  -- Lote mínimo por conta nas aberturas por sinais (conta «Todos os sinais»: 0,02). Nulo = sem mínimo.
  add column if not exists lote_minimo numeric(6,2) check (lote_minimo is null or (lote_minimo > 0 and lote_minimo <= 5));

-- ── 3. ajuste com registo ───────────────────────────────────────────────────────────────────────
create or replace function public.funded_ajustar_saldo_registado(
  p_conta uuid, p_delta numeric, p_referencia text, p_observacao text,
  p_admin_id uuid, p_admin_email text, p_chave text default null,
  p_preparado uuid default null, p_tipo text default 'ajuste'
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_motor text; v_depois numeric; v_antes numeric; v_id uuid; v_ja public.mtm_funded_ajustes_saldo%rowtype;
begin
  if p_referencia is null or char_length(btrim(p_referencia)) < 4 then
    raise exception 'referência obrigatória' using errcode = '22023';
  end if;
  if p_delta is null or p_delta = 0 then raise exception 'valor inválido' using errcode = '22023'; end if;
  if p_chave is not null then
    select * into v_ja from public.mtm_funded_ajustes_saldo where chave = p_chave;
    if found then
      return jsonb_build_object('id', v_ja.id, 'saldoAntes', v_ja.saldo_antes, 'saldo', v_ja.saldo_depois, 'delta', v_ja.delta, 'repetido', true);
    end if;
  end if;
  select motor into v_motor from public.mtm_trading_accounts where id = p_conta;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  if v_motor <> 'sim' then raise exception 'só contas simuladas' using errcode = '22023'; end if;

  -- A ÚNICA escrita de saldo, a mesma do motor e do WebTrader.
  v_depois := public.funded_somar_saldo(p_conta, p_delta);
  v_antes := v_depois - p_delta;
  if v_depois < 0 and p_delta < 0 then
    raise exception 'o débito deixava o saldo negativo (saldo %)', v_antes using errcode = '23514';
  end if;

  if p_preparado is not null then
    update public.mtm_funded_ajustes_saldo set
      estado = 'aplicado', delta = p_delta, saldo_antes = v_antes, saldo_depois = v_depois,
      referencia = btrim(p_referencia), observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
      admin_id = p_admin_id, admin_email = p_admin_email, chave = coalesce(p_chave, chave), aplicado_em = now()
    where id = p_preparado and account_id = p_conta and estado = 'preparado'
    returning id into v_id;
    if v_id is null then raise exception 'o ajuste preparado já não está por aplicar' using errcode = '40001'; end if;
  else
    insert into public.mtm_funded_ajustes_saldo
      (account_id, tipo, estado, delta, saldo_antes, saldo_depois, referencia, observacao, admin_id, admin_email, chave, aplicado_em)
    values (p_conta, coalesce(p_tipo, 'ajuste'), 'aplicado', p_delta, v_antes, v_depois, btrim(p_referencia),
            nullif(btrim(coalesce(p_observacao, '')), ''), p_admin_id, p_admin_email, p_chave, now())
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'saldoAntes', v_antes, 'saldo', v_depois, 'delta', p_delta);
end $$;

-- ── 4. transferência entre contas (as duas pernas na mesma transacção) ──────────────────────────
-- p_valor nulo = TUDO o que a origem tiver (lido sob a tranca, nunca na aplicação); nesse caso a
-- origem não pode ter posições abertas nem ordens pendentes.
create or replace function public.funded_transferir_saldo(
  p_origem uuid, p_destino uuid, p_valor numeric, p_referencia text, p_observacao text,
  p_admin_id uuid, p_admin_email text, p_chave text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  o record; d record; v_valor numeric; v_tid uuid := gen_random_uuid();
  v_o_depois numeric; v_d_depois numeric; v_abertas int; v_pend int; v_ja uuid;
begin
  if p_referencia is null or char_length(btrim(p_referencia)) < 4 then
    raise exception 'referência obrigatória' using errcode = '22023';
  end if;
  if p_origem = p_destino then raise exception 'origem e destino iguais' using errcode = '22023'; end if;
  if p_chave is not null then
    select transferencia_id into v_ja from public.mtm_funded_ajustes_saldo where chave = p_chave || ':saida';
    if found then
      return jsonb_build_object('transferenciaId', v_ja, 'repetido', true);
    end if;
  end if;
  -- Tranca as duas por ordem de id (sem deadlock entre duas transferências cruzadas).
  perform 1 from public.mtm_trading_accounts where id in (p_origem, p_destino) order by id for update;
  select id, motor, sim_saldo, arquivada_em into o from public.mtm_trading_accounts where id = p_origem;
  if not found then raise exception 'conta de origem não encontrada' using errcode = 'P0002'; end if;
  select id, motor, estado, arquivada_em into d from public.mtm_trading_accounts where id = p_destino;
  if not found then raise exception 'conta de destino não encontrada' using errcode = 'P0002'; end if;
  if o.motor <> 'sim' or d.motor <> 'sim' then raise exception 'só entre contas simuladas' using errcode = '22023'; end if;
  if d.arquivada_em is not null then raise exception 'a conta de destino está arquivada' using errcode = '22023'; end if;

  if p_valor is null then
    select count(*) into v_abertas from public.funded_positions where account_id = p_origem and estado = 'aberta';
    select count(*) into v_pend from public.funded_orders where account_id = p_origem and estado = 'pendente';
    if v_abertas > 0 or v_pend > 0 then
      raise exception 'fecha primeiro as % posições e % ordens da conta de origem', v_abertas, v_pend using errcode = '23514';
    end if;
    v_valor := round(coalesce(o.sim_saldo, 0), 2);
  else
    v_valor := round(p_valor, 2);
  end if;
  if v_valor is null or v_valor <= 0 then raise exception 'nada a transferir (saldo %)', coalesce(o.sim_saldo, 0) using errcode = '22023'; end if;

  v_o_depois := public.funded_somar_saldo(p_origem, -v_valor);
  if v_o_depois < 0 then raise exception 'saldo insuficiente na origem (%)', v_o_depois + v_valor using errcode = '23514'; end if;
  v_d_depois := public.funded_somar_saldo(p_destino, v_valor);

  insert into public.mtm_funded_ajustes_saldo
    (account_id, tipo, estado, delta, saldo_antes, saldo_depois, referencia, observacao, transferencia_id, conta_contraparte, admin_id, admin_email, chave, aplicado_em)
  values
    (p_origem, 'transferencia_saida', 'aplicado', -v_valor, v_o_depois + v_valor, v_o_depois, btrim(p_referencia),
     nullif(btrim(coalesce(p_observacao, '')), ''), v_tid, p_destino, p_admin_id, p_admin_email, case when p_chave is null then null else p_chave || ':saida' end, now()),
    (p_destino, 'transferencia_entrada', 'aplicado', v_valor, v_d_depois - v_valor, v_d_depois, btrim(p_referencia),
     nullif(btrim(coalesce(p_observacao, '')), ''), v_tid, p_origem, p_admin_id, p_admin_email, case when p_chave is null then null else p_chave || ':entrada' end, now());

  return jsonb_build_object('transferenciaId', v_tid, 'valor', v_valor,
    'origem', jsonb_build_object('antes', v_o_depois + v_valor, 'depois', v_o_depois),
    'destino', jsonb_build_object('antes', v_d_depois - v_valor, 'depois', v_d_depois));
end $$;

-- ── 5. repor saldo NEGATIVO a um valor (só mexe se estiver abaixo de zero) ─────────────────────
create or replace function public.funded_repor_saldo_negativo(
  p_conta uuid, p_alvo numeric, p_referencia text, p_observacao text,
  p_admin_id uuid, p_admin_email text, p_chave text default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c record; v_delta numeric;
begin
  if p_alvo is null or p_alvo <= 0 or p_alvo > 1000000 then raise exception 'valor alvo inválido' using errcode = '22023'; end if;
  select id, motor, sim_saldo into c from public.mtm_trading_accounts where id = p_conta for update;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  if coalesce(c.sim_saldo, 0) >= 0 then
    return jsonb_build_object('aplicado', false, 'saldo', c.sim_saldo, 'motivo', 'saldo não está negativo');
  end if;
  v_delta := round(p_alvo - c.sim_saldo, 2);
  return public.funded_ajustar_saldo_registado(p_conta, v_delta, p_referencia, p_observacao, p_admin_id, p_admin_email, p_chave, null, 'reposicao')
         || jsonb_build_object('aplicado', true);
end $$;

-- ── 6. arquivar / desarquivar (reversível) ──────────────────────────────────────────────────────
-- Arquivar: estado → 'cancelada' (o motor só gere 'ativa'), deixa de seguir estratégias, sai do
-- T2T/MTM Auto/rotas. Tudo o que muda fica em `arquivo_antes` para o desarquivar repor.
-- Recusa: posições abertas, ordens pendentes, levantamento por pagar, compra paga por usar,
-- conta-mestre de uma estratégia, conta de portefólio, conta que recolhe todos os sinais.
create or replace function public.funded_arquivar_conta(p_conta uuid, p_motivo text, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  c public.mtm_trading_accounts%rowtype; v_bloq text[] := '{}'; v_n int; v_antes jsonb;
begin
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then raise exception 'motivo obrigatório' using errcode = '22023'; end if;
  select * into c from public.mtm_trading_accounts where id = p_conta for update;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  if c.arquivada_em is not null then raise exception 'a conta já está arquivada' using errcode = '22023'; end if;

  select count(*) into v_n from public.funded_positions where account_id = p_conta and estado = 'aberta';
  if v_n > 0 then v_bloq := v_bloq || format('%s posições abertas', v_n); end if;
  select count(*) into v_n from public.funded_orders where account_id = p_conta and estado = 'pendente';
  if v_n > 0 then v_bloq := v_bloq || format('%s ordens pendentes', v_n); end if;
  select count(*) into v_n from public.mtm_funded_withdrawals where account_id = p_conta and estado in ('pedido', 'em_analise', 'aprovado');
  if v_n > 0 then v_bloq := v_bloq || format('%s levantamentos por pagar', v_n); end if;
  -- Compra paga (ou a meio) nos últimos 60 dias: o cliente pagou por esta conta. Ofertas não contam.
  select count(*) into v_n from public.mtm_funded_purchases
   where account_id = p_conta and estado in ('pago', 'pendente', 'em_fila') and created_at > now() - interval '60 days';
  if v_n > 0 then v_bloq := v_bloq || 'compra activa'::text; end if;
  select count(*) into v_n from public.mestres_estrategias where conta_mestre_id = p_conta;
  if v_n > 0 then v_bloq := v_bloq || 'é a conta-mestre de uma estratégia'::text; end if;
  select count(*) into v_n from public.mtmauto_providers where funded_account_id = p_conta;
  if v_n > 0 then v_bloq := v_bloq || 'é a conta de um provider'::text; end if;
  if c.conta_portefolio then v_bloq := v_bloq || 'é uma conta de portefólio'::text; end if;
  if c.recolhe_todos_sinais then v_bloq := v_bloq || 'recolhe todos os sinais (prova)'::text; end if;
  if array_length(v_bloq, 1) > 0 then
    raise exception 'não se arquiva: %', array_to_string(v_bloq, ' · ') using errcode = '23514';
  end if;

  v_antes := jsonb_build_object(
    'estado', c.estado, 'segue_estrategia', c.segue_estrategia, 'aceita_t2t', c.aceita_t2t,
    'mtmauto', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'copia_ativa', copia_ativa)) from public.mtmauto_accounts where funded_account_id = p_conta), '[]'::jsonb),
    'subscricoes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ativo', s.ativo)) from public.mtmauto_subscriptions s
                              join public.mtmauto_accounts x on x.id = s.conta_id where x.funded_account_id = p_conta), '[]'::jsonb),
    't2t', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'is_active', is_active, 't2t_enabled', t2t_enabled)) from public.mtmcopy_connections where funded_account_id = p_conta), '[]'::jsonb),
    'rotas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ativa', ativa)) from public.copia_rotas
                        where destino_ref in ('funded:' || p_conta::text, p_conta::text) or destino_chave = 'mtmfunded:' || p_conta::text), '[]'::jsonb)
  );

  update public.mtmauto_subscriptions set ativo = false
   where conta_id in (select id from public.mtmauto_accounts where funded_account_id = p_conta);
  update public.mtmauto_accounts set copia_ativa = false, updated_at = now() where funded_account_id = p_conta;
  update public.mtmcopy_connections set is_active = false, t2t_enabled = false where funded_account_id = p_conta;
  update public.copia_rotas set ativa = false, pausada_motivo = 'conta arquivada', updated_at = now()
   where destino_ref in ('funded:' || p_conta::text, p_conta::text) or destino_chave = 'mtmfunded:' || p_conta::text;
  update public.mtm_trading_accounts set
    estado = case when estado in ('ativa', 'aprovada', 'pedida', 'a_criar') then 'cancelada' else estado end,
    segue_estrategia = null, aceita_t2t = false,
    arquivada_em = now(), arquivada_por = p_admin_id, arquivo_motivo = btrim(p_motivo), arquivo_antes = v_antes,
    updated_at = now()
  where id = p_conta;
  return jsonb_build_object('arquivada', true, 'antes', v_antes);
end $$;

create or replace function public.funded_desarquivar_conta(p_conta uuid, p_admin_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c public.mtm_trading_accounts%rowtype; a jsonb; x jsonb;
begin
  select * into c from public.mtm_trading_accounts where id = p_conta for update;
  if not found then raise exception 'conta não encontrada' using errcode = 'P0002'; end if;
  if c.arquivada_em is null then raise exception 'a conta não está arquivada' using errcode = '22023'; end if;
  a := coalesce(c.arquivo_antes, '{}'::jsonb);
  for x in select * from jsonb_array_elements(coalesce(a->'mtmauto', '[]'::jsonb)) loop
    update public.mtmauto_accounts set copia_ativa = (x->>'copia_ativa')::boolean, updated_at = now() where id = (x->>'id')::uuid;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(a->'subscricoes', '[]'::jsonb)) loop
    update public.mtmauto_subscriptions set ativo = (x->>'ativo')::boolean where id = (x->>'id')::uuid;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(a->'t2t', '[]'::jsonb)) loop
    update public.mtmcopy_connections set is_active = (x->>'is_active')::boolean, t2t_enabled = (x->>'t2t_enabled')::boolean where id = (x->>'id')::uuid;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(a->'rotas', '[]'::jsonb)) loop
    update public.copia_rotas set ativa = (x->>'ativa')::boolean,
      pausada_motivo = case when (x->>'ativa')::boolean then null else pausada_motivo end, updated_at = now()
     where id = (x->>'id')::uuid;
  end loop;
  update public.mtm_trading_accounts set
    estado = coalesce(a->>'estado', estado),
    segue_estrategia = a->>'segue_estrategia',
    aceita_t2t = coalesce((a->>'aceita_t2t')::boolean, aceita_t2t),
    arquivada_em = null, arquivada_por = null, arquivo_motivo = null, arquivo_antes = null,
    updated_at = now()
  where id = p_conta;
  return jsonb_build_object('desarquivada', true, 'reposto', a);
end $$;

-- Funções de dinheiro: NUNCA abertas ao público (ver memória rpc-definer-abertas-ao-publico).
revoke all on function public.funded_ajustar_saldo_registado(uuid, numeric, text, text, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.funded_transferir_saldo(uuid, uuid, numeric, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.funded_repor_saldo_negativo(uuid, numeric, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.funded_arquivar_conta(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.funded_desarquivar_conta(uuid, uuid) from public, anon, authenticated;
grant execute on function public.funded_ajustar_saldo_registado(uuid, numeric, text, text, uuid, text, text, uuid, text) to service_role;
grant execute on function public.funded_transferir_saldo(uuid, uuid, numeric, text, text, uuid, text, text) to service_role;
grant execute on function public.funded_repor_saldo_negativo(uuid, numeric, text, text, uuid, text, text) to service_role;
grant execute on function public.funded_arquivar_conta(uuid, text, uuid) to service_role;
grant execute on function public.funded_desarquivar_conta(uuid, uuid) to service_role;
