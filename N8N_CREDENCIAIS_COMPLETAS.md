# 🔐 CREDENCIAIS COMPLETAS PARA N8N - AGENTE CEO MTM

## ✅ VARIÁVEIS DE AMBIENTE ESSENCIAIS

### 🤖 **OpenAI (GPT-4o + DALL-E 3)**
```bash
OPENAI_API_KEY=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
```

---

### 🗄️ **Supabase (Database + Realtime)**
```bash
# URL Base
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co

# Anon/Public Key (para front-end e queries públicos)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NDIzNjMsImV4cCI6MjA2NTIxODM2M30._FbOwT_oVoDWWlWCZphNnwLckL1A0AzkEUSdJZkOecg

# Service Role Key (para operações admin/bypass RLS)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3c2N4b3R2bXRrcGhham1hc29mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTY0MjM2MywiZXhwIjoyMDY1MjE4MzYzfQ.OSFUPZLlx4IaETqqfQPnt-pnYG-hau5NOJ_GHonpuOk

# Database Connection (PostgreSQL direto)
SUPABASE_DB_HOST=db.iwscxotvmtkphajmasof.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=Superacao2022#
```

---

### 🔗 **Webhook Base URL (MoreThanMoney API)**
```bash
# Produção
WEBHOOK_BASE_URL=https://www.morethanmoney.pt/api

# Endpoints Disponíveis:
# - /api/email-marketing/campaigns (POST)
# - /api/email-marketing/tracking/open (GET)
# - /api/email-marketing/tracking/click (GET)
# - /api/notifications/send-push (POST)
# - /api/admin/analytics (GET)
# - /api/admin/notifications (GET/POST)
# - /api/cron/daily-dca-check (POST - CRON)
# - /api/portfolio/mtm (GET)
# - /api/portfolio/dca-smart (GET)

# JWT Secret (para autenticação interna)
JWT_SECRET=morethanmoney_jwt_secret_key_2024_secure

# CRON Secret (proteger endpoints CRON)
CRON_SECRET=morethanmoney_cron_secret_2024
```

---

## 🌐 REDES SOCIAIS (APIs)

### 📷 **Instagram Graph API**
```bash
# PASSO 1: Criar App no Facebook Developers
# https://developers.facebook.com/apps/

# PASSO 2: Obter credenciais
IG_APP_ID=SEU_APP_ID
IG_APP_SECRET=SEU_APP_SECRET
IG_USER_ID=SEU_INSTAGRAM_BUSINESS_ID
IG_ACCESS_TOKEN=SEU_LONG_LIVED_ACCESS_TOKEN

# PASSO 3: Converter para Long-Lived Token (válido 60 dias)
# https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id={IG_APP_ID}&client_secret={IG_APP_SECRET}&fb_exchange_token={SHORT_TOKEN}

# Endpoints N8N:
# - GET: https://graph.instagram.com/v18.0/me/media
# - POST: https://graph.instagram.com/v18.0/me/messages
# - GET: https://graph.instagram.com/v18.0/{media_id}/comments
```

**⚠️ NOTA**: Precisa configurar Instagram Business Account e conectar ao Facebook Page.

---

### 🎵 **TikTok API**
```bash
# PASSO 1: Criar App no TikTok Developers
# https://developers.tiktok.com/

# PASSO 2: Obter credenciais
TIKTOK_CLIENT_KEY=SEU_CLIENT_KEY
TIKTOK_CLIENT_SECRET=SEU_CLIENT_SECRET
TIKTOK_ACCESS_TOKEN=SEU_ACCESS_TOKEN

# Endpoints N8N:
# - GET: https://open.tiktokapis.com/v2/post/publish/
# - POST: https://open.tiktokapis.com/v2/post/publish/creator_info/query/
```

**⚠️ NOTA**: TikTok API tem limitações. Considerar usar bots/automação via Selenium.

---

