-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 183 — O MOTOR AUTÓNOMO DOS AGENTES: morte arquivada, reprodução com tectos, evolução reversível,
--        e o interruptor geral. (Decisões do dono, 06/10/2026.)
--
-- (181 = códigos AG-PROSPECTOR/SETTER/…, 182 = envios por aprovar — ambas de sessões paralelas.)
--
-- NÃO APLICAR SEM APROVAÇÃO DO DONO. Ao aplicar, a régua nova começa a contar a partir de AGORA
-- (`agentes_vida.regra_desde = now()`): nenhum agente morre por horas anteriores a esta migração —
-- os seis filhos de 01/10 estiveram 5 dias sem links assinados e não podem ser julgados por isso.
--
-- A lógica vive em código puro com guarda:
--   lib/agentes/vida.ts        — a régua (48 h sem receita → morto; graça 72 h; CEO imortal)
--   lib/agentes/motor.ts       — aplica a régua e ARQUIVA o morto (nunca apaga)
--   lib/agentes/reproducao.ts  — um filho por agente que vende, com os três tectos
--   lib/agentes/evolucao.ts    — propostas de instruções, decisão do CEO, reversão automática
--   lib/agentes/motor-interruptor.ts — o interruptor geral (site_settings.agentes_motor_ligado)
--   guarda: lib/agentes/motor-autonomo.check.ts (+ vida/motor/arvore/atribuicao .check.ts)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- ── 1. O estado `morto` e a sua certidão ─────────────────────────────────────────────────────────
alter table public.agentes_equipa drop constraint if exists agentes_equipa_estado_check;
alter table public.agentes_equipa add constraint agentes_equipa_estado_check
  check (estado in ('vivo','em_risco','parado','pausado','reformado','morto'));

alter table public.agentes_equipa add column if not exists morto_em timestamptz;
alter table public.agentes_equipa add column if not exists causa_morte text;
-- O ângulo com que o filho nasceu, à vista na linha (o histórico completo está nas versões).
alter table public.agentes_equipa add column if not exists mutacao text;
alter table public.agentes_equipa add column if not exists mutacao_origem text
  check (mutacao_origem is null or mutacao_origem in ('pai','catalogo'));

-- Um morto sem data nem causa é uma linha que ninguém sabe ler daqui a seis meses.
alter table public.agentes_equipa drop constraint if exists agentes_equipa_morto_coerente;
alter table public.agentes_equipa add constraint agentes_equipa_morto_coerente
  check (estado <> 'morto' or (morto_em is not null and causa_morte is not null));

-- ── 2. Os tipos de evento novos ──────────────────────────────────────────────────────────────────
-- A lista de partida é a que está HOJE em produção (lida a 06/10, inclui `renomeado`, que nunca
-- esteve em migração nenhuma) — escrever o CHECK só a partir dos ficheiros rebentou a 174.
-- ATENÇÃO a quem aplicar: se a 181 (paralela) tiver acrescentado tipos, juntá-los aqui antes.
alter table public.agentes_eventos drop constraint if exists agentes_eventos_tipo_check;
alter table public.agentes_eventos add constraint agentes_eventos_tipo_check
  check (tipo in (
    'nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho',
    'reformou','reformado','renomeado','educou','escalou','desbloqueou',
    -- 183
    'morreu',               -- a régua das 48 h matou-o (arquivado em agentes_arquivo)
    'reproducao_bloqueada', -- um tecto travou um nascimento (vai na linha do CEO)
    'versao_proposta','versao_aceite','versao_rejeitada','versao_revertida',
    'ciclo',                -- o motor acordou-o e ele trabalhou (resumo do ciclo)
    'envio',                -- uma mensagem saiu a quem já tinha iniciado contacto
    'motor'                 -- ligar/desligar/parar o motor
  ));

