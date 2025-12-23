# 🔍 Diagnóstico: Problema de Autenticação Supabase

## ⚠️ Sintomas Observados

1. ✅ Login com Google funciona (evento SIGNED_IN)
2. ❌ Timeout na verificação de sessão
3. ❌ Redirecionamento para domínio Vercel em vez de morethanmoney.pt

---

## 🎯 Causa Raiz Provável

**O Supabase não está respondendo rapidamente** às requisições `getSession()`.

Possíveis causas:
1. ❌ Variáveis de ambiente não configuradas
2. ❌ URLs não configuradas no Supabase
3. ❌ Conexão lenta com Supabase
4. ❌ RLS Policies bloqueando

---

## ✅ Correção Deployada

**Melhorias aplicadas:**
- ✅ Timeout aumentado: 5s → 10s
- ✅ Flag `isChecking` para evitar verificações duplicadas
- ✅ Logs detalhados para diagnóstico
- ✅ Timeout não redireciona mais (apenas loga erro)

---

## 🧪 Teste e Diagnóstico

### Passo 1: Limpar Cache

**Importante! Limpar cache do browser:**
```
Chrome/Edge: Ctrl+Shift+Del
Mac: Cmd+Shift+Del
Ou usar aba anônima
```

### Passo 2: Acessar com Console Aberto

1. Abrir DevTools (F12)
2. Ir para tab "Console"
3. Acessar: http://www.morethanmoney.pt/app-mobile
4. Observar logs

### Passo 3: Analisar Logs

**Logs esperados (BOM):**
```
🔧 Criando instância SINGLETON do Supabase Client
🔍 [PROTECTED PAGE] Verificando sessão no Supabase...
⏱️ [PROTECTED PAGE] Tempo de verificação: 250ms
✅ [PROTECTED PAGE] Autenticado: user@example.com
```

**Logs de problema (MAU):**
```
🔧 Criando instância SINGLETON do Supabase Client
🔍 [PROTECTED PAGE] Verificando sessão no Supabase...
⏱️ [PROTECTED PAGE] Tempo de verificação: 5000ms
⚠️ [PROTECTED PAGE] Verificação muito lenta: 5000ms
⚠️ [PROTECTED PAGE] Timeout na verificação do Supabase após 10s
```

---

## 🔧 Soluções por Problema

### ❌ Problema 1: "Verificação muito lenta"

**Causa:** Variáveis de ambiente não configuradas

**Solução:**
1. Ir para: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables

2. **Verificar se existem:**
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

3. **Se não existirem, adicionar:**
   - Obter do Supabase Dashboard → Settings → API
   - Adicionar na Vercel
   - **REDEPLOY!**

---

### ❌ Problema 2: "Sem sessão válida"

**Causa:** URLs não configuradas no Supabase

**Solução:**
1. Ir para: Supabase Dashboard → Authentication → URL Configuration

2. **Site URL:**
   ```
   https://www.morethanmoney.pt
   ```

3. **Redirect URLs (adicionar todas):**
   ```
   https://www.morethanmoney.pt/**
   https://site-morethanmoney-final.vercel.app/**
   http://localhost:3000/**
   ```

4. Salvar e testar novamente

---

### ❌ Problema 3: Redireciona para Vercel

**Causa:** `NEXT_PUBLIC_SITE_URL` não configurada

**Solução:**
1. Ir para: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables

2. **Adicionar:**
   ```
   Name: NEXT_PUBLIC_SITE_URL
   Value: https://www.morethanmoney.pt
   Environment: Production, Preview, Development
   ```

3. **REDEPLOY:**
   ```bash
   vercel --prod --force --token 08zZPeikD3wsBLCCztG2j9yZ
   ```

---

### ❌ Problema 4: "Erro do Supabase"

**Causa:** Chaves incorretas ou RLS bloqueando

**Solução:**

1. **Verificar chaves no Supabase:**
   - Dashboard → Settings → API
   - Copiar `anon/public key` (não service_role!)

2. **Atualizar na Vercel:**
   ```
   NEXT_PUBLIC_SUPABASE_ANON_KEY=nova_chave_aqui
   ```

3. **Verificar RLS no Supabase:**
   ```sql
   -- No SQL Editor do Supabase
   SELECT * FROM auth.users LIMIT 1;
   ```
   
   Se der erro, RLS pode estar bloqueando.

---

## 📊 Checklist de Configuração

### Vercel Environment Variables:
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_SITE_URL` = https://www.morethanmoney.pt
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### Supabase URLs:
- [ ] Site URL = https://www.morethanmoney.pt
- [ ] Redirect URLs incluem morethanmoney.pt/**
- [ ] Redirect URLs incluem vercel.app/**

### Google Cloud:
- [ ] Origins incluem morethanmoney.pt
- [ ] Redirect URIs incluem morethanmoney.pt/auth/callback

---

## 🚀 Teste Final

Após configurar tudo:

1. **Redeploy:**
   ```bash
   vercel --prod --force --token 08zZPeikD3wsBLCCztG2j9yZ
   ```

2. **Aguardar 2-3 minutos**

3. **Limpar cache do browser**

4. **Testar:** http://www.morethanmoney.pt/app-mobile

5. **Verificar console:**
   ```
   ✅ [PROTECTED PAGE] Autenticado
   ```

---

## 💡 Logs Detalhados Agora Disponíveis

Com o novo código, você verá:

```
🔍 [PROTECTED PAGE] Verificando sessão no Supabase...
⏱️ [PROTECTED PAGE] Tempo de verificação: XXXms
```

**Se demorar > 1000ms:**
```
⚠️ [PROTECTED PAGE] Verificação muito lenta: XXXms
⚠️ Verifique configuração do Supabase e variáveis de ambiente
```

**Se timeout (10s):**
```
⚠️ [PROTECTED PAGE] Timeout na verificação do Supabase após 10s
⚠️ Possível problema de configuração ou rede
```

Use estes logs para identificar o problema exato!

---

## 📞 Próxima Ação

1. **Testar agora** (deploy já está live)
2. **Observar logs no console**
3. **Configurar variáveis se necessário**
4. **Redeploy se configurou variáveis**
5. **Reportar logs que aparecem**

---

**Status:** ✅ Deploy concluído com diagnóstico melhorado  
**URL:** http://www.morethanmoney.pt  
**Próximo:** Testar e reportar logs do console

