#!/bin/bash

# Script para executar SQL no Supabase
# Este script fornece instruções e tenta métodos alternativos

echo "🚀 Executando Script SQL no Supabase"
echo "======================================"
echo ""

# Verificar se temos acesso ao Supabase CLI
if command -v supabase &> /dev/null; then
    echo "✅ Supabase CLI encontrado"
    
    # Tentar link ao projeto
    echo "📋 Tentando link ao projeto..."
    supabase link --project-ref iwscxotvmtkphajmasof 2>&1 | head -3 || echo "⚠️  Link não configurado"
    echo ""
fi

# Verificar se temos psql
if command -v psql &> /dev/null; then
    echo "✅ psql encontrado"
    echo ""
    echo "📝 Para executar via psql, usa:"
    echo "psql 'postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres' -f scripts/deploy-mindset-fitness.sql"
    echo ""
else
    echo "⚠️  psql não encontrado"
    echo ""
fi

echo "======================================"
echo "📋 MÉTODO RECOMENDADO:"
echo "======================================"
echo ""
echo "1. Acede ao Supabase Dashboard:"
echo "   https://app.supabase.com"
echo ""
echo "2. Seleciona o projeto:"
echo "   iwscxotvmtkphajmasof"
echo ""
echo "3. Vai para SQL Editor (menu lateral)"
echo ""
echo "4. Cria uma nova query"
echo ""
echo "5. Copia e cola o conteúdo de:"
echo "   scripts/deploy-mindset-fitness.sql"
echo ""
echo "6. Clica em 'Run' ou pressiona Cmd/Ctrl + Enter"
echo ""
echo "======================================"
echo "✅ O script SQL está pronto em:"
echo "   scripts/deploy-mindset-fitness.sql"
echo ""
echo "📊 Tabelas que serão criadas:"
echo "   - workouts"
echo "   - workout_sessions"
echo "   - meals"
echo "   - mindset_sessions"
echo "   - fitness_goals"
echo "   - mindset_goals"
echo ""

