-- 106 — GOLDKILLER SEM TRAILING (decisão do dono, 16/09)
--
-- A 105 deu ao GoldKiller um break-even a 0,30R e deixou de propósito o trailing antigo da coluna
-- (arranca aos 40 pips, passo de 20), porque não fazia parte do pedido. A análise
-- (docs/analise-perfil-gk-aurum.md) mede o break-even COM esse trailing pior do que o break-even
-- sozinho: +0,090R contra +0,110R por trade. O dono mandou tirar.
--
-- Limpar as colunas NÃO chega: no cálculo das posições simuladas (lib/mtmfunded/estrategias-sinais/
-- calculo.ts), sem arranque o trailing cai para a distância ao TP1 e fica ligado. Por isso o
-- `sinais_config` ganha `semTrailing: true`, respeitado nos dois motores. Fica só o break-even.
-- Mesma ressalva da 105 — 213 trades, IC 95% a conter o zero, vantagem a encolher mês a mês. Voltar a medir daqui a um mês.

begin;

update public.mtmauto_providers
   set sinais_config = coalesce(sinais_config, '{}'::jsonb) || jsonb_build_object('semTrailing', true),
       trailing_arranca_pips = null,
       trailing_passo_pips = null
 where lower(slug) = 'goldkiller';

commit;
