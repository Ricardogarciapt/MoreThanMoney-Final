-- Tabela de contactos de trading / CRM leve

CREATE TABLE IF NOT EXISTS public.trading_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT,
  interest TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_followup', 'cliente', 'perdido')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_trading_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trading_contacts_updated_at ON public.trading_contacts;
CREATE TRIGGER trg_trading_contacts_updated_at
BEFORE UPDATE ON public.trading_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_trading_contacts_updated_at();

-- RLS
ALTER TABLE public.trading_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own trading contacts" ON public.trading_contacts;

CREATE POLICY "Users can manage own trading contacts"
ON public.trading_contacts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

