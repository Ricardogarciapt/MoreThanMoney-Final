-- 24/11/2026 — parabéns da AIDA aos membros que fazem anos (pedido do Ricardo).
-- Coluna aditiva: por omissão ninguém é celebrado. Só quem ligar o consentimento no perfil
-- (aniversario_consentimento = true) entra no parabéns, e só pelo primeiro nome.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aniversario_consentimento BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.aniversario_consentimento
  IS 'Consentimento para a AIDA celebrar o aniversário no canal geral (só primeiro nome). Por omissão false.';
