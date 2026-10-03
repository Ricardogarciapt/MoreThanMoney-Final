-- Subscrição 30 dias (Skool / IQ) com renovação automática
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_auto_renew BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_expires
  ON public.profiles (subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.subscription_expires_at IS
  'Fim do período de acesso para member_category iq ou skool (ciclo 30 dias).';
COMMENT ON COLUMN public.profiles.subscription_auto_renew IS
  'Se true, o cron renova automaticamente +30 dias ao expirar (iq/skool).';

-- Membros IQ/Skool existentes: iniciar ciclo de 30 dias
UPDATE public.profiles
SET
  subscription_expires_at = COALESCE(subscription_expires_at, NOW() + INTERVAL '30 days'),
  subscription_auto_renew = COALESCE(subscription_auto_renew, true)
WHERE member_category IN ('iq', 'skool');
