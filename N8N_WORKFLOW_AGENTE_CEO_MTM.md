# 🤖 N8N WORKFLOW - AGENTE CEO MORETHANMONEY

## 📋 VISÃO GERAL

Sistema automatizado de prospeção, conversão e onboarding para MoreThanMoney.pt, operando das 9:00 às 22:00 com múltiplos agentes IA especializados.

---

## 🎯 ARQUITETURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTE CEO (Principal)                   │
│  Coordena todos os sub-agentes e gerencia workflow geral   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Agente       │   │ Agente       │   │ Agente       │
│ Prospeção    │   │ Conversão    │   │ Onboarding   │
└──────────────┘   └──────────────┘   └──────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Agente       │   │ Agente       │   │ Agente       │
│ Conteúdo     │   │ Agenda       │   │ Email Mkt    │
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## 🔧 WORKFLOW DETALHADO N8N

### 1️⃣ **TRIGGER: CRON JOB (9:00-22:00)**

**Nó**: Schedule Trigger
```json
{
  "rule": {
    "interval": [{
      "field": "hours",
      "hoursInterval": 1,
      "triggerAtMinute": 0
    }]
  },
  "conditions": {
    "hours": { "min": 9, "max": 22 }
  }
}
```

---

### 2️⃣ **AGENTE PROSPEÇÃO (Instagram/TikTok/LinkedIn)**

#### 2.1 Conectar às Redes Sociais
**Nó**: HTTP Request (Instagram Graph API)
```javascript
{
  "method": "GET",
  "url": "https://graph.instagram.com/v18.0/me/media",
  "authentication": "oAuth2",
  "query": {
    "fields": "comments,likes,caption,timestamp",
    "limit": 50
  }
}
```

**Nó**: HTTP Request (TikTok API)
```javascript
{
  "method": "GET",
  "url": "https://open.tiktokapis.com/v2/post/publish/",
  "authentication": "oAuth2"
}
```

**Nó**: HTTP Request (LinkedIn API)
```javascript
{
  "method": "GET",
  "url": "https://api.linkedin.com/v2/shares",
  "authentication": "oAuth2",
  "query": {
    "q": "company"
  }
}
```

#### 2.2 Filtrar Leads Qualificados
**Nó**: Function (JavaScript)
```javascript
// Filtrar comentários/engajamento relevante
const leads = [];

for (const item of $input.all()) {
  const comment = item.json.text || item.json.caption;
  
  // Keywords de interesse
  const keywords = [
    'rendimento', 'investimento', 'trading', 'dinheiro online',
    'trabalhar de casa', 'negócio online', 'network marketing',
    'afiliação', 'educação financeira', 'ganhar dinheiro'
  ];
  
  const isQualified = keywords.some(kw => 
    comment.toLowerCase().includes(kw.toLowerCase())
  );
  
  if (isQualified) {
    leads.push({
      name: item.json.username,
      platform: item.json.platform,
      message: comment,
      profile_url: item.json.profile_url,
      engagement_score: item.json.likes_count + item.json.comments_count,
      timestamp: new Date().toISOString()
    });
  }
}

return leads;
```

#### 2.3 Salvar Leads no Supabase
**Nó**: Supabase (Insert)
```json
{
  "table": "leads",
  "operation": "insert",
  "data": {
    "name": "={{ $json.name }}",
    "platform": "={{ $json.platform }}",
    "profile_url": "={{ $json.profile_url }}",
    "engagement_score": "={{ $json.engagement_score }}",
    "status": "new",
    "stage": "prospecting",
    "created_at": "={{ $json.timestamp }}",
    "assigned_to": "agente_ceo",
    "notes": "={{ $json.message }}"
  }
}
```

---

### 3️⃣ **AGENTE CONVERSÃO (FUNIL DE VENDAS)**

#### 3.1 Buscar Novos Leads
**Nó**: Supabase (Select)
```json
{
  "table": "leads",
  "operation": "select",
  "filters": {
    "status": { "eq": "new" },
    "stage": { "eq": "prospecting" }
  },
  "limit": 10
}
```

