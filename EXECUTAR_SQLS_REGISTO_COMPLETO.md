# 🗄️ Executar SQLs para Sistema de Registo Completo

## ✅ **INSTRUÇÕES**

Para ativar o novo sistema de registo com **Organização MTM**, execute os seguintes SQLs no Supabase:

---

## 🚀 **SQLs A EXECUTAR**

### **1. Adicionar Coluna IQONIC ID**

**Ficheiro:** `scripts/add-iqonic-id-column.sql`

```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS iqonic_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_iqonic_id ON public.profiles(iqonic_id);

COMMENT ON COLUMN public.profiles.iqonic_id IS 'ID do membro IQONIC (obrigatório para membros VXA e RFG)';
```

### **2. Adicionar Passo 6 ao Fast Start**

**Ficheiro:** `scripts/add-step6-fast-start.sql`

Este SQL adiciona o **Passo 6: Apresentação do Negócio Digital** ao sistema de gamificação.

### **3. Sistema XP**

**Ficheiro:** `scripts/create-xp-system.sql`

Este SQL cria o sistema completo de gamificação com XP.

---

## 📋 **CHECKLIST DE EXECUÇÃO**

### **No Supabase SQL Editor:**

1. ✅ Executar `add-iqonic-id-column.sql`
2. ✅ Executar `add-step6-fast-start.sql`
3. ✅ Executar `create-xp-system.sql`
4. ✅ Executar `add-onboarding-platform.sql` (se ainda não executou)

### **Verificar Colunas:**

```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles'
  AND column_name IN ('iqonic_id', 'onboarding_platform', 'member_category')
ORDER BY column_name;
```

Deve mostrar:
- ✅ `iqonic_id` (TEXT, nullable)
- ✅ `onboarding_platform` (TEXT, nullable)
- ✅ `member_category` (TEXT, default: 'standard')

### **Verificar Tabelas:**

```sql
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('fast_start_progress', 'user_xp', 'xp_log', 'xp_config')
ORDER BY table_name;
```

Deve mostrar todas as tabelas de gamificação.

---

## 🎯 **RESULTADO ESPERADO**

Após executar todos os SQLs:

**Perfis criados com:**
- ✅ `member_category`: skool / iq / vip / standard
- ✅ `onboarding_platform`: vxa / rfg / NULL
- ✅ `iqonic_id`: ID do membro (para VXA/RFG)
- ✅ `trial_expires_at`: Data de expiração (trial/guest)
- ✅ `trial_expired`: Status de expiração

**Gamificação:**
- ✅ Fast Start: 6 passos gamificados
- ✅ XP system: pontos e níveis
- ✅ XP log: histórico de ações
- ✅ XP config: configuração de pontos

---

**Pronto para executar no Supabase!** 🎉

