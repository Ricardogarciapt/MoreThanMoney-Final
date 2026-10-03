-- A HORA DO MERCADO, a par da hora do motor — `funded_precos.em_mercado`.
--
-- PORQUÊ (medido a 24/09/2026): o campo `em` é a hora a que o MOTOR tocou no preço, não a hora a
-- que o MERCADO o fez. Desde que o motor vive sem MetaApi, o ouro vem de fontes de recurso que
-- entram com `Date.now()`: o PAXG (pouco líquido) fica dezenas de segundos parado e era
-- re-carimbado de segundo a segundo, e o Yahoo aceita cotações com até 240 s de atraso. Ao vivo,
-- o `em` do XAUUSD avançou 19 vezes com o bid PARADO num minuto, e o maior congelamento carimbado
-- como fresco foi 7,5 s no ouro e 5,0 s no EURUSD. A guarda de frescura media a nossa vivacidade,
-- não a idade do preço — e foi com preços assim que 6 de 7 entradas da mestre do Sensei bateram
-- a favor da casa.
--
-- `em_mercado` é a hora que a FONTE declarou para aquele preço, quando a sabe dizer:
--   · conector MT5 (EA no terminal) → `time_msc` do tick da corretora;
--   · gold-api (ouro/prata à vista) → `updatedAt` da cotação;
--   · Yahoo (forex)                 → `regularMarketTime` da cotação;
--   · Binance bookTicker            → NULO (medido: o payload não traz hora nenhuma);
--   · ouro derivado do PAXG         → NULO (herda a perna que não tem hora);
--   · TradeLocker (/trade/quotes)   → NULO (a resposta não traz hora).
-- Onde a fonte não dá hora de mercado não se inventa uma: fica NULO, que é a verdade, e quem lê
-- decide (lib/mtmfunded/precos/preenchimento.ts cai no caminho pessimista, o de hoje).
--
-- ADITIVA E SEGURA: coluna anulável, sem `not null`, sem default, sem reescrever linhas. O motor
-- antigo continua a escrever só `symbol/bid/ask/em` e nada quebra; o leitor antigo ignora-a.
alter table public.funded_precos add column if not exists em_mercado timestamptz;

comment on column public.funded_precos.em_mercado is
  'Hora a que o MERCADO fez este preço, declarada pela fonte (conector MT5, gold-api, Yahoo). NULA quando a fonte não a dá (Binance bookTicker, PAXG derivado, TradeLocker) — nunca inventada. `em` é só o carimbo do motor.';

comment on column public.funded_precos.em is
  'Hora a que o MOTOR carimbou este preço. Prova que o motor está vivo, NÃO que o preço é fresco — para isso é `em_mercado`.';