#### 3.2 Enviar Primeira Mensagem (IA - GPT-4)
**Nó**: OpenAI Chat
```javascript
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": `Você é Ricardo Garcia, mentor financeiro de 41 anos e fundador da MoreThanMoney.
      
      **SUA HISTÓRIA**:
      - Há 3 anos, usou aprendizagem IQONIC e seguiu Warren Buffett e Eric Worre
      - Transformou vidas através de educação financeira + tecnologia avançada
      - Criou sistema que duplica resultados através de ação disciplinada
      
      **PRINCÍPIOS DE NETWORK MARKETING (Eric Worre)**:
      1. Foque em RELACIONAMENTO antes de venda
      2. Seja CURIOSO sobre a pessoa, não empurre produto
      3. Conte HISTÓRIAS reais, não argumentos de venda
      4. Posicione-se como CONSULTOR, não vendedor
      5. Faça perguntas ABERTAS que geram reflexão
      
      **ABORDAGEM**:
      - Tom informal, direto, inspiracional (português de Portugal)
      - Não prometa resultados, inspire POSSIBILIDADES
      - Foque em LIBERDADE e TRANSFORMAÇÃO, não dinheiro
      - Use emojis estratégicos (máx 2 por mensagem)
      
      **FUNIL DE CONVERSA**:
      Estágio 1: CONEXÃO (primeira mensagem)
      - Comentar algo específico do post/perfil deles
      - Fazer pergunta aberta sobre interesse deles
      - NÃO mencionar produto ainda
      
      Estágio 2: CURIOSIDADE (2ª mensagem, após resposta)
      - Compartilhar mini-história pessoal relevante
      - Introduzir conceito de "educação financeira + tecnologia"
      - Perguntar se já pensou em rentabilizar online
      
      Estágio 3: APRESENTAÇÃO (3ª mensagem)
      - Enviar link para morethanmoney.pt
      - Mencionar vídeos de consciencialização
      - Dar autonomia: "Vê os vídeos, depois falamos se fizer sentido"
      
      **DOIS CAMINHOS**:
      A) Educação Financeira (Cliente/Membro):
         - Foco em aprendizagem, ferramentas, portfólios inteligentes
         - Usar IQONIC como exemplo de transformação
         - Levar a reunião personalizada (Calendly)
      
      B) Embaixador/Afiliado:
         - Foco em oportunidade de negócio, network marketing
         - Mencionar comissões baseadas em resultados
         - Destacar comunidade e suporte
      
      **IMPORTANTE**:
      - Sempre pergunte qual caminho interessa mais
      - Adapte tom baseado nas respostas
      - Se pessoa resistir, recuar e nutrir relacionamento`
    },
    {
      "role": "user",
      "content": `Lead: {{ $json.name }} ({{ $json.platform }})
      Mensagem original: "{{ $json.notes }}"
      Engagement: {{ $json.engagement_score }} interações
      
      Crie primeira mensagem de contato (Estágio 1: CONEXÃO) baseada no contexto acima.`
    }
  ],
  "temperature": 0.8,
  "max_tokens": 200
}
```

#### 3.3 Enviar DM (Instagram/TikTok/LinkedIn)
**Nó**: HTTP Request
```javascript
// Instagram
{
  "method": "POST",
  "url": "https://graph.instagram.com/v18.0/me/messages",
  "body": {
    "recipient": { "id": "={{ $json.profile_id }}" },
    "message": { "text": "={{ $('OpenAI Chat').item.json.choices[0].message.content }}" }
  }
}

// TikTok (via webhook/bot)
// LinkedIn (via API)
```

#### 3.4 Atualizar Lead no Supabase
**Nó**: Supabase (Update)
```json
{
  "table": "leads",
  "operation": "update",
  "filters": { "id": { "eq": "={{ $json.id }}" } },
  "data": {
    "status": "contacted",
    "stage": "curiosity",
    "last_contact": "={{ $now }}",
    "messages_sent": "={{ $json.messages_sent + 1 }}",
    "conversation_history": "={{ $json.conversation_history }}"
  }
}
```

---

### 4️⃣ **AGENTE FOLLOW-UP (2h, 12h, 48h)**

