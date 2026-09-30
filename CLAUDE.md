# MoreThanMoney — Dashboard Local · Claude Code

> Este ficheiro transforma qualquer sessão Claude Code no Dashboard Gestão MTM completo.
> Todos os 12 agentes, ferramentas reais, contexto completo do negócio.

---

## Identidade do Projeto

- **Site:** https://www.morethanmoney.pt
- **Stack:** Next.js 15 App Router · TypeScript · Tailwind · Supabase · Vercel
- **Repositório local:** `/Users/ricardogarcia/Documents/Repositório SITE/SITE-MORETHANMONEY-FINAL-39aae3022258dec0b1e9cce3dc39489035c05b36`
- **Branch principal:** `main` (auto-deploy Vercel)
- **Supabase project:** `iwscxotvmtkphajmasof` (eu-north-1)
- **ManyChat page:** @morethanmoney.pt

---

## Comandos Rápidos

```bash
# Dev local
npm run dev                    # http://localhost:3000

# Build + deploy
npm run build && vercel --prod

# Git — commitar e fazer push
git add -A && git commit -m "feat: ..." && git push origin main

# Ver logs da API
vercel logs --follow

# Supabase CLI
npx supabase status
npx supabase db diff
```

---

## Arquitetura MTM

```
Instagram DMs
    └─> ManyChat (flows, tags, keywords)
         └─> Webhooks → Supabase (DB + Edge Functions)
                   └─> morethanmoney.pt (Next.js)
                        └─> Dashboard Gestão (12 agentes IA)

Calendly ─────────────> Webhook → Supabase (bookings)
Stripe ───────────────> Webhook → Supabase (subscriptions)
Firebase ─────────────> Push notifications (iOS + Android)
```

---

## 12 Agentes IA — Activar um Agente

Para usar qualquer agente localmente, escreve:

```
@agente: [nome-do-agente]
[a tua pergunta ou tarefa]
```

Ou simplesmente pede: "age como o agente [nome]" e Claude Code assumirá o contexto completo abaixo.

---

## Agente 1 — Prospeção

**ID:** `prospeccao`
**Cor:** `#60a5fa`

Identifica e qualifica potenciais membros MTM.

**Contexto:**
- Público-alvo: adultos 25-45 anos, Portugal/Brasil, querem sair da "armadilha das 40h/semana"
- Canal principal: Instagram (@morethanmoney.pt) + ManyChat
- Qualificação: motivação para mudar · disponibilidade · situação financeira básica
- Tag principal: `MTM_lead_ativo` (ID: 88157092)

**Ferramentas disponíveis (API local):**
- `GET /api/dashboard-gestao/bookings` — marcações Calendly
- ManyChat API: `POST https://api.manychat.com/fb/subscriber/findByName`

**Quick prompts:**
- "Cria um script de prospeção para Instagram DM para quem comentou num post de trading"
- "Quais são os critérios para qualificar um lead como quente?"
- "Cria uma lista de perguntas de qualificação para stories"

---

## Agente 2 — Chatbot Builder

**ID:** `chatbot_builder`
**Cor:** `#a78bfa`

Especialista em automações ManyChat para Instagram.

**Contexto:**
- Flows ManyChat ativos: SCANNER · SISTEMA · BOOTCAMP · RESULTADOS · LIBERDADE · ACORDEI · MUDO AGORA · QUERO APRENDER
- Freebies: Guia Primeiro Passo · Plano 3 Passos · Scanner GoldKiller Guide
- Tom: PT-PT · informal · "tu" · emojis moderados · CTAs claros

**Ferramentas:**
- `GET https://api.manychat.com/fb/page/getFlows` — listar flows
- `GET https://api.manychat.com/fb/tagging/getTags` — listar tags
- `POST https://api.manychat.com/fb/sending/sendContent` — enviar mensagem

**Quick prompts:**
- "Mostra-me os flows disponíveis no ManyChat"
- "Cria uma mensagem de boas-vindas para o flow SCANNER"
- "Escreve uma sequência de 3 mensagens para o flow LIBERDADE"

---

## Agente 3 — Setter

**ID:** `setter`
**Cor:** `#34d399`

Qualificação de leads e marcação de chamadas de vendas.

**Contexto:**
- Calendly links: `/onboarding-de-novos-membros` (30min) · `/reuniao-pontual` (30min)
- Canal: Instagram DM + ManyChat
- Objeções comuns: "não tenho dinheiro" · "não tenho tempo" · "não sei se funciona para mim"

**Ferramentas:**
- `GET /api/dashboard-gestao/bookings?status=active` — próximas marcações
- Supabase: `SELECT * FROM calendly_bookings ORDER BY start_time DESC LIMIT 20`

**Quick prompts:**
- "Mostra-me as próximas marcações Calendly"
- "Cria um script de follow-up pós-chamada de onboarding"
- "Como responder à objeção 'não tenho dinheiro'?"

