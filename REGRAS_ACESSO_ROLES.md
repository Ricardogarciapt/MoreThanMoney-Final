# 🔐 REGRAS DE ACESSO POR ROLES - MoreThanMoney

**Data**: 26 de Outubro de 2025  
**Atualização**: Sistema baseado em `user_type` + `member_category`

---

## 📋 **RESUMO EXECUTIVO**

| Role | Redirecionamento Após Login | `/portfolios` | `/admin` | `/aimtm` | Social Feed |
|------|---------------------------|---------------|----------|----------|-------------|
| **admin** | `/admin` | ✅ | ✅ | ✅ | Criar posts |
| **vip** | `/app-mobile` | ✅ | ❌ | ✅ | Criar posts |
| **iq** | `/app-mobile` | ✅ | ❌ | ❌ | Visualizar |
| **skool** | `/app-mobile` | ❌ | ❌ | ❌ | Visualizar |
| **guest** | `/app-mobile` | ❌ | ❌ | ❌ | Visualizar |
| **presentation** | `/new-landing` | ❌ | ❌ | ❌ | ❌ |

---

## 🎯 **ROLES DETALHADOS**

### ✅ **1. ADMIN** (`user_type = 'admin'`)
- **Badge**: 🔴 Vermelho
- **Redirecionamento**: `/admin` (ou redirect solicitado)
- **Acesso**: **TOTAL** - Todas as áreas
- **Restrições**: Nenhuma

---

### ⭐ **2. VIP** (`member_category = 'vip'`)
- **Badge**: ⭐ Dourado  
- **Redirecionamento**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Portfólios (`/portfolios`)
  - ✅ **AI MTM Trader** (`/aimtm`) - EXCLUSIVO
  - ✅ Social Feed - criar posts
  - ✅ Todas áreas premium
- **Restrições**: `/admin`

---

### 🎓 **3. MEMBER IQ** (`member_category = 'iq'`)
- **Badge**: 🎓 Azul
- **Redirecionamento**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ **Portfólios** (`/portfolios`) - ACESSO PERMITIDO
  - ✅ Member Area, Scanner, Trading Ideas
  - ✅ Social Feed (visualizar)
  - ✅ User Dropdown (navegar pelo site)
- **Restrições**:
  - ❌ `/admin`
  - ❌ `/aimtm` (apenas VIP)
  - ❌ Áreas VIP (redireciona para `/app-mobile`)

---

### 📚 **4. MEMBER SKOOL** (`member_category = 'skool'`)
- **Badge**: 📚 Roxo
- **Redirecionamento**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Member Area, Scanner, Trading Ideas
  - ✅ Social Feed (visualizar)
  - ✅ User Dropdown (navegar pelo site)
- **Restrições**:
  - ❌ **Portfólios** (`/portfolios`) - **BLOQUEADO**
  - ❌ `/admin`
  - ❌ `/aimtm` (apenas VIP)

**Objetivo**: Manter este membro focado em `/app-mobile`

---

### 🆓 **5. GUEST** (`user_type = 'guest'`)
- **Badge**: 🟣 Roxo
- **Duração**: 7 dias
- **Redirecionamento**: `/app-mobile`
- **Acesso**:
  - ✅ App Mobile (`/app-mobile`)
  - ✅ Member Area, Scanner, Trading Ideas
  - ✅ Social Feed (visualizar)
- **Restrições**:
  - ❌ **Portfólios** (`/portfolios`) - igual a Skool
  - ❌ `/admin`, `/aimtm`
- **Nota**: Mesmos acessos que Membro Skool durante trial

---

### 🎁 **6. PRESENTATION** (`user_type = 'presentation'`)
- **Badge**: 🟣 Rosa
- **Duração**: 48 horas
- **Redirecionamento**: `/new-landing`
- **Acesso**:
  - ✅ `/new-landing`
  - ✅ Apresentação IQONIC
- **Restrições**:
  - ❌ Todas as rotas protegidas
  - ❌ App Mobile, Member Area, etc.

---

