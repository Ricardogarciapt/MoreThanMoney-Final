-- 234 — COTAÇÕES DA /portfolios GUARDADAS NA BASE (um cron escreve, a página só lê)
--
-- Até aqui cada visitante da /portfolios, a cada 2 minutos, ia buscar as cotações fora (Binance,
-- CoinGecko, Yahoo) e pedia à IA os TP/SL de CADA activo cripto. Na Vercel (EUA) a api.binance.com
-- responde 451, o CoinGecko grátis corta por limite e a página ficava sem preços; a IA era paga por
-- visita. Agora: o cron /api/cron/portfolio-cotacoes (de 15 em 15 min) escreve aqui com fontes
-- grátis (data-api.binance.vision, Yahoo; CoinGecko só para o que faltar) e os TP/SL da IA uma vez
-- por dia por activo. A página lê esta tabela.

create table if not exists public.portfolio_cotacoes (
  symbol        text primary key,
  tipo          text not null check (tipo in ('cripto', 'etf')),
  preco         numeric,
  var_24h_pct   numeric,
  fonte         text,
  atualizado_em timestamptz not null default now(),
  tp1           numeric,
  tp2           numeric,
  tp3           numeric,
  stop_loss     numeric,
  ia_validado   boolean not null default false,
  ia_em         timestamptz
);

alter table public.portfolio_cotacoes enable row level security;

-- Leitura pública (são cotações de mercado da página pública); escrita só com a service role.
drop policy if exists portfolio_cotacoes_ler on public.portfolio_cotacoes;
create policy portfolio_cotacoes_ler on public.portfolio_cotacoes for select using (true);
