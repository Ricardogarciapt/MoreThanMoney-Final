-- Trading Alerts — subscrições por utilizador (símbolos/estratégias/timeframes)
-- + notificação in-app automática para subscritores quando chega um sinal novo.
-- Aditivo: não altera o webhook nem o fluxo de chat/telegram existente.

create table if not exists public.user_signal_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  push_enabled boolean not null default true,
  symbols text[] not null default '{}',       -- vazio = todos os ativos
  strategies text[] not null default '{}',     -- vazio = todas as estratégias
  timeframes text[] not null default '{}',     -- vazio = todos os timeframes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_signal_subscriptions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'own_sub_select' and tablename = 'user_signal_subscriptions') then
    create policy "own_sub_select" on public.user_signal_subscriptions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own_sub_insert' and tablename = 'user_signal_subscriptions') then
    create policy "own_sub_insert" on public.user_signal_subscriptions for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'own_sub_update' and tablename = 'user_signal_subscriptions') then
    create policy "own_sub_update" on public.user_signal_subscriptions for update using (auth.uid() = user_id);
  end if;
end$$;

-- Função: cria notificação in-app para cada subscritor que corresponda ao sinal.
create or replace function public.notify_signal_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  norm_ticker text := upper(regexp_replace(coalesce(NEW.ticker, ''), '[^A-Za-z0-9]', '', 'g'));
  dir text := case
    when NEW.action ~* '(buy|long|compra|bull)' then 'COMPRA'
    when NEW.action ~* '(sell|short|venda|bear)' then 'VENDA'
    else coalesce(upper(NEW.action), 'SINAL')
  end;
begin
  if NEW.ticker is null then
    return NEW;
  end if;

  insert into public.notifications (user_id, type, title, message, data, read)
  select
    s.user_id,
    'trade_ideas',
    '🔔 Alerta de trade: ' || NEW.ticker || ' ' || dir,
    'Novo sinal ' || dir || ' em ' || NEW.ticker ||
      case when NEW.price is not null then ' @ ' || NEW.price::text else '' end,
    jsonb_build_object(
      'type', 'trade_alert',
      'signal_id', NEW.id,
      'ticker', NEW.ticker,
      'action', NEW.action,
      'timeframe', NEW.timeframe,
      'url', '/app-mobile?tab=trading-alerts'
    ),
    false
  from public.user_signal_subscriptions s
  where s.enabled = true
    and (
      array_length(s.symbols, 1) is null
      or exists (
        select 1 from unnest(s.symbols) sym
        where norm_ticker like '%' || upper(regexp_replace(sym, '[^A-Za-z0-9]', '', 'g')) || '%'
      )
    )
    and (
      array_length(s.timeframes, 1) is null
      or NEW.timeframe is null
      or NEW.timeframe = any (s.timeframes)
    );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_signal_subscribers on public.tradingview_signals;
create trigger trg_notify_signal_subscribers
  after insert on public.tradingview_signals
  for each row execute function public.notify_signal_subscribers();
