# 🔐 Configuração Completa do Google OAuth

## ✅ Resumo do Diagnóstico

- ✅ **Admin OK:** ricardogarciapt@proton.me
- ✅ **Senha OK:** Superacao2022#
- ✅ **Login Email/Password:** Funcionando
- ⚠️ **Google OAuth:** Requer configuração de URLs

---

## 📋 Passo 1: Configurar no Google Cloud Console

### 1.1 Acessar Google Cloud Console
🌐 https://console.cloud.google.com/

### 1.2 Criar/Selecionar Projeto
- Nome sugerido: "MoreThanMoney Site"

### 1.3 Ativar Google+ API
1. Menu → APIs & Services → Enable APIs and Services
2. Pesquisar "Google+ API"
3. Clicar em "Enable"

### 1.4 Criar Credenciais OAuth 2.0

1. **APIs & Services → Credentials**
2. **Create Credentials → OAuth 2.0 Client ID**
3. **Application type:** Web application
4. **Name:** MoreThanMoney Web Client

### 1.5 Configurar URLs

#### **Authorized JavaScript origins:**
```
http://localhost:3002
http://localhost:3000
https://iwscxotvmtkphajmasof.supabase.co
https://seu-dominio-producao.com
```

#### **Authorized redirect URIs:**
```
http://localhost:3002/auth/callback
http://localhost:3000/auth/callback
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
https://seu-dominio-producao.com/auth/callback
```

### 1.6 Obter Credenciais
- Copiar **Client ID**
- Copiar **Client Secret**

---

## 📋 Passo 2: Configurar no Supabase

### 2.1 Acessar Dashboard Supabase
🌐 https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers

### 2.2 Habilitar Google Provider

1. **Authentication → Providers → Google**
2. **Enable Sign in with Google:** ✅ ON
3. **Client ID:** [Cole aqui o Client ID do Google]
4. **Client Secret:** [Cole aqui o Client Secret do Google]

### 2.3 Configurar Redirect URLs

No Supabase, certifique-se que estas URLs estão configuradas em:
**Authentication → URL Configuration:**

#### Site URL:
```
http://localhost:3002
```

#### Redirect URLs (adicionar todas):
```
http://localhost:3002/**
http://localhost:3000/**
https://seu-dominio-producao.com/**
```

### 2.4 Salvar Configurações
- Clicar em **Save**
- Aguardar confirmação

---

## 📋 Passo 3: Testar Autenticação

### 3.1 Teste com Email/Password (Já Funciona)
```
URL: http://localhost:3002/test-auth
Email: ricardogarciapt@proton.me
Senha: Superacao2022#
```

### 3.2 Teste com Google OAuth
```
URL: http://localhost:3002/login
1. Clicar em "Continuar com Google"
2. Selecionar conta Google
3. Aguardar redirecionamento
```

### 3.3 Verificar Logs
Abrir Console do navegador (F12) e verificar:
```
🔍 Callback iniciado
✅ Código encontrado, trocando por sessão...
✅ Sessão criada: [seu-email]
✅ Perfil carregado: [seu-email]
🔄 Redirecionando para: /new-landing
```

---

## ⚠️ Problemas Comuns e Soluções

### Problema 1: "redirect_uri_mismatch"
**Causa:** URL de redirect não está configurada no Google Console

**Solução:**
1. Acesse Google Console
2. Verifique se tem EXATAMENTE:
   ```
   http://localhost:3002/auth/callback
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```
3. Não esqueça o `/auth/v1/callback` do Supabase

### Problema 2: Fica "processando" infinitamente
**Causa:** Callback não está funcionando

**Solução:**
1. Verifique se `/auth/callback/page.tsx` existe
2. Abra DevTools → Network
3. Veja se há erro 404 no callback
4. Verifique logs no console

### Problema 3: "Error 400: invalid_request"
**Causa:** Client ID/Secret incorretos

**Solução:**
1. Copiar novamente do Google Console
2. Colar no Supabase (sem espaços extras)
3. Salvar e testar novamente

### Problema 4: Sessão criada mas perfil não encontrado
**Causa:** Perfil não foi criado automaticamente

**Solução:**
- O código já trata isso automaticamente
- Veja `app/auth/callback/page.tsx` linha 45-66
- Perfil é criado se não existir

---

## 🔒 Configuração de Segurança (Produção)

### OAuth Consent Screen
1. **Google Console → OAuth consent screen**
2. **User Type:** External
3. **App name:** MoreThanMoney
4. **User support email:** ricardogarciapt@proton.me
5. **Developer contact:** ricardogarciapt@proton.me
6. **Scopes:** 
   - `email`
   - `profile`
   - `openid`

### Domínio Autorizado
Adicionar domínio de produção:
```
seu-dominio.com
```

---

## ✅ Checklist de Verificação

- [ ] Google+ API ativada
- [ ] OAuth Client ID criado
- [ ] Authorized JavaScript origins configuradas
- [ ] Authorized redirect URIs configuradas
- [ ] Client ID copiado para Supabase
- [ ] Client Secret copiado para Supabase
- [ ] Google Provider habilitado no Supabase
- [ ] Site URL configurada no Supabase
- [ ] Redirect URLs configuradas no Supabase
- [ ] Testado login com email/password (✅ já funciona)
- [ ] Testado login com Google
- [ ] Logs do console verificados
- [ ] Callback redirecionando corretamente
- [ ] Perfil sendo criado automaticamente

---

## 📝 URLs de Referência

- **Google Console:** https://console.cloud.google.com/
- **Supabase Dashboard:** https://supabase.com/dashboard/project/iwscxotvmtkphajmasof
- **Teste Auth:** http://localhost:3002/test-auth
- **Login:** http://localhost:3002/login

---

## 🆘 Suporte

Se ainda houver problemas:

1. **Verificar logs detalhados:**
   - Console do navegador (F12)
   - Terminal do servidor (npm run dev)
   - Supabase Dashboard → Logs

2. **Testar passo a passo:**
   ```bash
   # 1. Teste direto com Supabase
   node scripts/diagnose-auth.js
   
   # 2. Teste na página de debug
   http://localhost:3002/test-auth
   
   # 3. Teste login normal
   http://localhost:3002/login
   ```

3. **Limpar cache e cookies:**
   - Ctrl+Shift+Delete
   - Limpar tudo
   - Tentar novamente

---

**✅ Após configurar tudo, o login com Google deve funcionar perfeitamente!**

