-- 198 — Plano de limpeza de contas (07/10): o dono aprova linha a linha num dashboard ligado à base.
--
-- Cada linha é UMA acção sobre UMA conta. Nada corre sozinho: só `limpeza_executar(id)` mexe, e só
-- quando o dono carrega no botão. As acções de dinheiro passam pelas funções atómicas da 197
-- (funded_transferir_saldo / funded_repor_saldo_negativo → funded_somar_saldo), com a referência
-- no histórico de ajustes (mtm_funded_ajustes_saldo). Arquivar é reversível (funded_desarquivar_conta).
--
-- Ordem do plano: primeiro o que não move dinheiro (arquivar/configurar), depois transferências e
-- ajustes, por fim apagar (só desafios inactivos já arquivados, sem nada pendurado).

create table if not exists public.contas_limpeza_plano (
  id uuid primary key default gen_random_uuid(),
  ordem int not null,
  utilizador_nome text,
  utilizador_email text,
  conta_id uuid references public.mtm_trading_accounts(id) on delete set null,
  login text,
  tipo text,
  estrategia text,
  accao text not null check (accao in ('arquivar', 'apagar', 'transferir_saldo', 'ajustar_saldo', 'configurar')),
  valor numeric(14,2),
  conta_destino text,
  saldo_actual numeric(14,2),
  motivo text not null,
  bloqueio text,
  estado text not null default 'pendente' check (estado in ('pendente', 'aprovado', 'executado', 'erro', 'rejeitado')),
  resultado jsonb,
  aprovado_em timestamptz,
  executado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists contas_limpeza_plano_ordem_ix on public.contas_limpeza_plano (ordem);
alter table public.contas_limpeza_plano enable row level security;
-- Sem políticas: RLS fechada (só service role).

-- O bloqueio VIVO de uma acção sobre uma conta (null = pode). Usado no preenchimento e outra vez
-- no instante de executar — um bloqueio que entretanto desapareceu (o dono fechou a posição) deixa passar.
create or replace function public.limpeza_bloqueio(p_conta uuid, p_accao text)
returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare c public.mtm_trading_accounts%rowtype; b text[] := '{}'; n int;
begin
  select * into c from public.mtm_trading_accounts where id = p_conta;
  if not found then return 'conta não existe'; end if;
  if p_accao in ('arquivar', 'transferir_saldo', 'apagar') then
    select count(*) into n from public.funded_positions where account_id = p_conta and estado = 'aberta';
    if n > 0 then b := b || format('%s posição(ões) aberta(s) — o dono fecha primeiro', n); end if;
    select count(*) into n from public.funded_orders where account_id = p_conta and estado = 'pendente';
    if n > 0 then b := b || format('%s ordem(ns) pendente(s)', n); end if;
  end if;
  if p_accao in ('arquivar', 'apagar') then
    select count(*) into n from public.mtm_funded_withdrawals where account_id = p_conta and estado in ('pedido', 'em_analise', 'aprovado');
    if n > 0 then b := b || format('%s levantamento(s) por pagar', n); end if;
    select count(*) into n from public.mtm_funded_purchases where account_id = p_conta and estado in ('pago', 'pendente', 'em_fila') and created_at > now() - interval '60 days';
    if n > 0 then b := b || 'compra activa'::text; end if;
    select count(*) into n from public.mestres_estrategias where conta_mestre_id = p_conta;
    if n > 0 then b := b || ('conta-mestre de ' || (select string_agg(slug, ', ') from public.mestres_estrategias where conta_mestre_id = p_conta)); end if;
    select count(*) into n from public.mtmauto_providers where funded_account_id = p_conta or espelho_funded_account_id = p_conta;
    if n > 0 then b := b || ('conta de provider: ' || (select string_agg(slug, ', ') from public.mtmauto_providers where funded_account_id = p_conta or espelho_funded_account_id = p_conta)); end if;
    if c.conta_portefolio then b := b || 'conta de portefólio'::text; end if;
    if c.recolhe_todos_sinais then b := b || 'recolhe todos os sinais (prova)'::text; end if;
  end if;
  if p_accao = 'apagar' then
    if c.tipo <> 'desafio' then b := b || 'só se apagam contas de desafio'::text; end if;
    if c.motor <> 'sim' then b := b || 'conta MT5: apagar também na MetaApi/corretora — fica para o dono no modal'::text; end if;
    select count(*) into n from public.funded_positions where account_id = p_conta;
    if n > 0 then b := b || format('tem %s trade(s) no histórico — não é inactiva', n); end if;
    select count(*) into n from public.mtm_funded_purchases where account_id = p_conta;
    if n > 0 then b := b || 'tem compra/oferta ligada (registo de faturação)'::text; end if;
    select count(*) into n from public.mtm_certificates where account_id = p_conta;
    if n > 0 then b := b || 'tem certificado'::text; end if;
    select count(*) into n from public.mtm_tournament_participants where account_id = p_conta;
    if n > 0 then b := b || 'está num torneio'::text; end if;
    select count(*) into n from public.mtm_account_requests where account_id = p_conta;
    if n > 0 then b := b || 'tem pedido de conta ligado'::text; end if;
    -- `já arquivada` não entra aqui: é verificado no instante de executar (o arquivo vem antes no plano).
  end if;
  if p_accao = 'transferir_saldo' and c.motor <> 'sim' then b := b || 'conta MT5: o saldo vive na corretora'::text; end if;
  return case when array_length(b, 1) > 0 then array_to_string(b, ' · ') else null end;
end $$;

-- Executa UMA linha. Devolve:
--   { ok, id, accao, login, estado, resultado }        quando correu
--   { ok:false, id, accao, login, estado, erro }       quando foi recusada ou falhou
create or replace function public.limpeza_executar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  l public.contas_limpeza_plano%rowtype; v_b text; v_r jsonb; v_dest uuid; v_c public.mtm_trading_accounts%rowtype;
  v_ref text; v_err text;
  -- Quem carrega no botão: a sessão, se houver; senão o dono da casa (o dashboard corre com service role).
  v_admin uuid := coalesce(auth.uid(), (select id from public.profiles where email = 'ricardogarciapt@proton.me' limit 1));
begin
  select * into l from public.contas_limpeza_plano where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'id', p_id, 'erro', 'linha não existe'); end if;
  if l.estado <> 'pendente' then
    return jsonb_build_object('ok', false, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', l.estado,
      'erro', format('só se executa uma linha pendente (está %s)', l.estado));
  end if;

  -- bloqueio vivo (o guardado pode estar velho nos dois sentidos)
  v_b := case when l.accao = 'configurar' or l.conta_id is null then null else public.limpeza_bloqueio(l.conta_id, l.accao) end;
  if l.accao = 'apagar' and v_b is null then
    select * into v_c from public.mtm_trading_accounts where id = l.conta_id;
    if v_c.arquivada_em is null then v_b := 'arquiva primeiro (apagar só depois do arquivo)'; end if;
  end if;
  update public.contas_limpeza_plano set bloqueio = v_b where id = l.id;
  if v_b is not null then
    return jsonb_build_object('ok', false, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', 'pendente', 'erro', 'bloqueada: ' || v_b);
  end if;

  v_ref := upper(regexp_replace(coalesce(l.resultado->>'referencia', ''), '[^A-Za-z0-9.\-]', '', 'g'));

  begin
    if l.accao = 'arquivar' then
      v_r := public.funded_arquivar_conta(l.conta_id, l.motivo, v_admin);

    elsif l.accao = 'transferir_saldo' then
      select id into v_dest from public.mtm_trading_accounts where mt5_login = l.conta_destino;
      if v_dest is null then raise exception 'conta de destino % não existe', l.conta_destino; end if;
      if v_ref = '' then raise exception 'linha sem referência'; end if;
      -- valor nulo = tudo o que a origem tiver, lido SOB A TRANCA dentro da função atómica.
      v_r := public.funded_transferir_saldo(l.conta_id, v_dest, l.valor, v_ref, l.motivo, v_admin, 'limpeza_executar', 'limpeza:' || l.id::text);

    elsif l.accao = 'ajustar_saldo' then
      if v_ref = '' then raise exception 'linha sem referência'; end if;
      if coalesce(l.valor, 0) <= 0 or l.valor > 1000 then raise exception 'ajuste só até 1000 USD'; end if;
      v_r := public.funded_repor_saldo_negativo(l.conta_id, l.valor, v_ref, l.motivo, v_admin, 'limpeza_executar', 'limpeza:' || l.id::text);

    elsif l.accao = 'apagar' then
      insert into public.mtm_funded_admin_audit (account_id, admin_id, admin_email, accao, motivo, pedido, antes, estado, chave_idempotencia, concluido_em)
      select l.conta_id, v_admin, 'limpeza_executar', 'apagar_conta', l.motivo, jsonb_build_object('plano', l.id),
             to_jsonb(a) - 'mt5_password_cifrada' - 'mt5_investor_cifrada', 'ok', 'limpeza:' || l.id::text, now()
        from public.mtm_trading_accounts a where a.id = l.conta_id;
      delete from public.mtm_trading_accounts where id = l.conta_id;
      v_r := jsonb_build_object('apagada', true, 'login', l.login);

    elsif l.accao = 'configurar' then
      -- As configurações do plano são aplicadas na preparação (não mexem em dinheiro); aqui só se confirma.
      v_r := jsonb_build_object('configuracao', l.resultado);
    end if;
  exception when others then
    v_err := sqlerrm;
  end;

  if v_err is not null then
    update public.contas_limpeza_plano set estado = 'erro', resultado = coalesce(resultado, '{}'::jsonb) || jsonb_build_object('erro', v_err), executado_em = now() where id = l.id;
    return jsonb_build_object('ok', false, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', 'erro', 'erro', v_err);
  end if;
  update public.contas_limpeza_plano set estado = 'executado', aprovado_em = coalesce(aprovado_em, now()), executado_em = now(),
    resultado = coalesce(resultado, '{}'::jsonb) || jsonb_build_object('feito', v_r)
   where id = l.id;
  return jsonb_build_object('ok', true, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', 'executado', 'resultado', v_r);
end $$;

create or replace function public.limpeza_rejeitar(p_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare l public.contas_limpeza_plano%rowtype;
begin
  select * into l from public.contas_limpeza_plano where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'id', p_id, 'erro', 'linha não existe'); end if;
  if l.estado not in ('pendente', 'aprovado', 'erro') then
    return jsonb_build_object('ok', false, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', l.estado, 'erro', format('não se rejeita uma linha %s', l.estado));
  end if;
  update public.contas_limpeza_plano set estado = 'rejeitado', executado_em = now() where id = l.id;
  return jsonb_build_object('ok', true, 'id', l.id, 'accao', l.accao, 'login', l.login, 'estado', 'rejeitado');
end $$;

revoke all on function public.limpeza_bloqueio(uuid, text) from public, anon, authenticated;
revoke all on function public.limpeza_executar(uuid) from public, anon, authenticated;
revoke all on function public.limpeza_rejeitar(uuid) from public, anon, authenticated;
grant execute on function public.limpeza_bloqueio(uuid, text) to service_role;
grant execute on function public.limpeza_executar(uuid) to service_role;
grant execute on function public.limpeza_rejeitar(uuid) to service_role;
