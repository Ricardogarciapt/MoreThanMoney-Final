-- Ativos do Estúdio (10/11/2026): fotos, vídeos, capturas, logos e áudios que o Ricardo carrega no
-- /estudio para o editor usar num guião. Cada ativo pode ficar ligado a uma peça (guião) e a um
-- segmento do reel; sem peça fica na biblioteca. Ficheiros no bucket PRIVADO `estudio`, em ativos/.

create table if not exists public.estudio_ativos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  peca_id uuid references public.conteudo_magnetico_pecas(id) on delete set null,
  segmento int check (segmento is null or segmento between 0 and 30),
  tipo text not null check (tipo in ('imagem', 'video', 'audio')),
  nome text not null,
  caminho text not null,
  mime text not null,
  tamanho bigint,
  estado text not null default 'a_subir' check (estado in ('a_subir', 'pronto')),
  notas text,
  criado_em timestamptz not null default now()
);
create index if not exists estudio_ativos_user_idx on public.estudio_ativos (user_id, criado_em desc);
create index if not exists estudio_ativos_peca_idx on public.estudio_ativos (peca_id, segmento);

-- Só o servidor (service role) lê e escreve.
alter table public.estudio_ativos enable row level security;

-- O reel editado de cada take e o rascunho na fila do Instagram (para cancelar a partir do /estudio).
alter table public.estudio_gravacoes add column if not exists post_id uuid;
alter table public.estudio_gravacoes add column if not exists origem_id uuid;