### 💼 **LinkedIn API**
```bash
# PASSO 1: Criar App no LinkedIn Developers
# https://www.linkedin.com/developers/apps/

# PASSO 2: Obter credenciais
LINKEDIN_CLIENT_ID=SEU_CLIENT_ID
LINKEDIN_CLIENT_SECRET=SEU_CLIENT_SECRET
LINKEDIN_ACCESS_TOKEN=SEU_ACCESS_TOKEN
LINKEDIN_COMPANY_ID=SEU_COMPANY_ID

# Endpoints N8N:
# - GET: https://api.linkedin.com/v2/shares
# - POST: https://api.linkedin.com/v2/ugcPosts
# - GET: https://api.linkedin.com/v2/socialActions/{shareUrn}/comments
```

**⚠️ NOTA**: LinkedIn API requer aprovação para acesso total. Alternativa: Usar LinkedIn Sales Navigator + Phantombuster.

---

## 📧 EMAIL MARKETING

### 📮 **Gmail SMTP (Envio)**
```bash
GMAIL_USER=morethanmoneypt@gmail.com
GMAIL_APP_PASSWORD=adiqjaneivspublx

# Configuração SMTP:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=morethanmoneypt@gmail.com
SMTP_PASSWORD=adiqjaneivspublx
```

---

## 📆 CALENDLY (Agendamentos)

```bash
# PASSO 1: Obter Personal Access Token
# https://calendly.com/integrations/api_webhooks

CALENDLY_API_KEY=SEU_PERSONAL_ACCESS_TOKEN
CALENDLY_USER_URI=https://api.calendly.com/users/SEU_USER_UUID
CALENDLY_WEBHOOK_SECRET=SEU_WEBHOOK_SECRET

# URL do Agendamento (público)
CALENDLY_PUBLIC_URL=https://calendly.com/morethanmoneypt/onboarding-de-novos-membros

# Endpoints N8N:
# - GET: https://api.calendly.com/scheduled_events
# - POST: https://api.calendly.com/webhook_subscriptions (criar webhook)
# - Webhook: https://vmi2877758.contaboserver.net/webhooks/calendly
```

**⚠️ NOTA**: Configurar webhook para receber notificações de novos agendamentos.

---

## 💬 TELEGRAM BOT (Ordens + Notificações)

```bash
TELEGRAM_BOT_TOKEN=7926573487:AAFAbQSWYOOSkLteucaj82Xk_v1xpT-B3ok
TELEGRAM_CHAT_ID=SEU_CHAT_ID_PESSOAL
TELEGRAM_CHANNEL_ID=-1002486420436
TELEGRAM_WEBHOOK_SECRET=telegram_webhook_secret_key
TELEGRAM_BOT_USERNAME=@MoreThanMoney_Copierbot

# Endpoints N8N:
# - POST: https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage
# - POST: https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook
# - Webhook: https://vmi2877758.contaboserver.net/webhooks/telegram

# Obter seu Chat ID:
# 1. Enviar mensagem para @userinfobot
# 2. Ou GET: https://api.telegram.org/bot{TOKEN}/getUpdates
```

**✅ COMANDOS DO BOT**:
```
/start - Iniciar bot
/status - Status geral do sistema
/leads - Últimos leads capturados
/meetings - Próximas reuniões
/pause - Pausar prospeção
/resume - Retomar prospeção
/campaign <segmento> <objetivo> - Criar campanha email
/post <ideia> - Criar post social agora
/analytics - Relatório de conversão
```

---

## 📊 GOOGLE SHEETS (Planejamento de Conteúdo)

```bash
# PASSO 1: Criar Service Account no Google Cloud
# https://console.cloud.google.com/

# PASSO 2: Ativar Google Sheets API
# PASSO 3: Criar credenciais JSON

GOOGLE_SHEETS_API_KEY=SUA_API_KEY
GOOGLE_SERVICE_ACCOUNT_EMAIL=seu-email@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# ID da Planilha
GOOGLE_SPREADSHEET_ID=ID_DA_SUA_PLANILHA

# Estrutura da Planilha:
# Aba 1: "Ideias de Conteúdo"
# Colunas: Data | Título | Pilar | Formato | Plataforma | Melhor Horário | CTA | Status
```

---

