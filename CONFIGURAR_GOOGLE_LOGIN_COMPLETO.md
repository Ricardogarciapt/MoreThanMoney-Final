# 🔐 CONFIGURAR GOOGLE LOGIN - GUIA COMPLETO

**Problema**: "não há deploy" após escolher conta Google  
**Solução**: Configurar redirect URIs corretamente  
**Status**: ✅ **Código corrigido, precisa configuração**

---

## ✅ CÓDIGO ATUALIZADO

### 1. Login Page - Melhorado
**Ficheiro**: `app/login/page.tsx`

**Melhorias**:
```typescript
const handleGoogleLogin = async () => {
  // Detectar ambiente
  const isProduction = window.location.hostname.includes('morethanmoney.pt')
  const baseUrl = isProduction 
    ? `https://${window.location.hostname}`
    : 'http://localhost:3000'
  
  const callbackUrl = `${baseUrl}/auth/callback`
  
  // Logs detalhados
  console.log('📍 Callback URL:', callbackUrl)
  console.log('📍 Redirect destino:', redirectTo)
  
  // OAuth
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account'
      }
    }
  })
  
  if (data?.url) {
    window.location.href = data.url // ✅ Redirect para Google
  }
}
```

### 2. Auth Callback - Já OK
**Ficheiro**: `app/auth/callback/page.tsx`
- ✅ Suporta Implicit Flow (hash)
- ✅ Suporta PKCE Flow (code)
- ✅ ensureProfile automático

### 3. Root Page - Já OK
**Ficheiro**: `app/page.tsx`
- ✅ Client-side (preserva hash)
- ✅ Detecta OAuth e preserva

---

## 🔧 CONFIGURAÇÃO SUPABASE (OBRIGATÓRIO)

### Passo 1: Authentication URLs

**Ir para**:
```
https://supabase.com/dashboard
→ Projeto: iwscxotvmtkphajmasof
→ Authentication → URL Configuration
```

**Configurar**:

**Site URL**:
```
https://www.morethanmoney.pt
```

**Redirect URLs** (clicar "Add URL" para cada):
```
http://localhost:3000/**
http://localhost:3000/auth/callback
https://morethanmoney.pt/**
https://morethanmoney.pt/auth/callback
https://www.morethanmoney.pt/**
https://www.morethanmoney.pt/auth/callback
```

**IMPORTANTE**: Clicar **Save** depois!

---

### Passo 2: Google Provider

**Ir para**:
```
Supabase Dashboard
→ Authentication → Providers → Google
```

**Verificar/Configurar**:

1. **Enable Google Provider**: ✅ ON

2. **Authorized Client IDs**:
   - Copiar do Google Cloud Console

3. **Client ID** (Google):
   ```
   SEU_CLIENT_ID.apps.googleusercontent.com
   ```

4. **Client Secret** (Google):
   ```
   SEU_CLIENT_SECRET
   ```

5. **Authorized redirect URIs** (copiar este):
   ```
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```

**IMPORTANTE**: Clicar **Save** depois!

---

## 🔧 CONFIGURAÇÃO GOOGLE CLOUD CONSOLE

### Passo 1: Aceder ao Console

```
https://console.cloud.google.com
→ Projeto que está a usar
→ APIs & Services → Credentials
```

### Passo 2: OAuth 2.0 Client IDs

**Clicar no seu OAuth Client** (ou criar se não existir)

### Passo 3: Authorized Redirect URIs

**Adicionar TODAS estas URIs**:

```
http://localhost:3000/auth/callback
https://morethanmoney.pt/auth/callback
https://www.morethanmoney.pt/auth/callback
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

**IMPORTANTE**: Clicar **Save** no final!

### Passo 4: Copiar Credenciais

**Client ID**:
```
ALGO.apps.googleusercontent.com
```

**Client Secret**:
```
ALGO-SEGREDO
```

**Colar no Supabase** (Passo 2 acima)

---

## 🧪 TESTAR LOCALMENTE

### Teste 1: Verificar Console

```bash
# Servidor deve estar rodando
http://localhost:3000/login
```

**1. Abrir DevTools** (F12) → Console

**2. Clicar "Login com Google"**

