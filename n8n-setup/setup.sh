#!/bin/bash
# ============================================================
# MTM n8n Setup — VPS Contabo 173.249.23.54
# Corre este script como root no VPS
# ============================================================

set -e

echo "🚀 [MTM n8n] A iniciar setup..."

# ── 1. Variáveis de ambiente ────────────────────────────────
# PREENCHE ANTES DE CORRER:
export SUPABASE_SERVICE_ROLE_KEY="COLOCA_AQUI"
export TELEGRAM_BOT_TOKEN="COLOCA_AQUI"
export GMAIL_APP_PASSWORD="COLOCA_AQUI"

# ── 2. Instalar Docker se não existir ───────────────────────
if ! command -v docker &> /dev/null; then
    echo "📦 A instalar Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo "📦 A instalar Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
         -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo "✅ Docker OK"

# ── 3. Criar pasta do projeto ───────────────────────────────
mkdir -p /opt/mtm-n8n
cd /opt/mtm-n8n

# ── 4. Copiar docker-compose.yml ────────────────────────────
# (este script assume que o docker-compose.yml está na mesma pasta)
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml não encontrado. Copia-o para /opt/mtm-n8n/ primeiro."
    exit 1
fi

# ── 5. Criar ficheiro .env ──────────────────────────────────
cat > .env << EOF
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
GMAIL_APP_PASSWORD=${GMAIL_APP_PASSWORD}
EOF

echo "✅ .env criado"

# ── 6. Arrancar n8n ─────────────────────────────────────────
docker-compose up -d
echo "✅ n8n a correr em http://localhost:5678"

# ── 7. Configurar nginx ─────────────────────────────────────
if command -v nginx &> /dev/null; then
    cp nginx-n8n.conf /etc/nginx/sites-available/n8n.morethanmoney.pt
    ln -sf /etc/nginx/sites-available/n8n.morethanmoney.pt \
           /etc/nginx/sites-enabled/n8n.morethanmoney.pt
    nginx -t && systemctl reload nginx
    echo "✅ Nginx configurado"

    # SSL com certbot
    if command -v certbot &> /dev/null; then
        certbot --nginx -d n8n.morethanmoney.pt --non-interactive --agree-tos \
                -m morethanmoneypt@gmail.com
        echo "✅ SSL ativado"
    else
        echo "⚠️  Certbot não encontrado. Corre: apt install certbot python3-certbot-nginx"
    fi
else
    echo "⚠️  Nginx não encontrado. Instala: apt install nginx"
fi

# ── 8. Registar webhook do Telegram ─────────────────────────
echo ""
echo "📡 A registar webhook Telegram..."
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://n8n.morethanmoney.pt/webhook/telegram-mtm" \
     -d "allowed_updates=[\"message\",\"callback_query\"]" | python3 -m json.tool

echo ""
echo "============================================"
echo "✅ MTM n8n setup completo!"
echo ""
echo "🌐 URL: https://n8n.morethanmoney.pt"
echo "👤 User: admin"
echo "🔑 Pass: MTM_n8n_2026!"
echo ""
echo "📌 Próximos passos:"
echo "  1. Abre https://n8n.morethanmoney.pt"
echo "  2. Vai a Settings > Import Workflow"
echo "  3. Importa os 4 ficheiros JSON da pasta workflows/"
echo "  4. Ativa cada workflow"
echo "============================================"
