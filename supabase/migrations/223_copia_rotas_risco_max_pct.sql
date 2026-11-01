-- 223 · copia_rotas.risco_max_pct — o risco máximo por trade da conta de destino, em % da equity.
-- Vem de mtmauto_accounts.risco_max_pct (MTM Auto) ou mtmcopy_connections.max_risk_percent (site),
-- escrito pelo planeamento das rotas (lib/mestres/planear.ts). O motor da cópia usa-o para decidir
-- se pode subir ao lote mínimo da corretora em símbolos de mínimo 0,1/1 (índices): sobe quando o
-- risco no mínimo cabe no tecto, recusa e diz o risco que daria quando não cabe (dono, 01/11/2026).
alter table public.copia_rotas add column if not exists risco_max_pct numeric(6,3);
comment on column public.copia_rotas.risco_max_pct is 'Risco máximo por trade da conta de destino (% da equity); null = sem tecto conhecido → regra antiga (subir ao mínimo só até 0,01)';

-- Preenche as rotas derivadas das contas MTM Auto (destino auto:<id>)
update public.copia_rotas r set risco_max_pct = a.risco_max_pct
  from public.mtmauto_accounts a
 where r.mestres and r.destino_ref = 'auto:' || a.id::text and r.risco_max_pct is null and a.risco_max_pct > 0;

-- … e das ligações do site (destino site:<id>)
update public.copia_rotas r set risco_max_pct = c.max_risk_percent
  from public.mtmcopy_connections c
 where r.mestres and r.destino_ref = 'site:' || c.id::text and r.risco_max_pct is null and c.max_risk_percent > 0;
