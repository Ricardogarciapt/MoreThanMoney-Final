-- Estúdio de gravação (10/11/2026): o Ricardo grava no telemóvel a ler o guião (teleprompter)
-- e cada take fica aqui como «bruto» para a edição no Mac (skill video-edit / motor-reel).
-- Os ficheiros vão para um bucket PRIVADO: a cara e a voz do Ricardo nunca ficam num URL público.

insert into storage.buckets (id, name, public)
values ('estudio', 'estudio', false)
on conflict (id) do nothing;

create table if not exists public.estudio_gravacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  peca_id uuid references public.conteudo_magnetico_pecas(id) on delete set null,
  marca text not null,
  caminho text not null,
  mime text not null,
  duracao_s numeric,
  estado text not null default 'a_subir'
    check (estado in ('a_subir', 'bruto', 'escolhido', 'a_editar', 'editado', 'publicado', 'descartado')),
  reclamado_em timestamptz,
  notas text,
  editado_url text,
  criado_em timestamptz not null default now()
);
create index if not exists estudio_gravacoes_user_idx on public.estudio_gravacoes (user_id, criado_em desc);
create index if not exists estudio_gravacoes_estado_idx on public.estudio_gravacoes (estado, criado_em);

-- Só o servidor (service role) lê e escreve.
alter table public.estudio_gravacoes enable row level security;
