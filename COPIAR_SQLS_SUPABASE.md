# 📋 COPIAR SQLs PARA SUPABASE

## ⚠️ **ORDEM CRÍTICA** - Execute nesta ordem exata!

---

## 1️⃣ **SISTEMA XP** (Base)
**Abrir:** `scripts/create-xp-system.sql`  
**Executar:** Copiar TODO o conteúdo (337 linhas)

---

## 2️⃣ **TRIGGERS XP PARA POSTS** (Depende de #1)
**Abrir:** `scripts/add-xp-triggers-posts.sql`  
**Executar:** Copiar TODO o conteúdo

---

## 3️⃣ **FAST START PROGRESS** (Base)
**Abrir:** `scripts/create-fast-start-progress.sql`  
**Executar:** Copiar TODO o conteúdo (264 linhas)

---

## 4️⃣ **PASSO 6 FAST START** (Depende de #3)
**Abrir:** `scripts/add-step6-fast-start.sql`  
**Executar:** Copiar TODO o conteúdo (162 linhas)

---

## 5️⃣ **TRADING PLANS** (Base para #6)
**Abrir:** `scripts/create-trading-plans.sql`  
**Executar:** Copiar TODO o conteúdo (212 linhas)

---

## 6️⃣ **JOURNALING DE TRADING** (Depende de #5)
**Abrir:** `scripts/add-trading-journaling.sql`  
**Executar:** Copiar TODO o conteúdo (139 linhas)

---

## 7️⃣ **IQONIC ID** (Independente)
**Abrir:** `scripts/add-iqonic-id-column.sql`  
**Executar:** Copiar TODO o conteúdo (28 linhas)

---

## 8️⃣ **ONBOARDING PLATFORM** (Independente)
**Abrir:** `scripts/add-onboarding-platform.sql`  
**Executar:** Copiar TODO o conteúdo

---

## ✅ **VERIFICAÇÃO COMPLETA**

Execute esta query para verificar todas as tabelas criadas:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'user_xp',
    'xp_log',
    'xp_config',
    'fast_start_progress',
    'trading_plans',
    'trading_plan_trades'
  )
ORDER BY table_name;
```

Verificar colunas adicionadas:

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('iqonic_id', 'onboarding_platform')
ORDER BY column_name;
```

---

## 🎯 **RESULTADO ESPERADO**

Após executar todos os SQLs:
- ✅ `user_xp`, `xp_log`, `xp_config` criadas
- ✅ `fast_start_progress` com 6 passos
- ✅ `trading_plans` e `trading_plan_trades` criadas
- ✅ Colunas `iqonic_id` e `onboarding_platform` adicionadas
- ✅ Todas as funções RPC funcionando
- ✅ Todas as triggers ativas
- ✅ RLS policies configuradas

---

**Nota:** Todos os scripts usam `IF NOT EXISTS` - podem ser executados múltiplas vezes! 🎉
