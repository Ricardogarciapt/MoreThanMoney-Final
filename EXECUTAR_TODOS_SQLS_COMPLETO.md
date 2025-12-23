# 🚀 EXECUTAR TODOS OS SQLs NO SUPABASE

**Data**: Dezembro 2024  
**Status**: ⚠️ PENDENTE - Executar no Supabase  
**Ordem**: **CRÍTICA** - Execute nesta ordem exata!

---

## 📋 CHECKLIST COMPLETO

### ✅ **PASSO 1: Sistema de XP**
**Ficheiro**: `scripts/create-xp-system.sql`  
**O que cria**:
- Tabela `user_xp` (pontos e níveis)
- Tabela `xp_log` (histórico de ações)
- Tabela `xp_config` (configuração de pontos por ação)
- Funções de cálculo automático de nível
- Triggers para atualização automática

**Como executar**:
```bash
1. Abrir Supabase Dashboard → SQL Editor
2. Copiar TODO o conteúdo de scripts/create-xp-system.sql
3. Colar no editor
4. Clicar "RUN" (Ctrl+Enter)
```

---

### ✅ **PASSO 2: Triggers de XP para Posts**
**Ficheiro**: `scripts/add-xp-triggers-posts.sql`  
**O que cria**:
- Triggers automáticos para `posts`, `post_likes`, `post_comments`
- XP automático ao criar post (15 XP)
- XP automático ao dar like (2 XP)
- XP automático ao comentar (5 XP)

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/add-xp-triggers-posts.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 3: Fast Start Progress**
**Ficheiro**: `scripts/create-fast-start-progress.sql`  
**O que cria**:
- Tabela `fast_start_progress` (6 passos)
- Funções `mark_fast_start_step_complete`, `get_fast_start_progress`
- Triggers para cálculo automático de progresso
- Suporte para 6 passos com percentagem

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/create-fast-start-progress.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 4: Adicionar Passo 6 ao Fast Start**
**Ficheiro**: `scripts/add-step6-fast-start.sql`  
**O que faz**:
- Adiciona `step_6_completed` à tabela
- Atualiza funções RPC para incluir 6º passo
- Ajusta cálculo de progresso para 6 passos

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/add-step6-fast-start.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 5: Trading Plans**
**Ficheiro**: `scripts/create-trading-plans.sql`  
**O que cria**:
- Tabela `trading_plans` (planos de trading)
- Tabela `trading_plan_trades` (histórico de trades)
- RLS policies para ambos
- Função `get_active_trading_plan`
- Triggers para updated_at

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/create-trading-plans.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 6: Journaling de Trading**
**Ficheiro**: `scripts/add-trading-journaling.sql`  
**O que faz**:
- Adiciona campos de journaling a `trading_plan_trades`
- Cria função `get_trading_metrics` (cálculos de métricas)
- Adiciona índices para queries otimizadas
- Campos: market_context, setup_type, entry_reason, emotions, etc.

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/add-trading-journaling.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 7: IQONIC ID Column**
**Ficheiro**: `scripts/add-iqonic-id-column.sql`  
**O que faz**:
- Adiciona coluna `iqonic_id` à tabela `profiles`
- Obrigatório para membros VXA e RFG
- Índice para busca rápida

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/add-iqonic-id-column.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

### ✅ **PASSO 8: Onboarding Platform**
**Ficheiro**: `scripts/add-onboarding-platform.sql`  
**O que faz**:
- Adiciona coluna `onboarding_platform` à tabela `profiles`
- Valores: 'vxa', 'rfg', ou NULL
- Usado para definir onboarding de IQ members

**Como executar**:
```bash
1. Copiar TODO o conteúdo de scripts/add-onboarding-platform.sql
2. Colar no SQL Editor
3. Clicar "RUN"
```

---

## 🔗 LINKS DIRETOS

### Abrir no Supabase:
1. https://supabase.com/dashboard
2. Projeto: MoreThanMoney
3. Menu lateral: **SQL Editor**
4. **New Query**

---

## ⚠️ **ORDEM CRÍTICA**

```
1. create-xp-system.sql ⭐ BASE
2. add-xp-triggers-posts.sql ⭐ DEPENDE DE 1
3. create-fast-start-progress.sql ⭐ BASE
4. add-step6-fast-start.sql ⭐ DEPENDE DE 3
5. create-trading-plans.sql ⭐ BASE PARA 6
6. add-trading-journaling.sql ⭐ DEPENDE DE 5
7. add-iqonic-id-column.sql ⭐ INDEPENDENTE
8. add-onboarding-platform.sql ⭐ INDEPENDENTE
```

---

## ✅ **VERIFICAÇÃO PÓS-EXECUÇÃO**

Execute estas queries para verificar:

```sql
-- Verificar XP System
SELECT * FROM information_schema.tables WHERE table_name = 'user_xp';
SELECT * FROM user_xp LIMIT 5;

-- Verificar Fast Start
SELECT * FROM fast_start_progress LIMIT 5;

-- Verificar Trading Plans
SELECT * FROM trading_plans LIMIT 5;
SELECT * FROM trading_plan_trades LIMIT 5;

-- Verificar Colunas Profiles
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('iqonic_id', 'onboarding_platform');
```

---

## 🎯 **RESULTADO ESPERADO**

Após executar todos os SQLs:
- ✅ Sistema de XP funcionando
- ✅ Fast Start com 6 passos funcionando
- ✅ Planos de Trading criáveis
- ✅ Journaling com métricas funcionando
- ✅ Registro com VXA/RFG/MTM funcionando
- ✅ Calendário de desempenho funcionando

---

## 📝 **NOTAS**

- Todos os scripts usam `IF NOT EXISTS` - **podem ser executados múltiplas vezes**
- RLS está ativado para todas as tabelas
- Triggers e funções são **SECURITY DEFINER**
- Todos os timestamps usam `NOW()` automaticamente

---

## 🆘 **TROUBLESHOOTING**

**Erro: "relation does not exist"**
→ Execute os SQLs na ordem correta, começando pelo "BASE"

**Erro: "permission denied"**
→ Verifique se está executando no SQL Editor com permissões adequadas

**Erro: "function already exists"**
→ Normal! Os scripts usam `CREATE OR REPLACE`

**Tabela vazia após criar**
→ Normal! Apenas a estrutura foi criada, dados são adicionados pelos utilizadores

---

**Pronto!** 🎉 Execute todos os SQLs nesta ordem e estará tudo funcional!

