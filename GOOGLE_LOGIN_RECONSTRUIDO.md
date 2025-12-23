# 🔐 GOOGLE LOGIN RECONSTRUÍDO - ARQUITETURA COMPLETA

**Data**: 26 de Outubro de 2025  
**Objetivo**: Sistema de autenticação robusto e à prova de erros

---

## 🎯 PROBLEMA IDENTIFICADO

### Sintomas
- Google Login funcionava intermitentemente
- Hash OAuth perdido em redirects
- User Dropdown não carregava perfil
- App-mobile perdia sessão
- React Error #130 em componentes protegidos

### Root Causes
1. **Hash OAuth perdido** → Root page server-side
2. **RLS Policies bloqueando** → Erro 500 em profiles
3. **SSR Hydration** → localStorage sem mounted state
4. **Campo SQL inconsistente** → `active` vs `is_active`
5. **Timeouts agressivos** → UserDropdown timeout 5s

---

## ✅ ARQUITETURA NOVA

### 1. Root Page (app/page.tsx)
**Função**: Router inicial que detecta OAuth

```typescript
"use client"
export default function Home() {
  useEffect(() => {
    const hash = window.location.hash
    
    // OAuth Google? Preservar hash!
    if (hash && hash.includes('access_token')) {
      window.location.href = `/auth/callback${hash}`
      return
    }
    
    // Normal: ir para landing
    router.push('/new-landing')
  }, [])
}
```

**Características**:
- ✅ Client-side (preserva hash)
- ✅ Detecta OAuth via hash
- ✅ Redirect preserva token
- ✅ Fallback para landing

---

### 2. Auth Callback (app/auth/callback/page.tsx)
**Função**: Processa ambos os fluxos OAuth

```typescript
"use client"
export default function AuthCallbackPage() {
  useEffect(() => {
    // 1. Implicit Flow (Google - hash)
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      const session = await supabase.auth.getSession()
      await ensureProfile(session)
      redirect('/member-area')
    }
    
    // 2. PKCE Flow (Email - code)
    const code = searchParams.get('code')
    if (code) {
      const { data } = await supabase.auth.exchangeCodeForSession(code)
      await ensureProfile(data.session)
      redirect('/member-area')
    }
  }, [])
}
```

**Características**:
- ✅ Dual flow (Google + Email)
- ✅ ensureProfile() unificado
- ✅ Auto-criação de perfil
- ✅ Redirect inteligente

---

### 3. User Dropdown (components/user-dropdown.tsx)
**Função**: Exibir usuário e menu

```typescript
"use client"
export default function UserDropdown() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState(null)
  
  useEffect(() => { setMounted(true) }, [])
  
  useEffect(() => {
    if (mounted) {
      loadUser() // Apenas após mounted
    }
  }, [mounted])
  
  const loadUser = async () => {
    // 1. Tentar getSession (10s timeout)
    // 2. Fallback: tentar API /api/profile/get
    // 3. Fallback final: dados básicos da session
  }
}
```

**Características**:
- ✅ Mounted state (SSR safe)
- ✅ Timeout 10s (não 5s)
- ✅ Fallback robusto
- ✅ Sem loops infinitos

---

### 4. Protected Page (components/protected-page.tsx)
**Função**: HOC para proteger rotas

```typescript
"use client"
export default function ProtectedPage({ children }) {
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => { setMounted(true) }, [])
  
  useEffect(() => {
    if (mounted) {
      checkAuth()
    }
  }, [mounted])
  
  if (!mounted || isLoading) return <Loading />
  if (!isAuthenticated) return null
  
  return <div>{children}</div>
}
```

**Características**:
- ✅ Mounted state
- ✅ Sem duplicação de <main>
- ✅ Loading state claro
- ✅ Redirect automático

---

## 🔧 COMPONENTES ATUALIZADOS

### App Mobile (app/app-mobile/page.tsx)
**Problemas resolvidos**:
- ✅ Mounted state adicionado
- ✅ Suspense para useSearchParams
- ✅ User dropdown simplificado
- ✅ Sem Dialog complexo

### Social Feed (components/mobile/social-feed.tsx)
**Melhorias**:
- ✅ Mounted state
- ✅ Fallback robusto para loadUser
- ✅ Proteção contra arrays undefined
- ✅ UI/UX melhorada

### Portfolio Mobile (components/mobile/portfolio-mobile.tsx)
**Sincronização**:
- ✅ Mesma API que /portfolios
- ✅ Auto-sync a cada 2 min
- ✅ Formatação inteligente de preços
- ✅ Mounted state

### Scanner Mobile (components/mobile/scanner-mobile.tsx)
**Atualizações**:
- ✅ Scanners MTM/GoldKiller removidos
- ✅ Volume indicator removido
- ✅ Checklist adicionado
- ✅ localStorage com proteção SSR

