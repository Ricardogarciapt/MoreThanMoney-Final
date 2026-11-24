-- 24/11/2026 — a ligação Google do anfitrião expirou (token de app em teste, 7 dias) e as
-- marcações deixaram de chegar à agenda sem ninguém dar por isso. Esta coluna acende o aviso no
-- painel («a religar») até o anfitrião voltar a ligar o Google. Aditiva: por omissão false.
ALTER TABLE public.agenda_anfitrioes
  ADD COLUMN IF NOT EXISTS google_a_religar BOOLEAN NOT NULL DEFAULT false;
