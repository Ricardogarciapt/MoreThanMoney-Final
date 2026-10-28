-- 28/10/2026 (pedido do Ricardo: «/alertas-mtm continua a falhar com as imagens dos gráficos»).
--
-- O feed dos Alertas MTM guarda os últimos N POR estratégia, mas a função SQL só conhecia quatro
-- (aurum, sensei, goldkiller e «o resto»). O TrendShot e o Premium Scanner caíam no balde do MTM
-- Scanner e disputavam as mesmas 12 vagas com centenas de sinais dele. Medido hoje às 11h: o balde
-- tinha 10 alertas de DESENHO do TrendShot («US30, 1 Cruzando raio horizontal») sem ticker e sem
-- gráfico — os cartões partidos da página — e o Premium Scanner não aparecia de todo.
--
-- Agora a função espelha lib/mtm-alerts/scanners.ts (scannerKeyFromStrategy, pela mesma ordem) e
-- o feed deixa de fora o que nunca foi sinal: linhas sem ticker e as que o webhook marcou
-- 'filtered' (o TrendShot passa a marcar assim os alertas que descarta).

create or replace function public.mtm_scanner_canonico(estrategia text)
returns text
language sql
immutable
as $$
  select case
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

create or replace function public.mtm_recent_alerts(p_per_strategy integer default 10, p_total integer default 60)
returns table(id uuid, ticker text, exchange text, timeframe text, action text, price numeric, sl numeric, tp numeric, alert_name text, message text, ai_analysis text, raw_payload jsonb, chat_status text, chart_image_url text, trade_status text, signal_kind text, received_at timestamp with time zone)
language sql
stable
as $$
  select t.id, t.ticker, t.exchange, t.timeframe, t.action, t.price,
         t.sl, t.tp, t.alert_name, t.message, t.ai_analysis,
         t.raw_payload, t.chat_status, t.chart_image_url, t.trade_status,
         t.signal_kind, t.received_at
  from (
    select ts.*, row_number() over (
      partition by public.mtm_scanner_canonico(
        coalesce(nullif(ts.raw_payload->>'strategy',''), ts.alert_name)
      )
      order by ts.received_at desc
    ) as rn
    from public.tradingview_signals ts
    where (ts.signal_kind is null or ts.signal_kind = 'entry')
      -- Últimos 7 dias. O histórico fica na tabela; o feed é do que está a acontecer.
      and ts.received_at > now() - interval '7 days'
      -- Sem ticker não há sinal (nem gráfico): são alertas de desenho ou payloads partidos.
      and coalesce(ts.ticker, '') <> ''
      -- Descartados pelo webhook antes de serem sinal; nunca ocupam vaga no feed.
      and coalesce(ts.trade_status, '') <> 'filtered'
      -- Alertas de teste nunca são sinais de ninguém.
      and coalesce(ts.alert_name, '') !~* '(test|teste)'
      and coalesce(ts.raw_payload->>'strategy', '') !~* '(test|teste)'
      and coalesce(ts.ticker, '') !~* 'test'
  ) t
  where t.rn <= greatest(1, p_per_strategy)
  order by t.received_at desc
  limit greatest(1, p_total);
$$;
