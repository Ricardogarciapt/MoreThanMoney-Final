#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MTM Neural Network — Setup Local
# Configura o ambiente de desenvolvimento em localhost:3000
# Uso: bash scripts/setup-local.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$DIR/.env.local"

GREEN='\033[0;32m' YELLOW='\033[1;33m' RED='\033[0;31m' CYAN='\033[0;36m' NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }
info() { echo -e "${CYAN}→${NC} $1"; }

echo ""
echo -e "${CYAN}⚡ MTM Neural Network — Setup Local${NC}"
echo "────────────────────────────────────────"
echo ""

# ── 1. Verificar .env.local ───────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  ok ".env.local encontrado"
else
  warn ".env.local não encontrado — a criar template..."
  cat > "$ENV_FILE" << 'EOF'
# ─── Supabase ──────────────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ─── Anthropic ─────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241103

# ─── OpenAI (opcional) ────────────────────────────────────────────────────
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini

# ─── ManyChat ─────────────────────────────────────────────────────────────
MANYCHAT_API_KEY=...
# ou
# MANYCHAT_API_TOKEN=...

# ─── Agent API ────────────────────────────────────────────────────────────
AGENT_SITE_API_KEY=sk_agent_mtm_local_dev
ADMIN_TOKEN=admin_mtm_local_dev

# ─── Site ─────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# ─── Preferência de AI Chat (auto | anthropic | openai) ──────────────────
AI_CHAT_PROVIDER=anthropic
EOF
  warn "Edita $ENV_FILE com as tuas chaves antes de continuar!"
  echo ""
  info "Ficheiro criado em: $ENV_FILE"
  echo ""
fi

# ── 2. Verificar chaves essenciais ────────────────────────────────────────────
echo "Verificar variáveis de ambiente..."
source "$ENV_FILE" 2>/dev/null || true

MISSING=0
check_var() {
  local var="$1" label="$2"
  local val="${!var:-}"
  if [[ -z "$val" || "$val" == *"..."* || "$val" == *"xxx"* ]]; then
    err "$label não configurado ($var)"
    MISSING=$((MISSING+1))
  else
    ok "$label OK (${val:0:12}...)"
  fi
}

check_var NEXT_PUBLIC_SUPABASE_URL    "Supabase URL"
check_var NEXT_PUBLIC_SUPABASE_ANON_KEY "Supabase Anon Key"
check_var SUPABASE_SERVICE_ROLE_KEY   "Supabase Service Role"
check_var ANTHROPIC_API_KEY           "Anthropic API Key"
check_var MANYCHAT_API_KEY            "ManyChat API Key"
echo ""

if [[ $MISSING -gt 0 ]]; then
  warn "$MISSING variável(eis) em falta. O servidor pode não funcionar correctamente."
  echo ""
fi

# ── 3. Verificar node_modules ─────────────────────────────────────────────────
if [[ -d "$DIR/node_modules" ]]; then
  ok "node_modules existente"
else
  info "A instalar dependências..."
  cd "$DIR" && npm install
fi

# ── 4. Teste de conectividade (se servidor estiver a correr) ──────────────────
echo ""
echo "A verificar se o servidor está activo..."
SERVER_URL="http://localhost:3000"

if curl -sf --max-time 3 "$SERVER_URL/api/agent/v1" -H "Authorization: Bearer ${AGENT_SITE_API_KEY:-dev}" -o /dev/null 2>&1; then
  ok "Servidor activo em $SERVER_URL"
  ok "Dashboard: $SERVER_URL/dashboard-gestao"
  ok "Artifact:  $SERVER_URL/mtm-agent-dashboard.html"
  echo ""

  # Testar métricas
  if curl -sf --max-time 5 "$SERVER_URL/api/dashboard-gestao/metrics" -o /dev/null 2>&1; then
    ok "API Métricas: OK"
  else
    warn "API Métricas: sem resposta"
  fi

else
  warn "Servidor não está activo. Para iniciar:"
  echo ""
  echo "   cd '$DIR'"
  echo "   npm run dev"
  echo ""
fi

# ── 5. Resumo ─────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────"
echo -e "${GREEN}Setup completo!${NC}"
echo ""
echo "URLs após npm run dev:"
echo "  Dashboard:  http://localhost:3000/dashboard-gestao"
echo "  Artifact:   http://localhost:3000/mtm-agent-dashboard.html"
echo "  API Agent:  http://localhost:3000/api/agent/v1"
echo "  Métricas:   http://localhost:3000/api/dashboard-gestao/metrics"
echo ""
echo "Para usar o artifact:"
echo "  1. npm run dev"
echo "  2. Login como admin em localhost:3000"
echo "  3. Abre localhost:3000/mtm-agent-dashboard.html"
echo ""
echo "Para usar via Claude Code:"
echo "  bash scripts/mtm-agent.sh ai_control 'Estado do ecossistema'"
echo ""
