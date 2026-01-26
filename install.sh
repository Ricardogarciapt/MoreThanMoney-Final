#!/bin/bash

# Script para instalar dependências do projeto MoreThanMoney
# Execute este script no terminal: bash install.sh

echo "🚀 Instalando dependências do MoreThanMoney..."

# Verificar se npm está disponível
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado no PATH"
    echo ""
    echo "Por favor, instale Node.js primeiro:"
    echo ""
    echo "Opção 1 - Homebrew:"
    echo "  brew install node"
    echo ""
    echo "Opção 2 - NVM:"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "  source ~/.zshrc"
    echo "  nvm install --lts"
    echo ""
    echo "Opção 3 - Download: https://nodejs.org/"
    echo ""
    exit 1
fi

# Verificar versão do Node.js
NODE_VERSION=$(node -v)
echo "✅ Node.js encontrado: $NODE_VERSION"

# Verificar se atende aos requisitos (>=18.0.0)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "⚠️  Node.js versão $NODE_VERSION detectada"
    echo "   Requer Node.js >= 18.0.0"
    echo "   Por favor, atualize o Node.js"
    exit 1
fi

# Limpar cache do npm (opcional, mas ajuda com problemas)
echo "🧹 Limpando cache do npm..."
npm cache clean --force 2>/dev/null || true

# Instalar dependências
echo "📦 Instalando dependências (isso pode levar alguns minutos)..."
npm install --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dependências instaladas com sucesso!"
    echo ""
    echo "Próximos passos:"
    echo "  npm run dev    - Iniciar servidor de desenvolvimento (porta 3001)"
    echo "  npm run build  - Criar build de produção"
    echo "  npm run start  - Iniciar servidor de produção"
else
    echo ""
    echo "❌ Erro ao instalar dependências"
    echo "   Tente novamente ou verifique os logs acima"
    exit 1
fi
