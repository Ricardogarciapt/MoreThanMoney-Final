-- ===================================================================
-- ADICIONAR COLUNA IQONIC_ID À TABELA PROFILES
-- ===================================================================
-- Este script adiciona:
-- iqonic_id: ID do membro IQONIC (obrigatório para VXA e RFG)
-- ===================================================================

-- 1. Adicionar coluna iqonic_id
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS iqonic_id TEXT DEFAULT NULL;

-- 2. Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_profiles_iqonic_id ON public.profiles(iqonic_id);

-- 3. Comentário na coluna
COMMENT ON COLUMN public.profiles.iqonic_id IS 'ID do membro IQONIC (obrigatório para membros VXA e RFG)';

-- Verificar se foi adicionada
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'iqonic_id';
