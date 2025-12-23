# 🔑 Atualizar Google OAuth Client Secret

## ✅ Nova Chave Secreta
```
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
```

## 🔧 Onde Atualizar

### 1. Vercel Dashboard
1. Ir para: https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final/settings/environment-variables
2. Procurar: `GOOGLE_CLIENT_SECRET` (Production)
3. Editar e colar novo valor:
   ```
   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
   ```
4. Salvar
5. Fazer novo deploy:
   ```bash
   vercel --prod
   ```

### 2. Supabase Dashboard (IMPORTANTE!)
1. Ir para: https://supabase.com/dashboard/project/iwscxotvmtkphajmasof/auth/providers
2. Clicar em "Google"
3. Na seção "OAuth", atualizar:
   - **Client Secret**: `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`
4. **Ativar** o provider Google (se não estiver)
5. Salvar

### 3. Google Cloud Console
A chave foi atualizada pelo Google, confirmar:
1. Ir para: https://console.cloud.google.com/apis/credentials
2. Verificar se Client ID `922427186545-r6n4dcvpdu02mrk04pqaammd8rtb4qlm` está ativo

## 🧪 Testar Após Atualização
1. Fazer logout de qualquer sessão ativa
2. Ir para: https://www.morethanmoney.pt/login
3. Clicar em "Login com Google"
4. Deve funcionar sem erro 404

## ⚠️ Se Continuar com Erro 404
Verificar se o Redirect URI está correto no Google Cloud Console:
```
https://iwscxotvmtkphajmasof.supabase.co/auth/v1/callback
```