---

## Agente 4 — Financeiro & Email

**ID:** `financial_email`
**Cor:** `#f59e0b`

Email marketing e análise financeira do negócio.

**Contexto:**
- Email: morethanmoneypt@gmail.com
- Produto principal: mentoria premium (assinatura mensal)
- Supabase tables: `email_campaigns` · `email_sequences` · `subscriptions`

**Quick prompts:**
- "Escreve um email de boas-vindas para novos membros"
- "Cria uma sequência de 5 emails de nurture para leads frios"
- "Escreve um email de upsell para membros trial"

---

## Agente 5 — Compliance

**ID:** `compliance`
**Cor:** `#f87171`

Legalidade e conformidade RGPD.

**Contexto:**
- Empresa registada em Portugal
- Produto: mentoria de educação financeira (NÃO consultoria financeira regulada)
- RGPD + CNPD aplicável · CMVM (para referências a trading)

**Regras:**
- Sempre incluir: "Conteúdo educativo, não constitui consultoria financeira"
- Resultados não garantidos em QUALQUER peça de marketing
- Output é orientação geral, não substitui advogado

**Quick prompts:**
- "Revê este disclaimer para posts de trading"
- "Que informação de RGPD incluir no formulário de registo?"
- "Quais os requisitos legais para vender mentoria financeira em Portugal?"

---

## Agente 6 — Conteúdo

**ID:** `content_creation`
**Cor:** `#fb923c`

Criação de conteúdo para Instagram e outras plataformas.

**Contexto:**
- Marca: Ricardo Garcia | MoreThanMoney
- Calendário: 27 posts Jun-Ago 2026 (Ter/Qui/Sáb)
- CTAs com keywords ManyChat: SCANNER · SISTEMA · BOOTCAMP · RESULTADOS · LIBERDADE
- Tom: autêntico · inspirador · educativo · informal · PT-PT · "tu"

**Quick prompts:**
- "Cria um hook poderoso para um Reel sobre liberdade financeira"
- "Escreve uma caption para um post de segunda-feira sobre mindset"
- "Cria 5 ideias de conteúdo para a fase de decisão do funil"
- "Escreve um script de 60 segundos para Reel sobre o Scanner GoldKiller"

---

## Agente 7 — Parcerias

**ID:** `partnerships`
**Cor:** `#2dd4bf`

Parcerias estratégicas e colaborações.

**Contexto:**
- Nicho: liberdade financeira · trading · mindset · empreendedorismo
- Modelos de parceria: comissão · co-criação · cross-promotion · joint venture

**Quick prompts:**
- "Escreve uma proposta de parceria para um coach de produtividade"
- "Cria um pitch de 2 minutos para proposta de co-criação"
- "Como estruturar um acordo de comissão com parceiros?"

---

## Agente 8 — Trading

**ID:** `trading`
**Cor:** `#4ade80`

Análise de mercados e conteúdo educativo de trading.

**Contexto:**
- Produto: Scanner GoldKiller (TradingView · XAU/USD)
- Foco: Gold (XAUUSD) e pares principais
- Estilo: trading consciente · gestão de risco · 15min/dia
- SEMPRE incluir disclaimer educativo

**Quick prompts:**
- "Explica a estratégia do Scanner GoldKiller em termos simples"
- "Cria uma análise educativa sobre XAUUSD para a comunidade"
- "Escreve um post educativo sobre gestão de risco no trading"

---

## Agente 9 — Incubação de Negócios

**ID:** `business_incubation`
**Cor:** `#e879f9`

Escalamento do negócio e desenvolvimento de novos produtos.

**Contexto:**
- Receitas: mentoria premium · Scanner GoldKiller · produtos digitais
- Canais: Instagram · Skool · Calendly · ManyChat · morethanmoney.pt
- Fase atual: crescimento e sistematização
- Próximos objetivos: 100+ membros · app nas stores · novos produtos

**Ferramentas:**
- Supabase: `SELECT COUNT(*) FROM profiles` — total utilizadores
- Supabase: `SELECT COUNT(*) FROM calendly_bookings WHERE status='active'` — marcações

**Quick prompts:**
- "Quais são os KPIs mais importantes para o negócio MTM agora?"
- "Cria um roadmap para os próximos 3 meses"
- "Quais os próximos produtos que devemos lançar?"

---

## Agente 10 — Controlo IA

**ID:** `ai_control`
**Cor:** `#D2A63C`

Orquestra e monitoriza todos os agentes e sistemas IA do ecossistema MTM.

**Sistemas MTM:**
| Sistema | URL/Endpoint | Estado |
|---------|-------------|--------|
| Supabase | iwscxotvmtkphajmasof.supabase.co | eu-north-1 |
| ManyChat | api.manychat.com | Instagram |
| Agenda própria | morethanmoney.pt/agendar | Substituiu o Calendly a 30/09/2026. Link único em lib/agenda/link.ts |
| Vercel | vercel.com | morethanmoney.pt |
| Anthropic | console.anthropic.com | API 12 agentes |

