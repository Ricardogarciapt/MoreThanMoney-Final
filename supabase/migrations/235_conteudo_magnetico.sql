-- MTM Conteúdo Magnético (05/11/2026): guiões guardados e a fila de render de reels.
-- O render corre FORA da Vercel (VPS ou Mac, services/conteudo-magnetico-render): reclama um
-- trabalho, desenha, sobe o MP4 por URL assinado e devolve o endereço.

create table if not exists public.conteudo_magnetico_pecas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  formato text not null,
  marca text not null,
  guiao jsonb not null,
  fundo_url text,
  criado_em timestamptz not null default now()
);
create index if not exists conteudo_magnetico_pecas_user_idx on public.conteudo_magnetico_pecas (user_id, criado_em desc);

create table if not exists public.conteudo_magnetico_renders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  peca_id uuid references public.conteudo_magnetico_pecas(id) on delete set null,
  guiao jsonb not null,
  marca jsonb not null,
  fundo_url text,
  estado text not null default 'na_fila' check (estado in ('na_fila', 'a_render', 'pronto', 'erro')),
  video_url text,
  erro text,
  motor text,
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  terminado_em timestamptz
);
create index if not exists conteudo_magnetico_renders_fila_idx on public.conteudo_magnetico_renders (estado, criado_em);
create index if not exists conteudo_magnetico_renders_user_idx on public.conteudo_magnetico_renders (user_id, criado_em desc);

-- Só o servidor (service role) lê e escreve. Nada de acesso directo do browser.
alter table public.conteudo_magnetico_pecas enable row level security;
alter table public.conteudo_magnetico_renders enable row level security;

-- Reclamar o próximo trabalho de forma atómica (dois motores nunca pegam no mesmo).
-- Um trabalho preso em 'a_render' há mais de 20 min volta a ser reclamável (motor caiu a meio).
create or replace function public.conteudo_magnetico_reclamar(p_motor text)
returns setof public.conteudo_magnetico_renders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.conteudo_magnetico_renders r
     set estado = 'a_render', iniciado_em = now(), motor = p_motor, tentativas = r.tentativas + 1
   where r.id = (
     select id from public.conteudo_magnetico_renders
      where (estado = 'na_fila' or (estado = 'a_render' and iniciado_em < now() - interval '20 minutes'))
        and tentativas < 3
      order by criado_em
      limit 1
      for update skip locked
   )
  returning r.*;
end;
$$;
revoke all on function public.conteudo_magnetico_reclamar(text) from public, anon, authenticated;
