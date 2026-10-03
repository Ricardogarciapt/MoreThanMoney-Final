-- ============================================================================
-- 159 — A AGENDA DA CASA (substitui o Calendly)
-- ============================================================================
--
-- O Calendly nunca pegou: `calendly_bookings` tem UMA linha desde que existe. O link vivia fora da
-- casa, as marcações não entravam no pipeline, e a pessoa que marcava uma chamada de onboarding não
-- ficava registada em lado nenhum — ou seja, pagava-se uma ferramenta para perder leads com estilo.
--
-- Isto é o mesmo trabalho, cá dentro: a pessoa escolhe o ASSUNTO (que é o que decide com quem fala
-- e para que pipeline vai), escolhe a hora dentro do que o anfitrião tem livre, e a marcação nasce
-- já com um negócio em `vendas_negocios`.
--
-- ═══ TRÊS TABELAS, E PORQUÊ TRÊS ═══════════════════════════════════════════════════════════
--
--  · ANFITRIÕES — quem atende. Traz as janelas semanais, o fuso, o WhatsApp e o link fixo de Zoom.
--    Separado dos tipos porque a mesma pessoa atende vários assuntos, e o mesmo assunto pode ser
--    atendido por várias pessoas (é isso que permite distribuir sem ninguém escolher à mão).
--  · TIPOS — o assunto. É ele que sabe quanto tempo dura, onde acontece, que perguntas se fazem e
--    em que estado do pipeline o negócio nasce. Uma «apresentação do ecossistema» e uma «parceria
--    UGC» não são a mesma conversa nem caem no mesmo sítio.
--  · MARCAÇÕES — o que ficou marcado. Guarda o fuso de QUEM MARCOU (não só o nosso): quem marca de
--    São Paulo e recebe uma confirmação em hora de Lisboa sem o dizer falta à chamada, e a culpa é
--    da confirmação.
--
-- ═══ O QUE ESTA MIGRAÇÃO NÃO FAZ ═══════════════════════════════════════════════════════════
--
-- Não apaga `calendly_bookings`. Tem uma linha e um histórico; apagar dados de alguém por causa de
-- uma substituição de ferramenta não se faz numa migração sem o dono pedir.

-- ── Anfitriões ───────────────────────────────────────────────────────────────

