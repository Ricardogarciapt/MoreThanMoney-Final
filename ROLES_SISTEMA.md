# 🔐 ROLES E PERMISSÕES DO SISTEMA - MoreThanMoney

**Data**: 26 de Outubro de 2025  
**Tabela**: `profiles.user_type` + `profiles.member_category`

---

## 📋 **TODOS OS ROLES E MEMBER_CATEGORIES**

### 🔑 **SISTEMA DE AUTENTICAÇÃO**

**Google Login**: Roles definidos na gestão de utilizadores do Admin  
**Register (/register)**: Roles sincronizados com os existentes em `/admin`

---

### ✅ **1. ADMIN** 
- **Identificador**: `user_type = 'admin'`
- **Badge**: 🔴 Vermelho
- **Redirecionamento após login**: `/new-landing` ou `/admin`
- **Acesso Total**:
  - ✅ Painel Admin (`/admin`)
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Member Area (`/member-area`)
  - ✅ Scanner ao Vivo (`/scanner-access`)
  - ✅ **Portfólios** (`/portfolios`)
  - ✅ Trading Ideas (`/trading-ideas`)
  - ✅ Social Feed - criar posts
  - ✅ AI MTM Trader (áreas VIP)
  - ✅ Todas as áreas protegidas
- **Restrições**: Nenhuma

---

### ⭐ **2. MEMBER VIP**
- **Identificador**: `user_type = 'member'` + `member_category = 'vip'`
- **Badge**: ⭐ Dourado
- **Redirecionamento após login**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Member Area (`/member-area`)
  - ✅ Scanner ao Vivo (`/scanner-access`)
  - ✅ **Portfólios** (`/portfolios`)
  - ✅ Trading Ideas (`/trading-ideas`)
  - ✅ Social Feed - criar posts
  - ✅ AI MTM Trader (áreas VIP)
- **Restrições**:
  - ❌ Painel Admin (`/admin`)

---

### 🎓 **3. MEMBER IQ**
- **Identificador**: `user_type = 'member'` + `member_category = 'iq'`
- **Badge**: 🎓 Azul
- **Redirecionamento após login**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Member Area (`/member-area`)
  - ✅ Scanner ao Vivo (`/scanner-access`)
  - ✅ **Portfólios** (`/portfolios`)
  - ✅ Trading Ideas (`/trading-ideas`)
  - ✅ Social Feed - visualizar e comentar
  - ✅ Todas as áreas de membro
  - ✅ User Dropdown funcional (permitir navegar)
- **Restrições**:
  - ❌ Painel Admin (`/admin`)
  - ❌ Áreas VIP (redirecionado para `/app-mobile`)
  - ❌ Criar posts no Social Feed
  - ❌ AI MTM Trader
  - ❌ Outras áreas VIP: redirecionar para `/app-mobile`

---

### 📚 **4. MEMBER SKOOL**
- **Identificador**: `user_type = 'member'` + `member_category = 'skool'`
- **Badge**: 📚 Roxo
- **Redirecionamento após login**: `/app-mobile`
- **Acesso**:
  - ✅ **App Mobile (`/app-mobile`)**
  - ✅ Member Area (`/member-area`)
  - ✅ Scanner ao Vivo (`/scanner-access`)
  - ✅ Trading Ideas (`/trading-ideas`)
  - ✅ Social Feed - visualizar e comentar
  - ✅ User Dropdown funcional (permitir navegar)
- **Restrições**:
  - ❌ **Portfólios (`/portfolios`)** - BLOQUEADO, redirecionar para `/app-mobile`
  - ❌ Painel Admin (`/admin`)
  - ❌ Áreas VIP - redirecionar para `/app-mobile`
  - ❌ Criar posts no Social Feed
  - ❌ AI MTM Trader
  - ❌ Qualquer rota protegida (exceto user dropdown): redirecionar para `/app-mobile`

**🚨 IMPORTANTE**: Membro Skool deve manter acesso APENAS a `/app-mobile` e rotas desprotegidas

---

### 🆓 **5. GUEST (Free Trial 7 Dias)**
- **Identificador**: `user_type = 'guest'`
- **Badge**: 🆓 Ciano
- **Duração**: 7 dias (automático)
- **Redirecionamento após login**: `/app-mobile`
- **Colunas**:
  - `trial_expires_at`: Data de expiração
  - `trial_expired`: Boolean (true/false)
- **Acesso** (IGUAL AO MEMBER SKOOL):
  - ✅ **App Mobile (`/app-mobile`)**
  - ✅ Member Area (`/member-area`)
  - ✅ Scanner ao Vivo (`/scanner-access`)
  - ✅ Trading Ideas (`/trading-ideas`)
  - ✅ Social Feed - visualizar e comentar
  - ✅ User Dropdown funcional (permitir navegar)
  - ✅ Apenas rotas desprotegidas
