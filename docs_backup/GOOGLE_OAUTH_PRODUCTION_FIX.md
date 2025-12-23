# 🔧 Corrigir Redirect do Google OAuth para Produção

## ⚠️ Problema
O login com Google está redirecionando para localhost mesmo em produção.

## ✅ Solução

### 1. **Configurar URLs Autorizadas no Google Cloud Console**

Acesse: https://console.cloud.google.com/apis/credentials

Encontre seu OAuth 2.0 Client ID e adicione:

**Authorized JavaScript origins:**
```
http://localhost:3000
https://site-morethanmoney-final.vercel.app
https://morethanmoney.pt
```

**Authorized redirect URIs:**
```
http://localhost:3000/auth/callback
https://site-morethanmoney-final.vercel.app/auth/callback
https://morethanmoney.pt/auth/callback
```

### 2. **Configurar no Supabase Dashboard**

Acesse: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/url-configuration

**Site URL:**
```
https://site-morethanmoney-final.vercel.app
```

**Redirect URLs (adicione todas):**
```
http://localhost:3000/**
https://site-morethanmoney-final.vercel.app/**
https://morethanmoney.pt/**
```

### 3. **Verificar Variáveis de Ambiente no Vercel**

Acesse: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables

Certifique-se que existe:
```
NEXT_PUBLIC_SITE_URL = https://site-morethanmoney-final.vercel.app
```

### 4. **Após Configurar**

1. Salve todas as configurações
2. Aguarde 1-2 minutos para propagar
3. Teste o login com Google novamente

---

## 📋 **Checklist:**

- [ ] URLs adicionadas no Google Cloud Console
- [ ] Site URL configurada no Supabase
- [ ] Redirect URLs adicionadas no Supabase
- [ ] NEXT_PUBLIC_SITE_URL configurada no Vercel
- [ ] Aguardar 2 minutos
- [ ] Testar login

## ✅ **O código já está correto!**

O código usa `window.location.origin` que automaticamente detecta:
- `http://localhost:3000` em desenvolvimento
- `https://site-morethanmoney-final.vercel.app` em produção

O problema está apenas nas **configurações externas** (Google Cloud e Supabase).