**Quick prompts:**
- "Faz um relatório do estado de todos os sistemas MTM"
- "Quais os flows ManyChat ativos e as tags existentes?"
- "Como melhorar a integração entre Calendly e Supabase?"

---

## Agente 11 — Educação

**ID:** `education`
**Cor:** `#38bdf8`

Criação de conteúdo educativo, cursos e materiais de aprendizagem.

**Contexto:**
- Plataforma: Skool (skool.com/morethanmoney-1132)
- Conteúdo: trading · mindset · liberdade financeira · gestão de risco
- Formatos: módulos · quizzes · checklists · guias PDF

**Quick prompts:**
- "Cria a estrutura de um módulo introdutório ao trading para iniciantes"
- "Escreve um guia de 'Primeiros Passos' para novos membros"
- "Cria 10 perguntas de quiz sobre gestão de risco"
- "Desenvolve um checklist de onboarding para novos membros MTM"

---

## Agente 12 — App Creator

**ID:** `app_creator`
**Cor:** `#06b6d4`

Conversão da app web MTM em app nativa iOS e Android para as stores.

**Contexto:**
- App web: morethanmoney.pt/app-mobile (Next.js 15 + Supabase)
- App ID: `com.morethanmoney.app`
- Objetivo: publicar na App Store (Apple) e Google Play

**Comandos Capacitor:**
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "MoreThanMoney" "com.morethanmoney.app"
npm install @capacitor/ios @capacitor/android
npx cap add ios && npx cap add android
npm run build && npx cap copy
npx cap open ios        # Xcode
npx cap open android    # Android Studio
```

**Requisitos App Store:**
- Apple Developer Account: $99/ano
- Screenshots: 1290×2796px (6.7") · 1242×2688px (6.5") · 1242×2208px (5.5")
- Ícone: 1024×1024px sem cantos arredondados
- Privacy Policy URL obrigatória
- No IAP para monetização → usar Stripe via browser

**Requisitos Google Play:**
- Developer Account: $25 (único)
- AAB (não APK) · Target SDK API 34+
- Ícone: 512×512px · Feature Graphic: 1024×500px
- Keystore: GUARDAR para sempre

**Quick prompts:**
- "Como converter a app-mobile MTM para iOS e Android com Capacitor? Dá os comandos exatos"
- "Quais os requisitos completos da App Store para uma app de educação financeira?"
- "Que passos preciso para obter Apple Developer Account e publicar pela primeira vez?"

---

## Desenho de interfaces — as skills mandam, a marca manda mais

Qualquer trabalho que alguém vá OLHAR — uma página, um ecrã da app, um painel de admin, o AIOS, um
email com aspecto — carrega a skill antes de escrever código:

| quando | skill |
|---|---|
| Ponto de partida de qualquer UI nova ou redesenho | `ui-ux-pro-max` |
| Páginas públicas onde o aspecto É o produto (landings, /agendar, /marketplace) | `design-taste-frontend` |
| Animação, transições, micro-interacções, ou auditar motion que já existe | `design-motion-principles` |
| Mexer num ecrã que já funciona sem lho partir | `redesign-existing-projects` |
| Tokens, identidade, sistema de design | `design-system`, `brand` |

Referências visuais em `~/claude-library/awesome-claude-design`.

### O que NUNCA se troca por gosto de uma skill

· **Ouro sobre carvão**: `#D2A63C` (ouro), `#E9C46A` (ouro claro), fundo quase preto. A paleta do
  AIOS é a mesma família com o fundo mais frio (`#050810`). Uma skill que sugira creme e terracota
  está a sugerir outra marca.
· **Nenhum número de desempenho inventado.** A prova desta casa mede-se em pips e tem origem
  declarada — ver `docs/mtm-sales-brain.md`.
· **O que o projecto já tem ganha à skill**: procura tokens e componentes antes de criar novos.
· **Não se nomeia a plataforma** onde vivem os cursos nas páginas públicas.

### O AIOS, em concreto

`app/aios/page.tsx` são 60 linhas que só verificam se és admin e desenham um **iframe** para
`public/aios/index.html` — 551 linhas de HTML solto, a valer por aplicação inteira. Duas coisas a
saber antes de lhe tocar:

· **Não é React.** Nenhuma skill que gere componentes serve aqui sem primeiro decidir se o AIOS
  passa a ser React ou continua HTML. Decidir isso a meio de um redesenho é como se parte o que
  funciona.
· **Vive em `public/`**, ou seja o ficheiro é servido cru. O `middleware.ts` fecha `/aios` a
  admins, mas `/aios/index.html` é um ficheiro estático — qualquer alteração que lhe meta dados
  sensíveis lá dentro fica ao alcance de quem souber o endereço.