- **Restrições**:
  - ❌ **Portfólios (`/portfolios`)** - BLOQUEADO
  - ❌ Painel Admin
  - ❌ Áreas VIP
  - ❌ Criar posts no Social Feed
  - ❌ AI MTM Trader
  - ❌ Qualquer rota protegida (exceto user dropdown): redirecionar para `/app-mobile`

**Expiração Automática**:
  - Trigger: `check_trial_expiration_trigger`
  - Função: `check_and_expire_trials()`
  - Quando: `trial_expires_at < NOW()`

---

### 🎭 **6. PRESENTATION (Apresentação 48h)**
- **Identificador**: `user_type = 'presentation'`
- **Badge**: 🎭 Rosa
- **Duração**: 48 horas
- **Redirecionamento após login**: `/new-landing`
- **Colunas**:
  - `trial_expires_at`: Data de expiração
  - `trial_expired`: Boolean
- **Acesso**:
  - ✅ **New Landing Page (`/new-landing`)**
  - ✅ Apresentação IQONIC
  - ✅ Apenas rotas públicas
- **Restrições**:
  - ❌ App Mobile
  - ❌ Member Area
  - ❌ Scanner ao Vivo
  - ❌ Portfólios
  - ❌ Trading Ideas
  - ❌ Social Feed
  - ❌ Todas as áreas protegidas
  - ❌ Painel Admin

**Expiração Automática**: Igual ao Guest

---

### ⏳ **7. PENDING (Aguardando Aprovação)**
- **Identificador**: `user_type = 'pending'`
- **Badge**: ⏳ Laranja
- **Redirecionamento após login**: `/new-landing`
- **Acesso**:
  - ✅ Páginas públicas
  - ✅ New Landing Page
- **Restrições**:
  - ❌ App Mobile
  - ❌ Member Area
  - ❌ Scanner ao Vivo
  - ❌ Portfólios
  - ❌ Trading Ideas
  - ❌ Social Feed
  - ❌ Todas as áreas protegidas
  - ❌ Painel Admin

---

### 🚫 **8. INACTIVE (Inativo)**
- **Identificador**: `user_type = 'inactive'`
- **Badge**: 🚫 Cinza
- **Redirecionamento após login**: `/new-landing`
- **Acesso**:
  - ✅ Páginas públicas
  - ✅ New Landing Page
  - ✅ Início Rápido (sem subscrição ativa)
- **Restrições**:
  - ❌ App Mobile
  - ❌ Member Area completo
  - ❌ Scanner ao Vivo
  - ❌ Portfólios
  - ❌ Trading Ideas
  - ❌ Social Feed
  - ❌ Todas as áreas protegidas
  - ❌ Painel Admin

---

## 🎯 **MEMBERSHIP CATEGORIES**

As `member_category` são complementares ao `user_type`:

| member_category | Descrição | Badge |
|-----------------|-----------|-------|
| `standard` | Membro padrão | 🟢 Verde |
| `vip` | Membro VIP | ⭐ Dourado |
| `iq` | Membro IQ | 🎓 Azul |
| `skool` | Membro Skool | 📚 Roxo |

---

## 🔐 **REGRA DE REDIRECIONAMENTO APÓS LOGIN**

```typescript
function determineRedirect(user: Profile): string {
  // 1. Admin - vai para admin ou landing
  if (user.user_type === 'admin') {
    return '/new-landing' // ou '/admin' se preferir
  }
  
  // 2. Guest - vai para app-mobile (mesma lógica que Skool)
  if (user.user_type === 'guest') {
    return '/app-mobile'
  }
  
  // 3. Presentation - apenas landing
  if (user.user_type === 'presentation') {
    return '/new-landing'
  }
  
  // 4. Member baseado em member_category
  if (user.user_type === 'member') {
    if (user.member_category === 'vip') return '/app-mobile'
    if (user.member_category === 'iq') return '/app-mobile'
    if (user.member_category === 'skool') return '/app-mobile'
    return '/app-mobile' // padrão
  }
  
  // 5. Pending/Inactive - landing
  return '/new-landing'
}
```

---

## 🚨 **PROTEÇÃO DE ROTAS**

### **Bloqueio de `/portfolios`**

```typescript
// Middleware ou componente de proteção
if (user.member_category === 'skool' || user.user_type === 'guest') {
  window.location.href = '/app-mobile'
  return
}
```

### **Bloqueio de Áreas VIP**

```typescript
// Verificar antes de aceder a áreas VIP (AI MTM, etc)
if (user.member_category !== 'vip' && user.user_type !== 'admin') {
  window.location.href = '/app-mobile'
  return
}
```

### **User Dropdown - SEMPRE FUNCIONAL**

O User Dropdown deve funcionar para **TODOS** os roles (mesmo Membro Skool), permitindo navegação mas bloqueando acesso às páginas específicas.

---

