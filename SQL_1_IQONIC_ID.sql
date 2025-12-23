ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS iqonic_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_iqonic_id ON public.profiles(iqonic_id);
COMMENT ON COLUMN public.profiles.iqonic_id IS 'ID do membro IQONIC (obrigatório para membros VXA e RFG)';
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'iqonic_id';
