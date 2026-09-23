-- CONTA FAVORITA — «marca-me esta conta como favorita no WebTrader».
--
-- O WebTrader já tinha favoritos, mas só de SÍMBOLOS, e guardados no dispositivo. Uma pessoa com
-- várias contas (desafio, torneio, a real) abria sempre a última que usou — e quando muda de
-- telemóvel, a primeira da lista, que pode ser a que menos lhe interessa.
--
-- `favorita` é do DONO da conta (a mesma porta da etiqueta da 113): a conta marcada aparece no topo
-- do seletor e é a que abre quando não há última usada. Nada mais muda — não altera execução, nem
-- cópia, nem regras. Sem a migração aplicada, o select tolerante (numeros-conta.ts) ignora a coluna
-- e o WebTrader continua exactamente como estava.
alter table public.mtm_trading_accounts add column if not exists favorita boolean not null default false;
comment on column public.mtm_trading_accounts.favorita is 'O dono marcou esta conta como favorita: abre primeiro no WebTrader.';

create index if not exists idx_mtm_trading_accounts_favorita
  on public.mtm_trading_accounts (user_id) where favorita;
