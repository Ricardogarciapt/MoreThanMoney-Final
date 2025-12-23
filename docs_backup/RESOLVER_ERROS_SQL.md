# 🆘 Resolver Erros SQL - Guia Rápido

## 🎯 Qual erro você recebeu?

### ❌ Erro 1: "policy already exists"
```
ERROR: 42710: policy "Usuários veem suas notificações" already exists
```

**✅ SOLUÇÃO:**
```sql
-- Execute: scripts/setup-notifications-safe.sql
-- Este script remove políticas antigas antes de criar novas
```

---

### ❌ Erro 2: "column does not exist"
```
ERROR: 42703: column "data" of relation "notifications" does not exist
```

**✅ SOLUÇÃO:**
```sql
-- Execute: scripts/fix-notifications-structure.sql
-- Este script adiciona as colunas faltantes
```

---

### ❌ Erro 3: "relation already exists"
```
ERROR: relation "notifications" already exists
```

**✅ SOLUÇÃO:**
```sql
-- Execute: scripts/setup-notifications-safe.sql
-- Este script usa CREATE TABLE IF NOT EXISTS
```

---

## 🚀 Fluxograma de Decisão

```
┌─────────────────────────────────────┐
│  Tabela "notifications" existe?    │
└──────────┬──────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
   NÃO           SIM
    │             │
    │      ┌──────┴──────┐
    │      │             │
    │   Estrutura    Estrutura
    │   completa?   incompleta?
    │      │             │
    │     SIM           NÃO
    │      │             │
    ▼      ▼             ▼
    
    1️⃣      2️⃣              3️⃣
```

---

## 📋 Scripts para cada cenário

### 1️⃣ Tabela NÃO existe (primeira instalação)

**Execute nesta ordem:**

```sql
-- PASSO 1: App Mobile
scripts/setup-mobile-safe.sql

-- PASSO 2: Notificações
scripts/setup-notifications-safe.sql
```

✅ **Pronto!** Tudo configurado.

---

### 2️⃣ Tabela existe e está completa

**Execute:**

```sql
-- Apenas recriar políticas RLS
scripts/setup-notifications-safe.sql
```

✅ **Pronto!** Políticas atualizadas.

---

### 3️⃣ Tabela existe mas está incompleta ⚠️

**Execute nesta ordem:**

```sql
-- PASSO 1: Corrigir estrutura
scripts/fix-notifications-structure.sql

-- PASSO 2: App Mobile (se ainda não executou)
scripts/setup-mobile-safe.sql
```

✅ **Pronto!** Estrutura corrigida.

---

## 🔍 Como saber qual cenário é o seu?

Execute no Supabase SQL Editor:

```sql
-- Verificar se tabela existe
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'notifications'
);

-- Se retornar TRUE, verificar colunas
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;
```

**Colunas esperadas:**
- ✅ `id`
- ✅ `user_id`
- ✅ `type`
- ✅ `title`
- ✅ `message`
- ✅ `data` ← Se esta faltar, use o script FIX!
- ✅ `read`
- ✅ `created_at`

---

## 🛠️ Passo a Passo Visual

### Para o erro "column data does not exist":

```
1. Supabase Dashboard
   ↓
2. SQL Editor (lado esquerdo)
   ↓
3. Nova Query
   ↓
4. Copiar conteúdo de:
   📄 scripts/fix-notifications-structure.sql
   ↓
5. Colar no editor
   ↓
6. Clicar "Run" (ou Ctrl/Cmd + Enter)
   ↓
7. Verificar mensagens de sucesso ✅
   ↓
8. Pronto! Agora execute setup-mobile-safe.sql
```

---

## 📊 Verificação Final

Após executar os scripts, verifique:

```sql
-- 1. Verificar estrutura completa
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'notifications'
ORDER BY ordinal_position;

-- 2. Verificar políticas RLS
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'notifications';

-- 3. Verificar índices
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'notifications';
```

**Resultado esperado:**
- ✅ 8 colunas
- ✅ 4 políticas RLS
- ✅ 3+ índices

---

## 💡 Dicas

### ✅ DO (Faça):
- Leia as mensagens de sucesso no console
- Execute os scripts completos (não em partes)
- Use o SQL Editor do Supabase Dashboard
- Verifique a estrutura após executar

### ❌ DON'T (Não faça):
- Não execute scripts parcialmente
- Não ignore erros
- Não execute em terminal local
- Não modifique os scripts sem entender

---

## 🆘 Ainda com problemas?

### Se nenhum script resolver:

1. **Backup dos dados:**
```sql
-- Exportar dados existentes
SELECT * FROM public.notifications;
```

2. **Recriar tabela do zero:**
```sql
-- ⚠️ CUIDADO: Isto apaga todos os dados!
DROP TABLE IF EXISTS public.notifications CASCADE;
```

3. **Executar setup:**
```sql
-- scripts/setup-notifications-safe.sql
```

---

## 📞 Checklist de Deploy

Antes de fazer deploy na Vercel:

- [ ] ✅ Script `fix-notifications-structure.sql` executado (se necessário)
- [ ] ✅ Script `setup-mobile-safe.sql` executado
- [ ] ✅ Verificação de estrutura passou
- [ ] ✅ Verificação de políticas passou
- [ ] ✅ Sem erros no SQL Editor
- [ ] ✅ Variáveis de ambiente configuradas na Vercel
- [ ] 🚀 Pronto para deploy!

---

**Última atualização:** 10 de Outubro de 2025  
**Status:** ✅ Todos os cenários cobertos