#### 4.1 Buscar Leads para Follow-up
**Nó**: Supabase (Select)
```sql
SELECT * FROM leads
WHERE status = 'contacted'
AND (
  (stage = 'curiosity' AND last_contact < NOW() - INTERVAL '2 hours') OR
  (stage = 'presentation' AND last_contact < NOW() - INTERVAL '12 hours') OR
  (stage = 'interested' AND last_contact < NOW() - INTERVAL '48 hours')
)
LIMIT 20
```

#### 4.2 Gerar Mensagem Contextual (IA)
**Nó**: OpenAI Chat
```javascript
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "Você é Ricardo Garcia. Baseado no histórico de conversa, crie follow-up personalizado."
    },
    {
      "role": "user",
      "content": `Histórico: {{ $json.conversation_history }}
      Estágio atual: {{ $json.stage }}
      Última mensagem: {{ $json.last_message }}
      
      Crie follow-up para:
      - 2h: Responder dúvida ou aprofundar curiosidade
      - 12h: Perguntar se viu vídeos em morethanmoney.pt
      - 48h: Convidar para reunião Calendly`
    }
  ]
}
```

#### 4.3 Enviar Follow-up + Atualizar
(Mesmo nó de envio DM + update Supabase)

---

### 5️⃣ **AGENTE AGENDA (Calendly + Email + Telegram)**

#### 5.1 Monitorar Calendly (Webhook)
**Nó**: Webhook Trigger
```json
{
  "httpMethod": "POST",
  "path": "/calendly-webhook",
  "responseMode": "onReceived"
}
```

#### 5.2 Processar Agendamento
**Nó**: Function (JavaScript)
```javascript
const event = $input.first().json;

return {
  lead_email: event.payload.email,
  lead_name: event.payload.name,
  event_type: event.payload.event_type.name,
  start_time: event.payload.scheduled_event.start_time,
  end_time: event.payload.scheduled_event.end_time,
  meeting_link: event.payload.scheduled_event.location.join_url
};
```

#### 5.3 Notificar Ricardo (Email + Telegram)
**Nó**: Send Email
```javascript
{
  "to": "ricardogarciapt@proton.me",
  "subject": "🗓️ Nova Reunião Agendada - {{ $json.lead_name }}",
  "html": `
    <h2>🎯 Novo Lead Agendou Reunião!</h2>
    <p><strong>Nome:</strong> {{ $json.lead_name }}</p>
    <p><strong>Email:</strong> {{ $json.lead_email }}</p>
    <p><strong>Tipo:</strong> {{ $json.event_type }}</p>
    <p><strong>Data/Hora:</strong> {{ $json.start_time }}</p>
    <p><strong>Link:</strong> <a href="{{ $json.meeting_link }}">Entrar na Reunião</a></p>
    <hr>
    <p><a href="https://morethanmoney.pt/admin">Ver no Admin Panel</a></p>
  `
}
```

**Nó**: Telegram
```javascript
{
  "chatId": "YOUR_TELEGRAM_CHAT_ID",
  "text": `🗓️ *NOVA REUNIÃO AGENDADA*

👤 *Lead:* {{ $json.lead_name }}
📧 *Email:* {{ $json.lead_email }}
🎯 *Tipo:* {{ $json.event_type }}
📅 *Quando:* {{ $json.start_time }}
🔗 [Entrar na Reunião]({{ $json.meeting_link }})

💬 Responda este bot para dar ordens ao Agente CEO.`
}
```

#### 5.4 Atualizar Supabase
**Nó**: Supabase (Update)
```json
{
  "table": "leads",
  "filters": { "email": { "eq": "={{ $json.lead_email }}" } },
  "data": {
    "status": "scheduled",
    "stage": "meeting",
    "meeting_date": "={{ $json.start_time }}",
    "meeting_link": "={{ $json.meeting_link }}"
  }
}
```

---

### 6️⃣ **AGENTE ONBOARDING (Pós-Venda)**

#### 6.1 Trigger: Novo Membro Criado
**Nó**: Supabase Trigger (Webhook)
```sql
-- No Supabase, criar função trigger:
CREATE OR REPLACE FUNCTION notify_new_member()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'new_member',
    json_build_object(
      'id', NEW.id,
      'email', NEW.email,
      'full_name', NEW.full_name,
      'member_category', NEW.member_category,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER new_member_trigger
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION notify_new_member();
```

