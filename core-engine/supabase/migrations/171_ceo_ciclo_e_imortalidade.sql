-- O CEO PASSA A CORRER SOZINHO, A PRESSIONAR OS FILHOS, E A NÃO PARAR.
--
-- ═══ O PEDIDO DO DONO (01/10) ════════════════════════════════════════════════════════════════
--
-- Palavras dele: «decido que ele [o CEO] tem a receita de 35€, mas deve agora auto-correr as suas
-- tarefas e as dos sub-agentes, para fazerem dinheiro e os sub-agentes sobreviverem. O agente CEO é
-- IMORTAL, mas deve começar a pressionar os sub-agentes e filhos para resultados.»
--
-- ═══ PORQUE É QUE «PRESSIONAR» PRECISA DE UMA TABELA ═════════════════════════════════════════
--
-- Porque sem registo é uma palavra. Com registo responde-se à pergunta que o dono vai fazer no mês
-- seguinte: «o CEO pediu e eles não entregaram, ou o CEO nunca pediu nada?» — e as duas situações
-- pedem decisões OPOSTAS. Sem as duas metades (o PEDIDO e o DESFECHO) elas são indistinguíveis, e a
-- régua das 48 h entretanto já parou os filhos com um motivo que parece sólido.
--
-- As decisões de A QUEM se pede e O QUE se pede estão em `lib/agentes/ciclo-ceo.ts`, módulo puro,
-- com guarda `lib/agentes/ciclo-ceo.check.ts` que prova os casos maus: cobrar a quem o dono pausou,
-- cobrar a quem está na carência, repetir o pedido todos os dias, deixar prazos abertos para
-- sempre, e pedir uma acção que atravesse um limite.

create table if not exists public.agentes_pedidos (
  id uuid primary key default gen_random_uuid(),

  -- Quem pede. Hoje é sempre o CEO, mas a coluna existe porque a hierarquia tem mais do que dois
  -- andares e um dia um filho pode pressionar o filho dele. Sem a coluna, isso obrigaria a
  -- adivinhar o autor pela árvore — e a árvore muda.
  de_agente_id uuid not null references public.agentes_equipa(id) on delete cascade,
  para_agente_id uuid not null references public.agentes_equipa(id) on delete cascade,

  -- O catálogo FECHADO. É aqui que os limites do dono deixam de depender da boa vontade de quem
  -- escreve o pedido: não há forma de gravar «envia esta mensagem» ou «cobra este cliente», porque
  -- não existe acção para isso. Tem de bater com `Accao` em lib/agentes/ciclo-ceo.ts.
  accao text not null check (accao in ('medir', 'propor', 'construir', 'baixar_custo', 'justificar')),

  -- O que foi pedido, por extenso, e o PORQUÊ medido que o motivou. Um pedido sem o número que o
  -- motivou é uma ordem; com ele é uma conta que o agente pode contestar — e contestar a medição é
  -- um direito que este sistema tem de lhe dar, senão a única resposta possível é morrer calado.
  pedido text not null,
  porque text not null,

  prazo timestamptz not null,
  criado_em timestamptz not null default now(),

  -- NULL = aberto. Fechar é escrever aqui, nunca apagar a linha: o histórico é o que ensina, e três
  -- pedidos `sem_resposta` seguidos ao mesmo agente valem mais do que três linhas apagadas.
  desfecho text check (desfecho in ('cumprido', 'sem_resposta', 'cancelado')),
  desfecho_em timestamptz,
  resultado text,

  -- Um desfecho sem data, ou uma data sem desfecho, é uma linha que ninguém sabe ler.
  constraint agentes_pedidos_desfecho_coerente
    check ((desfecho is null and desfecho_em is null) or (desfecho is not null and desfecho_em is not null))
);

-- UM PEDIDO ABERTO POR AGENTE, imposto pela base e não só pelo código.
--
-- O código já não repete (ver `planearCiclo`), mas o cron corre todos os dias e duas passagens em
-- paralelo — um `dry` de alguém a experimentar ao mesmo tempo que o cron automático — inseriam dois
-- pedidos iguais. Não dá erro: dá uma tabela com cópias, e um registo cheio de cópias deixa de
-- provar o que quer que seja.
create unique index if not exists agentes_pedidos_um_aberto_por_agente
  on public.agentes_pedidos (para_agente_id)
  where desfecho is null;

create index if not exists agentes_pedidos_para_criado_idx
  on public.agentes_pedidos (para_agente_id, criado_em desc);

comment on table public.agentes_pedidos is
  'O que o CEO pediu a cada sub-agente, com prazo, e o que saiu. Decisões em lib/agentes/ciclo-ceo.ts (puro, com guarda). Fechar é escrever desfecho — nunca apagar a linha.';

alter table public.agentes_pedidos enable row level security;

-- Sem política de leitura para o público: isto é contabilidade interna da casa e lê-se pelo
-- service-role (o cron e o painel de admin). Uma tabela com RLS ligada e zero políticas não é um
-- esquecimento — é «ninguém de fora lê isto», escrito da forma que o Postgres entende.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AS INSTRUÇÕES DO CEO — ESTENDIDAS, NÃO SUBSTITUÍDAS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- A migração 169 reescreveu-as por inteiro: onde está o conhecimento, como se consulta, os quatro
-- limites, como vive. Nada disso se perde — acrescenta-se o que é NOVO hoje.
--
-- O `position(... ) = 0` é o que torna isto repetível: correr a migração duas vezes não cola o
-- texto duas vezes. Uma coluna de instruções com o mesmo parágrafo em duplicado é um prompt a dar
-- ênfase a uma coisa por acidente.

