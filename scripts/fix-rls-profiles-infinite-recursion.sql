-- ====================================================================
-- 🚨 CORREÇÃO URGENTE: RLS INFINITE RECURSION NO PROFILES
-- ====================================================================
-- 
-- ERRO: infinite recursion detected in policy for relation "profiles"
-- CAUSA: Políticas RLS estão se referenciando mutuamente em loop
-- SOLUÇÃO: Remover TODAS as políticas e criar políticas SIMPLES e DIRETAS
--
-- ====================================================================

BEGIN;

-- 1. REMOVER TODAS AS POLÍTICAS EXISTENTES (evitar conflitos)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles CASCADE', r.policyname);
        RAISE NOTICE '✅ Política removida: %', r.policyname;
    END LOOP;
END $$;

-- 2. GARANTIR QUE RLS ESTÁ ATIVADO
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. CRIAR POLÍTICAS SIMPLES (SEM RECURSÃO)
-- ====================================================================

-- POLÍTICA 1: SELECT - Usuários autenticados podem ver TODOS os perfis
-- (IMPORTANTE: Sem subquery em profiles, evita recursão)
CREATE POLICY "authenticated_users_read_all_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);  -- ✅ SEM RECURSÃO: Permite ver todos

-- POLÍTICA 2: INSERT - Usuários podem criar APENAS seu próprio perfil
CREATE POLICY "authenticated_users_insert_own_profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);  -- ✅ SEM RECURSÃO: Compara direto com auth.uid()

-- POLÍTICA 3: UPDATE - Usuários podem atualizar APENAS seu próprio perfil
CREATE POLICY "authenticated_users_update_own_profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)  -- ✅ SEM RECURSÃO: Compara direto com auth.uid()
WITH CHECK (auth.uid() = id);

-- POLÍTICA 4: DELETE - APENAS ADMINS podem deletar perfis
-- (IMPORTANTE: Verificação direta, sem subquery em profiles)
CREATE POLICY "admins_delete_profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'user_type' = 'admin'
  )
);  -- ✅ SEM RECURSÃO: Usa auth.users, não profiles

-- ====================================================================
-- 4. GARANTIR PERMISSÕES
-- ====================================================================

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;  -- Controlado por RLS

-- ====================================================================
-- 5. VERIFICAÇÃO FINAL
-- ====================================================================

DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public';
    
    IF policy_count = 4 THEN
        RAISE NOTICE '✅ SUCESSO: 4 políticas RLS criadas sem recursão';
        RAISE NOTICE '📊 Políticas ativas:';
        RAISE NOTICE '   1. authenticated_users_read_all_profiles (SELECT)';
        RAISE NOTICE '   2. authenticated_users_insert_own_profile (INSERT)';
        RAISE NOTICE '   3. authenticated_users_update_own_profile (UPDATE)';
        RAISE NOTICE '   4. admins_delete_profiles (DELETE)';
    ELSE
        RAISE WARNING '⚠️ Esperado 4 políticas, encontrado: %', policy_count;
    END IF;
END $$;

COMMIT;

-- ====================================================================
-- ✅ SCRIPT CONCLUÍDO
-- ====================================================================
-- 
-- PRÓXIMO PASSO:
-- Execute este script no SQL Editor do Supabase em:
-- https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new
--
-- APÓS EXECUTAR:
-- 1. Hard reload (Ctrl+Shift+R) no localhost:3000
-- 2. Verificar console: SEM erro "infinite recursion" ✅
--
-- ====================================================================



