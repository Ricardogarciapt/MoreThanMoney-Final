-- Agendas extra cujo «ocupado» conta para o /agendar (ex.: agenda pessoal do anfitrião
-- partilhada com a profissional em «ver só disponibilidade»). Lidas só por freeBusy.
alter table public.agenda_anfitrioes
  add column if not exists google_calendarios_ocupado text[] not null default '{}';
