# ⚠️ INCONSISTÊNCIA: Roles Admin vs User Dropdown

**Data**: 26 de Outubro de 2025  
**Problema**: Roles diferentes entre Gestão Admin e User Dropdown

---

## 🔴 PROBLEMA IDENTIFICADO

### **Gestão de Utilizadores (Admin)**
```typescript
// user_type
- 'admin' (👑 Admin)
- 'vip' (⭐ VIP)
- 'member' (🎓 Membro IQ / 📚 Membro Skool)
- 'guest' (🆓 Free Trial)
- 'inactive' (🚫 Inativo)

// member_category
- 'iq' (🎓 Membro IQ)
- 'skool' (📚 Membro Skool)
- 'vip' (⭐ VIP)
- 'standard' (padrão)
```

### **User Dropdown (Navbar)**
```typescript
// user_type
- 'admin' (🔴 Admin)
- 'member' (🟢 Membro)
- 'trial' (🔵 Trial) ⚠️
- 'guest' (🟣 Guest)
- 'presentation' (🩷 Apresentação)
- 'pending' (🟠 Aguardando)
- 'affiliate' (🟡 Afiliado)
```

### **Schema da Base de Dados**
```sql
CHECK (user_type IN ('member', 'admin', 'pending', 'guest', 'presentation'))
```

---

## ❌ DIFERENÇAS CRÍTICAS

### 1. **'vip' não existe no schema**
- ❌ Admin usa `user_type = 'vip'`
- ❌ User Dropdown NÃO tem 'vip'
- ✅ Schema NÃO tem 'vip'
- ✅ Deveria usar `member_category = 'vip'` + `user_type = 'member'`

### 2. **'inactive' não existe no schema**
- ❌ Admin usa `user_type = 'inactive'`
- ❌ User Dropdown NÃO tem 'inactive'
- ❌ Schema NÃO tem 'inactive'
- ✅ Deveria usar `is_active = false` + `user_type = 'member'`

### 3. **'trial' não existe no schema**
- ❌ User Dropdown tem 'trial'
- ❌ Schema NÃO tem 'trial'
- ✅ Deveria usar 'guest' ou 'presentation'

### 4. **'affiliate' está nos schemas antigos mas não no atual**
- ❌ User Dropdown tem 'affiliate'
- ❌ Schema atual NÃO tem 'affiliate'
- ⚠️ Foi depreciado

### 5. **'presentation' não está no admin**
- ✅ Schema tem 'presentation'
- ✅ User Dropdown tem 'presentation'
- ❌ Admin NÃO pode criar 'presentation'

---

## 🔧 CORREÇÕES NECESSÁRIAS

### **1. User Dropdown - Remover roles inválidos**
```typescript
const userTypeBadge: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  member: { label: "Membro", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  guest: { label: "Guest", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  presentation: { label: "Apresentação", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  pending: { label: "Aguardando", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  // ❌ REMOVER: trial, affiliate
}
```

### **2. Admin - Corrigir user_type**
```typescript
// ❌ ERRADO
user_type: 'vip' | 'guest' | 'inactive'

// ✅ CORRETO
user_type: 'admin' | 'member' | 'guest' | 'presentation' | 'pending'
```

### **3. Admin - Usar member_category para VIP**
```typescript
// Para criar VIP
user_type: 'member'
member_category: 'vip' // ✅ VIP aqui
```

### **4. Admin - Adicionar 'presentation'**
```typescript
<SelectItem value="presentation-standard">
  🎬 Apresentação (48 horas)
</SelectItem>
```

### **5. Admin - Usar is_active para Inativo**
```typescript
// Para criar Inativo
user_type: 'member'
is_active: false // ✅ Inativo aqui
```

---

## 📊 SISTEMA CORRETO (Proposta)

### **user_type (5 valores)**
1. `admin` - Administrador
2. `member` - Membro permanente
3. `guest` - Trial 7 dias
4. `presentation` - Apresentação 48h
5. `pending` - Aguardando aprovação

### **member_category (complementar)**
1. `standard` - Membro padrão
2. `vip` - Membro VIP (acesso especial)
3. `iq` - Subscrição IQ
4. `skool` - Subscrição Skool

### **is_active (boolean)**
- `true` - Utilizador ativo
- `false` - Utilizador inativo (sem acesso)

---

## 🎯 EXEMPLOS CORRETOS

### **VIP Premium**
```typescript
{
  user_type: 'member',
  member_category: 'vip',
  is_active: true
}
```

### **Inativo**
```typescript
{
  user_type: 'member',
  member_category: 'standard',
  is_active: false
}
```

### **Trial 7 dias**
```typescript
{
  user_type: 'guest',
  member_category: 'standard',
  is_active: true,
  trial_expires_at: '2025-11-02T10:00:00Z'
}
```

### **Apresentação 48h**
```typescript
{
  user_type: 'presentation',
  member_category: 'standard',
  is_active: true,
  trial_expires_at: '2025-10-28T10:00:00Z'
}
```

---

## ✅ AÇÕES REQUERIDAS

1. **Atualizar Admin** - Remover 'vip' e 'inactive' de user_type
2. **Atualizar Admin** - Adicionar 'presentation'
3. **Atualizar Admin** - Usar member_category para VIP
4. **Atualizar Admin** - Usar is_active para Inativo
5. **Atualizar User Dropdown** - Remover 'trial' e 'affiliate'
6. **Documentar** - Atualizar ROLES_SISTEMA.md
7. **Migrar Dados** - Converter 'vip' existentes para 'member' + 'vip'
8. **Migrar Dados** - Converter 'inactive' existentes para 'member' + is_active=false

---

**Ficheiro**: `COMPARACAO_ROLES.md`  
**Status**: ⚠️ Requer correção urgente
