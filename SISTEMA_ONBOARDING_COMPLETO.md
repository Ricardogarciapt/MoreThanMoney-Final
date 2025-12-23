# 🎯 SISTEMA DE ONBOARDING COMPLETO - DOCUMENTAÇÃO

## 📋 **RESUMO**

Sistema de gestão de onboarding que permite aos admins configurar qual plataforma de onboarding (VXA ou RFG) cada membro IQ deve usar, com lógica hierárquica completa.

---

## 🎯 **FUNCIONALIDADES**

### **1. Prioridade de Acesso aos Cards**

A exibição dos cards de onboarding segue esta hierarquia:

```
1. Admins e VIPs → VÊM AMBOS (VXA + RFG)
2. Membro IQ com onboarding_platform forçado → VÊ APENAS A PLATAFORMA CONFIGURADA
3. Membro IQ sem onboarding_platform → VÊ RFG (padrão)
4. Membro não-IQ → VÊ VXA (padrão)
```

### **2. Gestão de Utilizadores**

Na página `/admin`, a gestão de utilizadores inclui:
- **Status do Utilizador**: Dropdown unificado (Admin, VIP, IQ, Skool, etc)
- **Plataforma de Onboarding**: Dropdown apenas visível para membros IQ

---

## 🔧 **COMPONENTES TÉCNICOS**

### **Base de Dados**

**Tabela**: `profiles`

**Coluna**: `onboarding_platform`
```sql
Tipo: TEXT
Valores possíveis:
- NULL (padrão, usa lógica baseada em member_category)
- 'vxa' (forçar Vision X Ambition)
- 'rfg' (forçar RFG Life)

Constraint: CHECK (onboarding_platform IS NULL OR onboarding_platform IN ('vxa', 'rfg'))
```

**Script SQL**: `scripts/add-onboarding-platform.sql`

### **API Endpoint**

**Rota**: `/api/admin/users` (PATCH)

**Parâmetros aceitos**:
```typescript
{
  userId: string,
  user_type?: string,
  member_category?: 'iq' | 'skool' | 'vip' | 'standard',
  onboarding_platform?: 'vxa' | 'rfg' | null
}
```

### **Frontend**

**Componente**: `components/admin/user-management.tsx`

**Função**: `handleChangeOnboardingPlatform()`
```typescript
const handleChangeOnboardingPlatform = async (
  userId: string, 
  platform: 'vxa' | 'rfg' | null
) => {
  // Atualiza onboarding_platform via API
}
```

**UI**: Seletor de plataforma
- Apenas visível se `user.member_category === 'iq'`
- Opções: "🌐 Padrão (RFG)", "🎯 RFG Life", "⚡ Vision X Ambition"
- Atualização em tempo real

**Página**: `app/onboarding/page.tsx`

**Funções**:
```typescript
shouldShowVXA() {
  // Se admin/VIP → true
  // Se onboarding_platform = 'vxa' → true
  // Se onboarding_platform = 'rfg' → false
  // Se NULL → member_category !== 'iq'
}

shouldShowRFG() {
  // Se admin/VIP → true
  // Se onboarding_platform = 'rfg' → true
  // Se onboarding_platform = 'vxa' → false
  // Se NULL → member_category === 'iq'
}
```

---

## 🎬 **CASOS DE USO**

### **Caso 1: Admin ou VIP**
```
Dados: user_type = 'admin' OU 'vip'
Resultado: Vê AMBOS os cards
  ✅ Onboarding Internacional - Vision X Ambition
  ✅ Onboarding Internacional - RFG
```

### **Caso 2: Membro IQ sem configuração**
```
Dados: 
  member_category = 'iq'
  onboarding_platform = NULL

Resultado: Vê APENAS RFG
  ❌ Vision X Ambition (não mostrado)
  ✅ RFG Life
```

### **Caso 3: Membro IQ configurado para RFG**
```
Dados:
  member_category = 'iq'
  onboarding_platform = 'rfg'

Resultado: Vê APENAS RFG
  ❌ Vision X Ambition (não mostrado)
  ✅ RFG Life
```

### **Caso 4: Membro IQ configurado para VXA**
```
Dados:
  member_category = 'iq'
  onboarding_platform = 'vxa'

Resultado: Vê APENAS VXA
  ✅ Vision X Ambition
  ❌ RFG Life (não mostrado)
```

### **Caso 5: Membro não-IQ (Skool, Standard, etc)**
```
Dados:
  member_category = 'skool' OU 'standard' OU qualquer diferente de 'iq'

Resultado: Vê APENAS VXA
  ✅ Vision X Ambition
  ❌ RFG Life (não mostrado)
```

