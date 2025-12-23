# 🔔 Sistema de Push Notifications - Guia Completo

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Configuração do Firebase](#configuração-do-firebase)
3. [Configuração do Supabase](#configuração-do-supabase)
4. [Variáveis de Ambiente](#variáveis-de-ambiente)
5. [Como Usar](#como-usar)
6. [Eventos Automatizados](#eventos-automatizados)
7. [Testes](#testes)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Sistema completo de Push Notifications usando:
- **Firebase Cloud Messaging (FCM)** - Para envio de notificações
- **Supabase** - Para armazenar tokens e histórico
- **Service Worker** - Para receber notificações em background
- **React Hooks** - Para gerenciar estado e permissões

### ✨ Funcionalidades

- ✅ Notificações push em tempo real
- ✅ Suporte a notificações em foreground e background
- ✅ Histórico de notificações
- ✅ Múltiplos dispositivos por usuário
- ✅ Notificações automatizadas para eventos do sistema
- ✅ Interface de gerenciamento no app-mobile
- ✅ Deep links para navegar ao clicar
- ✅ Toasts elegantes com Sonner

---

## 🔥 Configuração do Firebase

### Passo 1: Criar Projeto no Firebase

1. Acede a https://console.firebase.google.com
2. Clica em **"Add project"** ou **"Adicionar projeto"**
3. Nome: `MTM Push Notifications` (ou outro nome)
4. Desativa Google Analytics (opcional)
5. Clica em **"Create project"**

### Passo 2: Adicionar Web App

1. No dashboard do projeto, clica no ícone **Web (</>) **
2. Nome do app: `MTM Web`
3. **NÃO** marcar "Firebase Hosting"
4. Clica em **"Register app"**
5. **COPIA** as credenciais que aparecem:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-ABC123"
}
```

### Passo 3: Ativar Cloud Messaging

1. No menu lateral, vai a **"Build" → "Cloud Messaging"**
2. Clica em **"Get started"** ou **"Começar"**
3. Aceita os termos
4. Vai a **"Cloud Messaging API (Legacy)"**
5. **ATIVA** a API se pedido

### Passo 4: Obter VAPID Key

1. Ainda em Cloud Messaging
2. Tab **"Web configuration"** ou **"Configuração da Web"**
3. Em **"Web Push certificates"**
4. Clica em **"Generate key pair"** ou **"Gerar par de chaves"**
5. **COPIA** a chave que aparece (começa com `B...`)

### Passo 5: Obter Service Account Key (Para Server)

1. No menu lateral, vai a **"Project Settings" → "Service accounts"**
2. Clica em **"Generate new private key"** ou **"Gerar nova chave privada"**
3. Confirma clicando em **"Generate key"**
4. Um arquivo `.json` será baixado
5. **COPIA TODO O CONTEÚDO** desse arquivo JSON

---

## 🗄️ Configuração do Supabase

### Executar SQL Script

1. Acede a https://supabase.com/dashboard
2. Seleciona teu projeto
3. Vai a **"SQL Editor"**
4. Clica em **"New query"**
5. Cola o conteúdo de `scripts/setup-push-notifications.sql`
6. Clica em **"Run"** ou pressiona `Cmd+Enter`

**Esperado:**
```
✅ Tabelas de Push Notifications criadas!
✅ Políticas RLS ativas!
```

### Verificar Tabelas Criadas

Execute no SQL Editor:

```sql
SELECT * FROM fcm_tokens LIMIT 5;
SELECT * FROM notification_history LIMIT 5;
```

Se der erro "relation does not exist", volta ao passo anterior.

---

## 🔐 Variáveis de Ambiente

### 1. Firebase Config (Client-Side)

Adiciona estas variáveis no `.env.local` e **Vercel**:

```bash
# Firebase Client Config
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-ABC123

# VAPID Key (Web Push Certificate)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BHd5...
```

### 2. Firebase Admin (Server-Side)

Adiciona no `.env.local` e **Vercel**:

```bash
# Service Account Key (TODO o conteúdo do JSON em UMA LINHA)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

**IMPORTANTE:** O JSON deve estar em UMA ÚNICA LINHA, sem quebras.

### 3. Atualizar Service Worker

Edita `public/firebase-messaging-sw.js`:

Substitui:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  // ...
}
```

Por:
```javascript
const firebaseConfig = {
  apiKey: "AIza...", // Teu API Key real
  authDomain: "your-project.firebaseapp.com", // Teu Auth Domain real
  projectId: "your-project-id", // Teu Project ID real
  // ... resto das configs
}
```

---

## 🚀 Como Usar

### 1. No App-Mobile

```typescript
// O componente PushNotificationsManager já está integrado
// Aparece nas configurações do perfil do usuário

// Usuário clica em "Ativar" → Solicita permissão → Salva token
```

### 2. Enviar Notificação Manualmente

```typescript
import { sendPushNotification } from '@/lib/push-notification-helpers'

// Para um usuário específico
await sendPushNotification({
  userId: 'uuid-do-usuario',
  title: 'Teste de Notificação',
  body: 'Esta é uma notificação de teste!',
  url: '/app-mobile'
})

// Para múltiplos usuários
await sendPushNotification({
  userIds: ['uuid-1', 'uuid-2', 'uuid-3'],
  title: 'Alerta para VIPs',
  body: 'Nova oportunidade disponível!'
})

// Para TODOS os usuários
await sendPushNotification({
  all: true,
  title: 'Manutenção Programada',
  body: 'O sistema ficará offline amanhã às 3h'
})
```

### 3. Via API (cURL)

```bash
curl -X POST https://morethanmoney.pt/api/notifications/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "uuid-do-usuario",
    "title": "Teste",
    "body": "Mensagem de teste",
    "url": "/app-mobile"
  }'
```

---

## 🤖 Eventos Automatizados

O sistema já está preparado para enviar notificações automaticamente nos seguintes eventos:

### 1. Post Liked (Social Feed)

```typescript
import { notifyPostLiked } from '@/lib/push-notification-helpers'

// Quando alguém dá like
await notifyPostLiked(postAuthorId, likerName)
```

### 2. Post Commented

```typescript
import { notifyPostCommented } from '@/lib/push-notification-helpers'

// Quando alguém comenta
await notifyPostCommented(postAuthorId, commenterName, commentText)
```

### 3. DCA Opportunity (Forte Compra)

```typescript
import { notifyDCAOpportunity } from '@/lib/push-notification-helpers'

// Quando detectar forte compra
const vipUserIds = await getVIPUsers()
await notifyDCAOpportunity(vipUserIds, 'BTCUSDT', 15.5)
```

### 4. Take Profit / Stop Loss

```typescript
import { notifyTakeProfitHit, notifyStopLossHit } from '@/lib/push-notification-helpers'

// Quando TP é atingido
await notifyTakeProfitHit(userId, 'ETHUSDT', 2500, 2450)

// Quando SL é atingido
await notifyStopLossHit(userId, 'ETHUSDT', 2200, 2250)
```

### 5. Nova Trading Idea

```typescript
import { notifyNewTradingIdea } from '@/lib/push-notification-helpers'

// Quando admin publica nova ideia
await notifyNewTradingIdea('BTCUSDT', 'BUY', 'Rompimento de resistência em $45k')
```

### 6. Novo Post de VIP/Admin

```typescript
import { notifyNewVIPPost } from '@/lib/push-notification-helpers'

// Quando VIP/Admin posta
if (user.user_type === 'admin' || user.member_category === 'vip') {
  await notifyNewVIPPost(user.full_name, postContent)
}
```

### 7. Boas-Vindas

```typescript
import { notifyWelcome } from '@/lib/push-notification-helpers'

// Quando novo usuário se registra
await notifyWelcome(newUser.id, newUser.full_name)
```

---

## 🧪 Testes

### Teste Local (Development)

1. Abre https://localhost:3001/app-mobile
2. Vai a Configurações → Perfil
3. Ativa "Notificações Push"
4. Permite notificações no browser
5. Abre o DevTools Console (F12)
6. Verifica logs:
```
✅ [FCM] Permissão concedida!
✅ [FCM] Token obtido: ey...
✅ [FCM] Token salvo com sucesso!
```

### Enviar Notificação de Teste

No terminal:

```bash
curl -X POST http://localhost:3001/api/notifications/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "SEU_USER_ID",
    "title": "🧪 Teste Local",
    "body": "Se vês isto, está a funcionar!",
    "url": "/app-mobile"
  }'
```

Substitui `SEU_USER_ID` pelo teu UUID do Supabase.

### Teste em Produção

1. Faz deploy na Vercel
2. Acede a https://morethanmoney.pt/app-mobile
3. Ativa notificações
4. Envia teste via cURL ou outro dispositivo

---

## 🐛 Troubleshooting

### ❌ "Notificações push não suportadas neste browser"

**Solução:** Usa Chrome, Firefox, Edge ou Safari 16+. **NÃO** funciona em:
- Safari < 16
- iOS Safari (ainda sem suporte completo)
- Browsers privados/incognito

### ❌ "Erro ao fazer upload: Bucket 'uploads' not found"

**Causa:** Bucket não existe no Supabase Storage  
**Solução:** Vai a `scripts/setup-storage-bucket.sql` e executa no Supabase

### ❌ "Firebase Admin não inicializado"

**Causa:** `FIREBASE_SERVICE_ACCOUNT_KEY` não configurada  
**Solução:**
1. Verifica se a variável existe na Vercel
2. Certifica-te que está em UMA LINHA (sem `\n` visíveis)
3. Redeploy na Vercel

### ❌ "Permissão negada pelo utilizador"

**Causa:** Usuário bloqueou notificações  
**Solução:** Usuário precisa ir nas configurações do browser:
- Chrome: `chrome://settings/content/notifications`
- Firefox: `about:preferences#privacy` → Notificações
- Remover o site da lista de bloqueados

### ❌ Service Worker não carrega

**Causa:** Caminho errado ou HTTPS necessário  
**Solução:**
- Verifica se `public/firebase-messaging-sw.js` existe
- Em produção, **HTTPS é obrigatório**
- Em development, `localhost` funciona

### ❌ Notificações não chegam

**Debug:**
1. Verifica logs do browser (DevTools Console)
2. Verifica se token foi salvo no Supabase:
```sql
SELECT * FROM fcm_tokens WHERE user_id = 'SEU_USER_ID';
```
3. Verifica logs da Vercel (Functions)
4. Testa manualmente via cURL

---

## 📊 Monitoramento

### Ver Tokens Ativos

```sql
SELECT 
  u.email,
  COUNT(t.id) as total_devices,
  MAX(t.last_used_at) as last_active
FROM fcm_tokens t
JOIN auth.users u ON u.id = t.user_id
GROUP BY u.email
ORDER BY last_active DESC;
```

### Ver Histórico de Notificações

```sql
SELECT 
  nh.title,
  nh.body,
  nh.status,
  nh.sent_at,
  u.email
FROM notification_history nh
JOIN auth.users u ON u.id = nh.user_id
WHERE nh.sent_at > NOW() - INTERVAL '7 days'
ORDER BY nh.sent_at DESC
LIMIT 50;
```

### Limpar Tokens Antigos

```sql
SELECT clean_old_fcm_tokens();
```

Remove tokens não usados há mais de 90 dias.

---

## ✅ Checklist de Produção

Antes de fazer deploy:

- [ ] Firebase projeto criado
- [ ] VAPID Key obtida
- [ ] Service Account Key baixada
- [ ] `firebase-messaging-sw.js` atualizado com credenciais reais
- [ ] SQL executado no Supabase
- [ ] Variáveis de ambiente configuradas na Vercel
- [ ] Teste local realizado
- [ ] Deploy na Vercel
- [ ] Teste em produção realizado

---

## 📚 Recursos

- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [Service Workers MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Notification API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)

---

**Última atualização:** 11 Out 2025  
**Versão:** 1.0.0  
**Status:** 🟢 Production Ready

