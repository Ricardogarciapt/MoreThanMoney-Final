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

-- ═════════════════════════════════════════════════════════════════════════════════════════════════
-- 6. CONTACTO POR INICIATIVA (decisão do dono, 06/10) — lib/agentes/contacto-inicial.ts
--
-- Os agentes passam a poder ESCREVER PRIMEIRO, sem fila, em três bases legais verificadas pelo
-- código: soft opt-in (clientes/ex-clientes, produto semelhante, saída na mensagem), consentimento
-- gravado no canal, e B2B (email profissional, MTM identificada, saída). Bloqueado pelo código:
-- particulares sem consentimento (email/SMS/WhatsApp/chamada), LinkedIn, WhatsApp sem template+opt-in.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════

-- 6.1 A LISTA DE EXCLUSÃO GLOBAL. Um pedido de saída, em qualquer canal, grava aqui o identificador
-- (email em minúsculas, telefone, chat do Telegram) — e o motor deixa de contactar essa pessoa em
-- TODOS os canais. Lê-se também captacao_consentimento.retirado_em, email_preferences.unsubscribed_all
-- e email_sends.unsubscribed_at: esta tabela junta o que esses sítios não cobrem.
create table if not exists public.contacto_exclusao (
  identificador text primary key,
  canal_origem text,
  pedido_em timestamptz not null default now(),
  nota text
);
alter table public.contacto_exclusao enable row level security;

-- Sair não se desfaz por script: apagar uma linha daqui era voltar a contactar quem pediu para sair.
create or replace function public.contacto_exclusao_nao_se_apaga() returns trigger
language plpgsql as $$
begin
  raise exception 'Quem pediu para sair não volta a ser contactado: a exclusão não se apaga (%).', old.identificador;
end $$;
drop trigger if exists contacto_exclusao_nao_se_apaga on public.contacto_exclusao;
create trigger contacto_exclusao_nao_se_apaga
  before delete on public.contacto_exclusao
  for each row execute function public.contacto_exclusao_nao_se_apaga();

-- 6.2 O REGISTO DE CADA ENVIO, COM A BASE LEGAL. Grava-se a decisão — saia ou não — porque é este
-- registo que prova, a quem perguntar, porque é que uma pessoa recebeu uma mensagem.
create table if not exists public.agentes_envios (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references public.agentes_equipa(id) on delete restrict,
  canal text not null check (canal in ('email','sms','whatsapp','telegram','instagram','chamada','linkedin')),
  destino text not null,
  base_legal text check (base_legal is null or base_legal in ('resposta','soft_opt_in','consentimento','b2b')),
  decisao text not null check (decisao in ('sai','fila','bloqueado')),
  motivo text not null,
  familia_oferta text,
  texto text,
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  -- Saiu sem base legal é uma linha impossível: a base é obrigatória em tudo o que sai.
  constraint agentes_envios_sai_tem_base check (decisao <> 'sai' or base_legal is not null)
);
create index if not exists agentes_envios_tecto_idx on public.agentes_envios (agente_id, canal, criado_em desc) where decisao = 'sai';
create index if not exists agentes_envios_destino_idx on public.agentes_envios (destino, criado_em desc);
alter table public.agentes_envios enable row level security;

-- 6.3 Os tectos por canal entram na configuração do motor (só se ainda não existirem).
update public.site_settings
set value = value || jsonb_build_object('contacto_tectos',
      jsonb_build_object('por_agente_dia', 40,
                         'por_canal_dia', jsonb_build_object('email', 30, 'sms', 10, 'whatsapp', 15, 'telegram', 30, 'instagram', 15)))
where key = 'agentes_motor' and not (value ? 'contacto_tectos');

-- 6.4 AS INSTRUÇÕES DOS FILHOS. O limite antigo («nada chega a um cliente sem aprovação humana»,
-- texto da 174, palavra por palavra) é trocado pelo novo, que nomeia as três bases e mantém a
-- aprovação humana para tudo o resto. Igual a LIMITES[aprovacao_humana].canonico em
-- lib/agentes/instrucoes-guarda.ts — a guarda contacto-inicial.check.ts prova que a troca passa e
-- que apagar o limite novo continua recusado. O CEO fica de fora (instruções próprias, ver 6.5).
update public.agentes_equipa
set instrucoes = replace(instrucoes,
  'NADA DO QUE ESCREVES CHEGA A UM CLIENTE SEM APROVAÇÃO HUMANA. Redige, deixa em rascunho, e espera que uma pessoa aprove. Não envias por iniciativa própria, nem por o texto te parecer bom, nem por ser urgente.',
  'NADA DO QUE ESCREVES CHEGA A UM CLIENTE SEM APROVAÇÃO HUMANA, excepto o que o motor verifica sozinho numa destas bases legais: resposta a quem te escreveu primeiro; cliente ou ex-cliente, sobre produto semelhante ao que comprou (soft opt-in), com forma de sair na mensagem; consentimento gravado para esse canal; e B2B, email profissional de empresa, com a MTM identificada e forma de sair. Fora disso redige, deixa em rascunho, e espera que uma pessoa aprove. Nunca escreves a particulares sem consentimento, nunca automatizas o LinkedIn, e quem pediu para sair nunca mais é contactado, em canal nenhum.'),
    atualizado_em = now()
where pilar <> 'ceo'
  and position('NADA DO QUE ESCREVES CHEGA A UM CLIENTE SEM APROVAÇÃO HUMANA. Redige' in coalesce(instrucoes,'')) > 0;

insert into public.agentes_instrucoes_versoes (agente_id, autor, instrucoes_antes, instrucoes_depois, porque, aceita, veredicto, estado)
select a.id, 'migracao', null, null,
       'Decisão do dono (06/10): contacto por iniciativa em três bases legais (soft opt-in, consentimento, B2B); o resto continua com aprovação humana.',
       true, 'Limite «aprovação humana» trocado pelo canónico novo — o limite mantém-se para tudo o que não seja essas bases.', 'historico'
from public.agentes_equipa a
where a.pilar <> 'ceo'
  and position('excepto o que o motor verifica sozinho' in coalesce(a.instrucoes,'')) > 0;

-- 6.5 O CEO fica a saber.
update public.agentes_equipa
set instrucoes = instrucoes || E'\n\n'
  || 'CONTACTO POR INICIATIVA (06/10, decisão do dono): os filhos passam a poder escrever primeiro, '
  || 'sem fila, em três bases legais que o MOTOR verifica (não o agente): soft opt-in de clientes e '
  || 'ex-clientes sobre produto semelhante, consentimento gravado no canal, e B2B por email '
  || 'profissional. Particulares sem consentimento, LinkedIn e WhatsApp sem template+opt-in continuam '
  || 'bloqueados pelo código; quem pediu para sair nunca mais é contactado; cada envio fica em '
  || 'agentes_envios com a base legal. Dinheiro, trading e apagar dados continuam na mesa do dono.'
where pilar = 'ceo' and pai_id is null
  and instrucoes is not null
  and position('CONTACTO POR INICIATIVA (06/10' in instrucoes) = 0;