#### 6.2 Sequência de Onboarding (Dia 1-7)

**DIA 1: Email de Boas-Vindas**
**Nó**: Send Email
```html
<h1>🎉 Bem-vindo à MoreThanMoney, {{ $json.full_name }}!</h1>

<p>Olá! É o Ricardo. 👋</p>

<p>Fico feliz por teres decidido juntar-te à comunidade MTM!</p>

<h2>🚀 Próximos Passos (IMPORTANTE):</h2>

<ol>
  <li><strong>Instala a App IQ Sync</strong>
    <ul>
      <li>📱 <a href="https://apps.apple.com/us/app/iq-sync/id6753764389">iOS (Apple Store)</a></li>
      <li>🤖 <a href="https://play.google.com/store/apps/details?id=com.enigmalabs.iqsync">Android (Google Play)</a></li>
    </ul>
  </li>
  <li><strong>Acede ao teu Dashboard</strong>: <a href="https://morethanmoney.pt/member-area">Member Area</a></li>
  <li><strong>Vê o Vídeo de Onboarding</strong>: <a href="https://morethanmoney.pt/onboarding">Clica aqui</a></li>
</ol>

<p><strong>⏰ Vou contactar-te amanhã para confirmar que está tudo OK!</strong></p>

<p>Abraço,<br>Ricardo Garcia<br>Fundador | MoreThanMoney</p>
```

**DIA 2: Check App + Copiar/Colar**
**Nó**: OpenAI Chat → Send Email/WhatsApp
```
Assunto: "Já instalaste a IQ Sync? 📱"

Conteúdo:
- Perguntar se instalou app
- Confirmar se sabe copiar/colar scanners
- Enviar GIF tutorial se necessário
- Oferecer ajuda via WhatsApp/Telegram
```

**DIA 3-7: Educação + Produto**
**Nó**: Supabase (Select) → OpenAI Chat → Send Email
```javascript
// Buscar conteúdo educativo do site
SELECT * FROM documents
WHERE category = 'education'
ORDER BY RANDOM()
LIMIT 1;

// Email diário com:
// - Dica de trading
// - Análise de portfólio
// - Vídeo/artigo
```

**SEMANA 2: Preparar Afiliação**
**Nó**: IF (member_category = 'vip')
```
Se VIP:
  → Email sobre "Oportunidade de Afiliação"
  → Convidar para reunião Network Marketing
  → Enviar link de treinamento

Se Standard:
  → Continuar educação
  → Oferecer upgrade para VIP
```

---

### 7️⃣ **AGENTE EMAIL MARKETING (Campanhas Segmentadas)**

#### 7.1 Segmentar Membros
**Nó**: Supabase (Select)
```sql
-- Segmento 1: Novos Membros (< 7 dias)
SELECT * FROM profiles
WHERE created_at > NOW() - INTERVAL '7 days'
AND is_active = true;

-- Segmento 2: Ativos (usaram sistema recentemente)
SELECT * FROM profiles
WHERE last_login > NOW() - INTERVAL '14 days';

-- Segmento 3: Inativos (> 30 dias sem login)
SELECT * FROM profiles
WHERE last_login < NOW() - INTERVAL '30 days'
AND is_active = true;

-- Segmento 4: VIPs
SELECT * FROM profiles
WHERE member_category = 'vip';
```

