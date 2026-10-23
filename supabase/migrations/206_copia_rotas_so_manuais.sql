-- 206 — Rotas de cópia «só manuais» (23/10/2026).
--
-- Pedido do Ricardo: o que ele abre ou fecha À MÃO na mestre MTM Auto Premium (77296149, ~23K) tem
-- de chegar às contas SIM que seguem a estratégia. Essas contas já recebem os SINAIS directamente
-- (encaminharSinalParaMestre abre na mestre e nas seguidoras), por isso uma rota mestre→seguidora
-- normal duplicava cada sinal. `so_manuais` diz à rota que só nasce cópia de aberturas com
-- origem = 'manual'; fechos, parciais e SL/TP seguem o caminho de sempre (o serviço de cópia salta
-- os eventos de posições que nunca copiou nessa rota).

alter table public.copia_rotas
  add column if not exists so_manuais boolean not null default false;

create or replace function public.copia_funded_emitir()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_chave text := 'mtmfunded:' || lower(new.account_id::text);
  v_mae public.funded_positions%rowtype;
  v_pos text;
  v_tipo text;
  v_payload jsonb;
  v_disc text;
  v_ref_espelho text;
begin
  v_ref_espelho := case when new.mae_id is null then new.ideia_ref
                        else (select m.ideia_ref from public.funded_positions m where m.id = new.mae_id) end;

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

  if v_ref_espelho like 'espelho-provider:%:%' and split_part(v_ref_espelho, ':', 3) <> '' then
    v_pos := split_part(v_ref_espelho, ':', 3);
  end if;

  for r in select id, so_manuais from public.copia_rotas
            where origem_tipo = 'mtmfunded' and origem_chave = v_chave and ativa and estado = 'aprovada'
  loop
    -- 206: rota «só manuais» → aberturas de sinais/estratégia não nascem aqui (a seguidora já as tem).
    if r.so_manuais and v_tipo = 'open' and coalesce(new.origem, '') <> 'manual' then
      continue;
    end if;
    insert into public.copia_eventos (rota_id, origem_posicao_id, tipo, payload, chave, origem_em)
    values (r.id, v_pos, v_tipo, v_payload, r.id || ':' || v_pos || ':' || v_tipo || ':' || v_disc, now())
    on conflict (chave) do nothing;
  end loop;
  return null;
end $function$;
