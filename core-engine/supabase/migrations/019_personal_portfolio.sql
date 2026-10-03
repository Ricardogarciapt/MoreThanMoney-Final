-- Portfólio pessoal (app-mobile): persistência na conta do utilizador

CREATE TABLE IF NOT EXISTS public.personal_portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  purchase_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  asset_type TEXT DEFAULT 'crypto',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legado (scripts antigos): buy_price → purchase_price
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'personal_portfolio' AND column_name = 'buy_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'personal_portfolio' AND column_name = 'purchase_price'
  ) THEN
    ALTER TABLE public.personal_portfolio RENAME COLUMN buy_price TO purchase_price;
  END IF;
END $$;

ALTER TABLE public.personal_portfolio ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(20, 8);
ALTER TABLE public.personal_portfolio ADD COLUMN IF NOT EXISTS current_price DECIMAL(20, 8);
ALTER TABLE public.personal_portfolio ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'crypto';
ALTER TABLE public.personal_portfolio ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_personal_portfolio_user_id ON public.personal_portfolio(user_id);

ALTER TABLE public.personal_portfolio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seu portfolio" ON public.personal_portfolio;
CREATE POLICY "Usuários veem seu portfolio"
  ON public.personal_portfolio FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários criam ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários criam ativos"
  ON public.personal_portfolio FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam seus ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários atualizam seus ativos"
  ON public.personal_portfolio FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus ativos" ON public.personal_portfolio;
CREATE POLICY "Usuários deletam seus ativos"
  ON public.personal_portfolio FOR DELETE
  USING (auth.uid() = user_id);
