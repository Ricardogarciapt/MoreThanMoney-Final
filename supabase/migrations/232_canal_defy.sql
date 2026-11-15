-- 04/11/2026 (pedido do Ricardo: «webhook e sistema de alertas e seguimento das trades conforme os
-- existentes na MTM e chats»). Canal do chat para o indicador DEFY (docs/pine/defy.pine), webhook
-- ?strategy=defy → lib/sinais/defy-webhook.ts: entrada com gráfico e seguimentos (TP1..TP3, SL,
-- descarte) em resposta ao cartão. Leitura Premium, como o Premium II. Tap to Trade sem rota de cópia;
-- a mestre «MTM Auto DEFY» só abre quando existir em mestres_estrategias (começa em sombra).
insert into chat_channels (slug, name, description, parent_slug, position, hidden, icone, cor, etiqueta, leitura, escrita, exige_uid_corretora)
values ('sinais-defy', 'MTM Auto DEFY', 'Ideias do indicador DEFY: entrada, warning, SL e 3 alvos, com o seguimento da trade — Tap to Trade', 'sinais', 19, false, '🟣', '#8E44EC', 'Premium', 'premium', 'ninguem', false)
on conflict (slug) do nothing;

update site_settings
set value = to_jsonb((
  jsonb_set(
    (value #>> '{}')::jsonb,
    '{t2t_extra_channels}',
    coalesce((value #>> '{}')::jsonb -> 't2t_extra_channels', '[]'::jsonb) || '["sinais-defy"]'::jsonb
  )
)::text)
where key = 'mtmcopy_signal_sources'
  and jsonb_typeof(value) = 'string'
  and not coalesce(((value #>> '{}')::jsonb -> 't2t_extra_channels') ? 'sinais-defy', false);

-- Alertas MTM: o DEFY tem vaga própria no feed (espelha lib/mtm-alerts/scanners.ts).
create or replace function public.mtm_scanner_canonico(estrategia text)
returns text
language sql
immutable
as $$
  select case
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
