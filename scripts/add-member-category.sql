-- Adicionar coluna member_category à tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS member_category TEXT DEFAULT 'standard';

-- Criar constraint para valores válidos
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_member_category_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_member_category_check 
CHECK (member_category IN ('iq', 'skool', 'vip', 'standard'));

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_profiles_member_category ON public.profiles(member_category);

-- Comentário na coluna
COMMENT ON COLUMN public.profiles.member_category IS 'Categoria do membro: IQ (IQONIC), Skool (MoreThanMoney), VIP, ou Standard';

