-- App «Missão» do Ricardo: membros, missões diárias, patentes por XP, moedas, recompensas com travões.
-- Tudo só pelo service role (RLS ligado, sem políticas). Gerido em /ricardogarcia/painel.

create table if not exists rg_app_membros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  telefone text,
  pass_hash text not null,
  xp int not null default 0,
  moedas int not null default 0,
  dias_ativos int not null default 0,
  sequencia int not null default 0,
  melhor_sequencia int not null default 0,
  ultimo_dia date,
  patente int not null default 0,
  origem text,
  negocio_id uuid,
  consentimento boolean not null default false,
  estado text not null default 'ativo' check (estado in ('ativo','bloqueado')),
  criado timestamptz not null default now(),
  visto timestamptz
);

create table if not exists rg_app_sessoes (
  token_hash text primary key,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  criado timestamptz not null default now(),
  expira timestamptz not null
);
create index if not exists rg_app_sessoes_membro on rg_app_sessoes(membro_id);

create table if not exists rg_app_missoes (
  id text primary key,
  tipo text not null check (tipo in ('treino','mindset','digital')),
  titulo text not null,
  resumo text,
  conteudo jsonb not null default '{}'::jsonb,
  xp int not null default 20,
  min_seg int not null default 0,
  ordem int not null default 0,
  activo boolean not null default true
);

create table if not exists rg_app_registos (
  id bigserial primary key,
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  missao_id text not null,
  dia date not null,
  iniciado timestamptz not null default now(),
  concluido timestamptz,
  xp int not null default 0,
  resposta text,
  unique (membro_id, missao_id, dia)
);
create index if not exists rg_app_registos_dia on rg_app_registos(dia);

create table if not exists rg_app_conquistas (
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  insignia text not null,
  criado timestamptz not null default now(),
  primary key (membro_id, insignia)
);

create table if not exists rg_app_recompensas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  custo int not null,
  min_dias_conta int not null default 0,
  min_dias_ativos int not null default 0,
  min_patente int not null default 0,
  cooldown_dias int not null default 30,
  stock_mes int,
  activo boolean not null default true,
  ordem int not null default 0,
  criado timestamptz not null default now()
);

create table if not exists rg_app_resgates (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  recompensa_id uuid not null references rg_app_recompensas(id) on delete cascade,
  custo int not null,
  estado text not null default 'pendente' check (estado in ('pendente','aprovado','recusado','entregue')),
  nota text,
  criado timestamptz not null default now(),
  decidido timestamptz
);
create index if not exists rg_app_resgates_estado on rg_app_resgates(estado);

alter table rg_app_membros enable row level security;
alter table rg_app_sessoes enable row level security;
alter table rg_app_missoes enable row level security;
alter table rg_app_registos enable row level security;
alter table rg_app_conquistas enable row level security;
alter table rg_app_recompensas enable row level security;
alter table rg_app_resgates enable row level security;

-- Recompensas iniciais: travões de tempo na app para nada valioso sair a quem chegou ontem.
insert into rg_app_recompensas (titulo, descricao, custo, min_dias_conta, min_dias_ativos, min_patente, cooldown_dias, stock_mes, ordem)
select * from (values
  ('Guia «Primeiro Passo» em PDF', 'O guia de arranque da MoreThanMoney, enviado por email.', 15, 7, 5, 1, 365, null::int, 1),
  ('Sessão de mindset em grupo (30 min)', 'Entras na próxima sessão de grupo com o Ricardo, no Google Meet.', 40, 21, 14, 2, 60, 20, 2),
  ('Módulo de formação à escolha', 'Acesso a um módulo de formação MTM (digital, IA ou trading educativo).', 80, 30, 21, 3, 120, 10, 3),
  ('1 mês do plano Membro MTM', 'Um mês de plano Membro oferecido. Só para quem já mostrou constância.', 150, 60, 45, 4, 180, 3, 4),
  ('Conversa 1:1 de mindset com o Ricardo', '30 minutos a sós com o Ricardo, no Google Meet.', 250, 90, 60, 5, 180, 2, 5)
) v
where not exists (select 1 from rg_app_recompensas);

-- Missões iniciais (rodam por dia; editáveis no painel).
insert into rg_app_missoes (id, tipo, titulo, resumo, conteudo, xp, min_seg, ordem) values
('t-acordar','treino','Circuito de arranque','7 minutos, sem pesos, para acordar o corpo.',
 '{"passos":["40 s de agachamentos","20 s de pausa","40 s de flexões (joelhos no chão se precisares)","20 s de pausa","40 s de prancha","20 s de pausa","40 s de lunges alternados","20 s de pausa","Repete o circuito mais uma vez"],"nota":"Respira pelo nariz. Qualidade antes de velocidade."}',30,360,1),
('t-tabata','treino','Tabata de 8 minutos','Dois blocos de 4 minutos: 20 s a fundo, 10 s de pausa.',
 '{"passos":["Bloco 1 (4 min): burpees 20 s · pausa 10 s, 8 vezes","1 minuto de pausa a andar","Bloco 2 (4 min): mountain climbers 20 s · pausa 10 s, 8 vezes"],"nota":"Se nunca fizeste burpees, troca por agachamento com salto ou só agachamento."}',30,480,2),
('t-core','treino','Núcleo de aço','Abdominal e lombar em 8 minutos.',
 '{"passos":["45 s de prancha frontal","45 s de prancha lateral (cada lado)","45 s de dead bug","45 s de superman","15 s de pausa entre exercícios","Faz 2 voltas"],"nota":"Mantém a lombar colada ao chão no dead bug."}',30,420,3),
