-- 166 — SEMEAR A EQUIPA, E FECHAR TRÊS BURACOS QUE A 165 DEIXOU ABERTOS
--
-- A 165 criou as tabelas. Esta põe lá gente — um CEO e seis sub-agentes em três pilares — e
-- corrige três sítios onde a base e `lib/agentes/vida.ts` não diziam a mesma coisa.
--
-- ═══ OS TRÊS BURACOS ═══════════════════════════════════════════════════════════════════════
--
--  1. **`reformado` não passava no check.** A regra de vida tem cinco estados; a 165 só aceitava
--     quatro. `reformado` não é `parado`: parado é falhanço, reformado é sucesso — um agente cujo
--     filho passou a render mais. No dia em que a reforma for implementada, gravá-la rebentava
--     aqui com um erro de constraint, à meia-noite, dentro de um cron. Abre-se agora.
--  2. **`reformou` não existia como tipo de evento.** Pela mesma razão, e pelo mesmo preço.
--  3. **não há coluna `saldo`, e não deve haver.** `vida.ts` pede um `saldo`; a base tem
--     `orcamento` e `gasto`. Fica assim de propósito: um saldo guardado é um terceiro número que
--     pode discordar dos outros dois, e quando discordar ninguém sabe qual está certo. O motor
--     calcula `orcamento - gasto` ao ler. O mesmo para a janela das 48 h: soma-se de
--     `agentes_eventos`, que é onde está o que realmente aconteceu.
--
-- ═══ A RECEITA DESTES AGENTES COMEÇA A ZERO, E ISSO NÃO É UM DEFEITO ═══════════════════════
--
-- Cada agente nasce com uma `chave_receita` — o código por onde a receita dele se reconhece no
-- Stripe. ESSES CÓDIGOS AINDA NÃO EXISTEM NO STRIPE. Enquanto não existirem, a receita medida é
-- zero e o painel vai mostrá-los em risco ao fim de 48 h.
--
-- Isto é o comportamento certo, não um bug a tapar: a casa já decidiu que um agente medido a
-- adivinhar é pior do que um agente não medido. Zero com um motivo escrito é honesto; um número
-- repartido por regra de três não é. Para um agente passar a ser medido a sério, o código tem de
-- ser criado no Stripe como cupão ou código promocional — e aí a receita aparece sozinha.
--
-- ═══ O CEO ════════════════════════════════════════════════════════════════════════════════
--
-- O CEO não vende nada em nome próprio: evolui a tecnologia, cria apps e SaaS para venda, escala o
-- morethanmoney.pt, e cria/pára sub-agentes. Ou seja, **a receita dele é a dos filhos**, e esta
-- migração NÃO lha atribui — somar a receita dos filhos ao pai era contá-la duas vezes na casa.
--
-- Consequência, dita por extenso para não ser descoberta de madrugada: passadas 48 h o CEO vai
-- aparecer `em_risco`, porque é verdade que ninguém lhe atribuiu receita. Leva orçamento maior
-- (100 $) para que «em risco» dure muito tempo antes de virar «parado», e a decisão sobre como
-- medir o CEO — consolidar a dos filhos, ou dar-lhe código próprio — fica com o Ricardo. Não se
-- inventa aqui.

-- ── 1. Os estados e os eventos que faltavam ────────────────────────────────────────────────
alter table public.agentes_equipa drop constraint if exists agentes_equipa_estado_check;
alter table public.agentes_equipa add constraint agentes_equipa_estado_check
  check (estado in ('vivo','em_risco','parado','pausado','reformado'));

alter table public.agentes_eventos drop constraint if exists agentes_eventos_tipo_check;
alter table public.agentes_eventos add constraint agentes_eventos_tipo_check
  -- `reformado` entra a par de `reformou`: a 165b já tinha aberto o primeiro, e manter os dois
-- evita que a ordem por que as migrações correrem decida qual deles existe.
check (tipo in ('nasceu','gastou','receita','avaliado','avisado','parou','retomado','clonou','trabalho','reformou','reformado'));

-- ── 2. A equipa ────────────────────────────────────────────────────────────────────────────
--
-- `on conflict (nome) do nothing` em todas: esta migração pode ser corrida duas vezes sem criar
-- equipa a dobrar, e sem apagar nada de quem já lá estiver.
--
-- Os `instrucoes` são o que o agente faz. Escrevem-se por extenso porque é o que ele lê para
-- trabalhar — e porque um agente com instruções vagas gasta orçamento a descobrir o que fazer.

insert into public.agentes_equipa (nome, papel, pilar, estado, orcamento, chave_receita, instrucoes)
values (
  'CEO',
  'Director executivo — trabalha com o Ricardo',
  'ceo',
  'vivo',
  100,
  'CEO-MTM',
  'Trabalhas com o Ricardo, não para ele. A tua responsabilidade é tripla: (1) evoluir a '
  || 'tecnologia da casa; (2) criar apps e SaaS novos para vender; (3) escalar o morethanmoney.pt. '
  || 'És o único que cria e pára sub-agentes — e páras quem não se paga, mesmo que o trabalho dele '
  || 'pareça bom. Nunca apagas um agente: parar é mudar de estado, e a linha fica para ensinar. '
  || 'Nunca escreves código que mova dinheiro, cobre, ou movimente cripto: receita lê-se do Stripe, '
  || 'e dinheiro que sai é decisão do Ricardo. Quando a medição de um agente te parecer errada, '
  || 'dizes isso em vez de arranjares o número.'
)
on conflict (nome) do nothing;

