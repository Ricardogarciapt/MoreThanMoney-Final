-- 189 · Fila de comentários do radar (06/10/2026)
--
-- O QUE ISTO RESOLVE
-- O radar de leads já ENCONTRA os posts e a IA já ESCREVE o comentário, mas só quando o dono
-- carrega em «Escrever comentário», cartão a cartão. A fila inverte isso: o agente Prospector
-- (AG-PROSPECTOR) deixa os comentários prontos durante o dia e o dono só tem de colar e publicar.
--
-- O QUE ISTO NÃO FAZ, e não vai fazer
-- Publicar. A Graph API não comenta em posts de terceiros e automatizar o browser viola as regras
-- do Instagram. Por isso não há aqui estado «a publicar» nem coluna de resposta da API: o
-- `publicado_em` só se escreve quando o DONO carrega em «Publiquei», depois de o ter feito à mão.
--
-- O TECTO
-- No máximo 20 comentários por dia (dia de Lisboa). Está no código (lib/instagram/fila-comentarios.ts,
-- TECTO_DIARIO) E aqui, num trigger com fechadura: duas passagens do cron em simultâneo não o
-- furam, e um bug no código também não.

create table if not exists public.ig_fila_comentarios (
  id uuid primary key default gen_random_uuid(),
  prospeto_id uuid not null unique references public.ig_radar_prospetos(id) on delete cascade,
  media_id text not null,
  permalink text,
  hashtag text,
  comentario text not null,
  -- Quem escreveu. Hoje é sempre o Prospector; fica numa coluna para a medição dos agentes.
  escrito_por text not null default 'AG-PROSPECTOR',
  estado text not null default 'pronto'
    check (estado in ('pronto', 'aberto', 'publicado', 'saltado')),
  dia date not null default ((now() at time zone 'Europe/Lisbon')::date),
  criado_em timestamptz not null default now(),
  aberto_em timestamptz,
  publicado_em timestamptz,
  saltado_em timestamptz,
  -- Para a taxa de resposta. Fica nulo até haver forma de ligar o post a uma DM/comentário de
  -- volta: a API de hashtags não diz quem é o autor do post, e sem isso não há ligação honesta.
  respondeu_em timestamptz,
  resposta_canal text check (resposta_canal is null or resposta_canal in ('dm', 'comentario')),

  -- Sem links no comentário. Um comentário com link é spam, é apagado e queima a conta.
  constraint ig_fila_sem_links check (
    comentario !~* '(https?://|www\.|t\.me/|bit\.ly|wa\.me|linktr\.ee|[a-z0-9-]+\.(com|pt|net|io|org|me|ly|app|link)(/|\s|$))'
  ),
  constraint ig_fila_comentario_curto check (char_length(comentario) between 8 and 400),
  -- «Publiquei» tem de deixar rasto completo: quando e quem escreveu.
  constraint ig_fila_publicado_com_rasto check (
    estado <> 'publicado' or (publicado_em is not null and escrito_por is not null)
  )
);

create index if not exists idx_ig_fila_dia on public.ig_fila_comentarios (dia);
create index if not exists idx_ig_fila_estado on public.ig_fila_comentarios (estado, criado_em);

comment on table public.ig_fila_comentarios is
  'Comentários preparados pelo AG-PROSPECTOR para posts do radar. Publicar é SEMPRE à mão, pelo dono; aqui só se regista que foi feito.';

-- O tecto diário, com fechadura para passagens em simultâneo.
create or replace function public.ig_fila_tecto_diario()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  new.dia := (now() at time zone 'Europe/Lisbon')::date;
  perform pg_advisory_xact_lock(hashtext('ig_fila_comentarios_tecto'));
  select count(*) into n from public.ig_fila_comentarios where dia = new.dia;
  if n >= 20 then
    raise exception 'ig_fila_tecto_diario: já há % comentários preparados hoje (tecto 20)', n
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.ig_fila_tecto_diario() from public, anon, authenticated;

drop trigger if exists trg_ig_fila_tecto_diario on public.ig_fila_comentarios;
create trigger trg_ig_fila_tecto_diario
  before insert on public.ig_fila_comentarios
  for each row execute function public.ig_fila_tecto_diario();

-- RLS fechado: só o service role (painel /admin e cron) lê e escreve.
alter table public.ig_fila_comentarios enable row level security;
revoke all on public.ig_fila_comentarios from anon, authenticated;
