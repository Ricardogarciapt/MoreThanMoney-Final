-- 250 — Links de auditoria também para contas REAIS ligadas (MT5 via MetaApi e TradeLocker).
--
-- Uma conta real não vive em mtm_trading_accounts: identifica-se pela referência do WebTrader
-- (`mt5:auto:<uuid>`, `mt5:site:<uuid>`, `tradelocker:auto:<uuid>`…) e pelo dono. A página pública
-- volta a confirmar a posse a cada leitura (o servidor abre a conta com o user_id do dono); se a
-- conta deixar de ser dele, o link deixa de mostrar dados. Um link activo por referência.

alter table public.funded_auditoria_links alter column account_id drop not null;
alter table public.funded_auditoria_links add column if not exists conta_ref text;
alter table public.funded_auditoria_links add column if not exists dono_id uuid references auth.users(id) on delete cascade;

do $$ begin
  alter table public.funded_auditoria_links add constraint funded_auditoria_links_alvo
    check (account_id is not null or (conta_ref is not null and dono_id is not null));
exception when duplicate_object then null; end $$;

create unique index if not exists funded_auditoria_links_ref_ativo
  on public.funded_auditoria_links (conta_ref) where ativo and revogado_em is null and conta_ref is not null;
