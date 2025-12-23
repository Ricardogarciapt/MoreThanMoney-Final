# 🔧 FIX: Erro 404 no Login Google OAuth

## ❌ Erro
```
404: NOT_FOUND
Code: DEPLOYMENT_NOT_FOUND
ID: cdg1::66f2r-1761760609574-4ffe70f74f66
```

## 🔍 Causa
O Supabase não está a reconhecer o redirect URL da aplicação em produção.

## ✅ SOLUÇÃO

### 1. Aceder ao Supabase Dashboard
https://supabase.com/dashboard/project/iwscxotvmtkphajmasof

### 2. Ir para Authentication > URL Configuration

### 3. Adicionar Redirect URLs Permitidas:
```
Site URL:
https://www.morethanmoney.pt

Redirect URLs (adicionar TODAS estas):
https://www.morethanmoney.pt/auth/callback
https://www.morethanmoney.pt/**
http://localhost:3000/auth/callback
https://*.vercel.app/auth/callback
```

### 4. Verificar Google OAuth Provider
- Authentication > Providers > Google
- Verificar se estas configurações estão corretas:
  - **Client ID**: `922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm.apps.googleusercontent.com`
  - **Client Secret**: `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` ← **NOVO SECRET**
  - **Enabled**: ✅ Sim
- **IMPORTANTE**: Atualizar o Client Secret no Supabase com o novo valor

### 5. Adicionar Redirect URI no Google Cloud Console
https://console.cloud.google.com/apis/credentials

1. Editar OAuth 2.0 Client ID: `922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm.apps.googleusercontent.com`
2. Adicionar Authorized redirect URIs:
```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

## 🧪 Testar

### Local (dev):
1. Iniciar `npm run dev`
2. Ir para http://localhost:3000/login
3. Clicar em "Login com Google"
4. Deve redirecionar para Google e depois voltar para http://localhost:3000/auth/callback

### Produção:
1. Ir para https://www.morethanmoney.pt/login
2. Clicar em "Login com Google"
3. Deve redirecionar para Google e depois voltar para https://www.morethanmoney.pt/auth/callback

## 📋 Checklist
- [ ] Site URL configurado no Supabase
- [ ] Redirect URLs adicionadas no Supabase
- [ ] Google OAuth Provider ativado
- [ ] Redirect URI adicionado no Google Cloud Console
- [ ] Testar login localmente
- [ ] Testar login em produção

## 🚨 Se continuar a dar erro:

1. Verificar logs do Vercel:
   ```bash
   vercel logs --follow
   ```

2. Verificar logs do Supabase Dashboard:
   - Authentication > Logs

3. Verificar rede no browser:
   - F12 > Network tab
   - Filtrar por "auth" ou "callback"
   - Ver qual URL está a falhar

## 📞 Contacto
Se o problema persistir, verifica:
- Google Cloud Console > APIs & Services > OAuth consent screen
- Supabase > Project Settings > API > Settings
