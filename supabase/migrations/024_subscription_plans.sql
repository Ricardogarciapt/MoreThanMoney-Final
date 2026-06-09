-- ============================================================
-- MTM Subscription Plans — Pack Membro & Pack Premium
-- ============================================================

-- 1. Novos campos no profiles para planos de subscrição
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    CHECK (subscription_plan IN ('app_member', 'premium'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_billing_cycle TEXT
    CHECK (subscription_billing_cycle IN ('monthly', 'annual'))
    DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS subscription_platform TEXT
    CHECK (subscription_platform IN ('app_store', 'skool', 'manual', 'coupon'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS apple_product_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skool_member_id TEXT DEFAULT NULL;

COMMENT ON COLUMN public.profiles.subscription_plan IS
  'app_member = Pack Membro ($35/mês, app+tools+live) | premium = Pack Premium ($65/mês, tudo)';
COMMENT ON COLUMN public.profiles.subscription_billing_cycle IS
  'monthly = mensal | annual = anual (20% desconto)';
COMMENT ON COLUMN public.profiles.subscription_platform IS
  'Origem da subscrição: app_store, skool, manual (admin), coupon';
COMMENT ON COLUMN public.profiles.apple_original_transaction_id IS
  'Apple IAP original transaction ID para verificação de renovação';

-- 2. Tabela de audit trail de subscrições
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'purchased', 'renewed', 'cancelled', 'expired',
      'upgraded', 'downgraded', 'coupon_applied', 'admin_grant'
    )),
  plan TEXT CHECK (plan IN ('app_member', 'premium')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  platform TEXT CHECK (platform IN ('app_store', 'skool', 'manual', 'coupon')),
  apple_transaction_id TEXT,
  coupon_code TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user
  ON public.subscription_events (user_id, created_at DESC);

-- RLS para subscription_events
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_events" ON public.subscription_events
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "admin_all_events" ON public.subscription_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );

-- 3. Tabela de cupões de desconto
CREATE TABLE IF NOT EXISTS public.subscription_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plan TEXT CHECK (plan IN ('app_member', 'premium', 'any')),
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  max_uses INTEGER DEFAULT NULL,
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.subscription_coupons (code);

ALTER TABLE public.subscription_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_manage_coupons" ON public.subscription_coupons
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND user_type = 'admin'
    )
  );
CREATE POLICY "users_read_active_coupons" ON public.subscription_coupons
  FOR SELECT USING (is_active = true);

-- 4. Adicionar access_tier à tabela lms_streams (controlo por plano)
ALTER TABLE public.lms_streams
  ADD COLUMN IF NOT EXISTS access_tier TEXT
    CHECK (access_tier IN ('all', 'app_member', 'premium'))
    DEFAULT 'all';

COMMENT ON COLUMN public.lms_streams.access_tier IS
  'all = todos os membros | app_member = Pack Membro ($35) ou superior | premium = só Pack Premium ($65)';

-- 5. Migrar membros existentes iq/skool para os novos planos
UPDATE public.profiles
SET
  subscription_plan = CASE
    WHEN member_category = 'skool' THEN 'premium'
    WHEN member_category = 'iq' THEN 'premium'
    WHEN member_category IN ('standard', 'vip') THEN 'app_member'
    ELSE NULL
  END,
  subscription_platform = CASE
    WHEN member_category IN ('iq', 'skool') THEN 'skool'
    ELSE 'manual'
  END
WHERE member_category IS NOT NULL AND subscription_plan IS NULL;

-- 6. Função para verificar acesso a stream
CREATE OR REPLACE FUNCTION public.user_can_access_stream(
  p_user_id UUID,
  p_stream_access_tier TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan TEXT;
  v_user_type TEXT;
BEGIN
  SELECT subscription_plan, user_type
  INTO v_plan, v_user_type
  FROM public.profiles
  WHERE id = p_user_id;

  -- Admins always have access
  IF v_user_type = 'admin' THEN RETURN TRUE; END IF;

  -- 'all' tier is accessible to any active member
  IF p_stream_access_tier = 'all' THEN
    RETURN v_plan IS NOT NULL;
  END IF;

  -- app_member tier: app_member or premium
  IF p_stream_access_tier = 'app_member' THEN
    RETURN v_plan IN ('app_member', 'premium');
  END IF;

  -- premium tier: only premium
  IF p_stream_access_tier = 'premium' THEN
    RETURN v_plan = 'premium';
  END IF;

  RETURN FALSE;
END;
$$;
