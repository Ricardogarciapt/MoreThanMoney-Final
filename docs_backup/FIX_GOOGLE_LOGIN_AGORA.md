# 🔧 FIX: Login com Google - Executar AGORA

## ❌ **Problema:**
Login com Google falha porque não cria perfil automaticamente na tabela `profiles`.

## ✅ **Solução:**
Executar SQL que cria triggers automáticos.

---

## 📋 **PASSO A PASSO (2 minutos):**

### 1️⃣ Abrir Supabase SQL Editor

Link direto: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql

### 2️⃣ Executar SQL

1. Clica em **"New query"**
2. **Cola o conteúdo completo de:** `scripts/fix-google-oauth-profiles.sql`
3. Clica em **"Run"** ou pressiona `Cmd+Enter`

### 3️⃣ Verificar Resultado

Deves ver algo como:

```
✅ Triggers criados!
✅ X usuários sem perfil corrigidos
✅ Perfis existentes: Y total_perfis
```

---

## 🎯 **O que este SQL faz:**

1. ✅ **Cria trigger `handle_new_user()`**
   - Sempre que alguém fizer login com Google
   - Cria automaticamente o perfil em `profiles`
   - Usa nome e foto do Google

2. ✅ **Cria trigger `handle_user_metadata_update()`**
   - Se o usuário atualizar foto no Google
   - Atualiza automaticamente no perfil

3. ✅ **Corrige usuários existentes**
   - Busca todos os usuários sem perfil
   - Cria perfis para eles

4. ✅ **Ajusta políticas RLS**
   - Permite que o sistema crie perfis automaticamente
   - Sem bloquear por permissões

---

## 🧪 **Testar:**

Depois de executar o SQL:

1. Vai a: https://morethanmoney.pt/login
2. Clica em "Login com Google"
3. Escolhe conta Google
4. **DEVE funcionar agora!** ✅

Se ainda falhar:
- Abre DevTools (F12) → Console
- Copia os logs de erro
- Partilha comigo

---

## 🔍 **Verificar se funcionou:**

No Supabase SQL Editor, executa:

```sql
-- Ver todos os perfis criados
SELECT 
  id,
  email,
  full_name,
  username,
  avatar_url,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- Ver usuários sem perfil (deve ser 0)
SELECT COUNT(*) as usuarios_sem_perfil
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;
```

Se `usuarios_sem_perfil` = 0 → **FUNCIONOU! ✅**

---

## ⚡ **EXECUTAR AGORA:**

```bash
# No terminal (opcional - para depois fazer commit)
git add scripts/fix-google-oauth-profiles.sql
git add FIX_GOOGLE_LOGIN_AGORA.md
git commit -m "fix: Criar perfis automaticamente para Google OAuth

🔧 Triggers automáticos:
- handle_new_user() → cria perfil após signup
- handle_user_metadata_update() → atualiza foto/nome

✅ Corrige usuários existentes sem perfil
✅ Políticas RLS ajustadas

Resolve: Login com Google falhando"
```

---

**AGORA:** Vai ao Supabase e executa o SQL! 🚀