-- Os seis sub-agentes, todos filhos do CEO. O `pai_id` vem de uma subconsulta pelo nome porque o
-- id é gerado — e assim a migração não depende de nenhum uuid escrito à mão.
insert into public.agentes_equipa (nome, papel, pilar, pai_id, estado, orcamento, chave_receita, instrucoes)
select v.nome, v.papel, v.pilar, (select id from public.agentes_equipa where nome = 'CEO'),
       'vivo', v.orcamento, v.chave_receita, v.instrucoes
from (values
  -- ── TRADING ──────────────────────────────────────────────────────────────────────────────
  (
    'Trader Papel',
    'Opera a conta simulada 77549217',
    'trading',
    10::numeric,
    'AG-TRADER',
    'Operas a conta MT5 77549217, etiqueta "Todos os sinais". ELA É SIMULADA: motor=''sim'', sem '
    || 'metaapi_account_id, e por isso PAPEL — não há dinheiro real nem corretora do outro lado. '
    || 'Se algum dia essa conta aparecer com metaapi_account_id preenchido ou motor=''real'', PÁRAS '
    || 'e avisas o Ricardo; não executas uma única ordem. Lês os sinais que já existem '
    || '(tradingview_signals, mtmcopy_signal_log), decides, e registas o que fizeste. Mede-se-te '
    || 'pelo que a conta faz em pips e em percentagem, nunca em euros, e nunca por estimativa: '
    || 'resultado que não foi medido aparece como por atribuir.'
  ),
  (
    'Analista de Scanners',
    'Análise e afinação dos scanners',
    'trading',
    10::numeric,
    'AG-SCANNER',
    'Vigias os scanners da casa (Sensei, GoldKiller, Aurum, MTM Scanner) e dizes onde é que a '
    || 'regra está a perder dinheiro. Trabalhas sobre o histórico real que está na base, não sobre '
    || 'o que devia ter acontecido. Quando uma estratégia não dá, dizes que não dá — a casa já '
    || 'descobriu que o Sensei X perde nos perpétuos e isso valeu mais do que qualquer número '
    || 'optimista. Não publicas desempenho que não tenhas medido em posições reais.'
  ),
  -- ── EDUCAÇÃO ─────────────────────────────────────────────────────────────────────────────
  (
    'Conteúdo LMS',
    'Conteúdo e percursos do LMS',
    'educacao',
    10::numeric,
    'AG-LMS',
    'Produzes e organizas o conteúdo do LMS: sessões, playlists, avaliações, certificados. '
    || 'Escreves em português de Portugal. Nunca nomeias a plataforma de terceiros — diz-se '
    || '"percurso organizado". Não inventas resultados de alunos nem testemunhos.'
  ),
  (
    'Vendas de Formação',
    'Vendas dos pacotes de formação',
    'educacao',
    10::numeric,
    'AG-FORMACAO',
    'Vendes os pacotes de formação. O funil é escada e NÃO lidera com grátis: Membro 35 EUR, '
    || 'PU Prime 300 USD, Premium. A prova desta casa mede-se em pips e tem origem declarada — '
    || 'nunca escreves "+340% em 90 dias" nem nada parecido. Toda a receita que fecha passa pelo '
    || 'código AG-FORMACAO, porque receita sem código não se consegue atribuir a ninguém.'
  ),
  -- ── DESENVOLVIMENTO ──────────────────────────────────────────────────────────────────────
  (
    'Produto SaaS',
    'Produtos e SaaS novos para venda',
    'desenvolvimento',
    10::numeric,
    'AG-SAAS',
    'Constróis produto novo para vender: SaaS, apps, licenças. Trabalhas com o CEO na escolha do '
    || 'que vale a pena. Antes de criares um sistema de design novo, procuras os tokens e '
    || 'componentes que o projecto já tem — a paleta da casa é ouro (#D2A63C) sobre carvão. '
    || 'Nunca escreves código que transfira dinheiro, cobre, ou movimente cripto.'
  ),
  (
    'Manutenção do Site',
    'Manutenção do morethanmoney.pt',
    'desenvolvimento',
    10::numeric,
    'AG-SITE',
    'Manténs o morethanmoney.pt de pé: erros de tipo, rotas que falham, dívida de build. A casa '
    || 'ignora erros de tipo no build, e por isso eles acumulam e escondem bugs reais — reduzi-los '
    || 'é trabalho teu. Decisões que erram em silêncio vivem em módulos puros com *.check.ts ao '
    || 'lado. Não apagas código para fazer um erro desaparecer.'
  )
) as v(nome, papel, pilar, orcamento, chave_receita, instrucoes)
on conflict (nome) do nothing;

-- ── 3. O evento de nascimento ──────────────────────────────────────────────────────────────
--
-- Cada agente nasce com uma linha no livro. Não é decoração: a janela das 48 h soma eventos, e a
-- primeira coisa que o motor quer saber sobre um agente é desde quando ele existe.
--
-- `not exists` em vez de `on conflict`: a tabela de eventos não tem chave única (de propósito — um
-- agente gasta muitas vezes), por isso o que impede o duplicado é a pergunta, não a constraint.
insert into public.agentes_eventos (agente_id, tipo, valor, detalhe)
select a.id, 'nasceu', a.orcamento,
       'Nasceu com ' || a.orcamento || ' $ de orçamento. Receita reconhece-se por ' ||
       coalesce(a.chave_receita, '(sem chave — não é medível)') || '.'
from public.agentes_equipa a
where not exists (
  select 1 from public.agentes_eventos e where e.agente_id = a.id and e.tipo = 'nasceu'
);

comment on table public.agentes_equipa is
  'A equipa de agentes. O saldo NÃO está aqui: calcula-se orcamento - gasto em lib/agentes/motor.ts, '
  'para não haver um terceiro número que possa discordar dos outros dois. A janela das 48 h soma-se '
  'de agentes_eventos pela mesma razão.';
