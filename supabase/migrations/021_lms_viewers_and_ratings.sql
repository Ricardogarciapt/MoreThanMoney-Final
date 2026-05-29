-- Presença de espectadores (heartbeat) + avaliações de aulas por educador

create table if not exists public.lms_stream_viewers (
  stream_id uuid not null references public.lms_streams(id) on delete cascade,
  viewer_key text not null,
  last_seen_at timestamptz not null default now(),
  primary key (stream_id, viewer_key)
);

create index if not exists idx_lms_stream_viewers_active
  on public.lms_stream_viewers (stream_id, last_seen_at desc);

comment on table public.lms_stream_viewers is 'Heartbeat de espectadores na sala; contagem ativa via last_seen_at';

create table if not exists public.lms_educator_ratings (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.lms_educators(id) on delete cascade,
  stream_id uuid references public.lms_streams(id) on delete set null,
  user_id uuid not null,
  user_name text,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (educator_id, user_id)
);

create index if not exists idx_lms_educator_ratings_educator
  on public.lms_educator_ratings (educator_id, created_at desc);

comment on table public.lms_educator_ratings is 'Feedback Rate da aula — um registo por membro por educador (atualizável)';

alter table public.lms_stream_viewers enable row level security;
alter table public.lms_educator_ratings enable row level security;

drop policy if exists lms_stream_viewers_read on public.lms_stream_viewers;
create policy lms_stream_viewers_read on public.lms_stream_viewers for select using (true);

drop policy if exists lms_educator_ratings_read on public.lms_educator_ratings;
create policy lms_educator_ratings_read on public.lms_educator_ratings for select using (true);
