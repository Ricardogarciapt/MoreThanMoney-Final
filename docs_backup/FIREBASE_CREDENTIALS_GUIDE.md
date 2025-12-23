# 🔥 Como Obter as Credenciais do Firebase

## 📋 Passo a Passo Rápido (5 minutos)

### 1️⃣ Criar Projeto Firebase

1. Acede a: https://console.firebase.google.com
2. Clica em **"Add project"** ou **"Adicionar projeto"**
3. Nome do projeto: `MTM Push Notifications` (ou qualquer nome)
4. **Desativa** Google Analytics (opcional, não é necessário)
5. Clica em **"Create project"**
6. Aguarda a criação (30 segundos)
7. Clica em **"Continue"**

---

### 2️⃣ Adicionar Web App ao Projeto

1. No dashboard do projeto, clica no ícone **Web** `</>`
   - Fica no centro, junto a "Get started by adding Firebase to your app"
2. Registo da app:
   - **App nickname:** `MTM Web App`
   - **NÃO** marcar "Also set up Firebase Hosting"
3. Clica em **"Register app"**

4. **COPIA** o código que aparece. Vai parecer com isto:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...",
  authDomain: "mtm-push-123456.firebaseapp.com",
  projectId: "mtm-push-123456",
  storageBucket: "mtm-push-123456.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
  measurementId: "G-ABCD123456"
};
```

**Guarda estes valores!** Vais precisar deles.

---

### 3️⃣ Ativar Cloud Messaging

1. No menu lateral esquerdo, vai a **"Build"** → **"Cloud Messaging"**
2. Se aparecer "Get started", clica nele
3. Aceita os termos se pedido

**Cloud Messaging está agora ativado! ✅**

---

### 4️⃣ Obter VAPID Key (Web Push Certificate)

1. Ainda na página do Cloud Messaging
2. Clica na aba **"Web configuration"** ou **"Configuração da Web"**
3. Na secção **"Web Push certificates"**
4. Clica em **"Generate key pair"** ou **"Gerar par de chaves"**
5. Uma chave será gerada. **COPIA** a chave.
   - Começa com `B...` e tem cerca de 80 caracteres
   - Exemplo: `BHd5wnJz9hKMxT...`

**Guarda esta VAPID Key!** 🔑

---

### 5️⃣ Obter Service Account Key (Para Server-Side)

1. No menu lateral, clica no ícone de **⚙️ (Settings)** no topo
2. Vai a **"Project settings"** ou **"Configurações do projeto"**
3. Clica na aba **"Service accounts"** ou **"Contas de serviço"**
4. Clica no botão **"Generate new private key"** ou **"Gerar nova chave privada"**
5. Um popup aparece: **"Generate key?"**
   - Clica em **"Generate key"**
6. Um arquivo `.json` será baixado para o teu computador
   - Nome tipo: `mtm-push-123456-firebase-adminsdk-abcde-1234567890.json`

**NÃO PERCAS ESTE ARQUIVO!** 🔒

---

## 📝 Preencher Variáveis de Ambiente

### No `env.local`:

Substitui as linhas 54-64 do `env.local` por:

```bash
# Firebase Client (das configurações do passo 2)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mtm-push-123456.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=mtm-push-123456
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mtm-push-123456.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABCD123456
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BHd5wnJz9hKMxT...

# Firebase Server (do arquivo JSON baixado)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"mtm-push-123456","private_key_id":"1234...","private_key":"-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-abcde@mtm-push-123456.iam.gserviceaccount.com","client_id":"123456789012345678901","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-abcde%40mtm-push-123456.iam.gserviceaccount.com"}
```

### ⚠️ IMPORTANTE: Service Account Key

O `FIREBASE_SERVICE_ACCOUNT_KEY` deve ser **TODO o conteúdo do arquivo JSON em UMA ÚNICA LINHA**.

**Como converter:**
1. Abre o arquivo `.json` baixado no VS Code
2. Copia TODO o conteúdo
3. Remove TODAS as quebras de linha (`\n` deve ficar, mas não pode ter Enter)
4. Cola como valor da variável

**Exemplo do JSON:**
```json
{
  "type": "service_account",
  "project_id": "mtm-push-123456",
  "private_key_id": "1234567890abcdef...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-...@mtm-push-123456.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-..."
}
```

**Vira:**
```bash
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"mtm-push-123456",...}
```

---

## 🔧 Atualizar Service Worker

Depois de teres as credenciais, atualiza o arquivo:
`public/firebase-messaging-sw.js`

Substitui as linhas 9-16 por:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD...", // Teu API Key real
  authDomain: "mtm-push-123456.firebaseapp.com", // Teu Auth Domain real
  projectId: "mtm-push-123456", // Teu Project ID real
  storageBucket: "mtm-push-123456.appspot.com", // Teu Storage Bucket real
  messagingSenderId: "123456789012", // Teu Messaging Sender ID real
  appId: "1:123456789012:web:abcdef123456", // Teu App ID real
  measurementId: "G-ABCD123456" // Teu Measurement ID real
}
```

---

## 🚀 Adicionar na Vercel

1. Vai a: https://vercel.com/your-team/site-morethanmoney-final/settings/environment-variables
2. Adiciona TODAS as variáveis do Firebase:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`
   - `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_KEY`
3. Marca **Production**, **Preview** e **Development**
4. Salva
5. **Redeploy** o site

---

## ✅ Checklist

Antes de testar:

- [ ] Projeto Firebase criado
- [ ] Web App registada
- [ ] Cloud Messaging ativado
- [ ] VAPID Key obtida
- [ ] Service Account JSON baixado
- [ ] `env.local` atualizado com as 9 variáveis
- [ ] `firebase-messaging-sw.js` atualizado
- [ ] Variáveis adicionadas na Vercel
- [ ] Site redeployado

---

## 🧪 Testar Localmente

```bash
# Reiniciar servidor
npm run dev

# Abrir app-mobile
http://localhost:3001/app-mobile

# Ir a Settings → Ativar Notificações Push
# Permitir no browser

# Se aparecer "✅ Token salvo com sucesso!" → Funcionou!
```

---

## 📞 Ajuda

Se tiveres dúvidas:
1. Consulta `PUSH_NOTIFICATIONS_SETUP.md` (guia completo)
2. Verifica logs do console (F12)
3. Confirma que TODAS as 9 variáveis estão preenchidas

---

**Tempo estimado:** 5-10 minutos  
**Dificuldade:** ⭐⭐☆☆☆ (Fácil)