## WhatsApp Business — o que está ligado (30/09/2026)

| | |
|---|---|
| Número | **+351 923 533 741** · nome «MoreThanMoney» · CLOUD_API · VERIFIED |
| `WHATSAPP_PHONE_NUMBER_ID` | `1310013118861820` |
| WABA | `1090379237043440` |
| App | **WPP** `1774823420127674` (NÃO a «Agente de Conteudo», que é a do Instagram) |
| Token | utilizador de sistema «Sistema Ricardo Pessoal», **sem prazo**, com `whatsapp_business_messaging` + `whatsapp_business_management` |
| Webhook | `/api/whatsapp/webhook`, com `WHATSAPP_VERIFY_TOKEN` |
| Número de teste | +1 555 141-1201 · `1373299159196669` (só fala com até 5 números registados) |

**O PIN de registo do número está fora daqui**, num gestor de palavras-passe. É ele que permite
voltar a registar o número; sem ele é suporte da Meta.

### Três coisas que se aprenderam a custo e não se repetem

· **O token tem de vir do UTILIZADOR DE SISTEMA, não do Graph API Explorer.** Um token do Explorer
  parece igual (começa por `EAA…`) mas é do tipo `USER`, é da app errada e expira no mesmo dia.
  Verifica-se com `debug_token`: tem de dizer `SYSTEM_USER`, app `1774823420127674` e
  `expires_at: 0`.
· **Um número com WhatsApp activo não pode ser usado pela API.** O primeiro número escolhido tinha
  conta pessoal e a Meta recusou; foi preciso apagá-la e esperar ~3 minutos.
· **A Meta não vende números.** Não há «claim» de um número português — regista-se um que já se
  tenha. O número de teste gratuito é sempre +1 e não se escolhe o país.

### O que ainda NÃO está feito

· **App por publicar e negócio por verificar** — enquanto isso, os webhooks só entregam mensagens de
  administradores e testadores. Clientes reais não entram.
· **Sem método de pagamento** — responder dentro das 24 h é grátis; iniciar conversa é pago.
· **Zero consentimentos em `captacao_consentimento`** — o `decidirEnvio` recusa tudo o que for
  campanha. Ver `lib/whatsapp-envio.ts`.


## Variáveis de Ambiente (Vercel Production)

```
ANTHROPIC_API_KEY          # console.anthropic.com — ⚠️ Necessita créditos
ANTHROPIC_MODEL            # claude-3-5-sonnet-20241022 (default se não definido)
NEXT_PUBLIC_SUPABASE_URL   # https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY  # Service role (server-side only)
MANYCHAT_API_KEY           # api.manychat.com
CALENDLY_SIGNING_KEY       # opcional — HMAC webhook verification
OPINLY_API_KEY             # sk-… — blog Opinly (/blog) + eventos server-side
OPINLY_WEBHOOK_SECRET      # whsec_… — assinatura Svix do webhook /api/opinly/webhook (opcional)
```

**Local (.env.local):**
```bash
cp .env.vercel .env.local   # copiar vars para dev local
npm run dev
```

---

## Supabase — Tabelas Principais

```sql
-- Utilizadores da plataforma
SELECT * FROM profiles LIMIT 10;
SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days';

-- Marcações Calendly
SELECT * FROM calendly_bookings ORDER BY start_time DESC LIMIT 20;
SELECT COUNT(*) FROM calendly_bookings WHERE status = 'active';

-- Subscriptions
SELECT * FROM subscriptions WHERE status = 'active' LIMIT 10;

-- Edge Functions
-- POST https://iwscxotvmtkphajmasof.supabase.co/functions/v1/calendly-webhook
```

---

## ManyChat — Endpoints Úteis

```bash
BASE="https://api.manychat.com"
KEY="$MANYCHAT_API_KEY"

# Info da página
curl -H "Authorization: Bearer $KEY" "$BASE/fb/page/getInfo"

# Listar flows
curl -H "Authorization: Bearer $KEY" "$BASE/fb/page/getFlows"

# Listar tags
curl -H "Authorization: Bearer $KEY" "$BASE/fb/tagging/getTags"

# Procurar subscriber
curl -H "Authorization: Bearer $KEY" "$BASE/fb/subscriber/findByName?name=Ricardo"

# Enviar mensagem a subscriber
curl -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"subscriber_id":"123","data":{"version":"v2","content":{"messages":[{"type":"text","text":"Olá!"}]}}}' \
  "$BASE/fb/sending/sendContent"
```

---

## Dashboard Web — URLs

| Secção | URL |
|--------|-----|
| Dashboard principal | https://www.morethanmoney.pt/dashboard-gestao |
| **Métricas (Pie charts)** | https://www.morethanmoney.pt/dashboard-gestao?tab=metrics |
| Admin | https://www.morethanmoney.pt/admin |
| App Mobile | https://www.morethanmoney.pt/app-mobile |
| API Chat | POST /api/dashboard-gestao/chat |
| API Bookings | GET /api/dashboard-gestao/bookings |
| **API Métricas** | GET /api/dashboard-gestao/metrics |

