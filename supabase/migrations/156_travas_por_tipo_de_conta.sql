-- AS TRAVAS POR TIPO DE CONTA — financiada 3 %/6 %, real 30 % e SL ≤ 95 % da banca.
--
-- ── O QUE ESTA MIGRAÇÃO ACRESCENTA, E PORQUE ─────────────────────────────────────────────────
--
-- Pedido do dono (2026-09-29): «Drawdown diário máximo e margem livre mínima devem ser para contas
-- de prop firms; as reais não têm essa regra. Financiadas: usam 3% diária, máx. global 6%. Reais:
-- diário 30% e SL máximo 95% da banca.»
--
-- Os limiares vivem em `site_settings.travas_por_tipo_de_conta` e não em constantes no código, para
-- se poderem afinar sem publicar. Quem os lê: `lib/travas-por-tipo-de-conta.ts:lerLimitesPorTipo`,
-- e quem os aplica está listado em `lib/copia-contas/mestre-controlos.ts` — a regra desta casa é que
-- um campo de configuração só aparece num painel se houver um motor a lê-lo.
--
-- IMPORTANTE: sem esta migração aplicada, as travas FUNCIONAM — o código cai nos valores que o dono
-- ditou (`LIMITES_POR_TIPO`) e mede a perda global contra `saldo_inicial`. O que falta sem ela é (a)
-- poder afinar os números sem publicar e (b) as REPOSIÇÕES: sem `travas_base_global` e sem a tabela
-- de auditoria, uma reposição não tem onde ficar registada — e por isso a rota recusa-a em vez de a
-- fazer em silêncio.
--
-- ── PORQUE É QUE A REPOSIÇÃO NÃO MEXE NO `saldo_inicial` ─────────────────────────────────────
--
-- A perda global mede-se contra uma base, e repor o contador é mover essa base para a equity do
-- momento. A tentação é mover o `saldo_inicial` — e seria um desastre silencioso: `saldo_inicial` é a
-- linha de partida da conta, é ele que `lib/admin-centro/linha-de-agua.ts` usa em TODOS os ecrãs e na
-- prova que esta casa publica. Mover 10 000 → 9 400 para repor uma trava fazia uma conta a −6 %
-- aparecer a 0 % no cockpit, no admin e na prova, para sempre.
--
-- Daí a coluna nova `travas_base_global`: só a trava a lê, a linha de água nunca. Com ela a NULL, a
-- base é o `saldo_inicial` — que é o que se quer numa conta que nunca foi reposta.
--
-- ── A AUDITORIA É A PARTE QUE NÃO SE PODE PERDER ─────────────────────────────────────────────
--
-- Uma prop firm não precisa de saber que a conta está viva; precisa de saber QUEM rebentou O QUÊ e
-- QUANTAS VEZES. Um contador que se repõe sem rasto apaga exactamente essa informação. Por isso cada
-- reposição grava uma linha com quem, quando, a equity e o saldo no momento, a base antes e depois, e
-- a percentagem de perda que estava atingida — e o ecrã do trader mostra o número de reposições ao
-- lado das barras, sem o esconder.
--
-- Aditiva e idempotente. NÃO APLICAR sem rever.

begin;

-- ── 1. os limiares, configuráveis ───────────────────────────────────────────
-- `margemLivreMinPct` fica a null de propósito nos dois tipos: a margem mínima é regra de prop firm,
-- mas nenhuma percentagem foi dada — e inventar uma era recusar entradas por uma regra imaginada.
-- Desafio, torneio e provider não aparecem aqui: quem os governa é `mtm_funded_programs.regras`
-- (avaliarConta) e `sinais_config.travas` (as travas da mestre). Duas travas sobre o mesmo número
-- davam dois limites diferentes para a mesma conta.
insert into public.site_settings (key, value, description)
values (
  'travas_por_tipo_de_conta',
  -- `excluirAnalise: false` é uma decisão, não um esquecimento. Hoje 15 das 16 contas `financiada` e 9
  -- das 12 `real` têm `analise: true` (são as contas-espelho que medem cada estratégia): excluí-las
  -- fazia os 3 %/6 % não se aplicarem praticamente a conta nenhuma. E um espelho que ignora os 3 %
  -- mostra um lucro que uma conta financiada de verdade nunca teria tido, porque a verdadeira tinha
  -- parado de abrir — a mesma família de erro do «preço de entrada viciado». Pôr `true` aqui exclui-as.
  '{
    "financiada":    { "perdaDiariaPct": 3,  "perdaGlobalPct": 6,    "slMaxPctDaBanca": null, "margemLivreMinPct": null },
    "real":          { "perdaDiariaPct": 30, "perdaGlobalPct": null, "slMaxPctDaBanca": 95,   "margemLivreMinPct": null },
    "excluirAnalise": false
  }'::jsonb,
  'Travas das contas que RECEBEM, por tipo (lib/travas-por-tipo-de-conta.ts). Financiada = prop firm: perda diária 3 % e global 6 %. Real: perda diária 30 % e SL máximo 95 % da banca, sem drawdown global nem margem mínima. Só travam ABERTURAS — as saídas passam sempre.'
)
on conflict (key) do nothing;

