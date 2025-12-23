# 🧪 Testar Push Notifications - Guia Rápido

## ✅ **JÁ CONFIGURADO:**
- ✅ Firebase projeto criado
- ✅ Credenciais no `env.local`
- ✅ Service Worker configurado
- ✅ Código implementado
- ✅ Sistema completo funcional

---

## 🔄 **FALTA FAZER (5 minutos):**

### 1️⃣ Executar SQL no Supabase (OBRIGATÓRIO)

**Passo a passo:**
1. Vai a: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql
2. Clica em "New query"
3. **Cola o conteúdo de:** `scripts/setup-push-notifications.sql`
4. Clica em "Run" ou pressiona `Cmd+Enter`
5. Verifica se aparece: `✅ Tabelas de Push Notifications criadas!`

**Repete para:**
- `scripts/setup-storage-bucket.sql` (para social feed com imagens)

---

### 2️⃣ Teste Local (AGORA!)

```bash
# Terminal 1: Servidor local
npm run dev

# Abrir no browser:
http://localhost:3001/app-mobile
```

**No app-mobile:**
1. Clica em Settings (⚙️) no topo direito
2. Scroll até "Notificações Push"
3. Clica em "Ativar"
4. Browser vai pedir permissão → Clica em "Permitir"
5. **Abre DevTools (F12)** → Tab "Console"

**Logs esperados:**
```
🔔 [FCM] Solicitando permissão para notificações...
✅ [FCM] Permissão concedida!
🔑 [FCM] Obtendo token FCM...
✅ [FCM] Token obtido: ey...
💾 [FCM] Salvando token no Supabase...
✅ [FCM] Token salvo com sucesso!
```

**Se aparecerem todos os ✅ → FUNCIONOU! 🎉**

---

### 3️⃣ Enviar Notificação de Teste

**Terminal 2** (deixa o servidor rodando no Terminal 1):

```bash
# Obter teu User ID do Supabase
# Vai a: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/users
# Copia o UUID do teu utilizador

# Enviar teste
curl -X POST http://localhost:3001/api/notifications/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "COLA_TEU_USER_ID_AQUI",
    "title": "🧪 Teste Local",
    "body": "Se vês isto, push notifications funcionam!",
    "url": "/app-mobile"
  }'
```

**Resultado esperado:**
- Notificação aparece no browser
- Toast elegante no canto superior direito
- Ao clicar, redireciona para `/app-mobile`

---

### 4️⃣ Testar Notificação em Background

1. **Minimiza** o browser (ou muda de tab)
2. Envia outra notificação (mesmo comando curl acima)
3. **Notificação do sistema operativo** deve aparecer
4. Clica nela → Browser abre na página

---

## 🚀 **Adicionar na Vercel (Para Produção)**

Vai a: https://vercel.com/ricardogarciapt/site-morethanmoney-final/settings/environment-variables

