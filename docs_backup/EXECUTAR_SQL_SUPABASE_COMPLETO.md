# 🗄️ SQL Completo para Executar no Supabase

## 🎯 **EXECUTAR NESTA ORDEM:**

Link direto: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql

---

## ✅ **1. FIX GOOGLE OAUTH (CRÍTICO - FAZER PRIMEIRO!)**

**Arquivo:** `scripts/fix-google-oauth-profiles.sql`

**O que faz:**
- ✅ Cria trigger para perfis automáticos no login com Google
- ✅ Corrige usuários existentes sem perfil
- ✅ Ajusta políticas RLS

**Verificação:**
```sql
-- Ver se funcionou
SELECT COUNT(*) FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;
-- Deve retornar 0
```

---

## ✅ **2. PUSH NOTIFICATIONS**

**Arquivo:** `scripts/setup-push-notifications.sql`

**O que faz:**
- ✅ Cria tabela `fcm_tokens`
- ✅ Cria tabela `notification_history`
- ✅ Cria políticas RLS
- ✅ Cria triggers automáticos

**Verificação:**
```sql
SELECT * FROM fcm_tokens LIMIT 5;
SELECT * FROM notification_history LIMIT 5;
```

---

## ✅ **2. FIX SOCIAL POSTS SCHEMA (CRÍTICO!)**

**Arquivo:** `scripts/fix-social-posts-schema.sql`

**O que faz:**
- ✅ Adiciona colunas `image_url` e `video_url`
- ✅ Migra dados de `media_url` se existir
- ✅ Cria índices para performance

**Erro que resolve:**
```
❌ column social_posts.image_url does not exist
```

**Verificação:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'social_posts' 
AND column_name IN ('image_url', 'video_url');
-- Deve retornar 2 linhas
```

---

## ✅ **3. STORAGE BUCKET (Para Social Feed)**

**Arquivo:** `scripts/setup-storage-bucket.sql`

**O que faz:**
- ✅ Cria bucket `uploads`
- ✅ Configura como público
- ✅ Cria políticas de acesso

**Verificação:**
```sql
SELECT * FROM storage.buckets WHERE id = 'uploads';
```

Ou vai a: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/storage/buckets

---

## ✅ **4. SOCIAL FEED (Se ainda não tiver)**

**Verificar se existe:**
```sql
SELECT * FROM social_posts LIMIT 5;
SELECT * FROM social_likes LIMIT 5;
SELECT * FROM social_comments LIMIT 5;
```

**Se der erro "relation does not exist":**
- Executa: `scripts/setup-complete-simple.sql`

---

## 📊 **VERIFICAÇÃO FINAL**

Executa este SQL para ver o status completo:

```sql
-- Ver todas as tabelas criadas
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as total_columns
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_name IN (
  'profiles',
  'social_posts',
  'social_likes',
  'social_comments',
  'fcm_tokens',
  'notification_history',
  'notifications',
  'personal_portfolio'
)
ORDER BY table_name;

-- Ver triggers ativos
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
OR event_object_schema = 'auth'
ORDER BY trigger_name;

-- Ver storage buckets
SELECT id, name, public FROM storage.buckets;
```

**Resultado esperado:**
- ✅ 8 tabelas criadas
- ✅ 4+ triggers ativos
- ✅ 1 bucket (uploads)

---

## 🚀 **ORDEM DE EXECUÇÃO:**

```bash
# 1. Fix Google OAuth (PRIMEIRO!)
scripts/fix-google-oauth-profiles.sql

# 2. Fix Social Posts Schema (CRÍTICO!)
scripts/fix-social-posts-schema.sql

# 3. Push Notifications
scripts/setup-push-notifications.sql

# 4. Storage Bucket
scripts/setup-storage-bucket.sql

# 5. Verificação Final (SQL abaixo)
```

---

## ⏱️ **Tempo Total:** ~5 minutos

---

## 🎯 **DEPOIS DE EXECUTAR:**

1. ✅ Testa login com Google: https://morethanmoney.pt/login
2. ✅ Testa social feed: https://morethanmoney.pt/app-mobile
3. ✅ Ativa push notifications
4. ✅ Publica um post com imagem

Se tudo funcionar → **SISTEMA COMPLETO! 🎉**

---

**AGORA:** Vai ao Supabase e executa os 3 SQLs na ordem! 🚀

