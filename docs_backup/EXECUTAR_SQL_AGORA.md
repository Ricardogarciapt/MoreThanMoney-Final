# 🔴 AÇÃO NECESSÁRIA - EXECUTAR SQL NO SUPABASE

**Urgência:** ALTA  
**Tempo:** 5 minutos  
**Impacto:** Ativa 100% das funcionalidades

---

## ⚠️ PROBLEMA ATUAL

### Utilizadores não conseguem fazer login porque:
- ❌ Coluna `is_verified` não existe na tabela `profiles`
- ❌ Isto impede a sincronização de 33 utilizadores do Auth para Profiles
- ❌ Apenas 10 utilizadores têm perfis criados

### O que funciona agora:
- ✅ 10 utilizadores podem fazer login (criados antes)
- ✅ Admin funciona
- ✅ Páginas carregam
- ✅ Tema e configurações funcionam (localStorage)

### O que NÃO funciona:
- ❌ 33 utilizadores não conseguem fazer login
- ❌ Sistema de trials não funciona
- ❌ Logs não salvam em banco
- ❌ Tema não salva em banco
- ❌ Sincronização falha

---

## ✅ SOLUÇÃO DEFINITIVA (5 MINUTOS)

### PASSO A PASSO:

#### 1. Aceder ao Supabase Dashboard
```
URL: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof
```

#### 2. Ir para SQL Editor
```
Menu lateral → SQL Editor → New Query
```

#### 3. Executar PRIMEIRO SQL (Mais Importante)
```sql
-- Copiar TUDO do arquivo:
scripts/add-is-verified-column.sql

-- OU copiar isto:

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;

UPDATE profiles 
SET is_verified = true 
WHERE id IN (
    SELECT au.id::uuid 
    FROM auth.users au 
    WHERE au.email_confirmed_at IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_is_verified 
ON profiles(is_verified);
```

**Clicar RUN**

**Resultado esperado:**
```
Success. Rows returned: 1
total: 10, verified: 10, not_verified: 0
```

#### 4. Executar SEGUNDO SQL (Sistema de Trials)
```sql
-- Copiar TUDO do arquivo:
supabase/trial-profiles-schema.sql

-- Clicar RUN
```

**Resultado esperado:**
```
Success. Multiple commands executed.
```

#### 5. Executar TERCEIRO SQL (Tabelas Admin)
```sql
-- Copiar TUDO do arquivo:
supabase/fix-auth-schema.sql

-- Clicar RUN
```

**Resultado esperado:**
```
Success. Tables created: site_content, activity_logs, admin_settings
```

#### 6. Sincronizar Utilizadores
```bash
# Voltar ao terminal e executar:
curl -X POST http://localhost:3000/api/admin/sync-users

# OU ir para:
http://localhost:3000/admin
# E clicar no botão "Sincronizar Utilizadores"
```

**Resultado esperado:**
```
✅ 33 novos perfis criados
✅ Total: 43 utilizadores sincronizados
✅ 4 admins identificados
```

---

## 🎯 APÓS EXECUTAR OS SQLs

### Todos os 43 utilizadores poderão fazer login:
- ✅ Email + password
- ✅ Username + password
- ✅ Redirecionamento automático

### Sistema 100% funcional:
- ✅ Login para todos
- ✅ Trials (Guest + Apresentação)
- ✅ Logs salvos em banco
- ✅ Tema salvo em banco
- ✅ Configurações salvas em banco
- ✅ Scanner de conteúdo completo
- ✅ Aprovação automática funcional

---

## 📋 ORDEM DE EXECUÇÃO

**EXECUTAR NESTA ORDEM:**

1. ✅ `scripts/add-is-verified-column.sql` (30 segundos) 🔴 **PRIORITÁRIO**
2. ✅ `supabase/trial-profiles-schema.sql` (2 minutos)
3. ✅ `supabase/fix-auth-schema.sql` (3 minutos)
4. ✅ Sincronizar utilizadores (30 segundos)

**TOTAL: 5 minutos**

---

## 🔍 VERIFICAR SE FUNCIONOU

### Teste 1: Verificar coluna is_verified
```sql
-- No SQL Editor:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'is_verified';
```

**Resultado esperado:**
```
column_name: is_verified
data_type: boolean
```

### Teste 2: Sincronizar utilizadores
```bash
# No navegador:
http://localhost:3000/admin
# Clicar "Sincronizar Utilizadores"
```

**Resultado esperado:**
```
Sincronização concluída!
- Utilizadores no Auth: 43
- Perfis existentes: 10
- Novos perfis criados: 33
- Admins identificados: 4
```

### Teste 3: Fazer login
```
URL: http://localhost:3000/login
Email: diogobastiao24@gmail.com
Password: [senha do utilizador]
```

**Resultado esperado:**
```
✅ Login bem-sucedido
→ Redirect para /scanner-access
```

---

## ⚡ EXECUTE AGORA!

### 3 Arquivos SQL para copiar e colar:

1. **scripts/add-is-verified-column.sql** 🔴
2. **supabase/trial-profiles-schema.sql**
3. **supabase/fix-auth-schema.sql**

### Dashboard Supabase:
```
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof
→ SQL Editor
→ New Query
→ Colar SQL
→ RUN
```

---

## 🎊 APÓS EXECUTAR:

- ✅ **43 utilizadores** poderão fazer login
- ✅ **Sistema de trials** funcionará
- ✅ **Admin completo** com todas funcionalidades
- ✅ **Logs e dados** salvos em banco
- ✅ **100% funcional**

---

**🚨 EXECUTE OS SQLs AGORA PARA ATIVAR TODO O SISTEMA! 🚨**

