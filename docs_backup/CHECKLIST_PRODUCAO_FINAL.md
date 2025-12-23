# ✅ Checklist de Verificação em Produção

## 🚀 Deploy Concluído!
- ✅ Merge para `main` completo
- ✅ Push para GitHub feito
- ⏳ Deploy automático na Vercel em andamento

---

## 📋 Tarefas Críticas para Testar

### 1️⃣ **Criar Bucket `uploads` no Supabase Storage**

**Por que?** O social feed precisa deste bucket para guardar imagens e vídeos.

**Como fazer:**
1. Acede a: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/storage/buckets
2. Clica em **"New bucket"**
3. Configura:
   - **Name:** `uploads`
   - **Public:** ✅ **SIM** (marcar como público)
   - **File size limit:** 50 MB
   - **Allowed MIME types:** `image/*, video/*`
4. Clica em **"Create bucket"**

**Políticas de Acesso (RLS):**
Vai a "Policies" e adiciona:

```sql
-- Policy: Todos podem VER uploads
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'uploads' );

-- Policy: Usuários autenticados podem FAZER UPLOAD
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' AND
  auth.role() = 'authenticated'
);

-- Policy: Usuários podem DELETAR seus próprios uploads
CREATE POLICY "Users can delete own uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

---

### 2️⃣ **Verificar Variáveis de Ambiente na Vercel**

Acede a: https://vercel.com/your-team/site-morethanmoney-final/settings/environment-variables

**Confirma que estas variáveis estão configuradas:**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Notion (para scraping do portfolio)
NEXT_PUBLIC_NOTION_API_KEY=secret_...
NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID=...

# OpenAI (para análise DCA)
OPENAI_API_KEY=sk-...

# Site URL (CRÍTICO para OAuth)
NEXT_PUBLIC_SITE_URL=https://morethanmoney.pt
```

**Se faltarem variáveis:**
1. Clica em **"Add New"**
2. Seleciona **"Production", "Preview", "Development"**
3. Cola o valor
4. Clica em **"Save"**
5. **Redeploy** o site

---

### 3️⃣ **Testar Social Feed (App-Mobile)**

**URL:** https://morethanmoney.pt/app-mobile

**Testes:**
- [ ] **Criar Post:**
  - Escreve um texto
  - Adiciona uma imagem
  - Clica em "Publicar"
  - **Esperado:** Post aparece no feed

- [ ] **Like:**
  - Clica no ❤️ de um post
  - **Esperado:** Contador aumenta, coração fica vermelho

- [ ] **Comentar:**
  - Clica nos comentários
  - Adiciona um comentário
  - **Esperado:** Comentário aparece

- [ ] **Delete:**
  - Clica nos 3 pontos de um post teu
  - Clica em "Eliminar"
  - **Esperado:** Post desaparece

**Se falhar:**
- Abre DevTools (F12) → Console
- Verifica erros
- Partilha os logs comigo

---

### 4️⃣ **Testar Sincronização de Portfolios**

**URL:** https://morethanmoney.pt/portfolios

**Testes:**
- [ ] **Verificar Fonte de Dados:**
  - No topo da página, verifica o badge
  - **Esperado:** "Notion (Scraping Real)" ou "Dados Locais (Fallback)"

- [ ] **Sync Manual:**
  - Clica em "Sincronizar Dados"
  - **Esperado:** Loading + dados atualizados

- [ ] **Preços Atuais:**
  - Verifica se os preços de BTC, ETH, etc. estão atuais
  - **Esperado:** Preços da Binance em tempo real

- [ ] **DCA Opportunities:**
  - Scroll até "Oportunidades DCA Inteligentes"
  - **Esperado:** Cards com recomendações (Forte Compra, Compra, etc.)
  - Usa as setas para navegar pelos cards

- [ ] **Gráficos:**
  - Verifica se os gráficos de crescimento aparecem
  - **Esperado:** Linhas de projeção para 5 anos

**Console Logs Esperados:**
```
📊 [PORTFOLIO] Carregando dados...
✅ [PORTFOLIO] Fonte de dados: Notion (Scraping Real)
💰 [PORTFOLIO] Crypto processado: total_assets: 28, with_price: 28, avg_performance: +X.XX%
```

**Se falhar:**
- Abre DevTools → Console
- Verifica se há erros de API
- Verifica se `NEXT_PUBLIC_NOTION_API_KEY` está configurado na Vercel

---

