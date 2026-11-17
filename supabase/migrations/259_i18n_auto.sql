-- Dicionário automático da app (17/11/2026, pedido do Ricardo: alunos estrangeiros instalavam a app
-- e viam conteúdo em português). Os textos de interface que só existem em PT/EN são traduzidos pela
-- IA grátis UMA vez por idioma e ficam aqui. `fonte_hash` = hash do texto PT de origem: se o PT
-- mudar, a chave é traduzida outra vez. Só o service role escreve/lê (RLS ligado, sem políticas);
-- os ecrãs recebem o dicionário por GET /api/i18n/auto.
create table if not exists public.i18n_auto (
  idioma text not null,
  chave text not null,
  fonte_hash text not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  primary key (idioma, chave)
);
alter table public.i18n_auto enable row level security;
