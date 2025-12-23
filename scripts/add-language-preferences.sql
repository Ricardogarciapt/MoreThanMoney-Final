-- ===================================================================
-- ADICIONAR CAMPOS DE IDIOMA E LOCALIZAÇÃO À TABELA PROFILES
-- ===================================================================
-- Este script adiciona:
-- 1. preferred_language: Idioma preferido do usuário
-- 2. detected_language: Idioma detectado automaticamente
-- 3. country: País do usuário (para localização)
-- 4. timezone: Fuso horário
-- ===================================================================

-- 1. Adicionar coluna de idioma preferido
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT NULL;

-- 2. Adicionar coluna de idioma detectado
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS detected_language TEXT DEFAULT NULL;

-- 3. Adicionar coluna de país
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS country TEXT DEFAULT NULL;

-- 4. Adicionar coluna de fuso horário
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT NULL;

-- 5. Adicionar coluna de auto-tradução (se o usuário quer tradução automática)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auto_translate BOOLEAN DEFAULT true;

-- 6. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language ON public.profiles(preferred_language);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);

-- 7. Comentários nas colunas
COMMENT ON COLUMN public.profiles.preferred_language IS 'Idioma preferido do usuário (ISO 639-1: pt, en, es, fr, etc)';
COMMENT ON COLUMN public.profiles.detected_language IS 'Idioma detectado automaticamente do navegador';
COMMENT ON COLUMN public.profiles.country IS 'País do usuário (ISO 3166-1 alpha-2: PT, BR, US, ES, etc)';
COMMENT ON COLUMN public.profiles.timezone IS 'Fuso horário do usuário (ex: Europe/Lisbon, America/Sao_Paulo)';
COMMENT ON COLUMN public.profiles.auto_translate IS 'Se true, traduz automaticamente para o idioma preferido';

-- 8. Atualizar trigger updated_at se não existir
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Remover trigger antigo se existir e criar novo
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. Garantir que RLS está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 10. Permitir que usuários atualizem suas próprias preferências de idioma
-- Remover política antiga se existir
DROP POLICY IF EXISTS "Users can update their own language preferences" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own language preferences" ON public.profiles;

-- Criar nova política de UPDATE
CREATE POLICY "Users can update their own language preferences"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 11. Criar nova política de SELECT
CREATE POLICY "Users can view their own language preferences"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ===================================================================
-- EXECUTADO COM SUCESSO!
-- ===================================================================
-- Agora a tabela profiles tem:
-- - preferred_language (idioma escolhido manualmente)
-- - detected_language (idioma do navegador)
-- - country (país para localização)
-- - timezone (fuso horário)
-- - auto_translate (ativar/desativar tradução automática)
-- ===================================================================