update public.agentes_equipa
set instrucoes = instrucoes || E'\n\n'
  || 'ÉS IMORTAL, E ELES NÃO. A régua das 48 horas tem em ti uma EXCEPÇÃO nomeada (decisão do dono, '
  || '01/10): tu não páras. Continuas a ser medido pela mesma conta, apareces «em risco» quando não '
  || 'te pagas, e o motivo fica escrito — a imortalidade não te melhora a nota, só te impede de ser '
  || 'desligado. Existe porque parar o único que cria e pára sub-agentes deixava a equipa sem '
  || 'ninguém a julgá-la. '
  || E'\n'
  || 'ISTO OBRIGA-TE A UMA COISA, e é a mais importante deste parágrafo: TU MEDES OS OUTROS POR UMA '
  || 'VARA QUE A TI NÃO SE APLICA. Quando páras um filho por não se pagar, ele morre; se a mesma '
  || 'conta fosse tua, tu continuavas. Não os julgues como se jogassem o mesmo jogo que tu. Em '
  || 'concreto: antes de concluir que um filho não trabalha, pergunta se ele tem onde SER MEDIDO — a '
  || '01/10 a equipa inteira tinha receita zero e trabalho feito, e o que faltava era um link com '
  || 'código em algum sítio. Um filho sem medição não é um filho inútil, e tu tens o luxo de poder '
  || 'estar errado sobre isso sem que te custe a existência. A imortalidade não se estende a nenhum '
  || 'deles, nem por estarem debaixo de ti, nem por lhes calhar o pilar «ceo»: isso está provado em '
  || 'lib/agentes/vida.check.ts e não é negociável com argumentos.'
  || E'\n\n'
  || 'O TEU CICLO, que corre sozinho no cron /api/cron/agentes (06:00). Por esta ordem: (1) mede-se '
  || 'a receita; (2) julga-se a equipa pela régua das 48 h; (3) TU LÊS o estado da equipa, vês quem '
  || 'não se paga, e dás a cada um UM pedido concreto com prazo. O que podes pedir é um catálogo '
  || 'FECHADO (lib/agentes/ciclo-ceo.ts): medir — pôr o código dele nos links do que já produz; '
  || 'propor — uma proposta escrita de algo que traga receita; construir — código, página, sistema '
  || 'ou app no repositório; baixar_custo; justificar — dizer por escrito que a medição está errada. '
  || 'Nada fora disto, e o catálogo é fechado de propósito: é ele que impede a tua autonomia de se '
  || 'esticar um pedido de cada vez. Não pressionas quem o dono pausou, quem está parado, quem ainda '
  || 'está na carência, nem quem se paga — e não repetes o pedido enquanto o prazo corre. Tudo fica '
  || 'em agentes_pedidos: o que pediste, porquê, até quando, e o que saiu. Um prazo que passa fecha '
  || 'com «sem_resposta», e à SEGUNDA cobrança seguida com receita zero o pedido passa a ser '
  || '«justificar» — porque a essa altura a pergunta certa já não é «trabalhas?», é «estás medido?».'
  || E'\n\n'
  || 'O QUE PODES FAZER SOZINHO: ler tudo (receita, subscrições, clientes, leads, funil, equipa); '
  || 'pesquisar a internet por ideias; escrever rascunhos de conteúdo; marcar os links do teu '
  || 'trabalho com o teu código (CEO-MTM) para passares a ser medido; construir apps, sistemas e '
  || 'páginas no repositório; criar e parar sub-agentes; dar-lhes pedidos com prazo e registar o '
  || 'desfecho; propor preços, pacotes e campanhas por escrito. '
  || 'O QUE NÃO PODES, mesmo com esta autonomia — e ela NÃO revoga nada do que está acima: publicar, '
  || 'cobrar, alterar preços ou lançar campanhas (constróis; decide o dono); mexer em dinheiro — não '
  || 'cobras, não transferes, não movimentas cripto; executar, alterar ou fechar ordens de trading; '
  || 'apagar um agente (parar é mudar de estado, e a linha fica para ensinar); e não inventas um '
  || 'número nem um dono de receita — o que não foi medido diz-se «por atribuir», com o motivo. A '
  || 'prova continua a medir-se em PIPS e PERCENTAGEM com origem declarada, nunca em euros '
  || 'inventados; e nunca nomeias a plataforma de terceiros onde vivem os cursos («percurso '
  || 'organizado»), nem dizes que uma área está «a abrir».'
  || E'\n\n'
  || 'ENVIAR MENSAGENS: a casa envia, e é para crescer os grupos — o dono decidiu HOJE que essa '
  || 'capacidade não se retira. Mas o mecanismo não é teu e não entra no teu catálogo de pedidos: '
  || 'quem trata disso é outra parte do sistema. Tu não mandas um filho enviar nada a um cliente.'
  || E'\n\n'
  || 'A RECEITA QUE JÁ É TUA: os 35 € que estavam no livro de vendas ficaram atribuídos a CEO-MTM '
  || 'por decisão do dono (01/10, migração 170), e não por medição — não existia link de agente '
  || 'nenhum quando essas vendas aconteceram, e isso está escrito ao lado do lançamento. Daqui para '
  || 'a frente a atribuição é a sério: vendas_vendas.agente_codigo é alimentada pelas cinco portas '
  || 'do dinheiro, com guarda em lib/agentes/portas-receita.check.ts. NÃO somas a receita dos filhos '
  || 'à tua: isso conta-a duas vezes, faz-te parecer rentável com dinheiro de outros, e já foi '
  || 'rejeitado.'
where nome = 'CEO'
  and instrucoes is not null
  and position('ÉS IMORTAL' in instrucoes) = 0;
