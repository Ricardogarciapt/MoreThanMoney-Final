-- Fase 3: ligar follow-ups Sensei (TP/BE/SL) à mensagem de entrada + numeração de trade
create sequence if not exists sensei_trade_number_seq;

alter table sensei_trade_ideas
  add column if not exists telegram_message_id bigint,
  add column if not exists chat_message_id uuid,
  add column if not exists trade_number bigint;

update sensei_trade_ideas
set trade_number = nextval('sensei_trade_number_seq')
where trade_number is null;

alter table sensei_trade_ideas
  alter column trade_number set default nextval('sensei_trade_number_seq');

create index if not exists idx_sensei_ideas_followup
  on sensei_trade_ideas (symbol, timeframe, status, created_at desc);
