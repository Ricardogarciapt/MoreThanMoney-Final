# 🧹 Limpeza e Sincronização do Projeto

## ✅ Ficheiros Removidos

1. ✅ `components/google-translate.tsx` - Componente desativado (retorna null)
2. ✅ `components/mobile/scanner-mobile 2.tsx` - Ficheiro duplicado

## 📋 Scripts SQL Principais (Manter)

### Sistema de Mensagens
- `create-messages-system.sql` - Sistema de conversas diretas
- `create-group-messages-system.sql` - Sistema de grupos

### Sistema de Posts Social
- `verify-and-fix-social-posts.sql` - Verificação completa de posts
- `fix-posts-updated-at.sql` - Adicionar coluna updated_at
- `fix-posts-media-urls.sql` - Adicionar coluna media_urls
- `fix-posts-rls-policies.sql` - Políticas RLS

### Sistema de Scanner
- `create-scanner-storage.sql` - Armazenamento de charts e checklist

### Sistema de Trading
- `INSTALL_TRADING_PLANS_COMPLETE.sql` - Sistema completo de trading plans
- `create-trading-plans.sql` - Tabelas de trading plans

### Sistema de Portfolios
- `create-admin-portfolio-tables.sql` - Tabelas de portfolios admin
- `setup-admin-portfolios.sql` - Setup de portfolios

### Sistema de XP
- `create-xp-system.sql` - Sistema de gamificação
- `ensure-xp-system.sql` - Garantir sistema XP

### Sistema de Notificações
- `create-notifications-system.sql` - Sistema de notificações
- `create-price-alerts-system.sql` - Alertas de preço

### Conteúdo Admin
- `sync-admin-content-iqonic.sql` - Sincronizar conteúdo IQONIC

## 🗑️ Scripts SQL Obsoletos (Pode Remover)

### Duplicados/Obsoletos
- `add-member-category-simple.sql` (usar `add-member-category.sql`)
- `fix-posts-user-id-simples.sql` (usar `fix-posts-column-user_id.sql`)
- `create-all-rpc-functions-drop-first.sql` (usar `create-all-rpc-functions-clean.sql`)
- `upsert-user-admin-vip-fixed.js` e `.sql` (duplicados)
- `setup-admin-portfolios-clean.sql` (usar `setup-admin-portfolios.sql`)

### Scripts de Teste (Manter para referência)
- `test-*.js` - Scripts de teste (manter)
- `check-*.js` - Scripts de verificação (manter)

### Scripts de Fix Antigos (Arquivar)
- `fix-auth-*.js`, `fix-auth-*.sql` - Fixes antigos de auth
- `fix-admin-*.sql` - Fixes antigos de admin

## 🔄 Sincronização Necessária

### 1. Supabase Schema
- ✅ `group_conversations` - Criado com constraint UNIQUE em `name`
- ✅ `group_members` - Criado
- ✅ `messages` - Coluna `group_id` adicionada
- ✅ `posts` - Colunas `media_urls`, `mentions`, `updated_at` adicionadas
- ✅ `user_charts` - Criado
- ✅ `user_checklist_progress` - Criado

### 2. APIs Ativas
- ✅ `/api/messages/*` - Sistema de mensagens
- ✅ `/api/social/posts/*` - Sistema de posts
- ✅ `/api/charts/*` - Sistema de charts
- ✅ `/api/checklist` - Sistema de checklist
- ✅ `/api/trading-plans/*` - Sistema de trading plans
- ✅ `/api/portfolio/*` - Sistema de portfolios
- ✅ `/api/xp/*` - Sistema de XP

### 3. Frontend
- ✅ `app/messages/page.tsx` - Página de mensagens
- ✅ `app/app-mobile/page.tsx` - App mobile com tab Chats
- ✅ `components/mobile/chats-mobile.tsx` - Componente de grupos
- ✅ `components/mobile/social-feed.tsx` - Feed social

## 📝 Próximos Passos

1. Executar scripts SQL principais no Supabase
2. Verificar que todas as APIs estão funcionando
3. Testar fluxo completo de mensagens e grupos
4. Remover scripts SQL obsoletos após confirmação

