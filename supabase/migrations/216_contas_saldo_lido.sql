-- 216 — Saldo e equity LIDOS das contas de corretora (MT4/MT5/TradeLocker), guardados.
--
-- As listas de contas do admin (Centro, backoffice → Gestão → Contas, /admin/mtmcopy) só mostravam o
-- saldo depois de «Ver posições (ao vivo)». As contas MTM Funded já guardam sim_saldo/sim_equity; as de
-- corretora não guardavam nada actual (baseline_balance é a referência de quando se ligou).
--
-- Escreve-se aqui sempre que o servidor JÁ lê a conta (vista ao vivo, cópia a dimensionar lotes) e no
-- botão «Actualizar saldos» do Centro (lotes pequenos, só as contas com leitura velha). As listas lêem
-- esta tabela — nunca uma chamada à MetaApi por linha.
create table if not exists public.contas_saldo_lido (
  chave    text primary key,            -- id MetaApi (MT4/MT5) ou a ref da ligação (TradeLocker)
  ref      text,                        -- a ligação por onde se leu (site:/auto:/wt:/prov:)
  saldo    numeric,
  equity   numeric,
  moeda    text,
  origem   text not null default 'vista', -- vista | copia | actualizar
  lido_em  timestamptz not null default now()
);

-- Só o service role (servidor) lê e escreve.
alter table public.contas_saldo_lido enable row level security;
