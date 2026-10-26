-- 213 · A «máquina do tempo» do agente trader, com o passado real.
--
-- Por estratégia + símbolo: quantas posições fecharam nas contas SIM nos últimos 60 dias, quantas
-- ganharam, o PnL somado, o risco somado e o R por trade (soma e soma dos quadrados, para média e
-- desvio). O agente (lib/agentes/trader-disciplina.ts) só abre onde isto mostra vantagem medida.
--
-- Só leitura, só agregados, sem dados de clientes: é uma vista, desfaz-se com `drop view`.
-- Excluídas as posições marcadas fora das estatísticas (testes internos, compensações).

create or replace view public.agente_trader_vantagem
with (security_invoker = true) as
select
  sp.estrategia,
  upper(fp.symbol) as symbol,
  count(*)::int as n,
  count(*) filter (where fp.pnl > 0)::int as ganhos,
  coalesce(sum(fp.pnl), 0)::float8 as pnl,
  coalesce(sum(abs(fp.risco_inicial)), 0)::float8 as risco,
  coalesce(sum(fp.pnl / nullif(abs(fp.risco_inicial), 0)), 0)::float8 as soma_r,
  coalesce(sum(power(fp.pnl / nullif(abs(fp.risco_inicial), 0), 2)), 0)::float8 as soma_r2
from public.funded_sinal_posicoes sp
join public.funded_positions fp on fp.id = sp.funded_position_id
where fp.estado = 'fechada'
  and fp.fora_estatisticas is null
  and fp.risco_inicial is not null and fp.risco_inicial <> 0
  and fp.fechada_em > now() - interval '60 days'
group by sp.estrategia, upper(fp.symbol);

-- Só o service role lê (o agente corre no servidor). Nada para anon/authenticated.
revoke all on public.agente_trader_vantagem from anon, authenticated;
grant select on public.agente_trader_vantagem to service_role;
