-- 241 · Retenção curta dos dados efémeros + tabelas quentes mais leves para o disco (10/11/2026)
--
-- Porquê: a BD volta a encravar por falta de Disk IO (checkpoints de 500 buffers a levar 140 s,
-- 10/11 06:45 UTC). O que pesa não é volume de negócio, são registos de passagem e reescritas
-- contínuas das mesmas linhas pelos serviços da VPS.
--
-- O que faz:
--   1. limpar_efemeros(): apaga, em lotes, o que só serve na hora (sombras, fotografias antigas,
--      logs do pg_cron/pg_net) com mais de 60 min. NUNCA toca em trades, posições, contas,
--      subscrições, licenças, sinais nem histórico.
--   2. pg_cron corre-a de 10 em 10 min.
--   3. Tabelas reescritas sem parar ficam com fillfactor 70 (updates HOT: sem reescrever índices)
--      e autovacuum agressivo (menos inchaço = menos páginas a ler e escrever).
--
-- Fica DE FORA de propósito:
--   · copia_eventos: a chave única é a idempotência da cópia; apagar cedo pode duplicar ordens.
--   · mtmcopy_signal_dedup: idem para sinais.
--   · funded_equity_snapshots: é a curva de equity das contas (negócio).

create extension if not exists pg_cron;

create or replace function public.limpar_efemeros()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alvo record;
  n bigint;
  total bigint;
  res jsonb := '{}'::jsonb;
begin
  for alvo in
    select * from (values
      ('public', 'metaapi_snapshot_sombra', 'em',          interval '60 minutes'),
      ('public', 'gestao_real_sombra',      'decidido_em', interval '60 minutes'),
      ('cron',   'job_run_details',         'end_time',    interval '60 minutes'),
      ('net',    '_http_response',          'created',     interval '60 minutes')
    ) as t(esquema, tabela, coluna, idade)
  loop
    -- só se a tabela e a coluna existirem (algumas migrações podem não estar aplicadas)
    if not exists (
      select 1 from information_schema.columns
      where table_schema = alvo.esquema and table_name = alvo.tabela and column_name = alvo.coluna
    ) then
      continue;
    end if;

    total := 0;
    loop
      -- lotes de 5000 para não prender a tabela nem gerar um pico de WAL
      execute format(
        'delete from %I.%I where ctid in (select ctid from %I.%I where %I < now() - $1 limit 5000)',
        alvo.esquema, alvo.tabela, alvo.esquema, alvo.tabela, alvo.coluna
      ) using alvo.idade;
      get diagnostics n = row_count;
      total := total + n;
      exit when n < 5000 or total >= 200000;
    end loop;

    res := res || jsonb_build_object(alvo.esquema || '.' || alvo.tabela, total);
  end loop;
  return res;
end;
$$;

revoke all on function public.limpar_efemeros() from public, anon, authenticated;
grant execute on function public.limpar_efemeros() to service_role;

-- índices na coluna de tempo para o delete não varrer a tabela toda
create index if not exists gestao_real_sombra_decidido_em_idx on public.gestao_real_sombra (decidido_em);
create index if not exists metaapi_snapshot_sombra_em_idx on public.metaapi_snapshot_sombra (em);

-- agenda (idempotente)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'limpar-efemeros-60min';
  perform cron.schedule('limpar-efemeros-60min', '*/10 * * * *', 'select public.limpar_efemeros()');
end $$;

-- tabelas quentes: updates HOT e vacuum frequente
do $$
declare
  t text;
begin
  foreach t in array array[
    'funded_precos', 'funded_precos_pedidos', 'mtm_trading_accounts', 'metaapi_snapshot',
    'mtmcopy_signal_tracking', 'servicos_pulso', 'gestao_real_pulso', 'site_settings',
    'funded_positions', 'funded_orders'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'alter table public.%I set (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.02, '
        'autovacuum_vacuum_threshold = 50, autovacuum_analyze_scale_factor = 0.05)', t);
    end if;
  end loop;
end $$;