---

## Métricas — Dashboard Local (Claude Code)

Para ver métricas completas do ecossistema localmente, usa estes SQL + APIs:

### Supabase — Queries de métricas

```sql
-- KPIs principais
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE is_active = true) AS active_users,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_30d,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_7d
FROM profiles;

-- Utilizadores por tipo
SELECT user_type, COUNT(*) AS total
FROM profiles
GROUP BY user_type
ORDER BY total DESC;

-- Marcações Calendly por estado
SELECT status, COUNT(*) AS total
FROM calendly_bookings
GROUP BY status;

-- Marcações por tipo de evento
SELECT event_type_slug, COUNT(*) AS total
FROM calendly_bookings
GROUP BY event_type_slug
ORDER BY total DESC;

-- Taxa de cancelamento
SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'cancelled')::numeric /
    NULLIF(COUNT(*)::numeric, 0) * 100, 1
  ) AS cancel_rate_pct
FROM calendly_bookings;

-- Crescimento semanal
SELECT
  DATE_TRUNC('week', created_at) AS week,
  COUNT(*) AS signups
FROM profiles
WHERE created_at > NOW() - INTERVAL '8 weeks'
GROUP BY week
ORDER BY week;
```

### ManyChat — via curl

```bash
# Seguidores totais
curl -s -H "Authorization: Bearer $MANYCHAT_API_KEY" \
  "https://api.manychat.com/fb/page/getInfo" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('Seguidores:', d['data'].get('total_active_subscriber_count', 'N/A'))"

# Contar flows
curl -s -H "Authorization: Bearer $MANYCHAT_API_KEY" \
  "https://api.manychat.com/fb/page/getFlows" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); flows=d.get('data',[]); print(f'{len(flows)} flows total')"

# Contar tags
curl -s -H "Authorization: Bearer $MANYCHAT_API_KEY" \
  "https://api.manychat.com/fb/tagging/getTags" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); tags=d.get('data',[]); print(f'{len(tags)} tags total')"
```

### API Métricas completa (JSON)

```bash
# Com servidor local
curl http://localhost:3000/api/dashboard-gestao/metrics | python3 -m json.tool

# Em produção
curl https://www.morethanmoney.pt/api/dashboard-gestao/metrics | python3 -m json.tool
```

### Pie Charts disponíveis no dashboard online

Vai a: **dashboard-gestao → Métricas** (ícone BarChart3 na sidebar)

| Gráfico | O que mostra |
|---------|-------------|
| Membros por Tipo | Admin / Membro / Trial / Premium |
| Atividade de Membros | Ativos vs Inativos (%) |
| Marcações por Estado | Ativas vs Canceladas |
| Tipo de Marcação | Onboarding vs Reunião Pontual |
| Flows ManyChat | Ativos vs Rascunhos |
| Novos Membros | Esta semana vs semana anterior (bar) |
| Funil MTM | Seguidores → Leads → Agendamentos → Membros |

---

## Métricas de Créditos Anthropic

**Modelo usado:** `claude-3-5-sonnet-20241022`

| Cenário | Tokens/mês | Custo/mês |
|---------|-----------|-----------|
| Uso admin leve (3 conv/dia) | ~270k | ~$5 |
| Uso admin normal (10 conv/dia) | ~900k | ~$16 |
| Uso admin intenso (20 conv/dia) | ~1.8M | ~$32 |
| +100 membros com acesso IA | +3M | +$54 |

**Recomendação:** Comprar $50 em créditos → dura 1-3 meses de uso admin normal.

Gerir em: https://console.anthropic.com/billing

---

## Estilo de Comunicação MTM

- **Língua:** Português de Portugal (não brasileiro)
- **Tratamento:** "tu" (nunca "você")
- **Tom:** informal · próximo · autêntico · descontraído
- **Vocabulário PT:** "óptimo" · "ótimo" · "ecrã" (não "tela") · "telemóvel" (não "celular")
- **Emojis:** moderados, só quando relevante

---

## Estrutura de Ficheiros — Dashboard

```
app/
  dashboard-gestao/
    page.tsx                    # Página principal (sidebar + conteúdo)
  api/dashboard-gestao/
    chat/route.ts               # API SSE com Anthropic SDK + 6 ferramentas
    bookings/route.ts           # Dados Calendly do Supabase

components/dashboard-gestao/
  dg-sidebar.tsx               # Sidebar com 12 secções (navItems, DGSection type)
  dg-overview.tsx              # Visão geral com status badges e grid de agentes
  agent-chat.tsx               # Chat SSE com tool indicators e markdown
  agent-context-panel.tsx      # Painel esquerdo: quick prompts, stats, links
  markdown-renderer.tsx        # Renderer markdown sem dependências externas
```

