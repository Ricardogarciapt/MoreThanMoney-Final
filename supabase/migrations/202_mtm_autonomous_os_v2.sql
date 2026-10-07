-- 202 · MTM AUTONOMOUS OS v2 (decisão do dono, 07/10/2026). Desenho: docs/mtm-autonomous-os-v2.md
--
-- O que faz (tudo aditivo e reversível — nada se apaga):
--   1. ciclo de vida económico (ACTIVE, PROVING, PROVEN, SCALING, MUTATING, UNDERPERFORMING,
--      SUSPENDED, ARCHIVED, IDLE) ao lado do `estado` antigo, que continua a ser escrito;
--   2. DNA operacional por agente (família, especialização, geração, dna jsonb, proof score);
--   3. genealogia dos clones (agentes_genealogia), memória económica (agentes_memoria) e missões
--      com workers efémeros (os_missoes);
--   4. ficha do arquivo (agentes_arquivo.tipo + ficha), e DELETE recusado em toda a equipa;
--   5. settings por omissão: os_objectivos (orgânico, pago 0), agentes_proof (pesos 30/20/15/15/10/10),
--      agentes_os_v2 (interruptor do caminho novo; desligar = volta à régua de 06/10);
--   6. instruções do CEO: bloco «MOTOR ECONÓMICO», com versão registada (como a 201).
-- Reverter: site_settings.agentes_os_v2.ligado = false (o motor volta ao caminho antigo).

-- 1. estado antigo aceita «arquivado» (o ARCHIVED do ciclo novo)
alter table public.agentes_equipa drop constraint if exists agentes_equipa_estado_check;
alter table public.agentes_equipa add constraint agentes_equipa_estado_check
  check (estado = any (array['vivo','em_risco','parado','pausado','reformado','morto','arquivado']));

-- 2. colunas novas
alter table public.agentes_equipa
  add column if not exists ciclo text not null default 'PROVING',
  add column if not exists ciclo_desde timestamptz not null default now(),
  add column if not exists ciclo_meta jsonb not null default '{}'::jsonb,
  add column if not exists familia text,
  add column if not exists especializacao text,
  add column if not exists geracao integer not null default 0,
  add column if not exists dna jsonb not null default '{}'::jsonb,
  add column if not exists efemero boolean not null default false,
  add column if not exists missao_id uuid,
  add column if not exists proof_score numeric,
  add column if not exists proof_banda text,
  add column if not exists proof_amostra_ok boolean not null default false,
  add column if not exists proof_em timestamptz,
  add column if not exists recursos_mult numeric not null default 1,
  add column if not exists clonagem_validada_em timestamptz,
  add column if not exists dominante boolean not null default false,
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_porque text;

alter table public.agentes_equipa drop constraint if exists agentes_equipa_ciclo_check;
alter table public.agentes_equipa add constraint agentes_equipa_ciclo_check
  check (ciclo = any (array['ACTIVE','PROVING','PROVEN','SCALING','MUTATING','UNDERPERFORMING','SUSPENDED','ARCHIVED','IDLE']));
alter table public.agentes_equipa drop constraint if exists agentes_equipa_familia_check;
alter table public.agentes_equipa add constraint agentes_equipa_familia_check
  check (familia is null or familia = any (array['CEO','SALES','CONTENT','GROWTH','CUSTOMER','PRODUCT','TRADING']));
alter table public.agentes_equipa drop constraint if exists agentes_equipa_recursos_check;
alter table public.agentes_equipa add constraint agentes_equipa_recursos_check check (recursos_mult >= 0.25 and recursos_mult <= 3);
alter table public.agentes_equipa drop constraint if exists agentes_equipa_arquivado_coerente;
alter table public.agentes_equipa add constraint agentes_equipa_arquivado_coerente
  check (ciclo <> 'ARCHIVED' or (arquivado_em is not null and arquivado_porque is not null) or estado in ('morto','reformado'));

-- O CEO (topo) nunca fica ARCHIVED: a imortalidade também na base.
create or replace function public.agentes_ceo_nao_se_arquiva() returns trigger language plpgsql as $$
begin
  if new.pilar = 'ceo' and new.pai_id is null and (new.ciclo = 'ARCHIVED' or new.estado in ('morto','arquivado')) then
    raise exception 'Regra do dono: o CEO é imortal — não se arquiva.';
  end if;
  return new;