**Adiciona estas 9 variáveis:**

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCUcYfGrV3QV-3MkEjxqwF0qqXdTK3OFjE
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mtm-push-notifications-fdbf1.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=mtm-push-notifications-fdbf1
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mtm-push-notifications-fdbf1.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=978304341617
NEXT_PUBLIC_FIREBASE_APP_ID=1:978304341617:web:a4e7c9d02f5a6b8d1e2f3c
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BDLNFba6Dstb05ihDbG7mf5YE7Jx2EXFY-73Z1y-N_23__Elp0QFDbMnMpFgAmYzxwn7U0mhYxkURhpnDUGXpd8
```

**A linha MAIS IMPORTANTE (Service Account):**
```bash
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"mtm-push-notifications-fdbf1","private_key_id":"6d82f3638b097e610958bb9d1478fa916ec9387e","private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDDGu5pTGKJ7+xU\nzx9dAPHZPufZBVjDT7niRE+7KN/7bxP1kZwndVOfwvq8VXeFKDWOs3jlAypWj4XD\nID/DSNQmCx37+dTvTcMJKMaT0KUG6we05xfZOUtPJ7oHOR39KsgDK+4QTMMRhJXV\ndpOOaX+zrTDxg+vZ0JMqQhVD81lYr3vcign+wV8lNtUklKtF4/RHt+PtwkaJxZ29\nZ6o3EGPgd2Qa+QQaJhJbjJLURr5GdmiGV/rn9ZEK+ZG5FQZLDmFkSWoYbioifoO3\nI49yC/y2vctxtH1W7MJz1IZCvaa6n9ga5NrH0sskjzkbYg6tHgSWCtVAGRf2BO5u\nv7+4E6LvAgMBAAECggEAHQoUozqZzhMWV3cuoV6jIKUyyAP6NrPWpH1rap2GXPum\n+l2OYvcdF8HjJQYJkJmwAwnmfBuxAQpCrAzQQMZFwVXVRCxmy6mE1oepqtWawoFX\n986Pp6bV9TWiBDI1qvljpMk0mVt7i09zJ78K7l74gWtNRh1PDO/0/4yvcpo1WbQe\nSpb8CoWbhnboc/sjcC5xrZ3Qne8xPusB2Nbb1sF1ZwvVAaREiDPNhtcHxKR+2zGa\nx5vo/M3ahP7mHuvrX2PlcfXVy/REFg1iHi4PMA6ZKRzNxwIMMHvgnbaXpG74xPvC\n8HZw3aQPUXahzczZ4BJ6xs5ME/gSBfx6+O6jrUFcNQKBgQDl+y1MjUQL2W1Kb+G/\ntYDMBKA9f7s86hqT1y09aEEfLaKlc+e223iE5DJELfc7Z3Kn0u8VA1KtwvJZVEj6\nZsOgDWm29nxHMlBWKoejlABluSQF2eWNWGKy+GplXXfk6K5T0szPu8uA2cFdlSBi\nCTZOMwRm1fn3Zdn088JRjaWWwwKBgQDZLakKuDAS9M1jhqn8cZ51vyz0UPrlFrf/\nE9yVeGsx14cMD5QL2EbrE20VCfQJaFbG+xCYt1RlUAxIShRNamgMVhDmqzbKMdFz\nzbdtyWWJUy8rn2XFekrjSMiqDDCV9DRc7CMVWIGdrs8wX8CI4mjkDrn8Fl9Eue+B\ni9lXcOG4ZQKBgElXhOa41k6BFF18uJ2OoHhvsTprlaajcb5cDM1chggPYaMqB2dF\nLnYS4ATmM8X6A5KJrj0hRiir1uWt/2f7hb9xB5mVmaSK4xvXjFIaTNYj6N0E1DPz\nT+aLWkLhP+78VTveKfrFhOyehQ/3EtCw52Sg2HKDIqhHDu8THZEsfvZJAoGBAK1P\nVcW7JIoMF1dkIITW+rhGHo69jOqCTcTdybryBMEamKeUSvWE21s+/l66uadEP3O8\n6QqlylCrJ5IMo9T/pBasHAKoASorxVTfhpCzFjcXTd5G7oU/yUFFVPT2k1MnNR4u\nRvUC0zTNSoP09YWHAGN2KQ81n0MOCkZcHs47w7VNAoGAS5lt1sw80YdpWnNM7N1u\nK9TuHkGNYAH+Ape9bsrSr2TGYdhzrBNDPcly1x/X9RdmuklMVAu4b8lwerznmwWD\ntbED3jhCQwHj2+hk/Ugu1fexJ1/fpkJWB6ifY5f0y/EFjnxe6kq76FuK4O6d+5i+\n3h7Keo9YPTZyP10JXtVHPVc=\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-fbsvc@mtm-push-notifications-fdbf1.iam.gserviceaccount.com","client_id":"102725003795186937427","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40mtm-push-notifications-fdbf1.iam.gserviceaccount.com","universe_domain":"googleapis.com"}
```

⚠️ **IMPORTANTE:** O `FIREBASE_SERVICE_ACCOUNT_KEY` DEVE estar em UMA ÚNICA LINHA (sem Enter). Copia exatamente como está acima.

Depois de adicionar:
1. Marca **Production**, **Preview** e **Development**
2. Clica em "Save"
3. Vercel vai fazer **redeploy automático**

---

## 🐛 **Troubleshooting**

### ❌ "Erro ao salvar token"
- Verifica se executaste o SQL no Supabase
- Vai a: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/editor
- Executa: `SELECT * FROM fcm_tokens LIMIT 5;`
- Se der erro "relation does not exist" → executa `setup-push-notifications.sql`

### ❌ "Permission denied"
- Usuário bloqueou notificações no browser
- Chrome: `chrome://settings/content/notifications`
- Remove o site da lista de bloqueados

### ❌ "VAPID key not configured"
- Verifica se a variável `NEXT_PUBLIC_FIREBASE_VAPID_KEY` está no env.local
- Reinicia o servidor: `Ctrl+C` e `npm run dev`

---

## ✅ **Checklist Final**

Antes de deploy para produção:

- [ ] SQL executado no Supabase
- [ ] Teste local funcionando
- [ ] Notificação recebida e clicada
- [ ] Variáveis adicionadas na Vercel
- [ ] Redeploy feito
- [ ] Teste em produção (https://morethanmoney.pt/app-mobile)

---

**AGORA:** Executa o SQL no Supabase e testa localmente! 🚀

