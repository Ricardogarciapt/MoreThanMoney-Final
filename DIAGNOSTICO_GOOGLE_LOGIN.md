# 🔍 DIAGNÓSTICO GOOGLE LOGIN - "Não há deploy"

**Problema**: Após escolher conta Google, aparece "não há deploy"  
**Causa Provável**: Configuração Supabase ou redirect URI

---

## 🔍 ANÁLISE DO ERRO

### O que significa "não há deploy"?

Esse erro geralmente aparece quando:
1. **Redirect URI** não está configurado corretamente
2. **Google OAuth** não reconhece o domínio
3. **Supabase** não está configurado para receber callback

---

## ✅ VERIFICAÇÕES NECESSÁRIAS

### 1. Supabase Authentication Settings

**Ir para**:
```
https://supabase.com/dashboard
→ Projeto: iwscxotvmtkphajmasof
→ Authentication → URL Configuration
```

**Verificar**:
```
Site URL: https://morethanmoney.pt
         ou http://localhost:3000 (para testes locais)

Redirect URLs (adicionar TODAS):
- http://localhost:3000/**
- http://localhost:3000/auth/callback
- https://morethanmoney.pt/**
- https://morethanmoney.pt/auth/callback
- https://www.morethanmoney.pt/**
- https://www.morethanmoney.pt/auth/callback
```

### 2. Google Cloud Console

**Ir para**:
```
https://console.cloud.google.com
→ APIs & Services → Credentials
→ Seu OAuth 2.0 Client
```

**Authorized redirect URIs** (adicionar TODAS):
```
http://localhost:3000/auth/callback
https://morethanmoney.pt/auth/callback
https://www.morethanmoney.pt/auth/callback
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

### 3. Supabase Google Provider

**Ir para**:
```
Supabase Dashboard
→ Authentication → Providers → Google
```

**Verificar**:
- ✅ **Enabled**: ON
- ✅ **Client ID**: Preenchido
- ✅ **Client Secret**: Preenchido
- ✅ **Redirect URL**: https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback

---

## 🔧 CORREÇÃO CÓDIGO

Vou reconstruir o fluxo OAuth mantendo tudo unificado.



