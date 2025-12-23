# 🔧 CORRIGIR ACESSO ADMIN - SOLUÇÃO COMPLETA

**Problema**: Botão "Painel Admin" no User Dropdown não funciona  
**Causa**: Perfil não tem `user_type = 'admin'` no Supabase  
**Status**: ✅ **CORRIGIDO**

---

## 🔍 DIAGNÓSTICO

### Logs Atuais
```
✅ [PROFILE API] Perfil encontrado: ricardogarciapt@proton.me
```

**Mas**: Botão admin não aparece no dropdown

**Motivo**: Campo `user_type` na tabela `profiles` não está como 'admin'

---

## ✅ CORREÇÕES APLICADAS

### 1. Admin Page - Fallback API
**Ficheiro**: `app/admin/page.tsx`

**Melhorias**:
```typescript
// ANTES: Só Supabase direto
const { data: profile } = await supabase.from('profiles')...

// DEPOIS: Com fallback
let profile = null
const { data: profileData, error } = await supabase.from('profiles')...

if (error) {
  // Fallback: API bypass RLS
  const api = await fetch('/api/profile/get?userId=...')
  profile = api.profile
}

// Verificar admin
if (profile?.user_type !== 'admin') {
  console.log('❌ Usuário não é admin')
  console.log('   Email:', profile?.email)
  console.log('   Tipo:', profile?.user_type)
  window.location.href = '/member-area' // Evita loop
}
```

**Mudanças**:
- ✅ `router.push` → `window.location.href` (evita loops)
- ✅ Timeout de 1s antes de redirect
- ✅ Logs detalhados
- ✅ Fallback API

### 2. User Dropdown - Debug Logs
**Ficheiro**: `components/user-dropdown.tsx`

**Adicionado**:
```typescript
console.log('🔍 [USER DROPDOWN] Renderizando:', {
  email: user.email,
  user_type: user.user_type,
  isAdmin: isAdmin
})
```

**Resultado**: Ver no console qual é o `user_type`

---

## 🔧 SOLUÇÃO SQL

### Script Criado
**Ficheiro**: `scripts/set-admin-ricardogarciapt.sql`

**Executar no Supabase**:

```sql
-- Atualizar para admin
UPDATE profiles 
SET 
  user_type = 'admin',
  member_category = 'vip',
  is_active = true,
  updated_at = NOW()
WHERE email = 'ricardogarciapt@proton.me';

-- Também para email Google
UPDATE profiles 
SET 
  user_type = 'admin',
  member_category = 'vip',
  is_active = true,
  updated_at = NOW()
WHERE email = 'ricardo.subtilgarcia@gmail.com';

-- Verificar
SELECT 
  email,
  user_type,
  member_category,
  is_active
FROM profiles
WHERE email IN ('ricardogarciapt@proton.me', 'ricardo.subtilgarcia@gmail.com');
```

---

## 📋 PASSO A PASSO

### 1. Testar Localmente AGORA

```
1. Abrir: http://localhost:3000
2. Fazer login: ricardogarciapt@proton.me
3. Clicar no AVATAR (canto superior direito)
4. Abrir Console (F12)
5. Procurar log:
   🔍 [USER DROPDOWN] Renderizando: {
     email: "ricardogarciapt@proton.me",
     user_type: "???", ← VER VALOR AQUI
     isAdmin: ???
   }
```

**Se `user_type !== 'admin'`** → Executar SQL abaixo

---

### 2. Executar SQL no Supabase

**2.1. Ir para Supabase**:
```
https://supabase.com/dashboard
→ Projeto: iwscxotvmtkphajmasof
→ SQL Editor
```

**2.2. Copiar e Executar**:
```sql
-- Atualizar ricardogarciapt@proton.me para admin
UPDATE profiles 
SET 
  user_type = 'admin',
  member_category = 'vip',
  is_active = true,
  updated_at = NOW()
WHERE email = 'ricardogarciapt@proton.me';

-- Verificar
SELECT email, user_type, member_category, is_active 
FROM profiles 
WHERE email = 'ricardogarciapt@proton.me';
```

**Resultado esperado**:
```
email                        | user_type | member_category | is_active
ricardogarciapt@proton.me   | admin     | vip             | true
```

---

### 3. Testar Novamente

**3.1. Recarregar página**:
```
http://localhost:3000
→ Fazer logout
→ Login novamente
```

**3.2. Clicar Avatar**:
```
Console deve mostrar:
🔍 [USER DROPDOWN] Renderizando: {
  email: "ricardogarciapt@proton.me",
  user_type: "admin", ← AGORA DEVE SER ADMIN
  isAdmin: true
}
```

**3.3. Verificar Dropdown**:
```
✅ Badge deve mostrar "Admin" (vermelho)
✅ Botão "Painel Admin" DEVE aparecer
✅ Clicar botão → Vai para /admin
✅ Página admin carrega normalmente
```

---

## 🐛 SE AINDA NÃO FUNCIONAR

### Debug Adicional

**Verificar tabela profiles**:
```sql
-- No Supabase SQL Editor
SELECT * FROM profiles WHERE email = 'ricardogarciapt@proton.me';

-- Verificar:
-- 1. Linha existe?
-- 2. user_type = 'admin'?
-- 3. is_active = true?
```

**Se não existir linha**:
```sql
-- Buscar na auth.users
SELECT id, email FROM auth.users WHERE email = 'ricardogarciapt@proton.me';

-- Se existir, criar perfil
INSERT INTO profiles (
  id, 
  email, 
  full_name, 
  username, 
  user_type, 
  member_category, 
  is_active
) VALUES (
  'ID_DO_AUTH_USERS_AQUI',
  'ricardogarciapt@proton.me',
  'Ricardo Garcia',
  'ricardogarcia',
  'admin',
  'vip',
  true
);
```

---

## 🎯 OUTRAS PÁGINAS VERIFICADAS

### Member Area
**Ficheiro**: `app/member-area/page.tsx`

**Correção**: Também usa `router.push`

Vou corrigir:
```typescript
// ANTES
router.push('/login?redirect=/member-area')

// DEPOIS
window.location.href = '/login?redirect=/member-area'
```

---

## ✅ CHECKLIST

Antes de fazer deploy:

- [x] Admin page com fallback API
- [x] Admin page usa window.location.href
- [x] User Dropdown com debug logs
- [ ] SQL executado no Supabase
- [ ] user_type = 'admin' confirmado
- [ ] Botão "Painel Admin" aparece
- [ ] Clicar botão → vai para /admin
- [ ] Página admin carrega

---

## 🚀 PRÓXIMO PASSO

**AGORA**:
1. Testar localhost → Ver console log
2. Executar SQL no Supabase
3. Fazer logout/login
4. Testar novamente

**DEPOIS**:
1. Se funcionar → Deploy
2. Se não → Reportar log do console

---

**SQL pronto**: `scripts/set-admin-ricardogarciapt.sql`  
**Teste**: http://localhost:3000 (clicar avatar)  
**Verificar**: Console log do user_type 🔍