create table if not exists public.agenda_anfitrioes (
  id uuid primary key default gen_random_uuid(),
  -- Opcional: um anfitrião pode ser alguém sem conta no site (um parceiro, um closer externo).
  profile_id uuid references public.profiles(id) on delete set null,
  nome text not null,
  email text not null,
  -- O número para onde vai a chamada de WhatsApp e o aviso da marcação. Em formato internacional.
  telefone text,
  fuso text not null default 'Europe/Lisbon',
  -- A SALA FIXA DO ZOOM (o «Personal Meeting Room»). É um link que não expira e que serve todas as
  -- chamadas desta pessoa. Existe assim, e não como uma sala criada a cada marcação, porque criar
  -- salas obriga a uma app de servidor no Zoom — e um link que a pessoa cola uma vez faz o mesmo
  -- trabalho para uma chamada a dois, sem depender de credencial nenhuma continuar válida.
  zoom_url text,
  /**
   * JANELAS SEMANAIS: [{ "dia": 2, "inicio": "15:00", "fim": "18:00" }]
   * `dia` é 0 = domingo … 6 = sábado, como o `getDay()` do JavaScript. As horas são LOCAIS ao
   * `fuso` desta linha — quem marca as janelas pensa na agenda dele, não em UTC.
   */
  janelas jsonb not null default '[]'::jsonb,
  -- Minutos de respiro entre chamadas. Sem isto, marcam-se duas seguidas coladas e a segunda começa
  -- com a primeira ainda a acabar.
  intervalo_min integer not null default 15 check (intervalo_min >= 0 and intervalo_min <= 240),
  -- Quanto tempo antes é que ainda se pode marcar. Duas horas por omissão: ninguém quer descobrir às
  -- 14h55 que tem uma chamada às 15h.
  antecedencia_horas integer not null default 2 check (antecedencia_horas >= 0 and antecedencia_horas <= 336),
  -- Até quão longe no futuro se abre a agenda.
  horizonte_dias integer not null default 21 check (horizonte_dias between 1 and 120),
  -- O máximo de chamadas por dia. Uma agenda sem tecto enche-se toda num dia mau.
  max_por_dia integer not null default 6 check (max_por_dia between 1 and 40),
  ativo boolean not null default true,
  ordem integer not null default 0,
  -- ── Google Calendar (opcional) ──
  -- Com isto preenchido, as marcações são escritas na agenda real e o «ocupado» dela é respeitado.
  -- Sem isto, a agenda do site é a única fonte — funciona, mas não sabe o que já lá está.
  google_email text,
  google_calendar_id text default 'primary',
  google_refresh_token text,
  google_ligado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agenda_anfitrioes is
  'Quem atende chamadas marcadas em /agendar: janelas, fuso, WhatsApp, sala Zoom fixa e (opcional) Google Calendar.';

-- ── Tipos de chamada ─────────────────────────────────────────────────────────

create table if not exists public.agenda_tipos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  -- Para quem é. Aparece no cartão e é o que evita a chamada errada — metade do valor da
  -- segmentação está em dizer a quem NÃO serve.
  para_quem text,
  duracao_min integer not null default 30 check (duracao_min between 10 and 180),
  -- Onde acontece: 'whatsapp' (ligamos nós), 'zoom' (sala fixa do anfitrião), 'meet' (link do
  -- evento do Google, só existe com a agenda ligada), 'presencial'.
  local text not null default 'whatsapp' check (local in ('whatsapp', 'zoom', 'meet', 'presencial')),
  /** Perguntas do formulário: [{ "chave": "conta", "rotulo": "Já tens conta na corretora?", "tipo": "escolha", "opcoes": ["Sim","Não"], "obrigatoria": true }] */
  perguntas jsonb not null default '[]'::jsonb,
  -- ── O que acontece ao pipeline ──
  -- O estado em que o negócio nasce, e o pack que se espera vender. Uma parceria UGC não é um lead
  -- de produto e não pode nascer no mesmo estado de quem vem falar de copytrading.
  pipeline_estado text not null default 'qualificado',
  pack_previsto text,
  -- Quem atende este assunto. Vazio = qualquer anfitrião activo.
  anfitrioes uuid[] not null default '{}',
  cor text not null default '#D2A63C',
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agenda_tipos is
  'Os assuntos que se podem marcar. O tipo decide a duração, quem atende, que perguntas se fazem e em que estado nasce o negócio.';

-- ── Marcações ────────────────────────────────────────────────────────────────

create table if not exists public.agenda_marcacoes (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.agenda_tipos(id) on delete restrict,
  anfitriao_id uuid not null references public.agenda_anfitrioes(id) on delete restrict,
  -- Quem marcou. `user_id` só quando já existe conta — a agenda é pública e quem marca não precisa
  -- de conta nenhuma (é quase sempre alguém que ainda não é cliente).
  user_id uuid references public.profiles(id) on delete set null,
  nome text not null,
  email text not null,
  telefone text,
  -- O fuso DE QUEM MARCA, lido do browser. Ver o cabeçalho.
  fuso_convidado text,
  inicio timestamptz not null,
  fim timestamptz not null,
  estado text not null default 'marcada'
    check (estado in ('marcada', 'cancelada', 'compareceu', 'faltou', 'remarcada')),
  local text not null default 'whatsapp',
  join_url text,
  respostas jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  -- A ligação ao pipeline. É isto que faz uma chamada marcada valer alguma coisa no dia seguinte.
  negocio_id uuid,
  google_event_id text,
  -- A chave que o convidado recebe no link de cancelar/remarcar. Não é o `id`: um id que anda em
  -- emails e que também é a chave primária acaba por aparecer onde não devia.
  token uuid not null default gen_random_uuid(),
  cancelada_em timestamptz,
  cancel_motivo text,
  lembrete_enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agenda_marcacoes_token_idx on public.agenda_marcacoes (token);
create index if not exists agenda_marcacoes_anfitriao_idx on public.agenda_marcacoes (anfitriao_id, inicio);
create index if not exists agenda_marcacoes_email_idx on public.agenda_marcacoes (lower(email));

-- DUAS CHAMADAS NO MESMO SÍTIO À MESMA HORA não podem existir, e a verificação em JavaScript não
-- chega: dois pedidos ao mesmo segundo lêem os dois «livre» antes de qualquer um escrever. Esta é a
-- única garantia que resiste a isso. Só conta o que está MARCADO — uma cancelada liberta a hora.
create unique index if not exists agenda_marcacoes_sem_choque_idx
  on public.agenda_marcacoes (anfitriao_id, inicio)
  where estado = 'marcada';

comment on table public.agenda_marcacoes is
  'Chamadas marcadas em /agendar. O índice único (anfitriao_id, inicio) where estado=marcada é o que impede duas pessoas na mesma hora.';

-- ── Bloqueios manuais ────────────────────────────────────────────────────────
--
-- Férias, uma manhã que não se quer dar, o dia a seguir a uma viagem. Existe mesmo com o Google
-- ligado: nem tudo o que se quer bloquear é um evento que se queira ter na agenda.

create table if not exists public.agenda_bloqueios (
  id uuid primary key default gen_random_uuid(),
  anfitriao_id uuid not null references public.agenda_anfitrioes(id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists agenda_bloqueios_idx on public.agenda_bloqueios (anfitriao_id, inicio);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- TUDO FECHADO. A agenda é pública, mas quem a serve é o servidor: as rotas usam a chave de
-- serviço e devolvem só as horas livres. Abrir a leitura de `agenda_marcacoes` ao público dava a
-- qualquer pessoa o nome, o email e o telefone de toda a gente que marcou uma chamada — e a leitura
-- de `agenda_anfitrioes` entregava os tokens do Google.

alter table public.agenda_anfitrioes enable row level security;
alter table public.agenda_tipos enable row level security;
alter table public.agenda_marcacoes enable row level security;
alter table public.agenda_bloqueios enable row level security;

drop policy if exists agenda_marcacoes_minhas on public.agenda_marcacoes;
create policy agenda_marcacoes_minhas on public.agenda_marcacoes
  for select using (auth.uid() = user_id);

-- ── O que fica pronto a usar ────────────────────────────────────────────────

insert into public.agenda_tipos (slug, nome, descricao, para_quem, duracao_min, local, pipeline_estado, pack_previsto, ordem, perguntas)
values
  ('apresentacao', 'Apresentação do ecossistema',
   'Mostro-te como a casa funciona — formação, sinais, copytrading e as ferramentas — e ajudo-te a perceber por onde começar. Saímos da chamada com o teu registo feito.',
   'Quem ainda não é membro e quer perceber o que isto é antes de decidir.',
   30, 'whatsapp', 'qualificado', 'membro', 1,
   '[{"chave":"experiencia","rotulo":"Já negoceias hoje?","tipo":"escolha","opcoes":["Nunca negociei","Comecei há pouco","Já negoceio há mais de um ano"],"obrigatoria":true},{"chave":"objetivo","rotulo":"O que te trouxe aqui?","tipo":"texto","obrigatoria":false}]'::jsonb),

  ('onboarding', 'Onboarding de novo membro',
   'Já és membro: nesta chamada deixamos tudo a funcionar — acessos, app, chats, e o caminho que faz sentido para ti nas primeiras semanas.',
   'Quem acabou de entrar e quer começar bem em vez de andar à procura.',
   30, 'whatsapp', 'ganho', null, 2,
   '[{"chave":"area","rotulo":"Que área te interessa mais?","tipo":"escolha","opcoes":["Forex","Criptomoedas","Ações e ETF","Imobiliário","Social Media e UGC","Mindset e Liderança","IA","Network Marketing"],"obrigatoria":true}]'::jsonb),

  ('copytrading', 'Copytrading e MTM Auto',
   'Ligar a tua conta da corretora, escolher as estratégias e afinar o risco ao tamanho da tua conta. É uma chamada técnica, com as mãos no teclado.',
   'Quem quer as estratégias da casa a executar na conta dele.',
   45, 'whatsapp', 'qualificado', 'premium', 3,
   '[{"chave":"corretora","rotulo":"Já tens conta numa corretora?","tipo":"escolha","opcoes":["Ainda não","Sim, na PU Prime","Sim, noutra"],"obrigatoria":true},{"chave":"plataforma","rotulo":"MT4, MT5 ou ainda não sabes?","tipo":"escolha","opcoes":["MT5","MT4","Ainda não sei"],"obrigatoria":false}]'::jsonb),

  ('parcerias', 'Parcerias, criadores e UGC',
   'Colaborações, conteúdo, afiliação e tudo o que não seja compra de produto.',
   'Criadores, parceiros e quem traz uma proposta.',
   30, 'whatsapp', 'novo', null, 4,
   '[{"chave":"proposta","rotulo":"Em duas linhas: o que tens em mente?","tipo":"texto","obrigatoria":true},{"chave":"onde","rotulo":"Onde é que publicas? (link ou @)","tipo":"texto","obrigatoria":false}]'::jsonb)
on conflict (slug) do nothing;