---

## Dispatch & Cowork — Rede Neural MTM

Para coordenar múltiplos agentes numa tarefa complexa:

```
Tarefa: "Lançar campanha de reativação de leads frios"

1. @agente:ai_control    → "Analisa o estado atual dos sistemas e dá-me dados"
2. @agente:prospeccao    → "Identifica leads frios no ManyChat dos últimos 30 dias"
3. @agente:content       → "Cria 3 emails de reativação para leads frios"
4. @agente:chatbot       → "Cria um flow ManyChat de reativação com os emails aprovados"
5. @agente:compliance    → "Revê os emails por conformidade RGPD"
6. @agente:financial     → "Analisa o ROI esperado da campanha"
```

Claude Code executa este pipeline diretamente via `POST /api/dashboard-gestao/chat`.
Cada agente tem contexto isolado mas pode passar outputs para o próximo.

---

## PENDENTES (memória entre sessões)

### 📋 CHECKLIST DO RICARDO — Mac mini, 2026-09-22 (apagar quando concluído)
**1. VPS · motor novo (fonte nula + Binance + WS + watchdogs) — ~10 min**
```bash
cd "/Users/ricardogarcia/Documents/Repositório SITE/SITE-MORETHANMONEY-FINAL-39aae3022258dec0b1e9cce3dc39489035c05b36"
git pull origin main && npm install   # npm install: dependência nova "ws"
node_modules/.bin/esbuild services/funded-motor/motor.ts --bundle --platform=node --target=node18 --outfile=/tmp/motor.js
scp /tmp/motor.js deploy/vps-stream/nginx-mtm-stream-https.conf.example deploy/vps-stream/funded-motor/mtm-funded-motor.service ubuntu@13.62.134.34:/tmp/
ssh ubuntu@13.62.134.34
  systemctl list-units | grep -i -E 'funded|motor'      # confirmar o NOME real do serviço
  sudo cp /tmp/motor.js /opt/mtm/funded-motor/motor.js
  sudo cp /tmp/mtm-funded-motor.service /etc/systemd/system/  # garante Restart=always
  sudo cp /tmp/nginx-mtm-stream-https.conf.example /etc/nginx/sites-available/mtm-stream  # novo bloco /precos
  sudo nginx -t && sudo systemctl reload nginx
  # OPCIONAL forex sem MetaApi — acrescentar ao /etc/mtm-funded-motor.env:
  #   ESPELHO_FEED_TL=1  ESPELHO_FEED_TL_RECURSO=1
  #   TL_FEED_EMAIL=…  TL_FEED_PASSWORD=…  TL_FEED_SERVER=…  TL_FEED_ENV=demo  TL_FEED_ACCOUNT_ID=…  TL_FEED_ACCNUM=…
  sudo systemctl daemon-reload && sudo systemctl restart mtm-funded-motor funded-copier
  journalctl -u mtm-funded-motor -f   # esperar: "[binance] feed cripto ligado" + "[ws-precos] a ouvir na porta 8788"  # 8787 é do mtm-dialogos, não mexer
  # A porta é 8788, não 8787: a 8787 está ocupada pela ponte do conector MT5 (ver
  # deploy/vps-stream/nginx-mtm-stream.conf e WS_PRECOS_PORTA em /etc/mtm-funded-motor.env).
  journalctl -u mtm-funded-motor -f   # esperar: "[binance] feed cripto ligado" + "[ws-precos] a ouvir na porta 8788"
```
**2. Vercel — env do WebTrader→WS**: Settings → Environment Variables → `NEXT_PUBLIC_FUNDED_WS_URL=wss://stream.morethanmoney.pt/precos` (Production) → Redeploy.
**3. ~~gmi-relay GOLD DID~~ — TERMINADO (decisão do dono 21/09)**: o relay correcto é o do Signal Master Elite (rota única `signal-master-elite` → Premium, já activa no `/opt/gmi-relay/.env`, `GMI_DRY_RUN=0`). As posições Premium da sessão de Londres abrem na conta-mestre MTM Funded (espelho Premium 10K, `1c6a3789`) e o motor propaga aos clientes. Não configurar a rota gold-did.
**4. MetaApi (quando decidires)**: créditos em app.metaapi.cloud → verificar contas DEPLOYED → o streaming reassume sozinho como fonte principal. Aproveitar e apagar no painel a conta órfã 111c8463/estratégia YMEE (resto do Golden Moves).
**5. Ulisses (se ainda não feito)**: abrir logado como admin: `https://www.morethanmoney.pt/api/admin/mtmfunded/conta-emitir-credenciais?account=4e2978b7-75c5-4954-90e5-d2275c1672e5` → gera credenciais e envia o email oficial (esperado: `{"ok":true,"emailAoDono":true}`).
**6. Verificação final**: WebTrader com preços a mexer (cripto já; forex se TL configurado ou MetaApi com créditos); alerta/recuperação do vigia no Telegram; `servicos_pulso` no admin com `wsClientes` e `binance`.
**7. Instalações no Mac (o container é efémero — repetir localmente, na pasta do repo)**:
```bash
npx skills add DietrichGebert/ponytail --skill ponytail --agent claude-code
npx skills add addyosmani/agent-skills --agent claude-code   # 25 skills
npm install -g omniroute                                      # router de IA (352 providers)
uv tool install graphifyy && graphify install --platform claude  # 2 y no pacote; dá graphify + graphify-mcp
```
(As skills vão para `.claude/skills/`, que está no .gitignore — instalação local por máquina, por decisão de segurança: skills de terceiros correm com permissões totais.)

