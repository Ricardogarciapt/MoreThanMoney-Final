-- 128 · As percentagens que o dono aprovou, os degraus de rank, e o número do pagamento
--
-- PORQUÊ AGORA
-- A 127 deixou a tabela de regras VAZIA de propósito: sem percentagens decididas, não se calcula
-- nada. O dono decidiu-as (25/09), a partir dos números reais do negócio — preços, margem,
-- permanência e taxa de falha de pagamentos. Entram aqui como DADOS SEMEADOS, não como valores
-- por omissão no código: ficam editáveis no admin, e mudá-las amanhã não reescreve o que foi
-- calculado hoje (é para isso que as regras têm `valido_de`/`valido_ate`).
--
-- AS TRÊS TABELAS DE PERCENTAGENS, nas palavras dele
--
--  SUBSCRIÇÕES (Membro 35 €/mês, Premium 65 €/mês, Elite 597 €/ano)
--    1.º pagamento: prospector 5 % · setter 10 % · closer 20 %          → 35 % do 1.º mês
--    residual mensal: closer 5 % · team_leader 5 %                       → 10 % de cada renovação
--
--  VENDA ÚNICA (licenças do Sensei EA, scanners vitalícios): 40 % no total, na mesma proporção
--    relativa — prospector 5 · setter 10 · closer 20 · team_leader 5. Sem residual, porque não há
--    entrega recorrente para manter.
--
--  MTM FUNDED (desafios): TECTO de 15 % no total. O risco fica na conta financiada, por isso
--    paga-se menos. A mesma proporção (5:10:20:5 = 40) escalada por 15/40 = 0,375 →
--    prospector 1,875 % · setter 3,75 % · closer 7,5 % · team_leader 1,875 %. Soma: 15 %.
--
-- OS RANKS SOBEM A PERCENTAGEM *DELE*, NÃO ACRESCENTAM CAMADAS
-- O erro clássico do MLM é o rank dar mais um nível de descendência a pagar: multiplica o custo
-- sem multiplicar a receita. Aqui o degrau sobe a percentagem da PRÓPRIA pessoa, e a árvore não
-- cresce. Para o closer, pelas vendas DO MÊS em que a venda acontece:
--    até 5 vendas → 20 % · de 6 a 10 → 25 % · acima de 10 → 30 %
-- Só no 1.º pagamento; o residual fica nos 5 % em todos os degraus.
--
-- COMO O DEGRAU SE APLICA AOS OUTROS PACKS (decisão a confirmar com o dono)
-- Os 20/25/30 são a escala das SUBSCRIÇÕES. Aplicados em bruto a um desafio MTM Funded, um closer
-- no topo passava de 7,5 % para 30 % — quatro vezes mais, e o tecto de 15 % que ele definiu ia
-- pelo ar. Por isso o degrau entra como PROPORÇÃO e não como substituição: 25 % sobre um degrau
-- base de 20 % é ×1,25, e é esse factor que se aplica à percentagem do pack (7,5 % → 9,375 %).
-- Os números do dono ficam à vista e editáveis; o que o código faz com eles é proporcional e não
-- fura tectos. Se ele preferir substituição pura, muda-se num sítio (`lib/vendas/calculo.ts`).
--
-- O NÚMERO DO PAGAMENTO
-- O residual só conta a partir do SEGUNDO pagamento efectivo. A permanência média medida foi de
-- 10,8 meses, mas sai de subscrições quase todas manuais (a data de expiração reflecte o que foi
-- CONCEDIDO, não o que foi PAGO) e 72 % dos perfis estão inactivos: a permanência real paga é
-- provavelmente bem menor. Pagar residual sobre o primeiro pagamento é pagar sobre clientes que
-- nunca chegaram a ser clientes. `vendas_comissoes.numero_pagamento` grava qual pagamento era.

begin;

-- ═══════════════════════ 1. Os degraus de rank (configuráveis) ═══════════════════════
--
-- Mesma disciplina das regras de comissão: imutáveis, com vigência. `papel` fica no desenho
-- mesmo que hoje só o closer tenha degraus — quando o dono quiser dar escala ao setter, é uma
-- linha no admin e não um deploy.

