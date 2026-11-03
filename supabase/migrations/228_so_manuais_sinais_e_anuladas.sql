-- 228 — Rotas «só manuais» voltam a ignorar os sinais + trades anuladas por erro (03/11/2026).
--
-- O ERRO: desde 26/10 cada sinal Premium entrava DUAS vezes nas contas SIM que seguem a estratégia —
-- a abertura directa do sinal e uma cópia pela rota «Premium manuais (77296149) → …». A abertura
-- de estratégia (lib/mtmfunded/estrategias-sinais/abrir.ts) insere a posição na mestre com a origem
-- por omissão ('manual') e só a seguir a marca 'estrategia'. O gatilho corre no INSERT, viu 'manual'
-- e deixou a rota «só manuais» copiar. Agora olha também para a referência do sinal (`sinal:%`),
-- que já vem no INSERT.
--
-- ANULADAS: pedido do dono no mesmo dia — os SL dessas cópias duplicadas de 02 e 03/11 saem do
-- histórico do cliente e o saldo é devolvido (ajuste registado em mtm_funded_ajustes_saldo).
-- `fora_estatisticas = 'anulada_erro'` tira-as das estatísticas (como o 'teste_interno') E do
-- histórico visível.

alter table public.funded_positions drop constraint if exists funded_positions_fora_estatisticas_check;
alter table public.funded_positions add constraint funded_positions_fora_estatisticas_check
  check (fora_estatisticas is null or fora_estatisticas in ('teste_interno', 'anulada_erro'));

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
  v_manual boolean;
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

  -- 228: manual = origem 'manual' E sem referência de sinal (a abertura de estratégia insere com a
  -- origem por omissão e só depois a marca; a referência `sinal:` já vem no INSERT).
  v_manual := coalesce(new.origem, '') = 'manual' and coalesce(new.ideia_ref, '') not like 'sinal:%';

  for r in select id, so_manuais from public.copia_rotas
            where origem_tipo = 'mtmfunded' and origem_chave = v_chave and ativa and estado = 'aprovada'
  loop
    -- 206: rota «só manuais» → aberturas de sinais/estratégia não nascem aqui (a seguidora já as tem).
    if r.so_manuais and v_tipo = 'open' and not v_manual then
      continue;
    end if;
    insert into public.copia_eventos (rota_id, origem_posicao_id, tipo, payload, chave, origem_em)
    values (r.id, v_pos, v_tipo, v_payload, r.id || ':' || v_pos || ':' || v_tipo || ':' || v_disc, now())
    on conflict (chave) do nothing;
  end loop;
  return null;
end $function$;