### ⚖️ DOUTRINA — MetaApi é SECUNDÁRIO (ordem do Ricardo, 2026-09-21)
- **As mestres são as contas MTM Funded (sim)**: sinais abrem lá, e o NOSSO motor gere (trailing, auto-BE, parciais) ao nosso preço. A cópia mestre→slaves (MT5 via MetaApi, TradeLocker via API) sai de `copia_rotas` (078, sombra→live por interruptor; escritores mt5+TL implementados).
- **MetaApi serve APENAS**: (1) slaves MT5 de clientes como destino de cópia; (2) fonte de preços preferencial — substituída automaticamente por Binance (cripto, `fonte-binance.ts`) e TradeLocker (`ESPELHO_FEED_TL_RECURSO=1`) quando falha; o motor arranca sem MetaApi (fonte nula). NUNCA voltar a desenhar nada que dependa do MetaApi para o sistema interno funcionar.
- Feed aos browsers: WS do motor (`wss://stream.morethanmoney.pt/precos`, `ws-precos.ts` + `NEXT_PUBLIC_FUNDED_WS_URL`); Supabase fora do caminho quente (o poll por cliente esgotou o egress a 19/09). Vigia Vercel `funded-precos-vigia` (1 min) alerta o admin por Telegram e escreve preços degradados (MetaApi→Binance fallback).

### 🏆 MTM FUNDED — Fase 1 aprovada em conceito (2026-09-13)
- **Spec completo: `docs/mtm-funded-fase1-spec.md`** — motor de contas SIMULADAS (desafios/torneios) + WebTrader próprio no app-mobile. NÃO é prop firm: fase "funded" = **Patrocínio de Desempenho MTM** (recompensa p/ aluno abrir conta própria na PU Prime regulada; MTM nunca custodia nem executa real por clientes).
- Estratégia de custos: MetaApi fica SÓ no MTM Auto + T2T (assinatura cobre a ligação); desafios simulados = custo marginal ~0/conta (um feed de ticks serve todas — providers streaming já pagos). Roadmap geral anti-MetaApi: (0) fechar 7 bypasses REST + interface TradingDriver; (1) MTM Funded próprio; (2) driver TradeLocker direto (API pública grátis — app TradeLocker exigiria brand partnership, rejeitado p/ Fase 1); (3) piloto MT5 self-hosted no mtmcopy-engine (bridge de 80 linhas, fala só via Supabase); (4) CopyFactory própria (últimO — maior risco; custódia de credenciais tem de ser resolvida antes). White label MT5 rejeitado ($7.5k-25k setup + $2.7k-11k/mês + licença de corretora).
- Mapa de dependência MetaApi: superfície real = 13 ficheiros (~3.200 linhas): núcleo `lib/mtmcopy/{metaapi,copyfactory,metaapi-provision,metaapi-admin,system-sync}.ts` + `mtmcopy-engine/src/metaapi-bridge.ts` + 7 bypasses REST (`lib/mtm-auto-bridge.ts`, `lib/accounts-daily-report.ts`, `lib/mtmcopy/provider-metrics.ts`, `app/api/admin/mtmcopy/{repair-subscriber,add-rg-slave,risk-audit,fontes-vivas}`, `app/api/mtm-auto/historico`). 48 consumidores ficam intactos se as assinaturas de `metaapi.ts` se mantiverem.

