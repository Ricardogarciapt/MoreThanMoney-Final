# 🔐 Configurar Google OAuth no Supabase

## 📋 Passo a Passo Completo

### **1️⃣ Criar Projeto no Google Cloud Console**

1. Aceda a: https://console.cloud.google.com/
2. Clique em **"Select a project"** → **"NEW PROJECT"**
3. Nome do projeto: `MoreThanMoney Auth`
4. Clique em **"CREATE"**

---

### **2️⃣ Configurar OAuth Consent Screen**

1. No menu lateral, vá para **"APIs & Services"** → **"OAuth consent screen"**
2. Selecione **"External"** (para permitir qualquer utilizador Google)
3. Clique em **"CREATE"**

#### **Informações da Aplicação:**
```
App name: MoreThanMoney
User support email: ricardogarciapt@proton.me (ou seu email)
Developer contact email: ricardogarciapt@proton.me
```

4. Clique em **"SAVE AND CONTINUE"**
5. Em **"Scopes"**, clique em **"ADD OR REMOVE SCOPES"**
6. Selecione:
   - `userinfo.email`
   - `userinfo.profile`
   - `openid`
7. Clique em **"UPDATE"** → **"SAVE AND CONTINUE"**
8. Em **"Test users"** (opcional), adicione emails de teste
9. Clique em **"SAVE AND CONTINUE"**
10. Revise e clique em **"BACK TO DASHBOARD"**

---

### **3️⃣ Criar Credenciais OAuth 2.0**

1. No menu lateral, vá para **"APIs & Services"** → **"Credentials"**
2. Clique em **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Selecione **"Web application"**

#### **Configurações:**
```
Name: MoreThanMoney Web Client

Authorized JavaScript origins:
- http://localhost:3000
- https://seu-dominio-producao.com (quando tiver)

Authorized redirect URIs:
- http://localhost:3000/auth/callback
- https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
- https://seu-dominio-producao.com/auth/callback (quando tiver)
```

4. Clique em **"CREATE"**
5. **COPIE** o **Client ID** e **Client Secret** que aparecem

---

### **4️⃣ Configurar no Supabase Dashboard**

1. Aceda ao Supabase Dashboard: https://app.supabase.com/
2. Selecione o projeto: **MoreThanMoney**
3. No menu lateral, vá para **"Authentication"** → **"Providers"**
4. Encontre **"Google"** e clique para expandir
5. **Ative** o toggle "Enable Sign in with Google"

#### **Cole as credenciais:**
```
Client ID: [Cole o Client ID do Google Cloud]
Client Secret: [Cole o Client Secret do Google Cloud]
```

6. **Copie** a URL de callback do Supabase que aparece:
   ```
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```

7. Clique em **"SAVE"**

---

### **5️⃣ Adicionar Callback URL ao Google Cloud**

1. Volte ao **Google Cloud Console** → **"Credentials"**
2. Clique no **OAuth 2.0 Client ID** que criou
3. Em **"Authorized redirect URIs"**, adicione:
   ```
   https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
   ```
4. Clique em **"SAVE"**

---

### **6️⃣ Testar a Integração**

#### **Desenvolvimento Local:**
1. Certifique-se de que o servidor está a correr:
   ```bash
   npm run dev
   ```

2. Aceda a: http://localhost:3000/login

3. Clique no botão **"Continuar com Google"**

4. Selecione uma conta Google

5. Deve ser redirecionado para `/auth/callback` e depois para a página inicial

#### **Verificar no Supabase:**
1. Vá para **"Authentication"** → **"Users"**
2. Deve ver o novo utilizador criado via Google OAuth
3. Verifique que o perfil foi criado na tabela `profiles`

---

### **7️⃣ Publicar para Produção (Opcional)**

Quando tiver um domínio de produção:

#### **No Google Cloud Console:**
1. Adicione as URLs de produção:
   ```
   Authorized JavaScript origins:
   - https://seu-dominio.com

   Authorized redirect URIs:
   - https://seu-dominio.com/auth/callback
   ```

#### **No Supabase:**
1. Vá para **"Authentication"** → **"URL Configuration"**
2. Adicione o domínio de produção em **"Site URL"**
3. Adicione em **"Redirect URLs"**:
   ```
   https://seu-dominio.com/auth/callback
   ```

#### **Publicar OAuth Consent Screen:**
1. No Google Cloud Console, vá para **"OAuth consent screen"**
2. Clique em **"PUBLISH APP"**
3. Isso permite que qualquer utilizador Google faça login (não apenas test users)

---

## ✅ Checklist de Verificação

- [ ] Projeto criado no Google Cloud Console
- [ ] OAuth Consent Screen configurado
- [ ] OAuth 2.0 Client ID criado
- [ ] Client ID e Secret copiados
- [ ] Google Provider ativado no Supabase
- [ ] Credenciais coladas no Supabase
- [ ] Callback URL do Supabase adicionada ao Google Cloud
- [ ] Teste realizado com sucesso em localhost
- [ ] Utilizador aparece no Supabase Auth
- [ ] Perfil criado na tabela `profiles`

---

## 🔧 Troubleshooting

### **Erro: "redirect_uri_mismatch"**
- Verifique se a URL de callback está EXATAMENTE igual no Google Cloud e no Supabase
- Certifique-se de que não há espaços ou caracteres extras

### **Erro: "Access blocked: This app's request is invalid"**
- Verifique se o OAuth Consent Screen está configurado
- Adicione seu email como test user se ainda não publicou o app

### **Utilizador criado mas sem perfil**
- Verifique se o SQL `EXECUTAR_ESTE_SQL.sql` foi executado
- Verifique se a função `handleOAuthCallback` está a funcionar
- Veja os logs do console no browser (F12)

### **Não redireciona após login**
- Verifique se a página `/auth/callback` existe
- Veja os logs do console para erros
- Verifique se o `redirect` query param está correto

---

## 📚 Recursos Úteis

- **Google Cloud Console**: https://console.cloud.google.com/
- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth/social-login/auth-google
- **OAuth 2.0 Playground**: https://developers.google.com/oauthplayground/

---

## 🎯 Próximos Passos

Após configurar o Google OAuth:

1. ✅ Testar login com Google em localhost
2. ✅ Verificar criação automática de perfil
3. ✅ Testar em diferentes browsers
4. ✅ Adicionar outros providers (Facebook, GitHub, etc.) se necessário
5. ✅ Configurar URLs de produção quando deploy for feito

---

**🎊 CONFIGURAÇÃO COMPLETA! O LOGIN COM GOOGLE ESTÁ PRONTO! 🎊**