-- ── 2. a base da perda global (move-se numa reposição; o saldo_inicial nunca) ────────────────
alter table public.mtm_trading_accounts
  add column if not exists travas_base_global numeric;

comment on column public.mtm_trading_accounts.travas_base_global is
  'Base da trava de perda global (lib/travas-por-tipo-de-conta.ts). NULL = mede-se ao saldo_inicial. Uma reposição escreve aqui a equity do momento — NUNCA no saldo_inicial, que é a linha de água usada em todos os ecrãs e na prova.';

-- ── 3. a âncora do dia das contas de CORRETORA (motor da cópia) ─────────────
--
-- As contas simuladas já têm `sim_ancora_dia`, mantida pelo motor. As contas de corretora não têm
-- nada parecido — e sem uma referência do dia, «perdeu 3 % hoje» não se consegue medir: medir contra
-- a linha de partida era medir a perda ACUMULADA e chamar-lhe do dia, o que travava a conta todas as
-- manhãs sem ela ter perdido nada hoje.
--
-- Escrita por `lib/mestres/servidor/trava-tipo-conta.ts` na primeira abertura de cada dia de
-- corretora (o dia que vira às 22:00 UTC, `diaDaCorretora` — o mesmo dia do motor simulado, para não
-- haver dois «dias» nesta casa).
alter table public.mestres_contas
  add column if not exists ancora_dia numeric,
  add column if not exists ancora_dia_em text;

comment on column public.mestres_contas.ancora_dia is
  'Equity com que o dia de corretora abriu nesta conta — base da trava de perda diária (lib/travas-por-tipo-de-conta.ts). Escrita pelo motor na primeira abertura do dia. Sem ela, a trava diária não se mede (e a acumulada continua).';

-- ── 4. a auditoria das reposições ───────────────────────────────────────────
create table if not exists public.funded_travas_resets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mtm_trading_accounts(id) on delete cascade,
  -- 'diaria' repõe a âncora do dia; 'global' move travas_base_global
  ambito text not null check (ambito in ('diaria', 'global')),
  -- quem carregou no botão. `feito_por` pode ser null quando a reposição vem de um processo da casa,
  -- mas `papel` nunca é: uma linha sem papel não diz se foi o trader ou um admin, que é o que a
  -- auditoria precisa de saber.
  feito_por uuid references auth.users(id) on delete set null,
  feito_por_email text,
  papel text not null check (papel in ('dono', 'admin', 'sistema')),
  em timestamptz not null default now(),
  -- o retrato do momento: sem isto, uma reposição antiga fica sem o número que a justificou
  equity_no_momento numeric,
  saldo_no_momento numeric,
  base_antes numeric,
  base_depois numeric,
  perda_diaria_pct numeric,
  perda_global_pct numeric,
  motivo text
);

create index if not exists funded_travas_resets_conta_idx
  on public.funded_travas_resets (account_id, em desc);

alter table public.funded_travas_resets enable row level security;

-- O trader vê as reposições DA SUA conta — é a informação que o modal lhe mostra («esta conta já foi
-- reposta 2 vezes»). Escrever é só do servidor (service role): um cliente a inserir linhas de
-- auditoria podia inventar reposições que não aconteceram, ou esconder as que aconteceram.
drop policy if exists funded_travas_resets_do_dono on public.funded_travas_resets;
create policy funded_travas_resets_do_dono
  on public.funded_travas_resets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.mtm_trading_accounts a
      where a.id = funded_travas_resets.account_id and a.user_id = auth.uid()
    )
  );

commit;
