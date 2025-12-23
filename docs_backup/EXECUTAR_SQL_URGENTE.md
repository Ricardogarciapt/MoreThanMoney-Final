# 🚨 AÇÃO URGENTE - EXECUTAR SQL ANTES DE TESTAR LOGIN! 🚨

## ⚠️ O loop de login está acontecendo por causa do erro 400 (Bad Request)

O erro ocorre porque a tabela `profiles` não tem a coluna `avatar_url` que o callback do Google OAuth tenta atualizar.

---

## 📋 PASSO A PASSO:

### 1️⃣ Abrir Supabase Dashboard
```
https://supabase.com/dashboard
```

### 2️⃣ Selecionar seu projeto
```
iwscxotvmtkphajmasof
```

### 3️⃣ Ir para SQL Editor
- No menu lateral: **SQL Editor**

### 4️⃣ Executar este SQL:

Copiar e colar o conteúdo do arquivo:
```
scripts/fix-profiles-complete.sql
```

### 5️⃣ Clicar em Run (▶️)

### 6️⃣ Verificar sucesso
Deve aparecer: ✅ **Success** (sem erros vermelhos)

---

## ✅ O QUE ESTE SQL FAZ:

1. **Adiciona colunas faltantes:**
   - `avatar_url` (para Google OAuth) ← **PRINCIPAL CAUSA DO ERRO 400**
   - `last_login`
   - `phone`, `whatsapp`
   - `trial_expires_at`, `trial_expired`

2. **Atualiza enum `user_type`:**
   - Adiciona: `'trial'`, `'guest'`, `'presentation'`

3. **Cria índices** para melhor performance

4. **Configura RLS** (Row Level Security) corretamente

5. **Adiciona função** para expirar trials automaticamente

6. **Corrige dados existentes**

---

## 🔍 VERIFICAR SE FUNCIONOU:

Execute esta query no SQL Editor do Supabase:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;
```

**Deve mostrar TODAS estas colunas:**
- ✅ id
- ✅ email
- ✅ full_name
- ✅ username
- ✅ user_type
- ✅ is_active
- ✅ **avatar_url** ← IMPORTANTE!
- ✅ phone
- ✅ whatsapp
- ✅ trial_expires_at
- ✅ trial_expired
- ✅ created_at
- ✅ updated_at

---

## ⚠️ SE DER ERRO "admin_settings does not exist":

Execute este SQL **ANTES** do fix-profiles-complete.sql:

```sql
CREATE TABLE IF NOT EXISTS admin_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  content_config JSONB,
  theme_config JSONB,
  settings JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 💡 APÓS EXECUTAR O SQL:

1. ✅ **Fazer logout** completo do site
2. ✅ **Fechar TODAS** as abas do site
3. ✅ **Limpar cache** do navegador (Ctrl+Shift+Delete)
   - Escolher: "Últimas 24 horas" ou "Tudo"
   - Marcar: "Cookies e dados de sites"
4. ✅ **Reabrir** o site
5. ✅ **Fazer login** novamente

---

## 🎯 RESULTADO ESPERADO:

### ❌ ANTES (com erro):
```
fetch.js:30 PATCH https://...supabase.co/rest/v1/profiles?... 400 (Bad Request)
```

### ✅ DEPOIS (sem erro):
```
✅ Perfil já existe: ricardo.subtilgarcia@gmail.com
✅ Avatar atualizado com sucesso
🔄 Redirecionando para: /admin
```

---

## 🚀 O LOOP VAI PARAR!

Após executar o SQL e limpar o cache:
- ✅ Login funcionará normalmente
- ✅ Google OAuth funcionará
- ✅ UserDropdown mostrará dados corretos
- ✅ Sem loop infinito
- ✅ Sem erro 400

---

**⏰ Execute o SQL AGORA antes de tentar fazer login novamente!**