end $$;
drop trigger if exists agentes_ceo_nao_se_arquiva on public.agentes_equipa;
create trigger agentes_ceo_nao_se_arquiva before insert or update on public.agentes_equipa
  for each row execute function public.agentes_ceo_nao_se_arquiva();

-- 4. nada da equipa se apaga (antes: só os mortos)
create or replace function public.agentes_mortos_nao_se_apagam() returns trigger language plpgsql as $$
begin
  raise exception 'Regra do dono (OS v2, 07/10): um agente nunca se apaga — arquiva-se (%).', old.nome;
end $$;

alter table public.agentes_arquivo
  add column if not exists tipo text not null default 'morte',
  add column if not exists ficha jsonb not null default '{}'::jsonb;
alter table public.agentes_arquivo drop constraint if exists agentes_arquivo_tipo_check;
alter table public.agentes_arquivo add constraint agentes_arquivo_tipo_check check (tipo in ('morte','arquivo'));

-- 3a. genealogia
create table if not exists public.agentes_genealogia (
  id uuid primary key default gen_random_uuid(),
  pai_id uuid not null references public.agentes_equipa(id),
  filho_id uuid not null references public.agentes_equipa(id),
  ninhada_id uuid not null,
  geracao integer not null,
  variacao text not null check (variacao in ('igual','hook','cta','publico','oferta','canal','missao')),
  variacao_texto text,
  origem_variacao text not null default 'catalogo' check (origem_variacao in ('pai','catalogo','nenhuma','ceo')),
  proof_pai numeric,
  dominante boolean not null default false,
  decidida_em timestamptz,
  decisao text,
  criado_em timestamptz not null default now(),
  unique (filho_id)
);
create index if not exists agentes_genealogia_pai on public.agentes_genealogia (pai_id, criado_em desc);
create index if not exists agentes_genealogia_ninhada on public.agentes_genealogia (ninhada_id);
alter table public.agentes_genealogia enable row level security;
create or replace function public.agentes_genealogia_nao_se_apaga() returns trigger language plpgsql as $$
begin
  raise exception 'Regra do dono (OS v2): a genealogia nunca se apaga.';
end $$;
drop trigger if exists agentes_genealogia_nao_se_apaga on public.agentes_genealogia;
create trigger agentes_genealogia_nao_se_apaga before delete on public.agentes_genealogia
  for each row execute function public.agentes_genealogia_nao_se_apaga();

-- 3b. memória económica (uma linha por agente, reescrita a cada passagem da vida; o histórico vai em jsonb)
create table if not exists public.agentes_memoria (
  agente_id uuid primary key references public.agentes_equipa(id),
  missao text,
  competencias text[] not null default '{}',
  canais text[] not null default '{}',
  janela_dias integer,
  custo_eur numeric not null default 0,
  receita_eur numeric not null default 0,
  margem_eur numeric not null default 0,
  diferido_eur numeric not null default 0,
  valor_marginal_eur numeric not null default 0,
  vendas integer not null default 0,
  oportunidades integer not null default 0,
  conversao numeric,
  cac_eur numeric,
  ltv_eur numeric,
  taxa_resposta numeric,
  taxa_erro numeric,
  confianca numeric,
  historico jsonb not null default '[]'::jsonb,
  experiencias jsonb not null default '[]'::jsonb,
  politicas jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.agentes_memoria enable row level security;

-- 3c. missões e workers efémeros
create table if not exists public.os_missoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  objectivo text,
  kpi text not null,
  familia text,
  especializacao text,
  base_agente_id uuid references public.agentes_equipa(id),
  estado text not null default 'aberta' check (estado in ('aberta','concluida','cancelada')),
  workers_pedidos integer not null default 0,
  workers_aprovados integer not null default 0,
  prazo timestamptz,
  criado_por text not null default 'CEO-MTM',
  porque text,
  resultado jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  fechada_em timestamptz
);
alter table public.os_missoes enable row level security;
alter table public.agentes_equipa drop constraint if exists agentes_equipa_missao_fk;
alter table public.agentes_equipa add constraint agentes_equipa_missao_fk foreign key (missao_id) references public.os_missoes(id);

-- 7. tipos de evento novos
alter table public.agentes_eventos drop constraint if exists agentes_eventos_tipo_check;
alter table public.agentes_eventos add constraint agentes_eventos_tipo_check check (tipo = any (array[
  'nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho','reformou','reformado','renomeado',
  'educou','escalou','desbloqueou','morreu','reproducao_bloqueada','versao_proposta','versao_aceite','versao_rejeitada',
  'versao_revertida','ciclo','envio','motor',
  'ciclo_estado','proof','clonagem_pedida','clonagem_validada','clonagem_bloqueada','dominante','missao','recursos','arquivado','worker','ceo_accao'
]));

