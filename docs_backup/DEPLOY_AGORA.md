# 🚀 DEPLOY AGORA - Guia Rápido

## ✅ Status

- ✅ Projeto já está linkado à Vercel
- ✅ 11 commits prontos para deploy
- ✅ Build local: Success
- ✅ Branch: `site-mtm-versao-3`

---

## 🎯 Opções de Deploy

### 🟢 OPÇÃO 1: Deploy Automático (MAIS FÁCIL)

**O código JÁ FOI PUSHED para GitHub!**

O deploy acontecerá automaticamente:

1. Ir para: https://vercel.com/dashboard
2. Encontrar projeto: "SITE-MORETHANMONEY-FINAL"
3. Verificar tab "Deployments"
4. Deploy deve estar em andamento ou completado

**Se não iniciou automático:**
- Clicar "Redeploy" no último deployment
- Ou aguardar alguns minutos

---

### 🟡 OPÇÃO 2: Deploy via CLI (Token)

**Você precisa de um token da Vercel.**

#### Obter Token:
1. https://vercel.com/account/tokens
2. "Create Token"
3. Nome: "MTM Deploy"
4. Copiar token

#### Deploy:
```bash
vercel --prod --token SEU_TOKEN_AQUI
```

---

### 🟡 OPÇÃO 3: Deploy via Script

Execute:
```bash
./vercel-deploy.sh
```

O script pedirá seu token e fará o deploy automaticamente.

---

## ⚡ Deploy Rápido (Recomendado)

**Passo a passo mais rápido:**

```bash
# 1. Obter token em: https://vercel.com/account/tokens

# 2. Executar (substitua SEU_TOKEN):
vercel --prod --token SEU_TOKEN_AQUI
```

Aguardar ~10-15 minutos ⏳

---

## 📊 O Que Verificar

Após deploy, a Vercel mostrará:

```
✅ Production: https://site-morethanmoney-final.vercel.app
```

Acesse essa URL e verifique se carrega.

---

## ⚙️ IMPORTANTE: Após Deploy

### 1. Variáveis de Ambiente (OBRIGATÓRIO!)

O site NÃO funcionará 100% sem estas variáveis:

**Ir para:** https://vercel.com → Projeto → Settings → Environment Variables

**Adicionar:**
```
NEXT_PUBLIC_NOTION_API_KEY=...
NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID=...
OPENAI_API_KEY=...
NEWS_API_KEY=...
NEXT_PUBLIC_SITE_URL=https://site-morethanmoney-final.vercel.app
```

**Após adicionar: REDEPLOY!**

---

### 2. Scripts SQL (OBRIGATÓRIO!)

**Ir para:** Supabase → SQL Editor

**Executar:**
```sql
-- Se tabela notifications já existe:
-- Copiar e executar: scripts/fix-notifications-structure.sql

-- Sempre executar:
-- Copiar e executar: scripts/setup-mobile-safe.sql
```

---

### 3. Google OAuth (IMPORTANTE!)

Seguir: `FIX_GOOGLE_OAUTH_CALLBACK.md`

**Resumo:**
- Google Cloud Console: Adicionar URLs
- Supabase: Configurar Site URL e Redirects
- Vercel: Verificar NEXT_PUBLIC_SITE_URL

---

## 🧪 Testar Após Deploy

### Teste 1: Site carrega
```
https://site-morethanmoney-final.vercel.app
```

### Teste 2: Login funciona
```
/login
```

### Teste 3: App Mobile
```
/app-mobile
```

### Teste 4: Portfolio
```
/portfolios
```

---

## 🆘 Se Algo Falhar

### Build falha:
```bash
# Testar localmente
npm run build

# Ver erro e corrigir
# Depois fazer deploy novamente
```

### Deploy não inicia:
- Verificar Dashboard da Vercel
- Pode estar em fila
- Aguardar alguns minutos

### Site carrega mas com erros:
1. Verificar variáveis de ambiente
2. Executar scripts SQL
3. Verificar logs da Vercel

---

## 📞 Resumão

**Método mais fácil:**

1. ✅ Código já está no GitHub (done!)
2. 🌐 Ir para: https://vercel.com/dashboard
3. 👁️ Verificar deploy automático
4. ⚙️ Configurar env vars
5. 🗄️ Executar scripts SQL
6. 🔄 Redeploy
7. 🧪 Testar
8. 🎉 Produção!

**Método via CLI:**

```bash
# Obter token: https://vercel.com/account/tokens
vercel --prod --token SEU_TOKEN
```

---

**Escolha o método que preferir e execute!** 🚀

Tempo total: 30-45 minutos (incluindo configurações)

