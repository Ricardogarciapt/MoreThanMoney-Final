# 🚀 EXECUTAR TRADING PLANS AGORA

## ❌ **ERRO ATUAL**
```
ERROR: 42P01: relation "public.trading_plan_trades" does not exist
```

## ✅ **SOLUÇÃO - EXECUTAR ESTE SQL**

---

## 📋 **OPÇÃO 1: SQL COMPLETO (RECOMENDADO)** ⭐

**Ficheiro**: `scripts/INSTALL_TRADING_PLANS_COMPLETE.sql`

**Como executar:**
1. Abrir Supabase Dashboard → **SQL Editor**
2. Criar **New Query**
3. **Copiar TODO** o conteúdo de `INSTALL_TRADING_PLANS_COMPLETE.sql`
4. **Colar** no editor
5. Clicar **"RUN"** (Ctrl+Enter)

**Este script inclui:**
- ✅ Criação de `trading_plans`
- ✅ Criação de `trading_plan_trades` ← **RESOLVE O ERRO!**
- ✅ Campos de journaling adicionados
- ✅ Função `get_trading_metrics`
- ✅ RLS e políticas de segurança
- ✅ Índices otimizados
- ✅ Triggers automáticos

**Tempo estimado**: 2-3 segundos

---

## 📋 **OPÇÃO 2: DOIS SQLs SEPARADOS**

Se preferir executar separadamente:

### **Script 1**: `scripts/create-trading-plans.sql`
Execute primeiro este para criar as tabelas base.

### **Script 2**: `scripts/add-trading-journaling.sql`
Execute depois este para adicionar campos de journaling.

---

## ✅ **VERIFICAÇÃO**

Após executar, rode esta query:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('trading_plans', 'trading_plan_trades')
ORDER BY table_name;
```

**Resultado esperado:**
```
table_name
------------------
trading_plan_trades
trading_plans
```

---

## 🎯 **DEPOIS DE EXECUTAR**

O erro desaparece ✅ e você pode:
- ✅ Criar planos de trading no `/scanner-access`
- ✅ Visualizar calendário de desempenho
- ✅ Ver métricas (R:R, Profit Factor, Win Rate)
- ✅ Registar trades com journaling completo

---

## 📝 **NOTA IMPORTANTE**

Todos os scripts usam:
- `CREATE TABLE IF NOT EXISTS` → Seguro executar múltiplas vezes
- `ADD COLUMN IF NOT EXISTS` → Não duplica colunas
- `CREATE OR REPLACE FUNCTION` → Substitui funções existentes

**Pode executar sem risco!** 🎉

---

**Link direto para Supabase:**
👉 https://supabase.com/dashboard → SQL Editor