-- 9. famílias dos 12 agentes de 07/10 e ciclo inicial (sem perder histórico: só acrescenta)
update public.agentes_equipa a set familia = m.familia, especializacao = coalesce(a.especializacao, m.esp),
  dna = a.dna || jsonb_build_object('familia', m.familia, 'especializacao', m.esp, 'missao', coalesce(a.papel, ''), 'tracking', a.chave_receita)
from (values
  ('CEO-MTM','CEO','Motor económico'), ('AG-SETTER','SALES','Setter'), ('AG-CLOSER','SALES','Closer'),
  ('AG-FORMACAO','SALES','Closer'), ('AG-PROSPECTOR','SALES','B2B'), ('AG-EMAIL','CUSTOMER','Retention'),
  ('AG-LMS','CUSTOMER','Onboarding'), ('AG-SOCIAL','CONTENT','Creative'), ('AG-SCANNER','TRADING','Scanner'),
  ('AG-TRADER','TRADING','Strategy'), ('AG-SAAS','PRODUCT','Development'), ('AG-SITE','PRODUCT','QA')
) as m(codigo, familia, esp)
where upper(a.chave_receita) = m.codigo and a.familia is null;

update public.agentes_equipa set
  ciclo = case
    when estado in ('morto','reformado','arquivado') then 'ARCHIVED'
    when estado in ('pausado','parado') or pausado then 'SUSPENDED'
    when criado_em > now() - interval '72 hours' then 'PROVING'
    when estado = 'em_risco' then 'UNDERPERFORMING'
    else 'ACTIVE' end,
  ciclo_desde = now(),
  arquivado_em = case when estado in ('morto','reformado') then coalesce(morto_em, reformado_em, now()) else arquivado_em end,
  arquivado_porque = case when estado in ('morto','reformado') then coalesce(causa_morte, 'reformado') else arquivado_porque end
where ciclo_meta = '{}'::jsonb;
update public.agentes_equipa set ciclo_meta = jsonb_build_object('tentativas', 0, 'reteste', false, 'migrado_de', estado) where ciclo_meta = '{}'::jsonb;

-- métricas por geração (linhagem = raiz da genealogia)
create or replace view public.agentes_metricas_geracao as
select a.familia, a.especializacao, a.geracao, count(*) as agentes,
       count(*) filter (where a.ciclo = 'ARCHIVED') as arquivados,
       round(avg(a.proof_score), 1) as proof_medio,
       max(a.proof_score) as proof_max,
       sum(a.receita) as receita_total,
       sum(a.gasto) as gasto_total
from public.agentes_equipa a
group by a.familia, a.especializacao, a.geracao;

-- 5. settings
insert into public.site_settings (key, value) values
  ('os_objectivos', jsonb_build_object(
     'receita_mensal_eur', 3000, 'orcamento_pago_mensal_eur', 0, 'tecto_pago_mensal_eur', 0, 'margem_minima_pct', 60,
     'canais_organicos', jsonb_build_array('instagram_organico','telegram','email_soft_opt_in','email_b2b','whatsapp_resposta','pipeline'),
     'canais_pagos_activos', jsonb_build_array(), 'regra', 'organico_primeiro',
     'listas_novas_permitidas', jsonb_build_array('b2b_paginas_publicas','optin_formularios','ex_clientes_soft_opt_in'),
     'recursos', jsonb_build_object('custo_subscricao_mensal_eur', 200, 'claude_ciclos_dia_max', 400),
     'tectos', jsonb_build_object(),
     'nota', 'OS v2 (07/10): arranque só orgânico. Pago = proposta; 1.ª activação de canal pago e subir o tecto = dono.')),
  ('agentes_proof', jsonb_build_object(
     'janela_dias', 14,
     'pesos', jsonb_build_object('receita',30,'margem',20,'conversao',15,'consistencia',15,'retencao',10,'custo',10),
     'amostra', jsonb_build_object('vendas_min',3,'dias_com_valor_min',2,'idade_horas_min',72),
     'referencias', jsonb_build_object('receita_eur',150,'custo_eur',15,'conversao_alvo',0.05,'conversao_prior',0.02,'prior_peso',20),
     'bandas', jsonb_build_object('testar',50,'candidato',70,'clonar',85,'escalar',95),
     'clones', jsonb_build_object('clonar',3,'escalar',5),
     'valor_diferido', jsonb_build_object('lead',0.5,'qualificado',2,'marcado',8,'apresentado',15,'resposta_b2b',5,'post_publicado',1),
     'peso_diferido', 0.5)),
  ('agentes_os_v2', jsonb_build_object('ligado', true, 'desde', now(),
     'ciclo', jsonb_build_object('graca_horas',72,'under_horas',48,'mutating_horas',48,'reteste_horas',72,'tentativas_max',2,'idle_horas',24)))
