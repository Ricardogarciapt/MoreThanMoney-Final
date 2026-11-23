-- Teste B (23/11/2026): conta MTM Auto que sai com a mestre em vez de copiar o trailing.
-- Ver lib/mestres/planear.ts flagsDaContaAuto.
alter table public.mtmauto_accounts add column if not exists sair_com_mestre boolean not null default false;