### 5️⃣ **Testar App-Mobile Tab Portfolio**

**URL:** https://morethanmoney.pt/app-mobile → Tab "Portfolio"

**Testes:**

#### **Tab "Portfólio MTM":**
- [ ] Verifica se os ativos aparecem (BTC, ETH, SOL, etc.)
- [ ] Verifica preços atuais
- [ ] Verifica alvos (TP1, TP2, TP3, SL)
- [ ] Verifica performance (7d, 30d, YTD)

**Esperado:**
- Dados sincronizados com `/api/portfolio/mtm`
- Preços atuais da Binance
- Auto-refresh a cada 2 minutos

#### **Tab "Meu Portfólio":**
- [ ] Clica em "Adicionar Ativo"
- [ ] Preenche:
  - Símbolo: BTCUSDT
  - Nome: Bitcoin
  - Quantidade: 0.5
  - Preço de Compra: 42000
- [ ] Clica em "Adicionar Ativo"
- [ ] **Esperado:** Asset aparece na lista

- [ ] Clica em "Alerta TP (+20%)"
- [ ] **Esperado:** Alerta criado, mensagem de sucesso

- [ ] Clica em "Alerta SL (-15%)"
- [ ] **Esperado:** Alerta criado, mensagem de sucesso

- [ ] Verifica se o PNL é calculado corretamente
- [ ] Clica no botão de Share
- [ ] **Esperado:** Menu com WhatsApp, Telegram, Instagram, etc.

**Console Logs Esperados:**
```
🔄 [SOCIAL FEED] Carregando posts do Supabase...
✅ [SOCIAL FEED] Posts carregados: X
```

---

## 🔍 Como Verificar os Logs de Produção

### **Na Vercel:**
1. Vai a: https://vercel.com/your-team/site-morethanmoney-final/logs
2. Filtra por "Error" para ver erros
3. Procura por:
   - `[API MTM]` → Logs do portfolio
   - `[SOCIAL FEED]` → Logs do feed social
   - `[PROTECTED PAGE]` → Logs de autenticação

### **No Supabase:**
1. Vai a: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/logs/explorer
2. SQL Editor → Executa:

```sql
-- Ver posts criados nas últimas 24h
SELECT * FROM social_posts 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver likes
SELECT * FROM social_likes 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver comentários
SELECT * FROM social_comments 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver notificações
SELECT * FROM notifications 
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 🚨 Problemas Comuns e Soluções

### ❌ **"Erro ao publicar post"**
**Causa:** Bucket `uploads` não existe  
**Solução:** Segue o passo 1️⃣ acima

### ❌ **"Portfólio MTM não carrega"**
**Causa:** `NEXT_PUBLIC_NOTION_API_KEY` não configurado  
**Solução:** Adiciona na Vercel + Redeploy

### ❌ **"Login redireciona para localhost"**
**Causa:** Google OAuth mal configurado  
**Solução:** Verifica FIX_GOOGLE_OAUTH_CALLBACK.md

### ❌ **"Página em loading infinito"**
**Causa:** `getSession()` timeout  
**Solução:** Verifica se `NEXT_PUBLIC_SUPABASE_URL` está correto

---

## ✅ Resultado Esperado Final

Quando tudo estiver a funcionar:

1. **Social Feed:**
   - ✅ Posts salvos no Supabase
   - ✅ Imagens no Storage
   - ✅ Likes e comments funcionais

2. **Portfolios:**
   - ✅ Dados do Notion sincronizados
   - ✅ Preços atuais via Binance
   - ✅ DCA com 3 cards por slide + navegação

3. **App-Mobile:**
   - ✅ Portfolio MTM sincronizado
   - ✅ Portfolio pessoal com alertas TP/SL
   - ✅ Auto-refresh a cada 2 minutos

4. **Auth:**
   - ✅ Login rápido (<3s)
   - ✅ Cache de sessões
   - ✅ Redirects para morethanmoney.pt

---

## 🎯 Próximos Passos

Depois de testar tudo:

1. **Se houver erros:**
   - Copia os logs do console
   - Partilha comigo para debug

2. **Se tudo funcionar:**
   - ✅ Sistema pronto para produção!
   - ✅ Social feed ativo
   - ✅ Portfolios sincronizados
   - ✅ App-mobile completo

---

**Última atualização:** 11 Out 2025  
**Status:** 🟢 Deploy em produção  
**Branch:** `main`  
**Commit:** 22dc1d2