create table if not exists public.vendas_regras_rank (
  id         uuid primary key default gen_random_uuid(),
  papel      text        not null
    check (papel in ('afiliado','setter','closer','prospector','team_leader')),
  -- O limiar: a partir de quantas vendas NO MÊS este degrau vale. O degrau de menor limiar é o
  -- degrau BASE — é a percentagem dele que serve de referência ao factor.
  min_vendas integer     not null check (min_vendas >= 0),
  pct        numeric(6,3) not null check (pct >= 0 and pct <= 100),
  valido_de  timestamptz not null default now(),
  valido_ate timestamptz,
  nota       text,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em  timestamptz not null default now()
);

create unique index if not exists uq_vendas_regras_rank_em_vigor
  on public.vendas_regras_rank (papel, min_vendas)
  where valido_ate is null;

alter table public.vendas_regras_rank enable row level security;
revoke all on public.vendas_regras_rank from anon, authenticated;

-- ═══════════════════════ 2. O que cada comissão passa a gravar ═══════════════════════
--
-- Subir de rank a meio do mês não pode reescrever o que já foi calculado. Por isso o degrau, a
-- contagem de vendas do mês e a percentagem ANTES do factor ficam gravados na linha: um ano
-- depois ainda se consegue reconstruir a conta à mão.
alter table public.vendas_comissoes
  add column if not exists pct_base         numeric(6,3),
  add column if not exists rank_regra_id    uuid references public.vendas_regras_rank(id) on delete set null,
  add column if not exists rank_min_vendas  integer,
  add column if not exists vendas_no_mes    integer,
  -- 1 = primeiro pagamento deste cliente. O residual só existe de 2 para cima.
  add column if not exists numero_pagamento integer;

-- ═══════════════════════ 3. As percentagens do dono ═══════════════════════
--
-- Semeia-se SEM sobrescrever: se já houver uma regra em vigor para um caso (porque o dono já a
-- mexeu no admin), a dele manda. Um seed que faz UPDATE é um seed que desfaz decisões.

-- ── 3.1 Subscrições: 1.º pagamento ──
insert into public.vendas_regras_comissao (papel, pack, pct, aplica_a, nota)
select p.papel, k.pack, p.pct, 'primeira', 'Semeado da tabela aprovada pelo dono (25/09): subscrições, 1.º pagamento.'
from (values
  ('prospector', 5.0),
  ('setter',    10.0),
  ('closer',    20.0)
) as p(papel, pct)
cross join (values
  ('app_member_monthly'), ('app_member_annual'),
  ('premium_monthly'), ('premium_annual'),
  ('elite_annual')
) as k(pack)
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.papel = p.papel and r.pack = k.pack and r.aplica_a = 'primeira' and r.valido_ate is null
);

-- ── 3.2 Subscrições: residual mensal (só do 2.º pagamento em diante — ver o código) ──
insert into public.vendas_regras_comissao (papel, pack, pct, aplica_a, nota)
select p.papel, k.pack, p.pct, 'renovacao', 'Semeado da tabela aprovada pelo dono (25/09): residual mensal das subscrições.'
from (values
  ('closer',      5.0),
  ('team_leader', 5.0)
) as p(papel, pct)
cross join (values
  ('app_member_monthly'), ('app_member_annual'),
  ('premium_monthly'), ('premium_annual'),
  ('elite_annual')
) as k(pack)
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.papel = p.papel and r.pack = k.pack and r.aplica_a = 'renovacao' and r.valido_ate is null
);

