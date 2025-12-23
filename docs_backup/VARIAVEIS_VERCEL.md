# 🔑 Variáveis de Ambiente para Vercel

## 📍 Onde Adicionar

**URL:** https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables

---

## ✅ Variáveis a Adicionar

### 1. NEXT_PUBLIC_SITE_URL
```
Name: NEXT_PUBLIC_SITE_URL
Value: https://www.morethanmoney.pt
Environment: Production, Preview, Development
```

---

### 2. NEXT_PUBLIC_NOTION_API_KEY
```
Name: NEXT_PUBLIC_NOTION_API_KEY
Value: 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
Environment: Production, Preview, Development
```

---

### 3. NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID
```
Name: NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID
Value: 76557dddfbc348aba2f6e24ea1f5133e
Environment: Production, Preview, Development
```

---

### 4. OPENAI_API_KEY
```
Name: OPENAI_API_KEY
Value: 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
Environment: Production, Preview, Development
```

---

### 5. NEWS_API_KEY
```
Name: NEWS_API_KEY
Value: d4cf3e3c4e7c4a9b9e5f4d3c2b1a0e9d
Environment: Production, Preview, Development
```

---

## 📋 Checklist

Adicione TODAS as variáveis acima e marque:

- [ ] NEXT_PUBLIC_SITE_URL
- [ ] NEXT_PUBLIC_NOTION_API_KEY
- [ ] NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID
- [ ] OPENAI_API_KEY
- [ ] NEWS_API_KEY

---

## ⚠️ IMPORTANTE

**Após adicionar TODAS as variáveis:**

1. ✅ Salvar cada uma
2. ✅ Verificar que estão em **Production, Preview, Development**
3. ✅ **REDEPLOY OBRIGATÓRIO:**

```bash
vercel --prod --force --token 08zZPeikD3wsBLCCztG2j9yZ
```

---

## 🎯 O Que Isto Vai Resolver

✅ **Com estas variáveis configuradas:**

1. **NEXT_PUBLIC_SITE_URL:**
   - APIs chamando domínio correto (morethanmoney.pt)
   - Sem mais erro 401 Unauthorized
   - OAuth callback correto

2. **NEXT_PUBLIC_NOTION_API_KEY + DATABASE_ID:**
   - Sync do portfolio funcionando
   - Dados do Notion carregados
   - Ativos e alvos atualizados

3. **OPENAI_API_KEY:**
   - Análise DCA inteligente
   - Recomendações automáticas
   - Sentiment analysis

4. **NEWS_API_KEY:**
   - Análise de notícias
   - Sentiment do mercado
   - Complemento ao DCA

---

## 🧪 Testar Após Redeploy

Aguardar deploy (~2-5min) e testar:

```
http://www.morethanmoney.pt/portfolios
```

**Logs esperados:**
```
✅ [PORTFOLIO] Dados do Notion carregados
✅ [PORTFOLIO] Preços atualizados
✅ Crypto performance: XX%
✅ ETF performance: XX%
```

**SEM mais estes erros:**
```
❌ 401 Unauthorized
❌ Notion Database ID não configurado
❌ Sem dados de portfolio
```

---

## 📊 Tempo Estimado

- Adicionar variáveis: 5 minutos
- Redeploy: 2-5 minutos
- **Total: 10 minutos** ⏱️

---

## 🚀 Comando de Redeploy

Copie e execute após adicionar as variáveis:

```bash
vercel --prod --force --token 08zZPeikD3wsBLCCztG2j9yZ
```

---

**Status:** ⏳ Aguardando configuração manual na Vercel

