# Ambiente, Supabase, URLs e métricas

> Movido do CLAUDE.md a 17/11/2026 para poupar tokens: só se lê quando a tarefa precisa.

## Variáveis de Ambiente (Vercel Production)

```
ANTHROPIC_API_KEY          # console.anthropic.com — ⚠️ Necessita créditos
ANTHROPIC_MODEL            # claude-3-5-sonnet-20241022 (default se não definido)
NEXT_PUBLIC_SUPABASE_URL   # https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY  # Service role (server-side only)
IG_CLOSER_MODEL            # opcional — modelo do closer das DMs/follow-ups (omissão: ANTHROPIC_MODEL)
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

### Social próprio — contagens reais (Supabase)

```sql
-- Leads do Instagram (quem comentou uma palavra-chave)
SELECT COUNT(*) FROM ig_leads;
SELECT intent, COUNT(*) FROM ig_leads GROUP BY intent ORDER BY 2 DESC;

-- Conversas de WhatsApp por responder
SELECT COUNT(*) FROM whatsapp_conversas WHERE por_responder > 0;

-- Leads do Telegram por etapa
SELECT stage, COUNT(*) FROM telegram_leads GROUP BY stage;
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
| Novos Membros | Esta semana vs semana anterior (bar) |
| Funil MTM | Leads Instagram → Leads Telegram → Agendamentos → Membros |

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