on conflict (key) do nothing;

-- 6. instruções do CEO: o motor económico (versão registada, avaliação em 7 dias)
with ceo as (
  select id, instrucoes from public.agentes_equipa
  where pilar = 'ceo' and pai_id is null
    and position('MOTOR ECONÓMICO (OS v2' in coalesce(instrucoes, '')) = 0
), novo as (
  select id, instrucoes as antes, instrucoes || E'\n\n' || 'MOTOR ECONÓMICO (OS v2, decisão do dono 07/10/2026). Não há «48 h sem receita → morre»: há um ciclo de vida económico (PROVING, ACTIVE, PROVEN, SCALING, MUTATING, UNDERPERFORMING, SUSPENDED, ARCHIVED) medido por valor marginal (receita + valor diferido medido − custo) e por Proof Score. Em cada ciclo:
1. Lês o P&L no retrato («os_pnl»): receita, custo da quota do claude -p (o recurso escasso), CAC, conversão, leads, funil, estados e Proof dos agentes, e o GARGALO.
2. Respondes à pergunta «qual é o melhor uso do próximo € e dos próximos 10 minutos?» com acções do teu catálogo: criar_missao (titulo, objectivo, kpi, base_codigo, workers, prazo_horas) — a quota decide quantos workers nascem; alocar_recursos (agente_codigo, mult 0,25–3); escalar (agente_codigo, modo clonar|recursos — só com Proof ≥ 70 e amostra; valida os pedidos REQUEST_CLONING); arquivar (agente_codigo, porque — reversível, nunca o CEO, nunca quem tem Proof ≥ 70 com amostra); suspender/retomar; fechar_missao.
3. FIND → TEST → CLONE → SCALE → MUTATE → KILL. Prioridade de arranque: orgânico, gasto pago 0 — leads que já existem (pipeline, radar, B2B) e listas novas SÓ com base legal (B2B de páginas públicas de empresas, opt-ins dos formulários, ex-clientes em soft opt-in). Nada de listas compradas de particulares.
4. Gastar dinheiro da casa: propões orçamento e alocação; a primeira activação de um canal pago e qualquer aumento do tecto mensal são do dono. Não tens ferramenta de compra.
5. À fila do dono só vai o que é HUMANO: jurídico, propriedade, credenciais, dinheiro de clientes, trading, apagar, permissões, merge, regulatório, o que nenhuma API permite, conflito de política e estratégia extraordinária. O resto, dentro dos guardrails, executa-se.
Os limites da casa ficam todos: não inventas números, não prometes lucro, RGPD e Lei 41/2004, regras das plataformas, isolamento das estratégias, nada de sinais atrasados, direito pago antes de executar, e nenhum agente tem ferramentas de dinheiro, trading ou apagar.' as depois from ceo
), versao as (
  insert into public.agentes_instrucoes_versoes
    (agente_id, autor, instrucoes_antes, instrucoes_depois, porque, aceita, veredicto, estado, receita_antes, avaliar_apos)
  select n.id, 'dono', n.antes, n.depois,
         'Decisão do dono (07/10): OS v2 — o CEO passa a motor económico (P&L, gargalo, missões, recursos, clonagem por Proof Score). Substitui a régua das 48 h por ciclo de vida económico.',
         true,
         'Acrescento por migração (o CEO não se reescreve). Nenhum limite retirado; o bloco repete os guardrails e a fila humana.',
         'activa',
         coalesce((select sum(greatest(e.valor, 0)) from public.agentes_eventos e
                   where e.agente_id = n.id and e.tipo = 'receita' and e.criado_em >= now() - interval '7 days'), 0),
         now() + interval '7 days'
  from novo n
  returning agente_id
)
update public.agentes_equipa a
set instrucoes = n.depois, atualizado_em = now()
from novo n
where a.id = n.id and a.id in (select agente_id from versao);