## 🔥 FIREBASE (Push Notifications) - JÁ CONFIGURADO ✅

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAbBVqaEziU-OnSt0obMx_HsgBRJqSubNY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mtm-push-notifications-fdbf1.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=mtm-push-notifications-fdbf1
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=978304341617
NEXT_PUBLIC_FIREBASE_APP_ID=1:978304341617:web:1312656f10990a496bedd0
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BDLNFba6Dstb05ihDbG7mf5YE7Jx2EXFY-73Z1y-N_23__Elp0QFDbMnMpFgAmYzxwn7U0mhYxkURhpnDUGXpd8

# Service Account (JSON completo)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"mtm-push-notifications-fdbf1",...}
```

---

## 🌍 OUTRAS INTEGRAÇÕES

### 🎥 **YouTube API** (Vídeos de Onboarding)
```bash
YOUTUBE_API_KEY=AIzaSyAjO5G-lZKW2gd0DAD3hMQ6PaeIAyXn5po
```

### 📊 **Google Analytics**
```bash
NEXT_PUBLIC_GA_ID=G-S8J5PC8615
```

### 📝 **Notion API**
```bash
NEXT_PUBLIC_NOTION_API_KEY=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
NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID=76557dddfbc348aba2f6e24ea1f5133e
```

---

## 🚀 CONFIGURAR NO N8N

### 1️⃣ **Acessar N8N no Contabo VPS**
```
URL: https://vmi2877758.contaboserver.net:5678
User: admin@vmi2877758.contaboserver.net
Password: 8AULskiFZQExF9jjTpyPd33V3zat
```

### 2️⃣ **Adicionar Credenciais**
No N8N, vá em **Settings → Credentials** e adicione:

1. **OpenAI** → API Key
2. **Supabase** → URL + Service Role Key
3. **Gmail** → SMTP credentials
4. **Telegram** → Bot Token
5. **HTTP Header Auth** → JWT Secret (para webhooks MTM)
6. **Google Sheets** → Service Account JSON
7. **Instagram/TikTok/LinkedIn** → OAuth2 tokens

### 3️⃣ **Configurar Webhooks**

**No N8N**, criar Webhook Triggers:
```
Calendly: /webhooks/calendly
Telegram: /webhooks/telegram
Supabase: /webhooks/supabase-new-member
```

**No Calendly**, configurar webhook:
```
URL: https://vmi2877758.contaboserver.net/webhooks/calendly
Events: invitee.created, invitee.canceled
```

**No Telegram**, configurar webhook:
```bash
curl -X POST "https://api.telegram.org/bot7926573487:AAFAbQSWYOOSkLteucaj82Xk_v1xpT-B3ok/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://vmi2877758.contaboserver.net/webhooks/telegram"}'
```

---

## ⚠️ AÇÕES PENDENTES

### 🔴 **URGENTE: Criar Contas/APIs**
- [ ] Instagram Business Account + Facebook App
- [ ] TikTok Developer Account + App
- [ ] LinkedIn Developer Account + App
- [ ] Calendly Personal Access Token
- [ ] Google Sheets Service Account
- [ ] Obter seu Telegram Chat ID pessoal

### 🟡 **OPCIONAL: Alternativas**
- **Phantombuster**: Automação LinkedIn/Instagram sem API oficial
- **Zapier/Make**: Integrações pré-prontas (se N8N complexo)
- **Cloudflare Workers**: Webhooks intermediários (mais rápido que VPS)

---

## 📞 SUPORTE

**Ricardo Garcia**
- Email: ricardogarciapt@proton.me
- Telegram: @MoreThanMoney_Copierbot
- Admin Panel: https://www.morethanmoney.pt/admin

**Contabo VPS (N8N)**
- IP: 173.249.23.54
- URL: https://vmi2877758.contaboserver.net
- SSH: `ssh root@173.249.23.54`

**Supabase Dashboard**
- URL: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof
- SQL Editor: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/sql/new

---

**🎉 TODAS AS CREDENCIAIS PRONTAS!**

➡️ **Próximo Passo**: Importar workflow N8N (`N8N_WORKFLOW_AGENTE_CEO_MTM.md`) e configurar credenciais.