---

## 🔄 **FLUXO DE OPERAÇÃO**

### **Admin Configura Membro IQ**

1. Admin acede a `/admin`
2. Gestão de Utilizadores → Lista de utilizadores
3. Seleciona membro IQ
4. Vê dropdown "Plataforma de Onboarding"
5. Escolhe:
   - "🌐 Padrão (RFG)" → `onboarding_platform = NULL`
   - "🎯 RFG Life" → `onboarding_platform = 'rfg'`
   - "⚡ Vision X Ambition" → `onboarding_platform = 'vxa'`
6. Sistema atualiza BD
7. Membro IQ vê o card correto em `/onboarding`

### **Membro IQ Acede ao Onboarding**

1. Membro IQ faz login
2. Acede a `/onboarding`
3. Sistema carrega perfil:
   - `member_category` → 'iq'
   - `user_type` → 'member'
   - `onboarding_platform` → valor configurado
4. Funções `shouldShowVXA()` e `shouldShowRFG()` determinam cards
5. Página renderiza apenas os cards corretos
6. Membro IQ clica no botão apropriado
7. Redireciona para plataforma correta

---

## 📊 **QUERY DE BUSCA**

```sql
-- Buscar membros IQ e suas configurações de onboarding
SELECT 
  id,
  email,
  full_name,
  member_category,
  onboarding_platform,
  CASE 
    WHEN onboarding_platform IS NULL THEN 'Padrão (RFG)'
    WHEN onboarding_platform = 'vxa' THEN 'Vision X Ambition'
    WHEN onboarding_platform = 'rfg' THEN 'RFG Life'
  END as platform_display
FROM profiles
WHERE member_category = 'iq'
ORDER BY created_at DESC;
```

---

## ✅ **VALIDAÇÕES**

- ✅ Constraint na BD: apenas `'vxa'`, `'rfg'`, ou `NULL`
- ✅ Seletor apenas visível para membros IQ
- ✅ Valores padrão corretos:
  - Membro IQ sem config → RFG
  - Membro não-IQ → VXA
- ✅ Admins e VIPs veem ambos
- ✅ Backward compatible (membros existentes mantêm comportamento padrão)

---

## 🔗 **INTEGRAÇÃO**

### **Páginas Afetadas**
- `/admin` → Gestão de utilizadores
- `/onboarding` → Exibição de cards

### **APIs Utilizadas**
- `GET /api/admin/users` → Lista utilizadores
- `PATCH /api/admin/users` → Atualiza utilizador

### **Componentes**
- `components/admin/user-management.tsx` → Gestão de utilizadores
- `app/onboarding/page.tsx` → Página de onboarding

### **Tipos TypeScript**
```typescript
interface UserManagement {
  ...
  member_category?: 'iq' | 'skool' | 'vip' | 'standard'
  onboarding_platform?: 'vxa' | 'rfg' | null
  ...
}
```

---

## 🚀 **DEPLOY**

### **Pré-requisitos**
1. Executar SQL: `scripts/add-onboarding-platform.sql`
2. Verificar constraint criada
3. Verificar índice criado

### **Verificações Pós-Deploy**
1. Admin pode criar membro IQ
2. Dropdown de plataforma aparece para IQ
3. Opções funcionam corretamente
4. Membro IQ vê cards corretos em `/onboarding`
5. Admins/VIPs veem ambos os cards

---

## 📝 **EXEMPLOS DE USO**

### **Exemplo 1: Criar Membro IQ com VXA**
```typescript
// Admin cria membro IQ
POST /api/admin/create-user
{
  email: "joao@example.com",
  username: "joao_iq",
  full_name: "João Silva",
  member_category: "iq"
}

// Admin configura plataforma
PATCH /api/admin/users
{
  userId: "...",
  onboarding_platform: "vxa"
}

// Resultado: Membro vê VXA
```

### **Exemplo 2: Alterar Plataforma**
```typescript
// Alterar de RFG para VXA
PATCH /api/admin/users
{
  userId: "membro-iq-id",
  onboarding_platform: "vxa"
}

// Resultado: Próximo acesso mostra VXA
```

### **Exemplo 3: Voltar ao Padrão**
```typescript
// Voltar ao comportamento padrão
PATCH /api/admin/users
{
  userId: "membro-iq-id",
  onboarding_platform: null
}

// Resultado: Membro vê RFG (padrão)
```

---

**Status**: ✅ **COMPLETO E FUNCIONAL**

**Última Atualização**: Dezembro 2024
