# 🔴 CORRIGIR ERRO: redirect_uri_mismatch

## ❌ Erro Atual:
```
Acesso bloqueado: o pedido da app MTM Site é inválido
Erro 400: redirect_uri_mismatch
```

## ✅ SOLUÇÃO RÁPIDA (5 minutos)

---

### **PASSO 1: Aceder ao Google Cloud Console**

1. Abra: https://console.cloud.google.com/
2. Faça login com: **ricardo.subtilgarcia@gmail.com**
3. Selecione o projeto **MTM Site** (ou o nome que deu)

---

### **PASSO 2: Ir para Credenciais**

1. No menu lateral (☰), vá para:
   ```
   APIs & Services → Credentials
   ```

2. Encontre o **OAuth 2.0 Client ID** que criou
   - Provavelmente tem um nome como "Web client" ou "MTM Site"

3. **CLIQUE** nele para editar

---

### **PASSO 3: Adicionar URLs de Callback CORRETAS**

Na secção **"Authorized redirect URIs"**, adicione **EXATAMENTE** estas URLs:

```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
http://localhost:3000/auth/callback
```

#### **📸 Deve ficar assim:**
```
Authorized redirect URIs:
┌─────────────────────────────────────────────────────────────┐
│ https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback │
│ http://localhost:3000/auth/callback                        │
└─────────────────────────────────────────────────────────────┘
```

---

### **PASSO 4: Adicionar JavaScript Origins**

Na secção **"Authorized JavaScript origins"**, adicione:

```
https://iwscxotvmtkphajmasof.supabase.co
http://localhost:3000
```

#### **📸 Deve ficar assim:**
```
Authorized JavaScript origins:
┌──────────────────────────────────────────────────┐
│ https://iwscxotvmtkphajmasof.supabase.co        │
│ http://localhost:3000                            │
└──────────────────────────────────────────────────┘
```

---

### **PASSO 5: SALVAR**

1. Clique no botão **"SAVE"** (no fundo da página)
2. Aguarde a mensagem de confirmação

---

### **PASSO 6: Verificar no Supabase**

1. Aceda ao Supabase Dashboard: https://app.supabase.com/
2. Selecione o projeto **MoreThanMoney**
3. Vá para: **Authentication → Providers**
4. Encontre **Google** e verifique se está **ATIVADO** (toggle verde)

#### **Deve ter:**
```
✅ Enable Sign in with Google: ON

Client ID: [seu client ID do Google]
Client Secret: [seu client secret do Google]

Callback URL (for Google):
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

5. Se não estiver configurado, adicione o **Client ID** e **Client Secret** do Google
6. Clique em **SAVE**

---

### **PASSO 7: Testar Novamente**

1. Abra uma **janela anónima/incógnita** no browser (Ctrl+Shift+N ou Cmd+Shift+N)

2. Vá para: http://localhost:3000/login

3. Clique em **"Continuar com Google"**

4. Selecione a conta **ricardo.subtilgarcia@gmail.com**

5. ✅ Deve funcionar agora!

---

## 🔍 CHECKLIST DE VERIFICAÇÃO

Antes de testar, confirme:

- [ ] Google Cloud Console:
  - [ ] Redirect URI: `https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback` ✅
  - [ ] Redirect URI: `http://localhost:3000/auth/callback` ✅
  - [ ] JavaScript origin: `https://iwscxotvmtkphajmasof.supabase.co` ✅
  - [ ] JavaScript origin: `http://localhost:3000` ✅
  - [ ] Botão "SAVE" clicado ✅

- [ ] Supabase Dashboard:
  - [ ] Google Provider ativado ✅
  - [ ] Client ID preenchido ✅
  - [ ] Client Secret preenchido ✅
  - [ ] Botão "SAVE" clicado ✅

- [ ] Teste:
  - [ ] Janela anónima aberta ✅
  - [ ] URL: http://localhost:3000/login ✅
  - [ ] Clique em "Continuar com Google" ✅
  - [ ] Login bem-sucedido ✅

---

## 🎯 URLs IMPORTANTES (COPIE E COLE)

### **Para Google Cloud Console:**

**Authorized redirect URIs:**
```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
http://localhost:3000/auth/callback
```

**Authorized JavaScript origins:**
```
https://iwscxotvmtkphajmasof.supabase.co
http://localhost:3000
```

### **Para Supabase Dashboard:**

**Callback URL:**
```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```

---

## 🔧 TROUBLESHOOTING

### **Ainda dá erro 400?**

1. **Limpe o cache do browser:**
   - Chrome/Edge: Ctrl+Shift+Delete → Limpar cache
   - Safari: Cmd+Option+E

2. **Verifique se as URLs estão EXATAMENTE iguais:**
   - Sem espaços no início ou fim
   - Com `https://` (não `http://`)
   - Com `/auth/v1/callback` no fim

3. **Aguarde 1-2 minutos:**
   - As alterações no Google Cloud podem demorar a propagar

4. **Tente em janela anónima:**
   - Evita problemas de cache/sessão

### **Erro: "Não consegue iniciar sessão"?**

- Verifique se adicionou o email como **Test User** no OAuth Consent Screen
- Ou publique o app (botão "PUBLISH APP" no OAuth Consent Screen)

### **Login funciona mas não cria perfil?**

- Execute o SQL: `CONFIGURAR_GOOGLE_OAUTH_SQL.sql` no Supabase
- Ou execute via terminal:
  ```bash
  psql -h db.iwscxotvmtkphajmasof.supabase.co -U postgres -d postgres -f CONFIGURAR_GOOGLE_OAUTH_SQL.sql
  ```

---

## 📞 SUPORTE

Se ainda tiver problemas:

1. Tire um **screenshot** das configurações no Google Cloud Console
2. Tire um **screenshot** das configurações no Supabase
3. Envie para análise

---

**🎊 APÓS SEGUIR ESTES PASSOS, O LOGIN COM GOOGLE DEVE FUNCIONAR! 🎊**

