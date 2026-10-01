-- 173 — AS CONTAS DE PORTEFÓLIO DA CASA (PORTF-CRIPTO e PORTF-ETF)
--
-- O dono tem duas contas em `mtm_trading_accounts` que não são negociação: são CARTEIRAS
-- reconstituídas desde 1 de Março de 2024, com reforço semanal às sextas (DCA). O histórico
-- delas vive em `portefolio_movimentos` e a curva em `portefolio_curva` — e NÃO em
-- `funded_positions`, de propósito: `funded_positions.symbol` tem FK para `funded_symbols`, e
-- meter SPY/XRPUSDT no catálogo da corretora punha-os na lista de negociáveis do WebTrader e de
-- volta ao motor de preços, que foi deliberadamente podado. Isso fica como está.
--
-- O que faltava era a PERGUNTA: «esta conta é uma carteira reconstituída?». Três ecrãs decidiam-na
-- por adivinhação e erravam em silêncio:
--  · o detalhe «Conta ao vivo» calculava a equity como `saldo + flutuante das posições abertas`.
--    Sem linhas em `funded_positions` o flutuante dá ZERO e a equity sai igual ao saldo: a conta
--    Cripto, que está 2 632 $ ABAIXO do investido, aparecia como se estivesse a zero. Mostrar uma
--    perda como se não existisse é pior do que não mostrar nada.
--  · o separador Histórico somava zero tendo 2 139 movimentos na base;
--  · o filtro do seletor («As minhas» / «Mestres») tornava-as exclusivamente mestres — capital do
--    dono que não aparecia em «As minhas».
--
-- Porque é uma COLUNA e não uma chave em `metricas` — a mesma razão da 109 (`conta_real_casa`):
-- `metricas` é reescrita pelo motor da VPS (ler → juntar → gravar) e uma chave posta por migração
-- perdia-se entre a leitura e a gravação. Prova disso está nestas duas linhas: `metricas.equity`
-- já foi reescrita para o SALDO pelo motor, enquanto `sim_equity` (e `metricas.valor`) guardam o
-- valor de mercado verdadeiro.
--
-- E porque não bastava `conta_real_casa = true`: essa marca é maior (a conta T2T, a «Todos os
-- sinais» e as quatro contas-espelho também a têm) e essas negoceiam a sério, com posições em
-- `funded_positions`. Só estas duas é que têm a carteira noutra tabela.
--
-- `sim_equity` passa a ser o VALOR DE MERCADO destas contas e `sim_saldo` o CONTRIBUÍDO. É a
-- mesma fonte que a lista do seletor já lia (e que mostrava certo): o detalhe deixa de calcular.

alter table public.mtm_trading_accounts
  add column if not exists conta_portefolio boolean not null default false;

comment on column public.mtm_trading_accounts.conta_portefolio is
  'Carteira reconstituída (DCA): o histórico vive em portefolio_movimentos/portefolio_curva e não em funded_positions. sim_saldo = contribuído, sim_equity = valor de mercado — nunca se calcula a equity a partir das posições abertas nestas contas.';

-- As duas que existem. Pelo login e não pelo id: é o que o código e a rota pública usam.
update public.mtm_trading_accounts
   set conta_portefolio = true
 where mt5_login in ('PORTF-CRIPTO', 'PORTF-ETF')
   and conta_portefolio is distinct from true;

-- O Histórico/Métricas/Diário lê os movimentos de UMA conta por data decrescente.
create index if not exists portefolio_movimentos_conta_data_idx
  on public.portefolio_movimentos (conta_id, data desc);

-- A curva é lida inteira por conta, por ordem de data.
create index if not exists portefolio_curva_conta_data_idx
  on public.portefolio_curva (conta_id, data);
