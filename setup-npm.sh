#!/bin/bash

# Script para configurar npm usando o Node.js do Cursor

CURSOR_NODE="/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"

if [ ! -f "$CURSOR_NODE" ]; then
    echo "❌ Node.js do Cursor não encontrado em: $CURSOR_NODE"
    exit 1
fi

echo "✅ Node.js do Cursor encontrado:"
$CURSOR_NODE --version

echo ""
echo "⚠️  O Node.js do Cursor não inclui npm."
echo ""
echo "📋 Opções para instalar npm:"
echo ""
echo "1️⃣  INSTALAR VIA HOMEBREW (Recomendado para macOS):"
echo "   brew install node"
echo "   # Isso instala Node.js + npm completo"
echo ""
echo "2️⃣  INSTALAR VIA NVM (Node Version Manager):"
echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
echo "   source ~/.zshrc"
echo "   nvm install --lts"
echo "   # Isso instala Node.js LTS + npm"
echo ""
echo "3️⃣  DOWNLOAD DIRETO:"
echo "   https://nodejs.org/ (escolher versão LTS)"
echo ""
echo "💡 Após instalar Node.js, execute:"
echo "   npm install --legacy-peer-deps"
echo ""
