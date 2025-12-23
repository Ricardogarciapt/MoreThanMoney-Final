# 🔧 **CORREÇÃO: ERROR column "user_id" does not exist**

## 🔍 **PROBLEMA**

Erro ao executar SQL:
```
ERROR: 42703: column "user_id" does not exist
```

**Causa:** A tabela `posts` foi criada sem a coluna `user_id` ou com schema diferente.

---

## ✅ **SOLUÇÃO IMEDIATA**

### **PASSO 1: EXECUTAR SCRIPT DE CORREÇÃO**

Execute este script no Supabase SQL Editor:

```sql
-- Copiar TODO o conteúdo de:
scripts/fix-posts-column-user_id.sql
```

**Link direto:** https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new

**O que este script faz:**
- ✅ Verifica se tabela `posts` existe
- ✅ Se não existir, cria com schema correto
- ✅ Se existir, adiciona coluna `user_id` (se faltar)
- ✅ Adiciona coluna `user_name` (se faltar)
- ✅ Adiciona coluna `category` (se faltar)
- ✅ Adiciona coluna `media_url` (se faltar)
- ✅ Cria índices
- ✅ Configura foreign keys
- ✅ Configura RLS policies
- ✅ Mostra verificação final

---

## 🔄 **SOLUÇÃO ALTERNATIVA (SE AINDA FALHAR)**

### **OPÇÃO 1: Drop e Recriar (SE NÃO HOUVER DADOS)**

```sql
-- ⚠️ ATENÇÃO: Isso apaga TODOS os posts existentes!
DROP TABLE IF EXISTS public.posts CASCADE;

-- Depois executar:
scripts/create-posts-table-with-categories.sql
```

### **OPÇÃO 2: Script Completo Atualizado**

Execute este script que foi atualizado:

```sql
-- Copiar TODO:
scripts/fix-posts-storage-completo.sql
```

Este script agora verifica e adiciona colunas faltantes automaticamente.

---

## 📋 **VERIFICAÇÃO**

Após executar o script, verificar:

```sql
-- Ver schema da tabela
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'posts'
ORDER BY ordinal_position;
```

**Resultado esperado:**
```
id          | uuid
user_id     | uuid          ← DEVE EXISTIR!
user_name   | text          ← DEVE EXISTIR!
content     | text
media_url   | text
category    | text
created_at  | timestamptz
updated_at  | timestamptz
```

---

## 🎯 **CHECKLIST**

- [ ] Executar `scripts/fix-posts-column-user_id.sql`
- [ ] Verificar se coluna `user_id` existe
- [ ] Verificar se coluna `user_name` existe
- [ ] Verificar foreign key para `auth.users`
- [ ] Verificar RLS policies
- [ ] Testar criação de post

---

## 📝 **NOTAS TÉCNICAS**

### **Schema Correto:**
```sql
posts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),  ← ESSENCIAL
  user_name TEXT NOT NULL,                          ← ESSENCIAL
  content TEXT NOT NULL,
  media_url TEXT,
  category TEXT CHECK (...),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### **Por que aconteceu?**
- Tabela pode ter sido criada com script antigo
- Script anterior pode ter referência errada (`profiles` vs `auth.users`)
- Migration pode ter falhado parcialmente

---

## ✅ **APÓS CORRIGIR**

1. ✅ Executar script de correção
2. ✅ Verificar schema
3. ✅ Testar criar post
4. ✅ Verificar console do browser (não deve haver mais erro)

**Erro resolvido!** 🎉