## 📊 **TABELA DE RESUMO**

| Role | member_category | Acesso /portfolios | Redirecionamento | Áreas VIP |
|------|----------------|-------------------|------------------|-----------|
| **admin** | - | ✅ | `/new-landing` | ✅ |
| **member** | **vip** | ✅ | `/app-mobile` | ✅ |
| **member** | **iq** | ✅ | `/app-mobile` | ❌ → `/app-mobile` |
| **member** | **skool** | ❌ → `/app-mobile` | `/app-mobile` | ❌ → `/app-mobile` |
| **guest** | - | ❌ → `/app-mobile` | `/app-mobile` | ❌ |
| **presentation** | - | ❌ | `/new-landing` | ❌ |
| **pending** | - | ❌ | `/new-landing` | ❌ |
| **inactive** | - | ❌ | `/new-landing` | ❌ |

---

## 🔧 **IMPLEMENTAÇÕES NECESSÁRIAS**

### **1. Middleware de Proteção de Rotas**
```typescript
// middleware.ts ou component
const protectedRoutes = {
  '/portfolios': ['admin', 'member:iq', 'member:vip'],
  '/aimtm': ['admin', 'member:vip'], // área VIP
}
```

### **2. Atualizar Login/Auth Callback**
```typescript
// app/auth/callback/page.tsx
const redirectTo = determineRedirect(profile)
window.location.href = redirectTo
```

### **3. Componente de Proteção de Página**
```typescript
// components/route-protector.tsx
if (user.member_category === 'skool' && pathname === '/portfolios') {
  window.location.href = '/app-mobile'
  return null
}
```

### **4. Atualizar Schema Supabase**
```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS member_category TEXT 
CHECK (member_category IN ('standard', 'vip', 'iq', 'skool'));
```

---

## ✅ **CHECKLIST DE IMPLEMENTAÇÃO**

- [ ] Atualizar `ROLES_SISTEMA.md` com as novas regras
- [ ] Criar/atualizar middleware de proteção de rotas
- [ ] Implementar bloqueio de `/portfolios` para Skool
- [ ] Implementar bloqueio de áreas VIP para IQ e Skool
- [ ] Atualizar redirect após login baseado em role
- [ ] Atualizar schema Supabase se necessário
- [ ] Testar fluxo de login para cada role
- [ ] Testar acesso/bloqueio de rotas protegidas
- [ ] Verificar user dropdown funcional para todos

---

**Última atualização**: 26/10/2025  
**Status**: 🔄 **A IMPLEMENTAR**


### **1. Adicionar Badges Faltantes**
```typescript
const userTypeBadge: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  member: { label: "Membro", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  guest: { label: "Guest", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  presentation: { label: "Apresentação", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" }, // ✅ ADICIONAR
  pending: { label: "Aguardando", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" }, // ✅ ADICIONAR
}
```

### **2. Verificar Permissões Específicas**
Alguns recursos verificam `member_category` além de `user_type`:
- AI MTM Trader
- Social Feed (criar posts)

### **3. RLS Policies**
Todas as policies verificam `user_type = 'admin'` para acessos admin.

---

## ✅ **RESUMO FINAL**

| Role | Acesso Admin | Acesso Member | Trial | VIP | Badge |
|------|-------------|---------------|-------|-----|-------|
| **admin** | ✅ Total | ✅ Total | ✅ | ✅ | 🔴 Vermelho |
| **member** | ❌ | ✅ | ✅ | Opcional | 🟢 Verde |
| **guest** | ❌ | ✅ Limitado | ⏱️ 7d | ❌ | 🟣 Roxo |
| **presentation** | ❌ | ✅ Limitado | ⏱️ 48h | ❌ | 🟣 Rosa* |
| **pending** | ❌ | ⚠️ Limitado | ❌ | ❌ | 🟠 Laranja* |

*Badge ainda não implementado no UserDropdown

---

**Ficheiro gerado**: `ROLES_SISTEMA.md`  
**Última atualização**: 26/10/2025

---

## ✅ **RESUMO FINAL**

| Role | Acesso Admin | Acesso Member | Trial | VIP | Badge |
|------|-------------|---------------|-------|-----|-------|
| **admin** | ✅ Total | ✅ Total | ✅ | ✅ | 🔴 Vermelho |
| **member** | ❌ | ✅ | ✅ | Opcional | 🟢 Verde |
| **guest** | ❌ | ✅ Limitado | ⏱️ 7d | ❌ | 🟣 Roxo |
| **presentation** | ❌ | ✅ Limitado | ⏱️ 48h | ❌ | 🟣 Rosa* |
| **pending** | ❌ | ⚠️ Limitado | ❌ | ❌ | 🟠 Laranja* |

*Badge ainda não implementado no UserDropdown

---

**Ficheiro gerado**: `ROLES_SISTEMA.md`  
**Última atualização**: 26/10/2025
