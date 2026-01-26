#!/bin/bash

# Script completo para instalar dependências do MoreThanMoney
# Este script tenta várias abordagens para instalar Node.js e npm

set -e

echo "🚀 Instalando dependências do MoreThanMoney..."
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Tentar encontrar npm
find_npm() {
    local npm_path=""
    
    # Verificar PATH padrão
    if command_exists npm; then
        npm_path=$(which npm)
        echo "$npm_path"
        return 0
    fi
    
    # Verificar locais comuns
    local paths=(
        "/usr/local/bin/npm"
        "/opt/homebrew/bin/npm"
        "$HOME/.nvm/versions/node/*/bin/npm"
        "$HOME/.local/bin/npm"
    )
    
    for path in "${paths[@]}"; do
        if [ -f "$path" ] || [ -n "$(ls $path 2>/dev/null)" ]; then
            npm_path="$path"
            echo "$npm_path"
            return 0
        fi
    done
    
    return 1
}

# Verificar se npm já existe
echo "🔍 Verificando se npm está instalado..."
NPM_PATH=$(find_npm 2>/dev/null || echo "")

if [ -n "$NPM_PATH" ]; then
    echo -e "${GREEN}✅ npm encontrado em: $NPM_PATH${NC}"
    $NPM_PATH --version
    echo ""
    echo "📦 Instalando dependências..."
    $NPM_PATH install --legacy-peer-deps
    exit 0
fi

# npm não encontrado - tentar instalar
echo -e "${YELLOW}⚠️  npm não encontrado. Tentando instalar...${NC}"
echo ""

# Opção 1: Tentar usar Homebrew para instalar Node.js
if command_exists brew; then
    echo "✅ Homebrew encontrado. Instalando Node.js via Homebrew..."
    brew install node
    if command_exists npm; then
        echo -e "${GREEN}✅ Node.js e npm instalados com sucesso!${NC}"
        npm install --legacy-peer-deps
        exit 0
    fi
fi

# Opção 2: Tentar instalar Homebrew primeiro (só se não existir)
if ! command_exists brew && [ -f "/usr/bin/ruby" ]; then
    echo "📥 Homebrew não encontrado. Deseja instalar? (isso pode demorar)"
    echo "   Execute manualmente: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    echo ""
fi

# Se chegou aqui, não conseguimos instalar automaticamente
echo -e "${RED}❌ Não foi possível instalar npm automaticamente.${NC}"
echo ""
echo "📋 Por favor, instale Node.js manualmente:"
echo ""
echo "1️⃣  VIA HOMEBREW (se já tiver instalado):"
echo "   brew install node"
echo ""
echo "2️⃣  VIA NVM:"
echo "   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
echo "   source ~/.zshrc"
echo "   nvm install --lts"
echo ""
echo "3️⃣  DOWNLOAD: https://nodejs.org/ (versão LTS)"
echo ""
echo "💡 Após instalar Node.js, execute:"
echo "   npm install --legacy-peer-deps"
echo ""
exit 1
