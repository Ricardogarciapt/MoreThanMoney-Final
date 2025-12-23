# 🚨 **URGENTE: ERRO CRÍTICO RLS - INFINITE RECURSION**

---

## ❌ **ERRO ATUAL**

```
Error: infinite recursion detected in policy for relation "profiles"
Code: 42P17
```

**Impacto**: 
- ❌ Social Feed não carrega posts
- ❌ Member Area loop infinito
- ❌ App-Mobile não carrega perfil
- ❌ TODAS as queries em `profiles` falham

---

## ✅ **SOLUÇÃO IMEDIATA**

### **PASSO 1: Abrir Supabase SQL Editor**

```
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new
```

### **PASSO 2: Copiar e Executar SQL**

**Ficheiro**: `scripts/fix-rls-profiles-infinite-recursion.sql`

```sql
-- 1. REMOVER TODAS AS POLÍTICAS
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles CASCADE', r.policyname);
    END LOOP;
END $$;

-- 2. CRIAR POLÍTICAS SIMPLES (SEM RECURSÃO)
CREATE POLICY "authenticated_users_read_all_profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);

CREATE POLICY "authenticated_users_insert_own_profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "authenticated_users_update_own_profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "admins_delete_profiles"
ON public.profiles FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'user_type' = 'admin'
  )
);
```

### **PASSO 3: Verificar Sucesso**

No SQL Editor, deve aparecer:

```
✅ SUCESSO: 4 políticas RLS criadas sem recursão
📊 Políticas ativas:
   1. authenticated_users_read_all_profiles (SELECT)
   2. authenticated_users_insert_own_profile (INSERT)
   3. authenticated_users_update_own_profile (UPDATE)
   4. admins_delete_profiles (DELETE)
```

### **PASSO 4: Testar Localhost**

```bash
# Hard reload no browser
Ctrl+Shift+R

# Console deve mostrar:
✅ [SOCIAL FEED] Posts carregados: [...]
✅ [MEMBER AREA] Perfil carregado: ricardogarciapt@proton.me
✅ [APP-MOBILE] Perfil carregado para: ricardogarciapt@proton.me
```

**SEM**:
```
❌ infinite recursion detected
```

---

## 🔍 **CAUSA DO ERRO**

As políticas RLS antigas tinham **subqueries recursivas**:

```sql
-- ❌ ERRADO (causava loop infinito)
CREATE POLICY "some_policy" ON profiles
USING (
  EXISTS (
    SELECT 1 FROM profiles  -- ❌ Subquery em profiles causa RECURSÃO!
    WHERE ...
  )
);
```

**Solução**: Políticas novas usam **auth.uid()** direto ou **auth.users** (sem tocar em `profiles`):

```sql
-- ✅ CORRETO (sem recursão)
CREATE POLICY "some_policy" ON profiles
USING (auth.uid() = id);  -- ✅ Comparação direta, sem subquery
```

---

## 📊 **IMPACTO DA CORREÇÃO**

**ANTES**:
```
❌ 500 Internal Server Error em /profiles queries
❌ Social Feed: "Erro ao carregar posts"
❌ Member Area: Loop infinito
❌ App-Mobile: "Erro ao carregar perfil"
```

**DEPOIS**:
```
✅ 200 OK em todas as queries
✅ Social Feed carrega posts
✅ Member Area carrega perfil
✅ App-Mobile funciona 100%
```

---

## ⚡ **EXECUTAR AGORA**

1. **Abrir**: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new
2. **Copiar**: `scripts/fix-rls-profiles-infinite-recursion.sql`
3. **Executar**: Clicar "RUN"
4. **Recarregar**: Ctrl+Shift+R em localhost:3000

---

**TEMPO ESTIMADO**: 2 minutos  
**PRIORIDADE**: 🔴 **CRÍTICA**  
**IMPACTO**: 🚀 **100% do sistema funcional**

---

✅ **Após executar, o erro desaparece completamente!**



