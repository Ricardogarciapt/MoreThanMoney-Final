-- 08/11/2026 (pedido do Ricardo: scanner próprio RocketNova, com os princípios do TrendShot, alertas
-- por webhook e plots de posições). Canal do chat para o indicador RocketNova
-- (docs/pine/rocketnova.pine), webhook ?strategy=rocketnova → lib/sinais/rocketnova-webhook.ts:
-- entrada com gráfico e seguimentos (TP1..TP4, SL, BE, exit) em resposta ao cartão. Leitura Premium,
-- como o DEFY. Tap to Trade sem rota de cópia; a mestre «MTM Auto RocketNova» só abre quando existir
-- em mestres_estrategias (começa em sombra).
insert into chat_channels (slug, name, description, parent_slug, position, hidden, icone, cor, etiqueta, leitura, escrita, exige_uid_corretora)
values ('sinais-rocketnova', 'MTM Auto RocketNova', 'Sinais do RocketNova: cruzamento das EMAs com estrela de lançamento, entrada, SL e 4 alvos, com a gestão da trade — Tap to Trade', 'sinais', 20, false, '🚀', '#D2A63C', 'Premium', 'premium', 'ninguem', false)
on conflict (slug) do nothing;

update site_settings
set value = to_jsonb((
  jsonb_set(
    (value #>> '{}')::jsonb,
    '{t2t_extra_channels}',
    coalesce((value #>> '{}')::jsonb -> 't2t_extra_channels', '[]'::jsonb) || '["sinais-rocketnova"]'::jsonb
  )
)::text)
where key = 'mtmcopy_signal_sources'
  and jsonb_typeof(value) = 'string'
  and not coalesce(((value #>> '{}')::jsonb -> 't2t_extra_channels') ? 'sinais-rocketnova', false);

-- Alertas MTM: o RocketNova tem vaga própria no feed (espelha lib/mtm-alerts/scanners.ts).
create or replace function public.mtm_scanner_canonico(estrategia text)
returns text
language sql
immutable
as $$
  select case
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
