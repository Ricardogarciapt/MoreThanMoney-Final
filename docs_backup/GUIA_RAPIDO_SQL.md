# 🗄️ Guia Rápido - Migrações SQL para Supabase

## ⚠️ Problemas Resolvidos

### Erro 1: Policy já existe
```
ERROR: 42710: policy "Usuários veem suas notificações" for table "notifications" already exists
```
**Solução:** Use os scripts **SAFE** ✅

### Erro 2: Coluna não existe
```
ERROR: 42703: column "data" of relation "public.notifications" does not exist
```
**Solução:** Use o script **fix-notifications-structure.sql** primeiro! ✅

---

## 🚀 Scripts Disponíveis

### 0. FIX: Estrutura de Notificações (SE TABELA JÁ EXISTE) ⚠️
**Arquivo:** `scripts/fix-notifications-structure.sql`

**Quando usar:**
- ⚠️ Se recebeu erro: `column "data" does not exist`
- ⚠️ Se a tabela `notifications` já existe mas está incompleta
- ⚠️ Execute ANTES do `setup-notifications-safe.sql`

**O que faz:**
- ✅ Adiciona colunas faltantes (`data`, `type`, `title`, `message`, `read`)
- ✅ Cria índices necessários
- ✅ Recria políticas RLS
- ✅ Mostra estrutura final da tabela

**Como usar:**
1. Supabase Dashboard → SQL Editor
2. Copiar todo o conteúdo de `scripts/fix-notifications-structure.sql`
3. Colar e executar (Run)
4. Verificar mensagens de sucesso
5. ✅ Agora pode executar outros scripts!

---

### 1. Setup de Notificações (TABELA NOVA)
**Arquivo:** `scripts/setup-notifications-safe.sql`

**O que faz:**
- ✅ Cria tabela `notifications` (se não existir)
- ✅ Remove políticas antigas e cria novas
- ✅ Cria índices para performance
- ✅ Adiciona função de limpeza automática
- ✅ **SEM ERROS** mesmo se já existir

**Como usar:**
1. Supabase Dashboard → SQL Editor
2. Copiar todo o conteúdo de `scripts/setup-notifications-safe.sql`
3. Colar e executar (Run)
4. ✅ Pronto!

---

### 2. Setup App Mobile (RECOMENDADO)
**Arquivo:** `scripts/setup-mobile-safe.sql`

**O que faz:**
- ✅ Cria 4 tabelas: `social_posts`, `social_likes`, `social_comments`, `personal_portfolio`
- ✅ Remove políticas antigas e cria novas
- ✅ Cria triggers para contadores automáticos
- ✅ Adiciona campo `bio` à tabela `profiles`
- ✅ **SEM ERROS** mesmo se já existir

**Como usar:**
1. Supabase Dashboard → SQL Editor
2. Copiar todo o conteúdo de `scripts/setup-mobile-safe.sql`
3. Colar e executar (Run)
4. ✅ Pronto!

---

## 📋 Ordem de Execução

### 🆕 Se as tabelas NÃO existem (primeira vez):

**Passo 1:** App Mobile
```sql
-- scripts/setup-mobile-safe.sql
```

**Passo 2:** Notificações
```sql
-- scripts/setup-notifications-safe.sql
```

---

### 🔧 Se recebeu erro "column does not exist":

**Passo 1:** FIX da estrutura
```sql
-- scripts/fix-notifications-structure.sql
```

**Passo 2:** App Mobile (se ainda não executou)
```sql
-- scripts/setup-mobile-safe.sql
```

---

## ✅ Verificação Pós-Execução

Após executar os scripts, você verá mensagens como:

```
NOTICE: ✅ Setup App Mobile Concluído!
NOTICE:    - Tabelas criadas: 4 de 4
NOTICE:    - Políticas RLS: 14 políticas
NOTICE:    - Triggers: 2 triggers
```

```
NOTICE: ✅ Setup de Notificações Concluído!
NOTICE:    - Tabela criada: SIM
NOTICE:    - Políticas RLS: 4 políticas
NOTICE:    - Índices: 3 índices
```

---

## 🔍 Verificar se Funcionou

Execute no SQL Editor para verificar:

```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'social_posts', 
  'social_likes', 
  'social_comments', 
  'personal_portfolio',
  'notifications'
)
ORDER BY table_name;

-- Verificar políticas RLS
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificar se campo bio existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'bio';
```

**Resultado esperado:**
- 5 tabelas encontradas ✅
- Múltiplas políticas RLS ✅
- Campo `bio` tipo TEXT ✅

---

## 🛠️ Troubleshooting

### Erro: "relation already exists"
**Solução:** Use os scripts **SAFE** - eles usam `CREATE TABLE IF NOT EXISTS`

### Erro: "policy already exists"
**Solução:** Os scripts **SAFE** fazem `DROP POLICY IF EXISTS` antes de criar

### Erro: "column already exists"
**Solução:** Os scripts **SAFE** verificam com `IF NOT EXISTS`

### Tabela não aparece
**Solução:** Verifique se o script foi executado por completo (role até o final)

---

## 📊 Estrutura das Tabelas

### `notifications`
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- type (TEXT: dca_opportunity, price_alert, system, portfolio)
- title (TEXT)
- message (TEXT)
- data (JSONB)
- read (BOOLEAN)
- created_at (TIMESTAMPTZ)
```

### `social_posts`
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- content (TEXT)
- image_url (TEXT)
- video_url (TEXT)
- likes_count (INTEGER)
- comments_count (INTEGER)
- created_at, updated_at (TIMESTAMPTZ)
```

### `social_likes`
```sql
- id (UUID, PK)
- post_id (UUID, FK → social_posts)
- user_id (UUID, FK → auth.users)
- created_at (TIMESTAMPTZ)
- UNIQUE(post_id, user_id)
```

### `social_comments`
```sql
- id (UUID, PK)
- post_id (UUID, FK → social_posts)
- user_id (UUID, FK → auth.users)
- content (TEXT)
- created_at, updated_at (TIMESTAMPTZ)
```

### `personal_portfolio`
```sql
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- asset_type (TEXT)
- symbol (TEXT)
- name (TEXT)
- quantity (DECIMAL)
- purchase_price (DECIMAL)
- current_price (DECIMAL)
- notes (TEXT)
- created_at, updated_at (TIMESTAMPTZ)
```

---

## 🎯 Próximo Passo

Após executar os scripts SQL:

1. ✅ Configurar variáveis de ambiente na Vercel
2. ✅ Fazer deploy
3. ✅ Testar funcionalidades

---

## 💡 Dicas

- **Use sempre os scripts SAFE** - evitam erros de duplicação
- **Execute no SQL Editor do Supabase** - não no terminal
- **Verifique as mensagens de sucesso** ao final da execução
- **Se tiver dúvidas**, execute os scripts de verificação acima

---

**Última atualização:** 10 de Outubro de 2025  
**Status:** ✅ Scripts seguros prontos para uso

