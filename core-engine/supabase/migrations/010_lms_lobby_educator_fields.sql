-- Campos para lobby / filtros / agenda (Live Sessions marketplace)
alter table if exists public.lms_educators
  add column if not exists specialty text;

alter table if exists public.lms_streams
  add column if not exists category text,
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists viewer_count int not null default 0;

comment on column public.lms_educators.specialty is 'Tag curta de especialidade (ex: Fiscalidade, Cripto)';
comment on column public.lms_streams.category is 'Categoria para filtros rápidos (iniciante, investimentos, poupanca, planeamento, outro)';
comment on column public.lms_streams.scheduled_start_at is 'Próxima live agendada (opcional)';
comment on column public.lms_streams.viewer_count is 'Contador de audiência (atualizado por job ou manual)';
