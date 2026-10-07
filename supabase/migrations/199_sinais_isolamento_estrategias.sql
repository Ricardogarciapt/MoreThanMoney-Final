-- 199 · ISOLAMENTO POR ESTRATÉGIA (07/10/2026) — docs/sinais-isolamento-estrategias.md
--
-- Cada registo da cadeia passa a levar a identidade que até aqui se adivinhava pelo ticker:
--   · tradingview_signals.estrategia   — slug de mestres_estrategias (sensei, Goldkiller, mtm-scanner,
--                                        aurum-flow, mtm-perps); null = desconhecida/ambígua
--   · tradingview_signals.chave_trade  — chave da trade calculada dos campos da fonte (lib/sinais/identidade.ts)
--   · tradingview_signals.entrada_id   — seguimento → a SUA entrada (e entrada repetida → a original)
--   · tradingview_signals.ligacao      — como se ligou: origem | chave | sem_chave | sem_entrada | ambigua | sem_estrategia | duplicada | legado
--   · sensei_trade_ideas.estrategia    — as ideias deixam de ser «do ouro» e passam a ser de UMA estratégia
--   · funded_sinal_posicoes.funded_order_id — a ponte de uma pendente aponta à ordem por coluna (antes: texto em `erro`)
--   · mtmcopy_signal_tracking.preco_admissao / tipo_entrada — a entrada enche pelo LADO certo (limite vs stop)
--
-- O histórico NÃO é reescrito: só se preenchem os últimos 35 dias quando a inferência é exacta (os 5
-- nomes de alerta em uso são inequívocos — medido a 07/10) e marcam-se como «legado» as entradas antigas
-- ainda abertas, que nenhum seguimento novo vai encontrar.

alter table public.tradingview_signals
  add column if not exists estrategia text,
  add column if not exists chave_trade text,
  add column if not exists entrada_id uuid references public.tradingview_signals(id) on delete set null,
  add column if not exists ligacao text;

create index if not exists tradingview_signals_entrada_chave_idx
  on public.tradingview_signals (estrategia, chave_trade)
  where signal_kind = 'entry';
create index if not exists tradingview_signals_entrada_id_idx
  on public.tradingview_signals (entrada_id)
  where entrada_id is not null;

alter table public.sensei_trade_ideas add column if not exists estrategia text;
create index if not exists sensei_trade_ideas_estrategia_idx
  on public.sensei_trade_ideas (estrategia, symbol, status);

alter table public.funded_sinal_posicoes add column if not exists funded_order_id uuid;

alter table public.mtmcopy_signal_tracking
  add column if not exists preco_admissao numeric,
  add column if not exists tipo_entrada text;

-- ── preenchimento (35 dias, inferência exacta) ─────────────────────────────────────────────────
update public.tradingview_signals set estrategia = case
    when alert_name ilike '%aurum flow%' then 'aurum-flow'
    when alert_name = 'MTMScanner' then 'mtm-scanner'
    when alert_name = 'MTM Sensei X' then 'sensei'
    when alert_name = 'GoldKiller' then 'Goldkiller'
  end
where received_at > now() - interval '35 days' and estrategia is null
  and (alert_name ilike '%aurum flow%' or alert_name in ('MTMScanner', 'MTM Sensei X', 'GoldKiller'));

-- chave = estrategia|TICKER|dir|entrada|tf|tp1 (mesma regra de chaveDaTrade)
update public.tradingview_signals t set chave_trade =
    t.estrategia || '|' || upper(regexp_replace(t.ticker, '^[A-Za-z0-9_]+:', '')) || '|'
    || case when (t.raw_payload->>'action') ~* 'buy|long' then 'buy' else 'sell' end || '|'
    || trim_scale(round((t.raw_payload->>'entry')::numeric, 8))::text || '|'
    || coalesce(t.raw_payload->>'tf', t.raw_payload->>'timeframe', t.raw_payload->>'interval', '') || '|'
    || coalesce(trim_scale(round(nullif(coalesce(t.raw_payload->>'tp1', t.raw_payload->>'tp'), '')::numeric, 8))::text, '')
where t.estrategia is not null and t.chave_trade is null
  and (t.raw_payload->>'entry') ~ '^[0-9]+(\.[0-9]+)?$'
  and (t.raw_payload->>'action') ~* 'buy|long|sell|short'
  and coalesce(t.raw_payload->>'tp1', t.raw_payload->>'tp', '0') ~ '^[0-9]+(\.[0-9]+)?$';

update public.tradingview_signals set ligacao = 'origem'
where estrategia is not null and signal_kind = 'entry' and ligacao is null;

-- seguimentos → a entrada com a mesma estratégia e chave, só quando é UMA
update public.tradingview_signals f set entrada_id = e.id, ligacao = 'chave'
from (
  select f2.id fid, (array_agg(e2.id))[1] id, count(*) n
  from public.tradingview_signals f2
  join public.tradingview_signals e2
    on e2.estrategia = f2.estrategia and e2.chave_trade = f2.chave_trade
   and e2.signal_kind = 'entry' and e2.received_at < f2.received_at
  where f2.signal_kind = 'followup' and f2.estrategia is not null and f2.chave_trade is not null and f2.entrada_id is null
  group by f2.id
) e
where f.id = e.fid and e.n = 1;

update public.tradingview_signals set ligacao = 'sem_entrada'
where signal_kind = 'followup' and estrategia is not null and entrada_id is null and ligacao is null
  and received_at > now() - interval '35 days';

-- entradas antigas ainda «abertas» sem identidade: legado (nenhum seguimento novo as toca)
update public.tradingview_signals set ligacao = 'legado'
where estrategia is null and ligacao is null and signal_kind = 'entry'
  and trade_status in ('active', 'pending', 'be', 'exit_1', 'exit_2', 'exit_3');

update public.sensei_trade_ideas i set estrategia = t.estrategia
from public.tradingview_signals t
where i.estrategia is null and t.id = coalesce(i.source_signal_id, i.trigger_signal_id) and t.estrategia is not null;

update public.funded_sinal_posicoes
set funded_order_id = (regexp_match(erro, '^pendente ([0-9a-f-]{36})$'))[1]::uuid
where funded_order_id is null and erro ~ '^pendente [0-9a-f-]{36}$';

comment on column public.tradingview_signals.estrategia is 'slug de mestres_estrategias; null = desconhecida/ambígua (não executa). 199';
comment on column public.tradingview_signals.chave_trade is 'chave da trade a partir dos campos da fonte (lib/sinais/identidade.ts › chaveDaTrade). 199';
comment on column public.tradingview_signals.entrada_id is 'seguimento → a sua entrada; entrada repetida → a original. Nunca por «último do ticker». 199';
comment on column public.tradingview_signals.ligacao is 'origem|chave|sem_chave|sem_entrada|ambigua|sem_estrategia|duplicada|legado. 199';
