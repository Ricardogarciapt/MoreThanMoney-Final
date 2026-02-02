#!/bin/bash

# Script para executar SQL no Supabase
# Requer: Supabase CLI instalado e autenticado

echo "🚀 Executando script SQL no Supabase..."
echo ""

# Verificar se o Supabase CLI está instalado
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não encontrado. Instala com: npm install -g supabase"
    exit 1
fi

# Verificar se está linkado
if ! supabase projects list &> /dev/null; then
    echo "⚠️  Não estás autenticado no Supabase CLI"
    echo "Executa: supabase login"
    exit 1
fi

# Método alternativo: usar psql se tiver acesso
if command -v psql &> /dev/null; then
    echo "📝 Nota: Para executar via psql, usa:"
    echo "psql 'postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres' -f scripts/deploy-mindset-fitness.sql"
    echo ""
fi

echo "✅ O script SQL está pronto em: scripts/deploy-mindset-fitness.sql"
echo ""
echo "📋 Para executar:"
echo "1. Acede ao Supabase Dashboard: https://app.supabase.com"
echo "2. Seleciona o projeto: iwscxotvmtkphajmasof"
echo "3. Vai para SQL Editor"
echo "4. Copia e cola o conteúdo de scripts/deploy-mindset-fitness.sql"
echo "5. Clica em Run"
echo ""
echo "Ou executa manualmente via psql se tiveres acesso direto à base de dados."

