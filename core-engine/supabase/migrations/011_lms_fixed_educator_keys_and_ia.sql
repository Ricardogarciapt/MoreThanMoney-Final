alter table if exists public.lms_educators
  add column if not exists stream_key_fixed text,
  add column if not exists youtube_stream_key text,
  add column if not exists youtube_enabled boolean not null default false;

create unique index if not exists idx_lms_educators_stream_key_fixed_unique
  on public.lms_educators(stream_key_fixed)
  where stream_key_fixed is not null;

-- Backfill de chave fixa para educadores existentes.
update public.lms_educators
set stream_key_fixed = concat('mtm_edu_', replace(id::text, '-', ''), '_', substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10))
where stream_key_fixed is null;

-- Sincronizar stream_key nas streams existentes com a chave fixa por educador.
update public.lms_streams s
set stream_key = e.stream_key_fixed
from public.lms_educators e
where s.educator_id = e.id
  and e.stream_key_fixed is not null
  and (s.stream_key is null or s.stream_key <> e.stream_key_fixed);

-- Upsert academias/categorias oficiais LMS.
insert into public.lms_academies (slug, name, description)
values
  ('forex', 'Forex', 'Sessões ao vivo de Forex'),
  ('criptomoedas', 'Criptomoedas', 'Aulas e análise de cripto ativos'),
  ('social-media', 'Social Media', 'Crescimento e marca pessoal'),
  ('imobiliario', 'Imobiliário', 'Educação imobiliária e estratégias'),
  ('fitness', 'Fitness', 'Performance e hábitos'),
  ('mindset', 'Mindset', 'Mentalidade e disciplina'),
  ('ia', 'IA', 'Ferramentas de Inteligência Artificial aplicadas ao negócio')
on conflict (slug)
do update set
  name = excluded.name,
  description = excluded.description;

-- Compatibilidade com slug antigo.
update public.lms_academies
set slug = 'criptomoedas', name = 'Criptomoedas'
where slug = 'cripto';

