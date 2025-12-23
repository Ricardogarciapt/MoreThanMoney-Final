# 🚀 Instruções para Deploy no Vercel

## ⚠️ **IMPORTANTE: Configurar Variáveis de Ambiente**

O deploy está falhando porque as variáveis de ambiente não estão configuradas no Vercel.

### 📋 **Passo a Passo:**

1. **Acesse o Dashboard do Vercel:**
   - URL: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables

2. **Adicione TODAS as variáveis de ambiente:**

   Copie do seu `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_SITE_URL
   GMAIL_USER
   GMAIL_APP_PASSWORD
   NEXT_PUBLIC_GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   ```

3. **Para cada variável:**
   - Clique em "Add New"
   - Nome: NEXT_PUBLIC_SUPABASE_URL (por exemplo)
   - Value: Cole o valor do seu `.env.local`
   - Environment: Selecione "Production", "Preview", e "Development"
   - Clique em "Save"

4. **Após configurar TODAS as variáveis:**
   - Vá para: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final
   - Clique em "Redeploy"
   - Ou execute: `vercel --token=6FHmqlBJi4cJP5tZsWqyzTDD --prod`

### ✅ **Variáveis Obrigatórias:**

1. **Supabase** (essenciais):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Site**:
   - `NEXT_PUBLIC_SITE_URL`

3. **Gmail** (para emails):
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`

4. **Google OAuth** (para login):
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

### 🔧 **Comando para Redeploy após configurar:**

```bash
vercel --token=6FHmqlBJi4cJP5tZsWqyzTDD --prod
```

---

## 📊 **Status Atual:**

✅ Build local: OK
✅ Código no GitHub: OK
✅ Projeto Vercel criado: OK
⚠️ Variáveis de ambiente: PENDENTE

**Após configurar as variáveis, o deploy será concluído com sucesso!**