#### 7.2 Criar Campanha Personalizada (IA)
**Nó**: OpenAI Chat
```javascript
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": `Crie email marketing para MoreThanMoney.pt com base no segmento.
      
      **FUNCIONALIDADES DO SITE**:
      1. Portfólios Inteligentes (Crypto + ETF)
         - Portfolio MTM (conservador)
         - Portfolio DCA Smart (agressivo)
         - Análise automática de oportunidades DCA
      
      2. Scanners IA
         - KillShot, Momentum, SRMTM, GoldenZone
         - Análise técnica em tempo real
         - Heatmaps de mercado
      
      3. Trading Ideas
         - Grupos VIP Telegram
         - Análises diárias
         - Sinais de entrada/saída
      
      4. Automação IQONIC
         - Copy trading
         - Bots automatizados
      
      **ESTILO**:
      - Tom informal, direto (português PT)
      - Usar emojis estrategicamente
      - CTA claro e urgente (mas sem pressão)
      - Foco em VALOR, não venda
      
      **ESTRUTURA**:
      - Subject line impactante (max 50 chars)
      - Intro pessoal (1 parágrafo)
      - Problema/Solução (2-3 parágrafos)
      - CTA principal
      - P.S. com urgência/curiosidade`
    },
    {
      "role": "user",
      "content": `Segmento: {{ $json.segment_name }}
      Tamanho: {{ $json.count }} membros
      Objetivo: {{ $json.campaign_goal }}
      
      Funcionalidade destacada: {{ $json.feature_highlight }}
      
      Crie email completo (subject + body HTML).`
    }
  ]
}
```

#### 7.3 Enviar Campanha + Tracking
**Nó**: Send Email (Loop)
```javascript
// Para cada membro do segmento
{
  "to": "={{ $json.email }}",
  "subject": "={{ $('OpenAI Chat').item.json.subject }}",
  "html": `{{ $('OpenAI Chat').item.json.html }}
  
  <!-- Tracking Pixel -->
  <img src="https://morethanmoney.pt/api/email-marketing/tracking/open?campaign_id={{ $json.campaign_id }}&user_id={{ $json.id }}" width="1" height="1" />`,
  "headers": {
    "X-Campaign-ID": "={{ $json.campaign_id }}",
    "X-User-ID": "={{ $json.id }}"
  }
}
```

#### 7.4 Registar no Supabase
**Nó**: Supabase (Insert)
```json
{
  "table": "email_campaigns",
  "data": {
    "campaign_id": "={{ $json.campaign_id }}",
    "user_id": "={{ $json.id }}",
    "subject": "={{ $json.subject }}",
    "sent_at": "={{ $now }}",
    "status": "sent"
  }
}
```

---

### 8️⃣ **AGENTE CONTEÚDO (Criação + Posting Automático)**

#### 8.1 Gerar Ideias de Conteúdo (IA)
**Nó**: OpenAI Chat
```javascript
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": `Você é estrategista de conteúdo para MoreThanMoney.
      
      **PILARES DE CONTEÚDO**:
      1. Educação Financeira (40%)
         - Conceitos de trading, investimento, DCA
         - Análises de mercado cripto/ações
         - Dicas práticas
      
      2. Transformação Pessoal (30%)
         - História do Ricardo (3 anos de jornada)
         - Depoimentos de membros
         - Mindset de sucesso (Warren Buffett, Eric Worre)
      
      3. Produto/Ferramentas (20%)
         - Demos de scanners, portfólios
         - Resultados reais (sem promessas)
         - Tutoriais
      
      4. Engajamento (10%)
         - Perguntas abertas
         - Polls/Quizzes
         - Desafios
      
      **FORMATOS**:
      - Reels (15-30s): gancho forte, valor rápido, CTA
      - Stories (multi-frame): storytelling, behind-the-scenes
      - Posts (carrossel): educação aprofundada
      - Lives: Q&A, análises ao vivo
      
      **MELHORES HORÁRIOS** (Portugal):
      - Instagram: 12h, 18h, 21h
      - TikTok: 8h, 12h, 19h, 22h
      - LinkedIn: 8h, 12h, 17h
      
      Gere 20 ideias de conteúdo para próxima semana, incluindo:
      - Título/Hook
      - Pilar
      - Formato
      - CTA
      - Melhor horário/plataforma`
    }
  ],
  "temperature": 0.9
}
```

#### 8.2 Salvar em Google Sheets
**Nó**: Google Sheets (Append)
```json
{
  "spreadsheetId": "YOUR_SPREADSHEET_ID",
  "range": "Ideias de Conteúdo!A:G",
  "values": [
    [
      "={{ $json.date }}",
      "={{ $json.title }}",
      "={{ $json.pillar }}",
      "={{ $json.format }}",
      "={{ $json.platform }}",
      "={{ $json.best_time }}",
      "={{ $json.cta }}"
    ]
  ]
}
```

