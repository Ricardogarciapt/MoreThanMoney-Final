# 🏷️ Alterar Nome no Login do Google

## 📍 Problema Atual

Na tela de login do Google aparece:
```
Selecione uma conta para continuar para iwscxotvmtkphajmasof.supabase.co
```

## ✅ Solução

Alterar para:
```
Selecione uma conta para continuar para MoreThanMoney
```

---

## 🚀 Passos Rápidos (2 minutos)

### **1. Aceder ao Google Cloud Console**

🔗 **Link Direto:** https://console.cloud.google.com/apis/credentials/consent

(Selecione o projeto correto no topo)

---

### **2. Editar OAuth Consent Screen**

1. Clicar em **"EDIT APP"** (botão no topo da página)

---

### **3. Alterar App Name**

Na secção **"App information"**:

```
App name *
┌─────────────────────────────────┐
│ MoreThanMoney                   │
└─────────────────────────────────┘

User support email *
┌─────────────────────────────────┐
│ ricardo.subtilgarcia@gmail.com  │
└─────────────────────────────────┘
```

---

### **4. (Opcional) Adicionar Logo**

- **Tamanho:** 120x120 pixels
- **Formato:** PNG ou JPG
- Pode usar o logo do site MoreThanMoney

---

### **5. Salvar**

1. Scroll até o final
2. Clicar em **"SAVE AND CONTINUE"**
3. Clicar **"SAVE AND CONTINUE"** nas próximas telas (Scopes, Test users)
4. Clicar **"BACK TO DASHBOARD"** na última tela

---

## 🧪 Testar

1. **Aguardar 1-2 minutos** (propagação)
2. Abrir **janela anónima**
3. Ir para: http://localhost:3000/login
4. Clicar em "Continuar com Google"
5. ✅ Deve aparecer: **"Selecione uma conta para continuar para MoreThanMoney"**

---

## 📋 Configurações Completas

### **Mínimo (Obrigatório):**
- ✅ App name: `MoreThanMoney`
- ✅ User support email: `ricardo.subtilgarcia@gmail.com`
- ✅ Developer contact email: `ricardo.subtilgarcia@gmail.com`

### **Recomendado:**
- App logo: 120x120px PNG
- Application home page: Seu domínio (quando tiver)
- Privacy policy: Link para `/privacy-policy`
- Terms of service: Link para `/terms`

---

## 🔗 Links Úteis

| Item | URL |
|------|-----|
| **Google Cloud Console** | https://console.cloud.google.com/ |
| **OAuth Consent Screen** | https://console.cloud.google.com/apis/credentials/consent |
| **Credentials** | https://console.cloud.google.com/apis/credentials |

---

## 💡 Dicas

### **Para Produção (Futuro):**
1. Publicar app (botão "PUBLISH APP")
2. Adicionar domínio verificado
3. Completar privacy policy e terms
4. Se muitos utilizadores, Google pode pedir verificação

### **Logo:**
- Use a logo do MoreThanMoney em 120x120px
- Aparecerá na tela de login do Google
- Aumenta profissionalismo e confiança

---

**🎊 APÓS ALTERAR, O NOME "MoreThanMoney" APARECERÁ NO LOGIN! 🎊**