-- ── 3.3 Venda única: 40 % no total, sem residual ──
--
-- Entram as licenças do Sensei (o exemplo que o dono deu) e os vitalícios — produtos que se
-- entregam uma vez. Os scanners MENSAIS e o semestral ficam DE FORA de propósito: são
-- subscrições de uma ferramenta e o dono não disse a que tabela pertencem. Sem regra, o sistema
-- registra a venda, não paga nada, e mostra-a no admin como «falta decidir» — que é o
-- comportamento certo. Inventar-lhes uma percentagem era decidir por ele.
insert into public.vendas_regras_comissao (papel, pack, pct, aplica_a, nota)
select p.papel, k.pack, p.pct, 'ambos', 'Semeado da tabela aprovada pelo dono (25/09): venda única, 40 % no total.'
from (values
  ('prospector',  5.0),
  ('setter',     10.0),
  ('closer',     20.0),
  ('team_leader', 5.0)
) as p(papel, pct)
cross join (values
  ('sensei_ea_annual'), ('sensei_ea_lifetime'),
  ('sensei_scalp_annual'), ('sensei_scalp_lifetime'),
  ('goldkiller_lifetime'), ('aurumflow_lifetime'),
  ('mtm_scanner_lifetime'), ('scanners_lifetime')
) as k(pack)
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.papel = p.papel and r.pack = k.pack and r.aplica_a = 'ambos' and r.valido_ate is null
);

-- ── 3.4 MTM Funded: tecto de 15 % no total ──
--
-- Um só pack ('mtmfunded') para todos os desafios: o tecto é do produto, não do tamanho da conta.
-- Qual foi o programa fica na nota da venda.
insert into public.vendas_regras_comissao (papel, pack, pct, aplica_a, nota)
select p.papel, 'mtmfunded', p.pct, 'ambos',
       'Semeado da tabela aprovada pelo dono (25/09): MTM Funded, tecto de 15 % (proporção 5:10:20:5 × 0,375).'
from (values
  ('prospector',  1.875),
  ('setter',      3.750),
  ('closer',      7.500),
  ('team_leader', 1.875)
) as p(papel, pct)
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.papel = p.papel and r.pack = 'mtmfunded' and r.aplica_a = 'ambos' and r.valido_ate is null
);

-- ── 3.5 Os degraus do closer ──
insert into public.vendas_regras_rank (papel, min_vendas, pct, nota)
select 'closer', d.min_vendas, d.pct, d.nota
from (values
  (0,  20.0, 'Degrau base: até 5 vendas no mês.'),
  (6,  25.0, 'De 6 a 10 vendas no mês (×1,25 sobre o degrau base).'),
  (11, 30.0, 'Acima de 10 vendas no mês (×1,5 sobre o degrau base).')
) as d(min_vendas, pct, nota)
where not exists (
  select 1 from public.vendas_regras_rank r
  where r.papel = 'closer' and r.min_vendas = d.min_vendas and r.valido_ate is null
);

-- ═══════════════════════ 4. O PLANO DE COMISSÃO DE CADA PESSOA ═══════════════════════
--
-- PORQUÊ ISTO EXISTE (e porque não é uma data no código)
-- O MLM que já está vivo paga 50 % RECORRENTE em cada renovação (`mlm_settings.direct_commission_pct`
-- = 50, em `lib/mlm-renewal-commission.ts`) e isso foi PROMETIDO em público. Com o Premium a 65 €
-- são 32,50 €/mês ao patrocinador, para sempre: tirando Stripe e infra sobravam 16 a 23 € para
-- entregar o serviço, e com uma equipa de vendas por cima não fecha.
--
-- A tabela nova do afiliado (30 % na 1.ª mensalidade + 10 % em cada renovação) vale para quem
-- entra DE AGORA EM DIANTE. **Quem já tem 50 % mantém 50 %** — nas renovações dos membros que já
-- trouxe e nos que vier a trazer, até o dono decidir o contrário. Cortar rendimento a quem já cá
-- está, sem aviso, não se desfaz; o contrário muda-se com um interruptor. Por isso o defeito é
-- PRESERVAR.
--
-- E fica GRAVADO NA PESSOA, não numa condição «se entrou antes de tal dia» espalhada pelo
-- cálculo: uma data solta no código é impossível de auditar, não sobrevive a um recálculo, e não
-- deixa o dono migrar alguém de plano deliberadamente. Assim, cada pessoa tem o plano com que
-- entrou, o cálculo lê o plano dela, e mexer na tabela geral não toca em ninguém.

-- As regras passam a pertencer a um plano. 'padrao' é a tabela geral — a que o dono edita no
-- admin e que vale para quem não tem plano próprio.
alter table public.vendas_regras_comissao
  add column if not exists plano text not null default 'padrao';

