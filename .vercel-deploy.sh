#!/bin/bash

# Script de Deploy para Vercel via CLI
# Data: 10 de Outubro de 2025

echo "🚀 MTM Deploy Script - Vercel CLI"
echo "=================================="
echo ""

# Verificar se vercel está instalado
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI não está instalado!"
    echo "📦 Instalando Vercel CLI..."
    npm install -g vercel
fi

echo "✅ Vercel CLI encontrado"
echo ""

# Verificar branch atual
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Branch atual: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "site-mtm-versao-3" ]; then
    echo "⚠️  Aviso: Você não está na branch site-mtm-versao-3"
    echo "   Branch atual: $CURRENT_BRANCH"
fi

echo ""
echo "📊 Últimos commits:"
git log --oneline -5
echo ""

# Verificar se há mudanças não commitadas
if [[ -n $(git status -s) ]]; then
    echo "⚠️  Há mudanças não commitadas!"
    git status -s
    echo ""
    read -p "❓ Deseja continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deploy cancelado."
        exit 1
    fi
fi

echo ""
echo "🔑 Para fazer deploy, você precisa de um token da Vercel."
echo ""
echo "📝 Como obter o token:"
echo "   1. Acesse: https://vercel.com/account/tokens"
echo "   2. Clique em 'Create Token'"
echo "   3. Dê um nome (ex: 'MTM Deploy')"
echo "   4. Copie o token gerado"
echo ""
read -p "❓ Você já tem um token da Vercel? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⏸️  Deploy pausado."
    echo "📖 Siga as instruções acima para criar um token."
    echo ""
    echo "Depois execute:"
    echo "   export VERCEL_TOKEN='seu_token_aqui'"
    echo "   vercel --prod --token \$VERCEL_TOKEN"
    exit 0
fi

echo ""
read -sp "🔑 Cole seu token da Vercel aqui: " VERCEL_TOKEN
echo ""
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
    echo "❌ Token não fornecido. Deploy cancelado."
    exit 1
fi

echo "✅ Token recebido"
echo ""
echo "🚀 Iniciando deploy para PRODUÇÃO..."
echo "⏳ Isso pode levar alguns minutos..."
echo ""

# Fazer deploy para produção
vercel --prod --token "$VERCEL_TOKEN"

DEPLOY_STATUS=$?

echo ""
if [ $DEPLOY_STATUS -eq 0 ]; then
    echo "✅ Deploy concluído com sucesso!"
    echo ""
    echo "🎉 Próximos passos:"
    echo "   1. Verificar variáveis de ambiente na Vercel"
    echo "   2. Executar scripts SQL no Supabase"
    echo "   3. Configurar Google OAuth"
    echo "   4. Testar funcionalidades"
    echo ""
    echo "📚 Guias disponíveis:"
    echo "   - DEPLOY_FINAL_CHECKLIST.md"
    echo "   - FIX_GOOGLE_OAUTH_CALLBACK.md"
    echo "   - RESOLVER_ERROS_SQL.md"
else
    echo "❌ Deploy falhou!"
    echo "📋 Verifique os logs acima para mais detalhes."
    echo ""
    echo "💡 Dicas:"
    echo "   - Verificar se o token está correto"
    echo "   - Verificar conexão com internet"
    echo "   - Tentar deploy via Dashboard: https://vercel.com/dashboard"
fi

echo ""