### 🟠 **7. PENDING** (`user_type = 'pending'`)
- **Badge**: 🟠 Laranja
- **Redirecionamento**: `/success?message=Aguardando+aprovação`
- **Acesso**: Apenas páginas públicas
- **Restrições**: Todas as áreas membro

---

### ⚪ **8. INACTIVE** (`user_type = 'inactive'`)
- **Badge**: ⚪ Cinza
- **Redirecionamento**: `/new-landing`
- **Acesso**: Apenas páginas públicas
- **Restrições**: Todas as áreas premium

---

## 🔄 **FLUXO DE REGISTO E LOGIN**

### **Registo Normal** (`/register`)
1. Utilizador registado com `user_type = 'member'`
2. `member_category` definido na gestão de utilizadores
3. Sincroniza com roles existentes em `/admin`

### **Google Login**
1. Utilizador faz login com Google
2. Perfil criado automaticamente
3. **Roles definidos na gestão de utilizadores** (`/admin`)
4. Admin pode alterar `user_type` e `member_category`

---

## 🚦 **PROTEÇÃO DE ROTAS**

### **Middleware** (`middleware.ts`)
- Protege rotas baseado em `user_type` e `member_category`
- Redireciona para `/app-mobile` se acesso negado (Skool, Guest, IQ)
- Redireciona para `/new-landing` se Presentation ou Inactive

### **Componentes de Proteção** (`lib/route-protection.tsx`)
- `ProtectedRoute` - Componente para proteger páginas
- `canAccessRoute()` - Verifica se tem acesso
- `getAccessDeniedMessage()` - Mensagem personalizada

### **Redirecionamento Pós-Login** (`lib/role-redirect.ts`)
- `determinePostLoginRedirect()` - Define onde redirecionar após login
- Baseado em `user_type` e `member_category`

---

## 📊 **SCHEMA SUPABASE**

### **Tabela `profiles`**
```sql
user_type TEXT CHECK (user_type IN (
  'member', 'admin', 'pending', 'guest', 
  'presentation', 'inactive', 'vip'
))

member_category TEXT DEFAULT 'standard' CHECK (member_category IN (
  'standard', 'iq', 'skool', 'vip', 'inactive'
))
```

### **Como Funciona**
- `user_type` define o **tipo base** do utilizador
- `member_category` define a **subcategoria** (para members)
- Combinados definem as **permissões de acesso**

---

## 🎯 **CASOS DE USO ESPECÍFICOS**

### **Membro Skool tenta aceder a `/portfolios`**
1. Sistema verifica `member_category = 'skool'`
2. Acesso negado
3. Redireciona para `/app-mobile` com mensagem
4. Mensagem: "Os Portfólios estão disponíveis apenas para Membros IQ e VIP"

### **Membro IQ tenta aceder a área VIP**
1. Sistema verifica `member_category = 'iq'`
2. Acesso negado (área VIP)
3. Redireciona para `/app-mobile`

### **Guest (trial) tenta aceder a `/portfolios`**
1. Sistema verifica `user_type = 'guest'`
2. Acesso negado (igual a Skool)
3. Redireciona para `/app-mobile`
4. Note: Trial tem 7 dias de acesso igual a Skool

### **Presentation tentar navegar**
1. Sistema verifica `user_type = 'presentation'`
2. Acesso negado a qualquer rota protegida
3. Redireciona para `/new-landing`
4. Objetivo: Ver apenas apresentação IQONIC

---

## 📝 **ATUALIZAÇÕES NECESSÁRIAS**

1. ✅ Criado `lib/role-redirect.ts` - Funções de redirecionamento
2. ✅ Criado `lib/route-protection.tsx` - Componente de proteção
3. ✅ Atualizado `app/auth/callback/page.tsx` - Redirecionamento após login
4. ⏳ Criar SQL para `member_category` - `scripts/add-member-category-column.sql`
5. ⏳ Atualizar gestão de utilizadores no Admin
6. ⏳ Testar todos os fluxos

---

**Ficheiro**: `REGRAS_ACESSO_ROLES.md`  
**Última atualização**: 26/10/2025

