-- ===================================================================
-- ADICIONAR CAMPO DE PLATAFORMA DE ONBOARDING À TABELA PROFILES
-- ===================================================================
-- Este script adiciona:
-- onboarding_platform: Plataforma de onboarding (vxa, rfg, ou NULL)
-- Para membros IQ, permite especificar VXA ou RFG
-- ===================================================================

-- 1. Adicionar coluna onboarding_platform
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_platform TEXT DEFAULT NULL;

-- 2. Criar constraint para valores válidos
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_onboarding_platform_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_onboarding_platform_check 
CHECK (onboarding_platform IS NULL OR onboarding_platform IN ('vxa', 'rfg'));

-- 3. Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_platform ON public.profiles(onboarding_platform);

-- 4. Comentário na coluna
COMMENT ON COLUMN public.profiles.onboarding_platform IS 'Plataforma de onboarding para membros IQ: vxa (Vision X Ambition) ou rfg (RFG Life)';

-- 5. Atualizar membros IQ existentes para manter comportamento padrão (NULL = RFG)
-- Este script não altera dados existentes, apenas adiciona o campo

