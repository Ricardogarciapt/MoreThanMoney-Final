-- 105 — PERFIL DE RISCO DO GOLDKILLER E DO AURUM FLOW: break-even e trailing em FRACÇÃO DO RISCO.
--
-- Decisão do dono (16/09): «aplica o BE 0,30R no goldkiller e corrige a unidade do aurum».
--
-- DE ONDE VÊM OS NÚMEROS: da medição em velas reais de 12/07 a 16/09 —
--   docs/analise-perfil-gk-aurum.md (tabelas geradas) e -leitura.md (a leitura à mão).
-- O motor que os lê é lib/mtmfunded/estrategias-sinais/calculo.ts (`beFracaoDoRisco`) e
-- lib/gestao-real/provider.ts; os testes estão em lib/mtmfunded/__tests__/perfil-fracao-risco.check.ts.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A RESSALVA, e é para ler antes de tomar isto por assente:
--
--  · GOLDKILLER. São 213 trades e dois meses. O BE 0,30R mede +0,110R por trade, mas o intervalo de
--    confiança a 95% é de ±0,128 — **contém o zero**. Isto NÃO é estatisticamente distinguível de
--    zero: é a melhor aposta com os dados que há, não um facto. E a vantagem encolhe mês a mês:
--    +0,198 em Julho, +0,062 em Agosto, −0,058 em Setembro (só 25 trades). Voltar a medir daqui a
--    um mês antes de o dar por assente.
--
--  · AURUM FLOW. Sem gestão nenhuma perde −0,067R por trade. Com a MELHOR gestão medida
--    (BE 0,75R + trailing a 1R com 0,5R de distância) passa a −0,009R: a gestão transforma a
--    sangria num EMPATE, **não** torna o Aurum lucrativo. Nenhum perfil medido é positivo. E o n
--    grande engana: dos 924 sinais, a maior parte cai entre 24/07 e 05/08, dezenas de símbolos a
--    disparar nos mesmos dias — é essencialmente UMA janela de mercado de duas semanas, com trades
--    muito correlacionados, por isso o intervalo calculado (±0,072) é optimista.
--
--  Ou seja: estes NÃO são perfis validados. São a menos má configuração medida. A decisão que fica
--  em cima da mesa para o Aurum não é «que break-even ponho» — é «ponho isto a executar?».
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- PORQUE É QUE É EM R E NÃO EM PIPS (a avaria que isto tapa):
--  1. O risco do próprio sinal do GoldKiller não é estável — mediana de 84 pips em Julho, 89 em
--     Agosto, 169 em Setembro. Um gatilho fixo em pips muda de significado sozinho.
--  2. Pior no Aurum: `pipSizeForSymbol` devolve 1 para cripto (PONTOS — é a convenção da casa e
--     está certa), por isso `trailing_arranca_pips = 40` passava pelo motor como 40 unidades DE
--     PREÇO. Num ONDOUSDT a 0,39 $ o trailing NUNCA armava; num BTCUSDT a 120 000 $ armava ao
--     primeiro tick. São ~42 perpétuos de 0,07 $ a 120 000 $: nenhum número absoluto serve para
--     todos. Por isso esta migração LIMPA essa coluna no Aurum — deixá-la lá era deixar os 40.
--
-- Aditiva e idempotente (merge de chaves no jsonb; correr duas vezes dá o mesmo).
-- NÃO APLICAR sem rever.

begin;

-- ── 1. GoldKiller: break-even a 0,30R com folga de 0,05R ─────────────────────────────────────
-- SEM trailing novo: a análise diz que o trailing é neutro no GoldKiller (+0,042R sozinho, e junto
-- com o BE PIORA — +0,090 contra +0,110), e o dono não o pediu. O `trailing_arranca_pips = 40` que
-- a estratégia já tinha na coluna fica como está: não faz parte desta decisão.
-- (o slug está gravado como 'Goldkiller', com maiúscula — daí o lower())
update public.mtmauto_providers
   set sinais_config = coalesce(sinais_config, '{}'::jsonb) || jsonb_build_object(
         'perfil', 'risco',
         'beFracaoDoRisco', 0.30,
         'beOffsetFracaoDoRisco', 0.05
       )
 where lower(slug) = 'goldkiller';

-- ── 2. Aurum Flow: a unidade. BE 0,75R, trailing a arrancar a 1R com 0,5R de distância ───────
-- O break-even LONGE é de propósito e é o contrário do GoldKiller: no Aurum o BE a 0,30R sobe a
-- taxa de vitórias para 71% e mesmo assim é o PIOR perfil (−0,046R) — os trades que salva valem
-- +0,05R cada e os que corta valiam muito mais. Só a partir de 0,75R a conta fica a favor.
update public.mtmauto_providers
   set sinais_config = coalesce(sinais_config, '{}'::jsonb) || jsonb_build_object(
         'perfil', 'risco',
         'beFracaoDoRisco', 0.75,
         'beOffsetFracaoDoRisco', 0.05,
         'trailingInicioFracaoDoRisco', 1.0,
         'trailingFracaoDoRisco', 0.5
       ),
       -- 40 unidades de preço. Sai: a partir daqui quem manda é a fracção do risco.
       trailing_arranca_pips = null
 where lower(slug) = 'aurum-flow';

-- ── 3. o que ficou (para quem aplica ver no log, sem ter de ir à tabela) ─────────────────────
do $$
declare r record;
begin
  for r in
    select slug, trailing_arranca_pips, sinais_config
      from public.mtmauto_providers
     where lower(slug) in ('goldkiller', 'aurum-flow')
     order by slug
  loop
    raise notice '105 · % → arranca_pips=% · sinais_config=%', r.slug, coalesce(r.trailing_arranca_pips::text, 'null'), r.sinais_config;
  end loop;
end $$;

commit;
