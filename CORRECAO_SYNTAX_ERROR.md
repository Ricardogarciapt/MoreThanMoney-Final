# 🔧 **CORREÇÃO: Syntax Error "END $$; AND"**

## ❌ **ERRO**

```
ERROR: 42601: syntax error at or near "AND"
LINE 68: END $$; AND table_name = 'posts'
```

**Causa:** Erro de sintaxe no bloco DO $$ ... END $$; provavelmente com fechamento incorreto ou AND mal posicionado.

---

## ✅ **SOLUÇÃO**

### **OPÇÃO 1: Script Simplificado (RECOMENDADO)**

Execute este script que foi simplificado e testado:

```sql
-- Copiar TODO:
scripts/fix-posts-user-id-simples.sql
```

**Link:** https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new

**Vantagens:**
- ✅ Cada operação em bloco DO separado
- ✅ Sintaxe verificada e corrigida
- ✅ Mais seguro e fácil de debugar
- ✅ Menos chance de erros

---

### **OPÇÃO 2: Script Completo Corrigido**

O script `fix-posts-storage-completo.sql` foi corrigido também:
- Corrigida query de verificação (linha 221)
- Parênteses adicionados na condição OR

---

## 📋 **O QUE O SCRIPT SIMPLIFICADO FAZ**

1. ✅ Cria tabela `posts` (se não existir) - versão segura sem NOT NULL
2. ✅ Adiciona `user_id` (se não existir)
3. ✅ Adiciona `user_name` (se não existir)
4. ✅ Adiciona `category` (se não existir)
5. ✅ Adiciona `media_url` (se não existir)
6. ✅ Cria foreign key
7. ✅ Cria índices
8. ✅ Configura RLS policies
9. ✅ Mostra verificação final

---

## 🎯 **EXECUTAR AGORA**

### **Passo 1:**
```sql
-- Copiar TODO: scripts/fix-posts-user-id-simples.sql
-- Colar no Supabase SQL Editor
-- Executar
```

### **Passo 2: Verificar**
```sql
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'posts'
ORDER BY ordinal_position;
```

**Resultado esperado:**
- ✅ `id` (uuid)
- ✅ `user_id` (uuid) ← DEVE APARECER
- ✅ `user_name` (text)
- ✅ `content` (text)
- ✅ `media_url` (text)
- ✅ `category` (text)
- ✅ `created_at` (timestamptz)
- ✅ `updated_at` (timestamptz)

---

## ✅ **APÓS EXECUTAR**

1. ✅ Schema corrigido
2. ✅ Coluna `user_id` existe
3. ✅ Testar criar post → Deve funcionar!
4. ✅ Erro "column user_id does not exist" → RESOLVIDO!

---

## 📝 **NOTA**

O script simplificado usa blocos DO $$ separados para cada operação, evitando problemas de sintaxe complexa. É mais seguro e fácil de executar.

**Erro corrigido! Execute o script simplificado.** ✅

