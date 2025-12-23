# 🔧 CORRIGIR GOOGLE LOGIN "UNDEPLOYED"

**Problema**: Após selecionar conta Google, aparece "undeployed"  
**Causa**: Redirect URI não configurado corretamente no Google Cloud Console  
**Status**: ⚠️ **Requer configuração manual**

---

## ✅ SOLUÇÃO RÁPIDA

### 1. Google Cloud Console - Adicionar Redirect URI

**Aceder**:
```
https://console.cloud.google.com
→ APIs & Services → Credentials
→ Selecionar OAuth 2.0 Client ID
```

**Adicionar ESTE redirect URI EXATAMENTE**:
```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

**⚠️ CRÍTICO**: Este é o redirect URI do Supabase que processa o OAuth!

---

### 2. Supabase Dashboard - Configurar URLs

**Aceder**:
```
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/url-configuration
```

**Site URL**:
```
https://www.morethanmoney.pt
```

**Redirect URLs** (adicionar TODAS):
```
https://www.morethanmoney.pt/**
https://www.morethanmoney.pt/auth/callback
http://localhost:3000/**
http://localhost:3000/auth/callback
```

**Guardar** ✅

---

### 3. Verificar Google Provider no Supabase

**Aceder**:
```
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers
→ Google
```

**Verificar**:
- ✅ **Enabled**: ON
- ✅ **Client ID**: `922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm.apps.googleusercontent.com`
- ✅ **Client Secret**: Preenchido
- ✅ **Redirect URL**: `https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback`

---

## 🔍 FLUXO CORRETO DO OAUTH

### Como funciona:

1. **Usuário clica "Login com Google"**
   ```
   /login → handleGoogleLogin()
   ```

2. **Supabase gera URL OAuth**
   ```
   redirectTo: https://www.morethanmoney.pt/auth/callback
   URL gerada: https://accounts.google.com/...&redirect_uri=https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```

3. **Google redireciona para Supabase**
   ```
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback?code=XXX
   ```
   ⚠️ **ESTE URI DEVE estar no Google Console!**

4. **Supabase processa e redireciona para nosso site**
   ```
   https://www.morethanmoney.pt/auth/callback?code=XXX
   ```

5. **Nosso callback processa e redireciona**
   ```
   /auth/callback → /member-area
   ```

---

## ❌ ERRO COMUM

**"undeployed" aparece quando**:
- Redirect URI no Google Console ≠ Supabase callback URI
- Google não reconhece o domínio Supabase

**Solução**: Sempre adicionar o Supabase callback URI no Google Console!

---

## ✅ CHECKLIST FINAL

- [ ] Google Cloud Console: Redirect URI `https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback` adicionado
- [ ] Supabase: Site URL = `https://www.morethanmoney.pt`
- [ ] Supabase: Redirect URLs incluem `https://www.morethanmoney.pt/**`
- [ ] Supabase: Google Provider habilitado e configurado
- [ ] Testado em produção após configuração

---

## 🧪 TESTAR APÓS CONFIGURAÇÃO

1. Ir para: `https://www.morethanmoney.pt/login`
2. Clicar "Login com Google"
3. Escolher conta
4. Deve redirecionar para `/member-area` sem erro ✅

---

**⚠️ IMPORTANTE**: As configurações acima precisam ser feitas MANUALMENTE no Google Cloud Console e Supabase Dashboard!