-- O índice de unicidade passa a incluir o plano: o mesmo (papel, pack) pode ter percentagens
-- diferentes em planos diferentes, e é exactamente isso que preserva os 50 % de quem já cá está.
drop index if exists public.uq_vendas_regras_em_vigor;
create unique index if not exists uq_vendas_regras_em_vigor
  on public.vendas_regras_comissao (plano, papel, pack, aplica_a)
  where valido_ate is null;

create table if not exists public.vendas_pessoa_plano (
  pessoa_id   uuid primary key references public.profiles(id) on delete cascade,
  plano       text        not null,
  desde       timestamptz not null default now(),
  -- Quem a pôs neste plano e porquê. Mover alguém de plano mexe-lhe no rendimento: tem de ter dono.
  definido_por uuid references public.profiles(id) on delete set null,
  nota        text,
  atualizado_em timestamptz not null default now()
);

alter table public.vendas_pessoa_plano enable row level security;
revoke all on public.vendas_pessoa_plano from anon, authenticated;

-- ── 4.1 O afiliado na tabela nova (plano 'padrao') ──
insert into public.vendas_regras_comissao (plano, papel, pack, pct, aplica_a, nota)
select 'padrao', 'afiliado', k.pack, v.pct, v.aplica_a,
       'Semeado da tabela aprovada pelo dono (25/09): afiliado 30 % na 1.ª mensalidade + 10 % por renovação.'
from (values
  (30.0, 'primeira'),
  (10.0, 'renovacao')
) as v(pct, aplica_a)
cross join (values
  ('app_member_monthly'), ('app_member_annual'),
  ('premium_monthly'), ('premium_annual'),
  ('elite_annual')
) as k(pack)
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.plano = 'padrao' and r.papel = 'afiliado' and r.pack = k.pack
    and r.aplica_a = v.aplica_a and r.valido_ate is null
);

-- ── 4.2 O plano de quem já cá está: 'afiliado_legado_50' ──
--
-- 50 % sobre TODOS os packs, na primeira e nas renovações. «Todas» e não só as renovações porque
-- é isso que o código faz hoje: `mlm-checkout-commission.ts` e `mlm-renewal-commission.ts` leem a
-- MESMA `direct_commission_pct`. Preservar é manter o que a pessoa recebia, não a nossa leitura
-- optimista do que ela recebia.
insert into public.vendas_regras_comissao (plano, papel, pack, pct, aplica_a, nota)
select 'afiliado_legado_50', 'afiliado', '*', 50.0, 'ambos',
       'Salvaguarda: quem já era afiliado mantém os 50 % do MLM antigo até o dono decidir o contrário.'
where not exists (
  select 1 from public.vendas_regras_comissao r
  where r.plano = 'afiliado_legado_50' and r.papel = 'afiliado' and r.pack = '*'
    and r.aplica_a = 'ambos' and r.valido_ate is null
);

-- NÃO se põe ninguém no plano legado automaticamente aqui.
--
-- Quem é «afiliado antigo» é uma lista de pessoas concretas, e essa decisão é do dono: há
-- patrocinadores em `mlm_nodes` que nunca trouxeram ninguém, contas duplicadas da mesma pessoa
-- (ver a memória «contas duplicadas e login»), e nós não vamos atribuir 50 % vitalícios com um
-- `insert ... select` de uma tabela que tem 45 linhas de origens misturadas. O admin tem o botão;
-- o rasto (`definido_por`, `nota`) fica em cada linha.

commit;

-- O QUE FICA POR DECIDIR (e o admin mostra como tal, em vez de adivinhar):
--   · scanners mensais e semestral (`mtm_scanner_monthly`, `scanners_monthly`, `scanners_semestral`)
--     — subscrição de ferramenta: paga como subscrição ou como venda única?
--   · degraus de rank para setter, prospector e team_leader — a tabela já os aceita, o dono ainda
--     não os definiu.
--   · QUEM entra no plano 'afiliado_legado_50' — a lista é do dono, não se adivinha de `mlm_nodes`.
