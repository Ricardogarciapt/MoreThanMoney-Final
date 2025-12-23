# 🔧 FIX: Google OAuth Callback para Localhost em Produção

## ⚠️ Problema

Login com Google OAuth está redirecionando para `http://localhost:3000/auth/callback` mesmo na versão live (produção).

**Sintomas:**
- ✅ Funciona em desenvolvimento (localhost)
- ❌ Em produção redireciona para localhost
- ❌ Usuário vê erro de "Cannot connect" ou página em branco

---

## 🎯 Causa Raiz

O problema **NÃO está no código** (já usa `window.location.origin`).  
O problema está nas **configurações de OAuth** que precisam ser atualizadas em 3 lugares.

---

## ✅ Solução Completa (3 Passos)

### 📍 PASSO 1: Google Cloud Console

**URL:** https://console.cloud.google.com/apis/credentials

1. **Localizar OAuth 2.0 Client ID**
   - Procure o Client ID usado no projeto
   - Clicar em "Edit" (ícone de lápis)

2. **Adicionar Origins Autorizados:**
   
   **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   https://site-morethanmoney-final.vercel.app
   https://morethanmoney.pt
   https://www.morethanmoney.pt
   ```

3. **Adicionar URIs de Redirecionamento:**
   
   **Authorized redirect URIs:**
   ```
   http://localhost:3000/auth/callback
   https://site-morethanmoney-final.vercel.app/auth/callback
   https://morethanmoney.pt/auth/callback
   https://www.morethanmoney.pt/auth/callback
   ```

4. **Salvar** e aguardar 2-5 minutos para propagar

---

### 📍 PASSO 2: Supabase Dashboard

**URL:** https://supabase.com/dashboard/project/[SEU_PROJECT_ID]/auth/url-configuration

1. **Configurar Site URL Principal:**
   ```
   Site URL: https://site-morethanmoney-final.vercel.app
   ```
   Ou use seu domínio custom se já configurado:
   ```
   Site URL: https://morethanmoney.pt
   ```

2. **Adicionar Redirect URLs (IMPORTANTE!):**
   
   Clicar em "Add URL" e adicionar TODAS estas URLs:
   ```
   http://localhost:3000/**
   https://site-morethanmoney-final.vercel.app/**
   https://morethanmoney.pt/**
   https://www.morethanmoney.pt/**
   ```
   
   ⚠️ **IMPORTANTE:** O `/**` no final permite todos os caminhos!

3. **Salvar configurações**

---

### 📍 PASSO 3: Vercel Environment Variables

**URL:** https://vercel.com/[SEU_USER]/site-morethanmoney-final/settings/environment-variables

1. **Adicionar/Verificar variável:**
   
   ```
   Name: NEXT_PUBLIC_SITE_URL
   Value: https://site-morethanmoney-final.vercel.app
   ```
   
   Ou use seu domínio custom:
   ```
   Value: https://morethanmoney.pt
   ```

2. **Aplicar a todos os ambientes:**
   - ✅ Production
   - ✅ Preview
   - ✅ Development

3. **Salvar e fazer Redeploy:**
   - Ir para Deployments
   - Clicar nos 3 pontos no último deploy
   - "Redeploy" → "Use existing Build Cache"

---

## 🧪 Testar a Correção

### Teste 1: Verificar Redirect URL

1. Abrir site em produção
2. Abrir DevTools → Console
3. Executar:
   ```javascript
   console.log(window.location.origin)
   // Deve retornar: https://site-morethanmoney-final.vercel.app
   // NÃO deve retornar: http://localhost:3000
   ```

### Teste 2: Login com Google

1. Ir para `/login`
2. Clicar em "Entrar com Google"
3. Selecionar conta Google
4. **Verificar URL após autorização:**
   - ✅ Correto: `https://site-morethanmoney-final.vercel.app/auth/callback`
   - ❌ Errado: `http://localhost:3000/auth/callback`

---

## 📋 Checklist Completo

### Google Cloud Console:
- [ ] ✅ Origins autorizados adicionados (4 URLs)
- [ ] ✅ Redirect URIs adicionados (4 URLs)
- [ ] ✅ Configurações salvas
- [ ] ✅ Aguardado 2-5 minutos

### Supabase:
- [ ] ✅ Site URL configurada (produção)
- [ ] ✅ Redirect URLs adicionadas (4 URLs com `/**`)
- [ ] ✅ Configurações salvas

### Vercel:
- [ ] ✅ `NEXT_PUBLIC_SITE_URL` configurada
- [ ] ✅ Aplicada a todos ambientes
- [ ] ✅ Redeploy realizado

### Teste:
- [ ] ✅ `window.location.origin` retorna URL de produção
- [ ] ✅ Login com Google funciona
- [ ] ✅ Callback vai para URL de produção

---

## 🔍 Troubleshooting

### Erro: "redirect_uri_mismatch"

**Causa:** Google Cloud Console não tem a URI de redirect autorizada.

**Solução:**
1. Verificar exatamente qual URL está sendo usada no erro
2. Adicionar essa URL exata no Google Cloud Console
3. Aguardar 2-5 minutos

### Erro: Ainda redireciona para localhost

**Possíveis causas:**

1. **Cache do browser:**
   ```
   Solução: Limpar cache e cookies, ou usar aba anônima
   ```

2. **Configuração antiga do Supabase:**
   ```
   Solução: Verificar se Site URL está correta no Supabase
   ```

3. **Vercel não usou nova variável:**
   ```
   Solução: Fazer redeploy SEM usar build cache
   ```

4. **Variável não é pública:**
   ```
   Solução: Verificar que é NEXT_PUBLIC_SITE_URL (não SITE_URL)
   ```

### Erro: "Invalid redirect URL"

**Causa:** Supabase não tem a URL nos Redirect URLs permitidos.

**Solução:**
```
1. Supabase → Auth → URL Configuration
2. Adicionar: https://seu-dominio.com/**
3. Salvar
```

---

## 💡 Explicação Técnica

### Como funciona o redirect:

```typescript
// No código (login/page.tsx):
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback?redirect=/new-landing`
    //           ^^^^^^^^^^^^^^^^^^^^^^
    //           Detecta automaticamente:
    //           - localhost:3000 em dev
    //           - site-morethanmoney-final.vercel.app em prod
  }
})
```

### Fluxo completo:

```
1. Usuário clica "Login com Google"
   ↓
2. Supabase redireciona para Google OAuth
   ↓
3. Google mostra tela de seleção de conta
   ↓
4. Usuário autoriza
   ↓
5. Google redireciona para: {origin}/auth/callback
   ↓
6. Supabase processa autenticação
   ↓
7. Usuário redirecionado para: /new-landing
```

⚠️ **O problema está no passo 5**: Se as configurações não estiverem corretas, o `{origin}` pode ser `localhost` mesmo em produção!

---

## 🎯 Configurações de Domínio Custom

Se você usar `morethanmoney.pt` como domínio principal:

1. **Vercel:**
   ```
   NEXT_PUBLIC_SITE_URL=https://morethanmoney.pt
   ```

2. **Supabase Site URL:**
   ```
   https://morethanmoney.pt
   ```

3. **Redirect URLs:**
   ```
   https://morethanmoney.pt/**
   https://www.morethanmoney.pt/**
   https://site-morethanmoney-final.vercel.app/**
   ```

---

## 📞 URLs de Referência

- **Google Cloud Console:** https://console.cloud.google.com/apis/credentials
- **Supabase Auth Config:** https://supabase.com/dashboard → Seu Projeto → Authentication → URL Configuration
- **Vercel Env Vars:** https://vercel.com → Seu Projeto → Settings → Environment Variables

---

## ✅ Resultado Esperado

Após configurar tudo:

1. ✅ Login com Google funciona em localhost
2. ✅ Login com Google funciona em produção
3. ✅ Callback sempre vai para o domínio correto
4. ✅ Sem erros de redirect_uri_mismatch
5. ✅ Sem redirecionamentos para localhost em produção

---

**Tempo estimado:** 10-15 minutos (incluindo propagação)  
**Última atualização:** 10 de Outubro de 2025  
**Status:** ✅ Solução testada e comprovada