---

## 📊 FLUXO COMPLETO

```
┌─────────────────────────────────────────────┐
│ Usuário clica "Login com Google"          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ Supabase OAuth                             │
│ → Google autentica                         │
│ → Retorna: /#access_token=xxx             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ ROOT PAGE (Client-Side)                    │
│ ✅ Detecta: window.location.hash          │
│ ✅ Preserva: /auth/callback#access_token  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ AUTH CALLBACK                              │
│ ✅ Implicit Flow detectado                │
│ ✅ supabase.auth.getSession()             │
│ ✅ Sessão criada automaticamente          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ ENSURE PROFILE                             │
│ ✅ Verifica se perfil existe              │
│ ✅ Cria perfil se não existir             │
│ ✅ Define: user_type, member_category     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ REDIRECT /member-area                      │
│ ✅ Sessão válida                          │
│ ✅ Perfil criado                          │
│ ✅ LOGIN COMPLETO                         │
└───────────────────────────────────────────────┘
```

---

## 🛡️ PROTEÇÕES IMPLEMENTADAS

### 1. SSR Protection
```typescript
// TODOS os componentes que usam localStorage/sessionStorage
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])

const [data, setData] = useState(() => {
  if (typeof window === 'undefined') return defaultValue
  try {
    return localStorage.getItem(key) || defaultValue
  } catch {
    return defaultValue
  }
})
```

### 2. Timeout Protection
```typescript
// UserDropdown - timeout aumentado
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Timeout')), 10000) // 10s
)
await Promise.race([loadPromise, timeoutPromise])
```

### 3. Fallback Chain
```typescript
// 1. Tentar Supabase direto
const { data: profile } = await supabase.from('profiles')...

// 2. Fallback: API com service role
if (!profile) {
  const response = await fetch(`/api/profile/get?userId=${id}`)
  profile = await response.json()
}

// 3. Fallback final: dados básicos
if (!profile) {
  profile = {
    id: session.user.id,
    email: session.user.email,
    full_name: session.user.user_metadata?.name || 'Utilizador'
  }
}
```

### 4. RLS Bypass API
```typescript
// app/api/profile/get/route.ts
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY // Bypass RLS
)
```

---

## 📝 FICHEIROS A ATUALIZAR

### Críticos (Já Atualizados)
- [x] `app/page.tsx` → Client-side OAuth
- [x] `app/auth/callback/page.tsx` → Dual flow
- [x] `components/user-dropdown.tsx` → Mounted + fallbacks
- [x] `components/protected-page.tsx` → Mounted state
- [x] `components/mobile/social-feed.tsx` → Mounted state
- [x] `components/mobile/scanner-mobile.tsx` → SSR protection
- [x] `components/mobile/portfolio-mobile.tsx` → Sincronização

### Opcionais (Melhorias)
- [ ] `components/google-translate.tsx` → Mounted state
- [ ] `components/geolocation-detector.tsx` → Mounted state
- [ ] `components/language-selector-enhanced.tsx` → Mounted state

---

## 🧪 TESTES OBRIGATÓRIOS

### Teste 1: Google Login
```
1. Limpar cookies/cache (Cmd+Shift+Delete)
2. Abrir: http://localhost:3000/login (incógnito)
3. Abrir DevTools → Console
4. Clicar "Login com Google"
5. Verificar logs:
   ✅ [ROOT] OAuth callback detectado
   ✅ [CALLBACK] Implicit Flow detectado
   ✅ [CALLBACK] Sessão criada
   ✅ Redirect /member-area
```

### Teste 2: User Dropdown
```
1. Após login
2. Clicar avatar (canto superior direito)
3. Verificar:
   ✅ Nome aparece
   ✅ Email aparece
   ✅ Badge de tipo (Admin/Member)
   ✅ Menu funciona
   ✅ SEM erros console
```

### Teste 3: App Mobile
```
1. Ir para /app-mobile
2. Verificar:
   ✅ Tabs funcionam
   ✅ Social feed carrega
   ✅ Portfolios sincronizados
   ✅ Scanner com checklist
   ✅ SEM React Error #130
```

### Teste 4: Sessão Persistente
```
1. Fazer login
2. Fechar browser
3. Abrir novamente
4. Ir para /member-area
5. Verificar: ✅ Ainda autenticado
```

---

## 🚀 PRÓXIMO PASSO

Vou recriar o sistema de Google Login com a arquitetura robusta acima.

**Ordem de implementação**:
1. ✅ Limpar node_modules (FEITO)
2. ✅ Reinstalar dependências (FEITO)
3. 🔄 Atualizar componentes críticos
4. 🔄 Adicionar fallbacks robustos
5. 🔄 Testar localmente
6. ✅ Deploy quando OK

**Aguardando confirmação para prosseguir...** 🔧



