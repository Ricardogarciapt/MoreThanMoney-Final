#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MTM Agent Runner — Dashboard local via terminal
# Usa a API /api/dashboard-gestao/chat do servidor local (npm run dev)
#
# Uso:
#   ./scripts/mtm-agent.sh setter "Mostra as próximas marcações Calendly"
#   ./scripts/mtm-agent.sh ai_control "Estado de todos os sistemas"
#   ./scripts/mtm-agent.sh content_creation "Hook para Reel de liberdade financeira"
#
# Agentes disponíveis:
#   prospeccao · chatbot_builder · setter · financial_email · compliance
#   content_creation · partnerships · trading · business_incubation
#   ai_control · education · app_creator
# ─────────────────────────────────────────────────────────────────────────────

AGENT="${1:-ai_control}"
MESSAGE="${2:-Faz um relatório do estado de todos os sistemas MTM}"
BASE_URL="${MTM_BASE_URL:-http://localhost:3000}"

AGENTS=(prospeccao chatbot_builder setter financial_email compliance content_creation partnerships trading business_incubation ai_control education app_creator)

# Validate agent
valid=false
for a in "${AGENTS[@]}"; do
  [[ "$a" == "$AGENT" ]] && valid=true && break
done

if [[ "$valid" == false ]]; then
  echo "❌ Agente inválido: $AGENT"
  echo ""
  echo "Agentes disponíveis:"
  for a in "${AGENTS[@]}"; do echo "  • $a"; done
  exit 1
fi

echo ""
echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│  MTM Dashboard — Agente: $AGENT"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
echo "📨  $MESSAGE"
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo ""

# Send request to local API and stream response
curl -sN -X POST "$BASE_URL/api/dashboard-gestao/chat" \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"$AGENT\",\"messages\":[{\"role\":\"user\",\"content\":\"$MESSAGE\"}]}" \
  | while IFS= read -r line; do
    # Strip "data: " prefix
    if [[ "$line" == data:* ]]; then
      raw="${line#data: }"
      [[ "$raw" == "[DONE]" ]] && echo "" && break

      # Parse type field
      type=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('type',''))" 2>/dev/null)

      case "$type" in
        text)
          text=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('text',''),end='')" 2>/dev/null)
          printf "%s" "$text"
          ;;
        tool_start)
          name=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null)
          printf "\n🔧 [%s]…" "$name"
          ;;
        tool_result)
          name=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null)
          printf " ✓\n\n"
          ;;
        error)
          msg=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','Erro desconhecido'))" 2>/dev/null)
          echo ""
          echo "❌ Erro: $msg"
          ;;
      esac
    fi
  done

echo ""
echo ""
echo "─────────────────────────────────────────────────────────────────"
echo "✅  Agente $AGENT · $(date +"%H:%M:%S")"
echo ""
