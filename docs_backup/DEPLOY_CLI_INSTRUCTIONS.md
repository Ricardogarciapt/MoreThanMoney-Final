# 🚀 Deploy via CLI - Instruções Completas

## 📋 Método 1: Script Automatizado (RECOMENDADO)

Execute o script preparado:

```bash
./vercel-deploy.sh
```

O script irá:
1. ✅ Verificar se Vercel CLI está instalado
2. ✅ Mostrar branch e commits
3. ✅ Pedir seu token da Vercel
4. ✅ Fazer deploy para produção
5. ✅ Mostrar próximos passos

---

## 📋 Método 2: Comandos Manuais

### Passo 1: Obter Token da Vercel

1. Acesse: https://vercel.com/account/tokens
2. Clique em **"Create Token"**
3. Nome: `MTM Deploy CLI`
4. Scope: **Full Account**
5. Copie o token gerado

### Passo 2: Configurar Token

**Opção A - Variável de ambiente (temporária):**
```bash
export VERCEL_TOKEN='seu_token_aqui'
```

**Opção B - Arquivo de configuração (permanente):**
```bash
echo "VERCEL_TOKEN=seu_token_aqui" >> ~/.zshrc
source ~/.zshrc
```

### Passo 3: Deploy

**Com token via variável:**
```bash
vercel --prod --token $VERCEL_TOKEN
```

**Ou diretamente:**
```bash
vercel --prod --token 'seu_token_aqui'
```

---

## 📋 Método 3: Vercel Login Interativo

Se preferir login tradicional:

```bash
# 1. Login
vercel login

# 2. Selecionar método (GitHub, GitLab, Email)
# Siga as instruções no terminal

# 3. Após login, fazer deploy
vercel --prod
```

---

## 🔍 Verificar Status do Deploy

Durante o deploy, você verá:

```
Vercel CLI 32.0.0
🔍 Inspect: https://vercel.com/...
✅ Production: https://site-morethanmoney-final.vercel.app [copied]
```

---

## ⚙️ Configurações do Deploy

### Deploy com configurações específicas:

```bash
# Deploy para produção
vercel --prod

# Deploy com build custom
vercel --prod --build-env NODE_ENV=production

# Deploy sem usar cache
vercel --prod --force

# Deploy com confirmação
vercel --prod --yes
```

---

## 🐛 Troubleshooting

### Erro: "No token provided"

**Solução:**
```bash
export VERCEL_TOKEN='seu_token_da_vercel'
vercel --prod --token $VERCEL_TOKEN
```

### Erro: "Command not found: vercel"

**Solução:**
```bash
# Instalar Vercel CLI globalmente
npm install -g vercel

# Verificar instalação
vercel --version
```

### Erro: "Error: The specified token is not valid"

**Solução:**
1. Verificar se token foi copiado corretamente
2. Criar novo token em: https://vercel.com/account/tokens
3. Usar token novo

### Erro: "Failed to compile"

**Solução:**
```bash
# Testar build localmente primeiro
npm run build

# Se passar, fazer deploy novamente
vercel --prod
```

---

## 📊 Monitorar Deploy

### Via CLI:

```bash
# Ver lista de deployments
vercel ls

# Ver logs do último deploy
vercel logs

# Ver detalhes do projeto
vercel inspect
```

### Via Dashboard:

Acesse: https://vercel.com/dashboard
- Ver progresso em tempo real
- Logs detalhados
- Métricas de performance

---

## ✅ Após Deploy Bem-Sucedido

O CLI mostrará:

```
✅ Production: https://site-morethanmoney-final.vercel.app
```

### Próximos passos:

1. **Configurar variáveis de ambiente:**
   ```bash
   # Via CLI
   vercel env add NEXT_PUBLIC_NOTION_API_KEY
   vercel env add NEXT_PUBLIC_NOTION_PORTFOLIO_DATABASE_ID
   vercel env add OPENAI_API_KEY
   vercel env add NEWS_API_KEY
   
   # Ou via Dashboard
   # https://vercel.com → Settings → Environment Variables
   ```

2. **Executar scripts SQL:**
   - Seguir: `RESOLVER_ERROS_SQL.md`

3. **Configurar Google OAuth:**
   - Seguir: `FIX_GOOGLE_OAUTH_CALLBACK.md`

4. **Redeploy após configurações:**
   ```bash
   vercel --prod --force
   ```

---

## 🚀 Deploy Completo (Todos os Passos)

```bash
# 1. Verificar branch
git branch --show-current

# 2. Verificar commits
git log --oneline -5

# 3. Obter token da Vercel
# https://vercel.com/account/tokens

# 4. Configurar token
export VERCEL_TOKEN='seu_token'

# 5. Deploy
vercel --prod --token $VERCEL_TOKEN

# 6. Aguardar conclusão (~10-15 minutos)

# 7. Configurar env vars via Dashboard
# https://vercel.com → Settings → Environment Variables

# 8. Redeploy
vercel --prod --force --token $VERCEL_TOKEN

# 9. Testar
# Aceder: https://site-morethanmoney-final.vercel.app
```

---

## 💡 Dicas

### ✅ DO (Faça):
- Teste build localmente antes: `npm run build`
- Verifique branch correta: `site-mtm-versao-3`
- Use `--force` se houver cache issues
- Monitore logs durante deploy

### ❌ DON'T (Não faça):
- Não compartilhe seu token
- Não faça deploy de branch errada
- Não ignore erros de build
- Não pule configuração de env vars

---

## 📞 Suporte

**Se deploy falhar:**
1. Verificar logs: `vercel logs`
2. Testar build local: `npm run build`
3. Verificar variáveis de ambiente
4. Consultar: `DEPLOY_FINAL_CHECKLIST.md`

**Alternativas:**
- Deploy via GitHub (automático)
- Deploy via Dashboard Vercel
- Deploy via GitHub Actions

---

## 📈 Performance Esperada

**Build time:**
- ⏱️ ~10-15 minutos

**Deploy size:**
- 📦 ~50-100 MB

**First load:**
- 🚀 101 kB (JS compartilhado)
- 📄 102-276 kB por página

---

**Status:** ✅ PRONTO PARA DEPLOY  
**Branch:** `site-mtm-versao-3`  
**Commits:** 11 recentes  
**Build local:** ✅ Success

