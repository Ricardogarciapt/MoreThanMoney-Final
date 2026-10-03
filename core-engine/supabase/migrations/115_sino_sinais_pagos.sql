-- 115 · Sino (notificações in-app) dos alertas: sinal pago só a quem tem direito
--
-- NÃO APLICADA. Escrita no ramo `fechar-fugas-premium` para o dono aplicar.
--
-- Porquê: o trigger `trg_notify_signal_subscribers` (em tradingview_signals) cria uma notificação
-- no sino para TODAS as contas activas que seguem o símbolo — e, sem escolha feita, os símbolos
-- por omissão incluem XAUUSD e BTCUSD, que é onde vivem o Sensei e o GoldKiller. O texto leva o
-- ativo, a direção e o preço («🔔 Alerta de trade: XAUUSD COMPRA · Novo sinal COMPRA em XAUUSD @
-- 2345»). Em 7 dias (11–18/09) foram 18 424 notificações destas a 43 contas sem direito a sinais
-- pagos (a maioria de sinais abertos — o problema é o mesmo caminho servir os pagos).
--
-- O que muda: SÓ os sinais pagos passam a exigir direito. A regra é a de lib/direito-sinais.ts
-- (a mesma do chat, dos Alertas MTM e do send-push), escrita em SQL:
--   • pago = GoldKiller; ou Sensei fora do forex e dos perpétuos (ver `alertaDeSinalPago`);
--   • direito = admin, VIP (user_type / member_category / membership_level), Premium/Fundador
--     (member_category / membership_level / subscription_plan), IQ; ou direito_mtm_auto.
-- Os sinais abertos (MTM Scanner, Aurum Flow, Sensei forex/perps) continuam exactamente como hoje.
--
-- Mudar a regra = mudar lib/direito-sinais.ts, este trigger e lib/__tests__/direito-sinais.check.ts.

create or replace function public.notify_signal_subscribers()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  norm_ticker text := upper(regexp_replace(coalesce(NEW.ticker, ''), '[^A-Za-z0-9]', '', 'g'));
  dir text := case
    when NEW.action ~* '(buy|long|compra|bull)' then 'COMPRA'
    when NEW.action ~* '(sell|short|venda|bear)' then 'VENDA'
    else coalesce(upper(NEW.action), 'SINAL')
  end;
  defaults text[] := array['XAUUSD','EURUSD','GBPUSD','USDCAD','USDJPY','BTCUSD','US30'];
  -- Espelho de scannerKeyFromStrategy (lib/mtm-alerts/scanners.ts): minúsculas, só [a-z0-9].
  estrategia text := regexp_replace(lower(coalesce(
    nullif(trim(NEW.raw_payload->>'strategy'), ''),
    nullif(trim(NEW.raw_payload->>'strategy_name'), ''),
    nullif(trim(NEW.raw_payload->>'scanner'), ''),
    nullif(trim(NEW.raw_payload->>'estrategia'), ''),
    NEW.alert_name,
    ''
  )), '[^a-z0-9]', '', 'g');
  -- Espelho de classifyAssetClass (lib/mtm-alerts/asset-class.ts).
  t_norm text := upper(regexp_replace(coalesce(NEW.ticker, ''), '[^A-Za-z0-9.]', '', 'g'));
  t_letras text := regexp_replace(upper(coalesce(NEW.ticker, '')), '[^A-Z]', '', 'g');
  fx text[] := array['EUR','USD','GBP','JPY','CHF','AUD','NZD','CAD','SGD','SEK','NOK','MXN','ZAR'];
  classe text;
  pago boolean := false;
begin
  if NEW.ticker is null then
    return NEW;
  end if;

  -- Só notifica ENTRADAS (não follow-ups de gestão: SL/TP/BE/exit)
  if NEW.signal_kind is not null and NEW.signal_kind <> 'entry' then
    return NEW;
  end if;

  classe := case
    when t_norm like '%XAUUSD%' or t_norm = 'BTCUSD' then 'gold_btc'
    when t_norm ~ '\.P$' or t_norm like '%USDT%' or t_norm like '%PERP%' then 'crypto_perp'
    when length(t_letras) = 6 and substr(t_letras, 1, 3) = any (fx) and substr(t_letras, 4, 3) = any (fx) then 'forex'
    else 'outro'
  end;

  pago := case
    when estrategia like '%aurum%' then false
    when estrategia like '%sensei%' then classe not in ('forex', 'crypto_perp')
    when estrategia like '%goldkiller%' or (estrategia like '%gold%' and estrategia like '%kill%') then true
    else false
  end;

  insert into public.notifications (user_id, type, title, message, data, read)
  select
    p.id,
    'trade_ideas',
    '🔔 Alerta de trade: ' || NEW.ticker || ' ' || dir,
    'Novo sinal ' || dir || ' em ' || NEW.ticker ||
      case when NEW.price is not null then ' @ ' || NEW.price::text else '' end,
    jsonb_build_object(
      'type', 'trade_alert', 'signal_id', NEW.id, 'ticker', NEW.ticker,
      'action', NEW.action, 'timeframe', NEW.timeframe, 'url', '/app-mobile?tab=trading-alerts'
    ),
    false
  from public.profiles p
  left join public.user_signal_subscriptions s on s.user_id = p.id
  where p.is_active = true
    and coalesce(s.enabled, true) = true
    and (
      (s.symbols is not null and array_length(s.symbols, 1) > 0
        and exists (select 1 from unnest(s.symbols) sym
                    where norm_ticker like '%' || upper(regexp_replace(sym, '[^A-Za-z0-9]', '', 'g')) || '%'))
      or
      ((s.symbols is null or array_length(s.symbols, 1) is null)
        and exists (select 1 from unnest(defaults) d where norm_ticker like '%' || d || '%'))
    )
    and (
      s.timeframes is null or array_length(s.timeframes, 1) is null
      or NEW.timeframe is null or NEW.timeframe = any (s.timeframes)
    )
    -- SINAL PAGO → só a quem tem direito (lib/direito-sinais.ts → temDireitoSinaisPagos).
    and (
      not pago
      or lower(coalesce(p.user_type, '')) in ('admin', 'vip')
      or lower(coalesce(p.member_category, '')) in ('vip', 'iq')
      or lower(coalesce(p.membership_level, '')) = 'vip'
      or lower(coalesce(p.member_category, '')) like any (array['%premium%', '%fundador%'])
      or lower(coalesce(p.membership_level, '')) like any (array['%premium%', '%founder%', '%fundador%'])
      or lower(coalesce(p.subscription_plan, '')) like any (array['%premium%', '%founder%', '%fundador%'])
      or coalesce((select d.tem from public.direito_mtm_auto(p.id, true) d limit 1), false)
    );

  return NEW;
end;
$function$;
