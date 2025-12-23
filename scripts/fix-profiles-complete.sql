-- ════════════════════════════════════════════════════════════════════════════
-- SCRIPT DE CORREÇÃO COMPLETA DA TABELA PROFILES
-- ════════════════════════════════════════════════════════════════════════════
-- Execute este script no Supabase SQL Editor para garantir que todos os campos
-- necessários existem e estão configurados corretamente
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Adicionar colunas faltantes (se não existirem)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS whatsapp TEXT;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS trial_expired BOOLEAN DEFAULT false;

-- 2. Garantir que user_type aceita todos os valores necessários
-- ────────────────────────────────────────────────────────────────────────────

-- Criar o tipo user_type se não existir
DO $$ 
BEGIN
    -- Verificar se o tipo existe
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_type') THEN
        -- Criar o tipo com todos os valores necessários
        CREATE TYPE user_type AS ENUM ('member', 'trial', 'guest', 'presentation', 'admin');
    ELSE
        -- Se o tipo existe, adicionar valores que faltam
        BEGIN
            ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'trial';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
        
        BEGIN
            ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'guest';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
        
        BEGIN
            ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'presentation';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
        
        BEGIN
            ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'admin';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
    END IF;
END $$;

-- Adicionar coluna user_type se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = 'user_type'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN user_type user_type DEFAULT 'member'::user_type NOT NULL;
    END IF;
END $$;

-- 3. Criar índices para melhorar performance
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS profiles_email_idx 
ON public.profiles(email);

CREATE INDEX IF NOT EXISTS profiles_username_idx 
ON public.profiles(username);

CREATE INDEX IF NOT EXISTS profiles_user_type_idx 
ON public.profiles(user_type);

CREATE INDEX IF NOT EXISTS profiles_is_active_idx 
ON public.profiles(is_active);

CREATE INDEX IF NOT EXISTS profiles_trial_expires_at_idx 
ON public.profiles(trial_expires_at) 
WHERE trial_expires_at IS NOT NULL;

-- 4. Adicionar comentários às colunas
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.profiles.avatar_url IS 
'URL do avatar do utilizador (Google OAuth ou upload)';

COMMENT ON COLUMN public.profiles.last_login IS 
'Data e hora do último login do utilizador';

COMMENT ON COLUMN public.profiles.trial_expires_at IS 
'Data de expiração para contas trial/guest/presentation';

COMMENT ON COLUMN public.profiles.trial_expired IS 
'Indica se a conta trial expirou (atualizado automaticamente)';

-- 5. Criar ou substituir função para expirar trials automaticamente
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_trial_expiration()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET trial_expired = true
  WHERE user_type IN ('trial', 'guest', 'presentation')
    AND trial_expires_at IS NOT NULL
    AND trial_expires_at < NOW()
    AND trial_expired = false;
END;
$$;

-- 6. Criar trigger para atualizar updated_at automaticamente
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Criar funções RPC necessárias para login
-- ────────────────────────────────────────────────────────────────────────────

-- Função para buscar email pelo username (usado no login)
CREATE OR REPLACE FUNCTION get_user_email_by_username(username_param TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT email INTO user_email
  FROM public.profiles
  WHERE username = username_param
  LIMIT 1;
  
  RETURN user_email;
END;
$$;

-- 8. Garantir RLS (Row Level Security) correto
-- ────────────────────────────────────────────────────────────────────────────

-- Ativar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas que podem causar conflito
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.profiles;

-- Criar políticas corretas
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Enable insert for authenticated users"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- 9. Verificar e corrigir dados existentes
-- ────────────────────────────────────────────────────────────────────────────

-- Marcar trials expirados
UPDATE public.profiles
SET trial_expired = true
WHERE user_type IN ('trial', 'guest', 'presentation')
  AND trial_expires_at IS NOT NULL
  AND trial_expires_at < NOW()
  AND trial_expired = false;

-- Garantir que todos os perfis têm is_active definido
UPDATE public.profiles
SET is_active = true
WHERE is_active IS NULL
  AND user_type = 'member';

-- ════════════════════════════════════════════════════════════════════════════
-- ✅ SCRIPT CONCLUÍDO!
-- ════════════════════════════════════════════════════════════════════════════
-- 
-- Verifique se tudo está correto executando:
-- 
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
-- ORDER BY ordinal_position;
--
-- ════════════════════════════════════════════════════════════════════════════

