# 📝 Como Executar Scripts SQL no Supabase

## ⚠️ Erro que Estava Recebendo

```
ERROR: 42601: syntax error at or near "IF"
```

**Causa:** Executou apenas UMA linha em vez de TODO o script.

---

## ✅ SOLUÇÃO: Script Simplificado

Criei um script que funciona: **`scripts/setup-complete-simple.sql`**

---

## 🎯 Passo a Passo (CORRETO)

### 1. Abrir Supabase SQL Editor

1. Ir para: https://supabase.com/dashboard
2. Selecionar seu projeto
3. Menu lateral → **SQL Editor**
4. Clicar em **"New query"**

---

### 2. Copiar TODO o Script

**IMPORTANTE:** Copie **TUDO** do arquivo, não linha por linha!

1. Abrir: `scripts/setup-complete-simple.sql`
2. **Selecionar TUDO** (Ctrl+A / Cmd+A)
3. **Copiar** (Ctrl+C / Cmd+C)

---

### 3. Colar no SQL Editor

1. Colar no editor do Supabase
2. Verificar que todo o script está lá (scroll para ver o final)
3. **NÃO** executar linha por linha!

---

### 4. Executar

1. Clicar no botão **"Run"** (ou Ctrl+Enter / Cmd+Enter)
2. Aguardar ~5-10 segundos
3. Verificar resultado na parte inferior

---

### 5. Verificar Sucesso

**Você verá algo como:**

| status | tabelas_criadas | politicas_rls | triggers |
|--------|-----------------|---------------|----------|
| ✅ Setup Completo! | 5 | 14 | 2 |

**Isso significa:**
- ✅ 5 tabelas criadas
- ✅ 14 políticas RLS ativas
- ✅ 2 triggers funcionando

---

## ❌ Erros Comuns

### Erro: "syntax error at or near IF"

**Causa:** Executou linha por linha

**Solução:** Selecionar TODO o script e executar de uma vez

---

### Erro: "policy already exists"

**Causa:** O script foi executado antes

**Solução:** O script usa `DROP POLICY IF EXISTS`, então pode executar novamente sem problemas

---

### Erro: "relation already exists"

**Causa:** Tabela já existe

**Solução:** O script usa `CREATE TABLE IF NOT EXISTS`, então não há problema

---

## 📋 Checklist de Execução

- [ ] Abri Supabase SQL Editor
- [ ] Criei nova query
- [ ] Copiei **TODO** o conteúdo de `setup-complete-simple.sql`
- [ ] Colei no editor
- [ ] Executei **de uma vez** (não linha por linha)
- [ ] Vi mensagem "✅ Setup Completo!"
- [ ] Verifico que criou 5 tabelas

---

## 🎯 Qual Script Executar?

**Use ESTE:** `scripts/setup-complete-simple.sql`

**Por quê?**
- ✅ Sem blocos `DO $$` complicados
- ✅ Usa `CREATE INDEX IF NOT EXISTS` (padrão SQL)
- ✅ Pode executar de uma vez
- ✅ Funciona no Supabase SQL Editor

**NÃO use:**
- ❌ `setup-mobile-safe.sql` (tem blocos DO $$)
- ❌ `setup-notifications-safe.sql` (tem blocos DO $$)
- ❌ `fix-notifications-structure.sql` (tem blocos DO $$)

---

## 🚀 Após Executar

1. ✅ Tabelas criadas no Supabase
2. ✅ RLS configurado
3. ✅ Triggers ativos
4. ⏭️ Próximo: Configurar variáveis na Vercel
5. ⏭️ Depois: Redeploy

---

## 📊 Verificação Manual (Opcional)

Se quiser confirmar, execute separadamente:

```sql
-- Ver tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('social_posts', 'social_likes', 'social_comments', 'personal_portfolio', 'notifications')
ORDER BY table_name;

-- Ver políticas
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Resultado esperado:**
- 5 linhas de tabelas
- 14+ políticas

---

## 💡 Dica Visual

```
┌─────────────────────────────────┐
│ Supabase SQL Editor             │
│                                 │
│ [New query]                     │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ -- COLAR TUDO AQUI          │ │
│ │ -- TODO O SCRIPT            │ │
│ │ CREATE TABLE...             │ │
│ │ ...                         │ │
│ │ ... (200 linhas)            │ │
│ │ SELECT '✅ Setup Completo!' │ │
│ └─────────────────────────────┘ │
│                                 │
│              [RUN] ← CLICAR     │
│                                 │
│ Resultado:                      │
│ ✅ Setup Completo! | 5 | 14 | 2 │
└─────────────────────────────────┘
```

---

**Agora execute o script `setup-complete-simple.sql` de uma vez no Supabase!** 🚀

**Tempo estimado:** 10 segundos ⚡