### 🎛️ CONTROLO ADMIN T2T/MTM COPY (2026-09-04)
- **App-mobile → T2T → Estratégias**: secção "Controlo Admin" (só `user_type='admin'`) com interruptores no estilo Seguir: pausa/liga CÓPIA por estratégia (route.enabled + removeProviderStrategy + resync + espelho em `mtmauto_providers.ativo` — a app MTM Auto lê a MESMA tabela) e liga/desliga FONTES T2T (route.tap_to_trade + `t2t_extra_channels`). API: `/api/admin/mtmcopy/t2t-controls`.
- Fonte desligada → some do feed T2T dos clientes E o botão dos chats desaparece (chat-channels consulta `/api/mtmcopy/tap-to-trade/providers`).
- **Subscritores**: admin Subscribers tab tem Pausar/Retomar por ligação (is_active + unsubscribe/sync CopyFactory; o reconcile respeita is_active). GET inclui pausadas.
- **Rotas provider**: conta mestre pode ser "— (nenhuma)" (account_id '', sobrevive ao repair por match de id; sem execução/CopyFactory, sinais continuam p/ chat+T2T). PUT telegram-sources já NÃO apaga `app_channel`/`signal_source`/`t2t_extra_channels` (bug corrigido).
- **Perps/Aurum Flow**: perps-gate é só de EXECUÇÃO — a entrega (chat cripto-perps + Telegram "Ideias de Perpétuos Cripto" −1004363723837 + T2T) publica sempre; bloqueio fica em trade_status='filtered'. Botão nos perps = **TAP to Copy** (modal com copy por campo: par, direção, entrada, SL, exits — components/mobile/tap-to-copy-modal.tsx). 'cripto-perps' ativo em t2t_extra_channels.
- 34744057 ("Copy PU · Premium") NÃO é mestre CopyFactory: é subscritora espelho da MxsR; o trailing/BE chega-lhe por replicação CopyFactory do mestre 530d2e07 (motor premium-price-monitor gere o mestre; premium_subscriber_exits espelha saídas).

### 🔁 ROTINA SEMANAL — Flyer "Resultados da Semana" (desde 2026-08-22)
- **Ordem permanente do Ricardo:** todas as semanas criar o flyer com resultados reais, enviar-lhe por Telegram e publicar como Story no @morethanmoney.pt. Branding MTM: dourado `#efb810` sobre preto, logo `public/logo-mtm-transparent.png`, CTA WhatsApp +351 912 666 699 + morethanmoney.pt/scanners, disclaimer educativo obrigatório.
- **Automatizado:** cron `/api/cron/weekly-flyer` (sábado 10:00 UTC, vercel.json) → calcula stats canónicas (`lib/mtm-flyer/weekly-stats.ts`: exit_N→TP N, loss→SL, be→entrada; pips 0.0001 forex/0.01 JPY/0.1 XAU, pontos índices; sanidade |12%|/trade) → Telegram sendPhoto ao admin → agenda STORY `approved` na fila `social_scheduled_posts` (ig-publish publica em <5 min). Imagem live: `/api/flyer/weekly?w=YYYY-MM-DD&lang=pt|en` (next/og, 1080×1920).
- **SEMPRE dois flyers separados — PT e EN — e win rate visível em TODOS os cartões** (pedido 2026-08-22). O cron envia/agenda ambos; números formatados por língua (23.900 / 23,900).
- **Funil Telegram:** aos sábados o cron `telegram-leads-content` (11:00/18:00 UTC) publica os DOIS flyers no grupo de leads MTM System (`telegram_leads_group_id`, −1004352255256) com CTAs Testar grátis + DM; dedup semanal em `site_settings.weekly_flyer_leads_posted`.
- **Premium vem do GOLD DID** (relay → chat premium-ideas), NUNCA do TradingView: preferir resumos diários "Total Net : N PIPS"; dias sem resumo → marcos "HIT TP3 +N PIPS" e −50/SL. Fontes no flyer: Premium, MTM Scanner V3.4, Sensei X, GoldKiller (Aurum Perps fora por decisão de 2026-08-22).
- Simulação lote mínimo: ≈$0,10/pip a 0.01 (forex/ouro) e ≈$0,10/ponto a 0.1 (índices).

### ✅ RESOLVIDO 2026-08-20 — Deep-link T2T nas apps nativas (commit b82e4b6)
- A notificação de sinal T2T abre `/app-mobile?tab=tap-to-trade&signal=<msgId>` e o feed abre DE IMEDIATO o modal de confirmação (aceitação 1 clique; guard 1× por sinal — commit 295ceb3).
- **Cobertura por shell (sem rebuild nativo — as shells carregam o site ao vivo):**
  - Web/PWA/Android: service worker `notificationclick` navega com o URL (incl. cold start via openWindow); ação "Fechar" já não abre a app.
  - Capacitor: tap trata `data.url`; cold start recuperado com `App.getLaunchUrl()`.
  - **iOS WKWebView (APNs nativo, código Swift fora do repo)**: RESGATE server-side — ao abrir/retomar sem `?signal`, a app procura a notificação in-app T2T não-lida (<3 min), navega para o `data.url` e marca-a lida. O tap na push funciona de facto mesmo sem a shell entregar o URL.
- Rebuild nativo é OPCIONAL (só para entrega direta do URL no Swift; o resgate já cobre o fluxo).
- Regras de visibilidade em vigor: botão T2T visível em ideias válidas/pendentes até resolução (ENTRY HIT/TP/SL/BE/fecho/descarte, por símbolo E direção); sinais terminados escondidos dos feeds T2T/Alertas MTM (só BD; `?includeClosed=1` devolve tudo).