('t-pernas','treino','Pernas sem desculpas','Só precisas de uma parede e de uma cadeira.',
 '{"passos":["45 s de agachamento","45 s de cadeira na parede","45 s de lunges para trás","45 s de elevação de gémeos","15 s de pausa entre exercícios","Faz 2 voltas"],"nota":"Joelhos alinhados com os pés."}',30,420,4),
('t-mobilidade','treino','Mobilidade e respiração','Dia leve: 10 minutos para recuperar e soltar.',
 '{"passos":["1 min de rotação de ombros e pescoço","2 min de gato-vaca","2 min de abertura de anca (90/90)","2 min de alongamento de posteriores","3 min de respiração em caixa: 4 s inspirar, 4 s segurar, 4 s expirar, 4 s segurar"],"nota":"Recuperar também é treino."}',25,480,5),
('m-controlo','mindset','O que controlas hoje','Separa o que depende de ti do que não depende.',
 '{"texto":"A maior parte da ansiedade vem de tentar controlar o que não depende de nós: o mercado, a opinião dos outros, o passado. Hoje, foca-te só no que depende de ti: a tua atenção, o teu esforço e a forma como respondes.","pergunta":"Escreve uma coisa que te preocupa e que NÃO controlas, e uma acção que controlas e vais fazer hoje."}',20,0,1),
('m-identidade','mindset','Identidade antes de resultados','Hábitos colam quando mudam quem és.',
 '{"texto":"Não digas «quero ganhar dinheiro online». Diz «sou uma pessoa que aprende e executa todos os dias». Cada missão que fazes aqui é um voto nessa identidade.","pergunta":"Completa: «Sou o tipo de pessoa que…» e diz que prova deste hoje."}',20,0,2),
('m-emocoes','mindset','Decidir sem emoções','A regra dos 10 segundos antes de reagir.',
 '{"texto":"Medo e ganância decidem por nós quando temos pressa. Antes de uma decisão importante, pára 10 segundos e pergunta: «Isto está no meu plano, ou é a emoção a falar?»","pergunta":"Lembra-te de uma decisão recente tomada a quente. O que farias diferente com 10 segundos de pausa?"}',20,0,3),
('m-gratidao','mindset','Três vitórias pequenas','Treinar o cérebro para ver progresso.',
 '{"texto":"O cérebro está programado para ver o que falta. Para contrariar isso, regista vitórias pequenas: elas somam-se e dão-te provas de que estás a avançar.","pergunta":"Escreve três vitórias pequenas das últimas 24 horas."}',20,0,4),
('m-tempo','mindset','A hora que é tua','Encontrar tempo onde parece não haver.',
 '{"texto":"Ninguém «tem» tempo, cria-se. Olha para o teu dia de ontem e encontra 30 minutos que foram para scroll, notícias ou distracção. Essa é a tua hora de construção.","pergunta":"Onde estão os teus 30 minutos escondidos, e o que vais construir com eles amanhã?"}',20,0,5),
('d-ia-prompt','digital','O teu primeiro prompt a sério','Usar IA como assistente, não como oráculo.',
 '{"texto":"Um bom prompt tem 4 peças: papel («és um…»), contexto (quem és e o que precisas), tarefa (o que queres) e formato (lista, tabela, 100 palavras). Abre o ChatGPT, o Claude ou o Gemini (há versões grátis) e experimenta.","acao":"Escreve aqui o prompt que usaste e uma frase sobre o que a IA te devolveu."}',25,0,1),
('d-marca','digital','A tua bio em 3 linhas','O primeiro activo digital é como te apresentas.',
 '{"texto":"Uma bio que funciona diz: quem ajudas, como ajudas e o próximo passo. Exemplo: «Ajudo pais ocupados a treinar em casa · Treinos de 15 min · Começa aqui ↓».","acao":"Escreve a tua bio em 3 linhas (mesmo que ainda não tenhas negócio)."}',25,0,2),
('d-automatizar','digital','Uma tarefa que podes automatizar','Ganhar horas por semana com ferramentas grátis.',
 '{"texto":"Tudo o que fazes mais de 3 vezes por semana da mesma forma pode ser automatizado ou acelerado com IA: respostas a mensagens, resumos, organização de ficheiros, lembretes.","acao":"Escolhe uma tarefa repetitiva tua e descreve como a IA ou uma ferramenta a podia fazer por ti."}',25,0,3),
('d-conteudo','digital','Uma ideia de conteúdo por dia','Quem cria atrai; quem só consome, segue.',
 '{"texto":"Não precisas de ser especialista para criar. Documentar o que aprendes já ajuda quem está um passo atrás de ti. Usa a IA para te dar 10 ideias a partir de uma coisa que aprendeste esta semana.","acao":"Escreve a melhor ideia de publicação que tiveste hoje, com um gancho na primeira frase."}',25,0,4),
('d-seguranca','digital','Higiene digital em 10 minutos','Proteger contas antes de crescer online.',
 '{"texto":"Antes de crescer online, protege o básico: autenticação em dois passos no email e nas redes, palavras-passe diferentes num gestor de palavras-passe e cuidado com links que pedem dados.","acao":"Diz em que conta activaste (ou já tinhas) a autenticação em dois passos hoje. Não escrevas palavras-passe aqui."}',25,0,5)
on conflict (id) do nothing;