**Logs esperados**:
```
🔍 [GOOGLE LOGIN] Iniciando OAuth...
🌐 [GOOGLE LOGIN] Origin: http://localhost:3000
🌐 [GOOGLE LOGIN] Hostname: localhost
📍 [GOOGLE LOGIN] Callback URL: http://localhost:3000/auth/callback
📍 [GOOGLE LOGIN] Redirect destino: /member-area
✅ [GOOGLE LOGIN] URL gerada com sucesso
🔄 [GOOGLE LOGIN] Redirecionando para autenticação Google...
```

**3. Google abre → Escolher conta**

**4. Após escolha**:
```
→ Redirect para: http://localhost:3000/auth/callback#access_token=...
```

**5. Root page detecta hash**:
```
🔍 [ROOT] OAuth callback detectado
🔍 [ROOT] Hash: #access_token=...
```

**6. Callback processa**:
```
✅ [CALLBACK] Implicit Flow detectado (hash)
✅ [CALLBACK] Sessão do hash: seu-email@gmail.com
✅ [CALLBACK] Perfil criado/verificado
→ Redirect: /member-area
```

**Se TODOS os logs aparecem** → ✅ **FUNCIONA!**

---

## 🚨 SE DER ERRO "NÃO HÁ DEPLOY"

### Causa Provável

**Redirect URI não está configurado no Google Console**

**Solução**:
1. Ir para Google Cloud Console
2. OAuth Client → Authorized redirect URIs
3. Adicionar:
   ```
   http://localhost:3000/auth/callback
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```
4. **Save**
5. Aguardar ~2 min (propagação)
6. Testar novamente

---

## 🚨 SE DER ERRO "redirect_uri_mismatch"

### Erro no Console
```
Error: redirect_uri_mismatch
```

**Solução**:
1. Copiar a URI que o Google está a esperar (aparece no erro)
2. Adicionar no Google Console
3. Save
4. Testar

---

## 🚨 SE NÃO REDIRECIONAR

### Verificar Supabase Site URL

**Ir para**:
```
Supabase → Authentication → URL Configuration
```

**Site URL DEVE ser**:
- Produção: `https://www.morethanmoney.pt`
- Local: `http://localhost:3000`

**Redirect URLs DEVE incluir**:
```
http://localhost:3000/**
```

---

## ✅ CHECKLIST CONFIGURAÇÃO

### No Supabase
- [ ] Authentication → URL Configuration
  - [ ] Site URL: `https://www.morethanmoney.pt`
  - [ ] Redirect URLs: localhost + produção adicionados
  - [ ] Salvou as mudanças ✅

- [ ] Authentication → Providers → Google
  - [ ] Enabled: ✅ ON
  - [ ] Client ID: Preenchido
  - [ ] Client Secret: Preenchido
  - [ ] Salvou as mudanças ✅

### No Google Cloud Console
- [ ] OAuth 2.0 Client ID existe
- [ ] Authorized redirect URIs:
  - [ ] http://localhost:3000/auth/callback
  - [ ] https://www.morethanmoney.pt/auth/callback
  - [ ] https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
  - [ ] Salvou as mudanças ✅

### No Código
- [x] app/login/page.tsx → Logs detalhados
- [x] app/auth/callback/page.tsx → Dual flow
- [x] app/page.tsx → Preserva hash

---

## 🎯 TESTE COMPLETO

### 1. Configurar (5 min)
```
1. Supabase → URLs
2. Google Console → Redirect URIs
3. Salvar tudo
4. Aguardar 2 min
```

### 2. Testar Local (2 min)
```
1. http://localhost:3000/login
2. Console (F12)
3. "Login com Google"
4. Escolher conta
5. Verificar logs
```

### 3. Se Funcionar (1 min)
```
git add .
git commit -m "🔐 Fix: Google Login - Redirect URIs corrigidos"
git push origin main
```

### 4. Testar Produção (3 min)
```
https://www.morethanmoney.pt/login
→ Google Login
→ Deve funcionar! ✅
```

---

## 📞 SUPORTE

**Se continuar a falhar**:

1. **Copiar TODOS os logs** do console
2. **Screenshot do erro**
3. **Verificar** no Google Cloud Console se as URIs estão salvas
4. **Verificar** no Supabase se as URLs estão salvas

---

**Código corrigido!** ✅  
**Configuração necessária!** ⚙️  
**Testar: http://localhost:3000/login** 🧪