-- ── 3. O ARQUIVO DOS MORTOS ──────────────────────────────────────────────────────────────────────
-- O processo fechado: a linha como estava, receita total, instruções e TODOS os eventos, copiados
-- no instante da morte. A linha em agentes_equipa e os eventos em agentes_eventos ficam também —
-- isto é a cópia que não muda mais.
create table if not exists public.agentes_arquivo (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes_equipa(id) on delete restrict,
  nome text not null,
  codigo text,
  pai_id uuid,
  pilar text,
  nasceu_em timestamptz,
  morto_em timestamptz not null,
  causa_morte text not null,
  receita_total numeric(12,2) not null default 0,
  gasto_total numeric(12,2) not null default 0,
  orcamento numeric(12,2),
  instrucoes text,
  linha jsonb not null default '{}'::jsonb,
  eventos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create unique index if not exists agentes_arquivo_um_por_agente on public.agentes_arquivo (agente_id);
alter table public.agentes_arquivo enable row level security;
-- RLS ligada e zero políticas: lê-se pelo service-role (cron, /admin, motor).

-- NUNCA APAGADO — escrito na base, e não só no código. Um morto e o seu arquivo não se apagam
-- nem por engano de um script: o DELETE rebenta com o motivo.
-- Duas funções, e não uma com «tabela = arquivo OR old.estado»: o plpgsql não garante a ordem do
-- OR, e ler `old.estado` numa linha do arquivo (que não tem a coluna) rebentava com outro erro.
create or replace function public.agentes_mortos_nao_se_apagam() returns trigger
language plpgsql as $$
begin
  if old.estado = 'morto' then
    raise exception 'Regra do dono (06/10): um agente morto é ARQUIVADO, nunca apagado (%).', old.nome;
  end if;
  return old;
end $$;

create or replace function public.agentes_arquivo_nao_se_apaga() returns trigger
language plpgsql as $$
begin
  raise exception 'Regra do dono (06/10): o arquivo dos agentes mortos não se apaga (%).', old.nome;
end $$;

drop trigger if exists agentes_equipa_mortos_nao_se_apagam on public.agentes_equipa;
create trigger agentes_equipa_mortos_nao_se_apagam
  before delete on public.agentes_equipa
  for each row execute function public.agentes_mortos_nao_se_apagam();

drop trigger if exists agentes_arquivo_nao_se_apaga on public.agentes_arquivo;
create trigger agentes_arquivo_nao_se_apaga
  before delete on public.agentes_arquivo
  for each row execute function public.agentes_arquivo_nao_se_apaga();

-- ── 4. As versões das instruções ganham ciclo de vida ────────────────────────────────────────────
alter table public.agentes_instrucoes_versoes drop constraint if exists agentes_instrucoes_versoes_autor_check;
alter table public.agentes_instrucoes_versoes add constraint agentes_instrucoes_versoes_autor_check
  check (autor in ('ceo','dono','migracao','agente','reproducao'));

alter table public.agentes_instrucoes_versoes add column if not exists estado text not null default 'historico';
alter table public.agentes_instrucoes_versoes drop constraint if exists agentes_instrucoes_versoes_estado_check;
alter table public.agentes_instrucoes_versoes add constraint agentes_instrucoes_versoes_estado_check
  check (estado in (
    'historico',          -- as linhas de antes de 06/10
    'proposta',           -- um agente propôs; espera o CEO
    'recusada_guarda',    -- a guarda recusou à entrada (perdia um limite / concedia um poder)
    'activa',             -- o CEO aceitou; corre a janela seguinte
    'rejeitada',          -- o CEO rejeitou
    'confirmada',         -- passada a janela, a receita não baixou
    'revertida',          -- passada a janela, a receita baixou: voltaram as instruções de antes
    'mutacao_proposta',   -- o ângulo que um pai propõe para o próximo filho
    'mutacao_usada'       -- esse ângulo já deu um filho
  ));
alter table public.agentes_instrucoes_versoes add column if not exists mutacao text;
alter table public.agentes_instrucoes_versoes add column if not exists mutacao_angulo text;
alter table public.agentes_instrucoes_versoes add column if not exists decisao_ceo text;
alter table public.agentes_instrucoes_versoes add column if not exists accao_ceo text
  check (accao_ceo is null or accao_ceo in ('medir','propor','construir','baixar_custo','justificar'));
alter table public.agentes_instrucoes_versoes add column if not exists decidida_em timestamptz;
alter table public.agentes_instrucoes_versoes add column if not exists receita_antes numeric(12,2);
alter table public.agentes_instrucoes_versoes add column if not exists receita_depois numeric(12,2);
alter table public.agentes_instrucoes_versoes add column if not exists avaliar_apos timestamptz;
alter table public.agentes_instrucoes_versoes add column if not exists revertida_em timestamptz;

create index if not exists agentes_instrucoes_versoes_por_decidir
  on public.agentes_instrucoes_versoes (estado, criado_em desc)
  where estado in ('proposta','activa','mutacao_proposta');

-- ── 5. A configuração (site_settings) — só se ainda não existir; nunca reescreve a do dono ────────
insert into public.site_settings (key, value, description)
select v.key, v.value, v.description
from (values
  ('agentes_motor_ligado',
   jsonb_build_object('ligado', false, 'por', 'migracao', 'em', now(), 'porque', 'Desligado por omissão — o dono liga no /admin/agentes ou no painel do AIOS.'),
   'Interruptor geral do motor autónomo (aios/motor). O /admin/agentes, o painel do AIOS e o comando «para os agentes» escrevem AQUI.'),
  ('agentes_vida',
   jsonb_build_object('janela_horas', 48, 'graca_horas', 72, 'regra_desde', now()),
   'Régua de vida: 48 h sem receita atribuída → morto (arquivado). Graça do recém-nascido. A régua conta desde regra_desde.'),
  ('agentes_reproducao',
   jsonb_build_object('ligada', true, 'limiar_eur', 50, 'janela_dias', 7, 'max_vivos', 15,
                      'intervalo_filho_dias', 7, 'orcamento_filho', 5, 'orcamento_total_equipa', 250),
   'Reprodução automática: limiar de receita atribuída e os três tectos (vivos, 1 filho/7 dias/agente, orçamento total).'),
  ('agentes_evolucao',
   jsonb_build_object('janela_dias', 7),
   'Evolução: uma versão aceite que baixe a receita na janela seguinte é revertida automaticamente.'),
  ('agentes_motor',
   jsonb_build_object(
     'ritmo_ceo_min', 60, 'ritmo_filho_min', 180,
     'horas_trabalho', jsonb_build_array(0, 24),
     'contacto_dono', jsonb_build_array(10, 18),
     'max_execucoes_dia_agente', 8, 'max_execucoes_dia_total', 60,
     'timeout_ciclo_seg', 900, 'envios_dia_agente', 20),
   'Ritmo do motor: CEO de hora a hora, filhos a cada 3 h, tectos diários de execuções claude -p e de envios.')
) as v(key, value, description)
where not exists (select 1 from public.site_settings s where s.key = v.key);