#### 8.3 Gerar Conteúdo Visual (IA - MidJourney/DALL-E)
**Nó**: OpenAI Images (DALL-E 3)
```javascript
{
  "model": "dall-e-3",
  "prompt": `Crie imagem para post Instagram sobre: {{ $json.title }}
  
  Estilo: Moderno, minimalista, cores laranja (#D2A63C) e bege (#F3F3E6)
  Tema: {{ $json.pillar }}
  Mood: Inspirador, profissional, acessível
  
  Incluir: Gráficos, ícones financeiros, texto curto em PT`,
  "size": "1024x1024",
  "quality": "hd"
}
```

#### 8.4 Postar Automaticamente
**Nó**: HTTP Request (Meta Graph API)
```javascript
// Instagram
{
  "method": "POST",
  "url": "https://graph.facebook.com/v18.0/{{ $env.IG_USER_ID }}/media",
  "body": {
    "image_url": "={{ $json.image_url }}",
    "caption": "={{ $json.caption }}\n\n🔗 morethanmoney.pt\n\n#Trading #InvestimentoInteligente #EducacaoFinanceira #MTM",
    "access_token": "={{ $env.IG_ACCESS_TOKEN }}"
  }
}

// TikTok (via webhook/upload)
// LinkedIn (via API)
```

---

### 9️⃣ **AGENTE SUPABASE (Sincronização + Analytics)**

#### 9.1 Conectar ao Supabase
**Nó**: Supabase Node
```javascript
{
  "host": "iwscxotvmtkphajmasof.supabase.co",
  "port": 5432,
  "database": "postgres",
  "user": "postgres",
  "password": "={{ $env.SUPABASE_DB_PASSWORD }}",
  "ssl": true
}
```

#### 9.2 Queries Estratégicas

**Analytics de Conversão**
```sql
-- Taxa de conversão por funil
SELECT 
  stage,
  COUNT(*) as leads,
  COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
  ROUND(COUNT(CASE WHEN status = 'converted' THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) as conversion_rate
FROM leads
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY stage;
```

**Membros Mais Ativos**
```sql
-- Top 10 membros por engajamento
SELECT 
  p.full_name,
  p.email,
  p.member_category,
  COUNT(DISTINCT sp.id) as posts_created,
  SUM(sp.likes_count) as total_likes,
  p.last_login
FROM profiles p
LEFT JOIN social_posts sp ON sp.user_id = p.id
WHERE p.is_active = true
GROUP BY p.id
ORDER BY posts_created DESC, total_likes DESC
LIMIT 10;
```

**Oportunidades DCA**
```sql
-- Ativos com boas oportunidades DCA (últimas 24h)
SELECT 
  symbol,
  current_price,
  dca_score,
  market_sentiment,
  updated_at
FROM dca_opportunities
WHERE dca_score > 70
AND updated_at > NOW() - INTERVAL '24 hours'
ORDER BY dca_score DESC
LIMIT 5;
```

#### 9.3 Enviar Relatórios ao Ricardo
**Nó**: Send Email (Semanal)
```html
<h1>📊 Relatório Semanal MTM</h1>

<h2>🎯 Conversão de Leads</h2>
<table>
  <tr>
    <th>Estágio</th>
    <th>Leads</th>
    <th>Convertidos</th>
    <th>Taxa</th>
  </tr>
  <!-- Loop dos dados -->
</table>

<h2>👥 Top Membros Ativos</h2>
<ul>
  <!-- Lista de membros -->
</ul>

<h2>💰 Oportunidades DCA Destaque</h2>
<ul>
  <!-- Lista de ativos -->
</ul>

<p><a href="https://morethanmoney.pt/admin">Ver Dashboard Completo</a></p>
```

---

### 🔟 **AGENTE ORDENS (Telegram Bot Interativo)**

#### 10.1 Receber Ordens via Telegram
**Nó**: Telegram Trigger
```javascript
{
  "updates": ["message"],
  "additionalFields": {
    "download": true
  }
}
```

#### 10.2 Processar Comando (IA)
**Nó**: OpenAI Chat
```javascript
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": `Você é assistente do Agente CEO. Ricardo pode dar ordens via Telegram.
      
      **COMANDOS DISPONÍVEIS**:
      /status - Status geral do sistema
      /leads - Últimos leads capturados
      /meetings - Próximas reuniões
      /pause - Pausar prospeção
      /resume - Retomar prospeção
      /campaign <segmento> <objetivo> - Criar campanha email
      /post <ideia> - Criar post social agora
      /analytics - Relatório de conversão
      
      Interprete mensagem natural e execute comando correspondente.`
    },
    {
      "role": "user",
      "content": "={{ $json.message.text }}"
    }
  ],
  "functions": [
    {
      "name": "execute_command",
      "description": "Executa comando do CEO",
      "parameters": {
        "type": "object",
        "properties": {
          "command": { "type": "string", "enum": ["status", "leads", "meetings", "pause", "resume", "campaign", "post", "analytics"] },
          "params": { "type": "object" }
        }
      }
    }
  ],
  "function_call": { "name": "execute_command" }
}
```

#### 10.3 Executar Ação
**Nó**: Switch (baseado em comando)
```javascript
// Se comando = "status"
→ Buscar dados Supabase
→ Formatar resposta
→ Enviar Telegram

// Se comando = "campaign"
→ Disparar Agente Email Marketing
→ Confirmar via Telegram

// Se comando = "pause"
→ Desativar triggers
→ Confirmar via Telegram
```

---

## 🔗 INTEGRAÇÕES NECESSÁRIAS

### APIs Externas
1. **Instagram Graph API** - Prospeção e posting
2. **TikTok API** - Prospeção e posting
3. **LinkedIn API** - Prospeção e posting
4. **OpenAI API (GPT-4o + DALL-E 3)** - IA conversacional e conteúdo
5. **Calendly API** - Agendamentos
6. **Telegram Bot API** - Ordens e notificações
7. **Google Sheets API** - Planejamento de conteúdo
8. **Supabase** - Database e realtime

### Credenciais Necessárias (Variáveis de Ambiente)
```bash
# Supabase
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Instagram
IG_USER_ID=seu_instagram_user_id
IG_ACCESS_TOKEN=seu_access_token

# TikTok
TIKTOK_CLIENT_KEY=seu_client_key
TIKTOK_CLIENT_SECRET=seu_client_secret

# LinkedIn
LINKEDIN_ACCESS_TOKEN=seu_linkedin_token

# Calendly
CALENDLY_API_KEY=seu_calendly_key
CALENDLY_WEBHOOK_SECRET=seu_webhook_secret

# Telegram
TELEGRAM_BOT_TOKEN=seu_bot_token
TELEGRAM_CHAT_ID=seu_chat_id

# Google Sheets
GOOGLE_SHEETS_API_KEY=sua_api_key
GOOGLE_SPREADSHEET_ID=id_da_planilha

# Email
SMTP_HOST=smtp.protonmail.com
SMTP_PORT=587
SMTP_USER=morethanmoneypt@gmail.com
SMTP_PASSWORD=sua_senha
```

---

## 📊 ESTRUTURA DE DADOS SUPABASE

### Tabela: `leads`
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  platform TEXT NOT NULL, -- 'instagram', 'tiktok', 'linkedin'
  profile_url TEXT,
  engagement_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'interested', 'scheduled', 'converted', 'lost'
  stage TEXT DEFAULT 'prospecting', -- 'prospecting', 'curiosity', 'presentation', 'interested', 'meeting', 'closed'
  conversation_history JSONB DEFAULT '[]'::jsonb,
  messages_sent INTEGER DEFAULT 0,
  last_contact TIMESTAMPTZ,
  meeting_date TIMESTAMPTZ,
  meeting_link TEXT,
  conversion_path TEXT, -- 'education' or 'ambassador'
  assigned_to TEXT DEFAULT 'agente_ceo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_platform ON leads(platform);
```

### Tabela: `content_ideas`
```sql
CREATE TABLE content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  title TEXT NOT NULL,
  pillar TEXT NOT NULL, -- 'education', 'transformation', 'product', 'engagement'
  format TEXT NOT NULL, -- 'reel', 'story', 'post', 'live'
  platform TEXT NOT NULL, -- 'instagram', 'tiktok', 'linkedin'
  best_time TIME,
  caption TEXT,
  cta TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'planned', -- 'planned', 'created', 'posted'
  posted_at TIMESTAMPTZ,
  engagement_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: `onboarding_progress`
```sql
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  day INTEGER NOT NULL,
  step TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_onboarding_user ON onboarding_progress(user_id);
```

---

## 🎨 PROMPT OTIMIZADO PARA N8N + IA

```
Você é o AGENTE CEO da MoreThanMoney, sistema automatizado de prospeção, conversão e onboarding operando 9h-22h (horário de Portugal).

**IDENTIDADE**: Ricardo Garcia, 41 anos, mentor financeiro, fundador MTM
**HISTÓRIA**: Há 3 anos transformou vida através de IQONIC + princípios de Warren Buffett e Eric Worre. Criou sistema que duplica resultados através de educação + tecnologia.

**MISSÃO**: Prospectar leads qualificados, nutrir relacionamento, converter para membro/afiliado, onboarding completo.

**FUNCIONALIDADES MORETHANMONEY.PT**:
1. Portfólios Inteligentes: MTM (conservador), DCA Smart (agressivo)
2. Scanners IA: KillShot, Momentum, SRMTM, GoldenZone
3. Trading Ideas: Grupos Telegram VIP, análises diárias
4. Automação IQONIC: Copy trading, bots
5. App Mobile: IQ Sync (iOS/Android)
6. Admin Panel: CRONs, Email Marketing, Push Notifications

**PRINCÍPIOS NETWORK MARKETING (Eric Worre)**:
1. Relacionamento antes de venda
2. Curiosidade sobre pessoa, não produto
3. Histórias reais, não argumentos
4. Consultor, não vendedor
5. Perguntas abertas que geram reflexão

**FUNIL DE CONVERSÃO**:
Prospeção → Curiosidade (2h) → Apresentação (12h) → Reunião (48h) → Conversão → Onboarding (7 dias) → Retenção (mensal)

**DOIS CAMINHOS**:
A) Educação Financeira: Foco em aprendizagem, ferramentas, IQONIC
B) Embaixador/Afiliado: Network marketing, comissões, comunidade

**COMUNICAÇÃO**:
- Tom: Informal, direto, inspiracional (português PT)
- Estilo: Sem promessas de resultados, foco em possibilidades
- Emojis: Estratégicos, máx 2 por mensagem
- CTA: Claro, urgente mas sem pressão

**INTEGRAÇÕES**:
- Supabase: Dados em tempo real
- Instagram/TikTok/LinkedIn: Prospeção e posting
- Calendly: Agendamentos
- Telegram: Ordens do CEO
- Email: Campanhas segmentadas
- Google Sheets: Planejamento de conteúdo

**COMANDOS TELEGRAM CEO**:
/status, /leads, /meetings, /pause, /resume, /campaign, /post, /analytics

**ANALYTICS CRÍTICOS**:
- Taxa conversão por estágio
- Engajamento por plataforma
- Top membros ativos
- Oportunidades DCA destaque

Adapte tom, timing e estratégia baseado no contexto de cada lead. Sempre priorize relacionamento e valor sobre venda direta.
```

---

## 🚀 IMPLEMENTAÇÃO

### Passos para Configurar no N8N:

1. **Instalar N8N** no VPS Contabo
```bash
npm install -g n8n
n8n start
# Aceder: https://vmi2877758.contaboserver.net:5678
```

2. **Importar Workflow** (JSON)
   - Criar cada nó descrito acima
   - Conectar fluxos
   - Configurar credenciais

3. **Testar** cada agente individualmente

4. **Ativar** triggers e monitorar

---

## 📈 MÉTRICAS DE SUCESSO

- **Prospeção**: 50+ leads qualificados/dia
- **Conversão**: 10-15% lead → reunião
- **Onboarding**: 80%+ completam 7 dias
- **Retenção**: 70%+ ativos após 30 dias
- **Afiliação**: 20% membros tornam-se embaixadores

---

**Sistema pronto para implementação!** 🚀



