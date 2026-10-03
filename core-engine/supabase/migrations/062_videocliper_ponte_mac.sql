-- 062 — Ponte do Mac para links do YouTube (o YouTube recusa o IP do servidor da AWS).
-- ponte_estado: null = não precisa; pendente → a_descarregar → feito | erro.
alter table public.videocliper_jobs
  add column if not exists ponte_estado text check (ponte_estado in ('pendente','a_descarregar','feito','erro')),
  add column if not exists ponte_reclamado_em timestamptz;
