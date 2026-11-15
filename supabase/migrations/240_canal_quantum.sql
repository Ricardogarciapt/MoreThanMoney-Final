-- 08/11/2026 (pedido do Ricardo: versão própria do indicador Quantum, «Quantum by MTM»). Canal do
-- chat para os sinais do indicador (docs/pine/mtm-quantum.pine), webhook ?strategy=quantum →
-- lib/sinais/quantum-webhook.ts: entrada com gráfico (stop no extremo das últimas velas, alvo a 2R).
-- O Pine só manda a entrada: quem segue a trade é o tracker de preço, por o canal entrar no Tap to
-- Trade. Leitura Premium, como o DEFY e o RocketNova. A mestre «MTM Auto Quantum» só abre quando
-- existir em mestres_estrategias (começa em sombra).
insert into chat_channels (slug, name, description, parent_slug, position, hidden, icone, cor, etiqueta, leitura, escrita, exige_uid_corretora)
values ('sinais-quantum', 'MTM Auto Quantum', 'Sinais do Quantum by MTM: tendência confirmada, entrada no recuo à fita ou na onda do oscilador, com a força por timeframe, stop e alvo a 2R — Tap to Trade', 'sinais', 21, false, '⚛️', '#3B7DDD', 'Premium', 'premium', 'ninguem', false)
on conflict (slug) do nothing;

update site_settings
set value = to_jsonb((
  jsonb_set(
    (value #>> '{}')::jsonb,
    '{t2t_extra_channels}',
    coalesce((value #>> '{}')::jsonb -> 't2t_extra_channels', '[]'::jsonb) || '["sinais-quantum"]'::jsonb
  )
)::text)
where key = 'mtmcopy_signal_sources'
  and jsonb_typeof(value) = 'string'
  and not coalesce(((value #>> '{}')::jsonb -> 't2t_extra_channels') ? 'sinais-quantum', false);

-- Alertas MTM: o Quantum tem vaga própria no feed (espelha lib/mtm-alerts/scanners.ts).
create or replace function public.mtm_scanner_canonico(estrategia text)
returns text
language sql
immutable
as $$
  select case
    when n like '%quantum%' then 'quantum'
    when n like '%rocketnova%' then 'rocketnova'
    when n = 'defy' or n like 'defy%' or n like 'mtmautodefy%' then 'defy'
    when n like '%premiumscanner%' or n like '%premiumii%' then 'premiumscanner'
    when n like '%premium%' then 'premium'
    when n like '%trendshot%' then 'trendshot'
    when n like '%aurum%' then 'aurum'
    when n like '%sensei%' then 'sensei'
    when n like '%goldkiller%' or (n like '%gold%' and n like '%kill%') then 'goldkiller'
    else 'mtmscanner'
  end
  from (select lower(regexp_replace(coalesce(estrategia, ''), '[^a-zA-Z0-9]', '', 'g')) as n) x;
$$;
