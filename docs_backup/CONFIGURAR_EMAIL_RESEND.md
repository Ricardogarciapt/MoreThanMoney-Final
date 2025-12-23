# 📧 CONFIGURAR EMAIL RESEND - GUIA PASSO A PASSO

**Tempo estimado:** 10-15 minutos  
**Custo:** Grátis (100 emails/dia) ou $20/mês (50,000 emails)

---

## 📝 PASSO 1: CRIAR CONTA RESEND (2 min)

### 1.1 Aceder ao Resend
```
https://resend.com
```

### 1.2 Criar Conta
- Clicar "Sign Up"
- Inserir email: `morethanmoneypt@gmail.com` (recomendado)
- Criar password
- Verificar email
- ✅ Conta criada!

---

## 🌐 PASSO 2: ADICIONAR DOMÍNIO (5 min)

### 2.1 No Dashboard Resend
```
Dashboard → Domains → Add Domain
```

### 2.2 Inserir Domínio
```
Domain: morethanmoney.pt
```

### 2.3 Configurar DNS

**Resend irá mostrar 3 registos DNS para adicionar:**

#### Registo 1: SPF (TXT)
```
Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all
TTL: 3600
```

#### Registo 2: DKIM (CNAME)
```
Type: CNAME
Name: resend._domainkey
Value: [valor fornecido pelo Resend]
TTL: 3600
```

#### Registo 3: DMARC (TXT)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none
TTL: 3600
```

### 2.4 Adicionar Registos no Fornecedor DNS

**Onde adicionar:** No painel do seu fornecedor de domínio (ex: GoDaddy, Namecheap, Cloudflare)

**Como adicionar:**
1. Login no fornecedor de domínio
2. Ir para gestão de DNS
3. Adicionar os 3 registos acima
4. Salvar alterações
5. Aguardar propagação (5-30 minutos)

### 2.5 Verificar Domínio no Resend
```
Resend Dashboard → Domains
Clicar "Verify"
Aguardar confirmação
✅ Domínio verificado!
```

---

## 🔑 PASSO 3: OBTER API KEY (1 min)

### 3.1 Criar API Key
```
Resend Dashboard → API Keys
Clicar "Create API Key"
```

### 3.2 Configurar API Key
```
Name: MoreThanMoney Production
Permission: Full Access (ou Sending Access)
Domain: morethanmoney.pt
```

### 3.3 Copiar API Key
```
⚠️ COPIE AGORA! Só aparece uma vez!

Exemplo: re_123abc456def789ghi012jkl345mno678
```

---

## 💻 PASSO 4: ADICIONAR AO PROJETO (1 min)

### 4.1 Abrir arquivo .env.local
```
Abrir: env.local
```

### 4.2 Atualizar RESEND_API_KEY
```env
# Encontrar esta linha:
RESEND_API_KEY=re_1234567890abcdef

# Substituir por:
RESEND_API_KEY=re_sua_chave_copiada_aqui
```

### 4.3 Salvar arquivo
```
Ctrl+S (ou Cmd+S no Mac)
```

---

## 🔄 PASSO 5: REINICIAR SERVIDOR (1 min)

### 5.1 Parar servidor
```bash
# No terminal, pressionar:
Ctrl+C
```

### 5.2 Reiniciar
```bash
npm run dev
```

### 5.3 Aguardar
```
Servidor iniciado em http://localhost:3000
✅ Pronto!
```

---

## 🧪 PASSO 6: TESTAR EMAIL (3 min)

### 6.1 Criar Utilizador de Teste
```
1. Ir para: http://localhost:3000/register
2. Preencher:
   - Nome: Teste Email
   - Email: seu_email_real@gmail.com
   - Username: teste_email
   - Password: teste123
3. Registar
```

### 6.2 Verificar Email Enviado
```
1. Verificar inbox de: morethanmoneypt@gmail.com
2. Deve receber email com assunto:
   "🔔 Novo Pedido de Registo - Ação Necessária!"
3. Ver informações do candidato
4. Ver botões: ✅ Aprovar / ❌ Rejeitar
```

### 6.3 Aprovar Utilizador
```
1. Clicar botão verde "✅ Aprovar Membro"
2. Aguardar redirecionamento
3. Ver mensagem de sucesso
```

### 6.4 Verificar Email do Membro
```
1. Verificar inbox de: seu_email_real@gmail.com
2. Deve receber email com assunto:
   "🎉 Bem-vindo à MoreThanMoney! A Tua Jornada Começa Agora!"
3. Ver dados de login
4. Ver botão "🚀 Verificar Email Agora"
```

### 6.5 Verificar Email
```
1. Clicar botão de verificação no email
2. Ser redirecionado para /email-verified
3. Ver confirmação
✅ Sistema de email 100% funcional!
```

---

## 🆓 ALTERNATIVA: USAR GMAIL SMTP (Mais Simples)

### Se não quiser usar Resend agora:

#### Opção A: Gmail SMTP (Desenvolvimento)
```env
# Não requer Resend, usa Gmail diretamente
# Configurar depois se preferir
```

#### Opção B: Sistema sem Email (Funciona Parcialmente)
```
✅ Sistema funciona sem email
✅ Login e registo funcionam
✅ Admin funciona
⚠️ Aprovação deve ser manual no admin
⚠️ Não envia notificações
```

---

## ⚠️ PROBLEMAS COMUNS

### Problema 1: Domínio não verifica
**Solução:**
- Aguardar 30 minutos (propagação DNS)
- Verificar se registos foram adicionados corretamente
- Usar ferramenta: https://mxtoolbox.com/

### Problema 2: Email não chega
**Solução:**
- Verificar spam/lixo
- Verificar API key está correta
- Ver logs no Resend Dashboard
- Verificar domínio está verificado

### Problema 3: Erro 401 Unauthorized
**Solução:**
- API key incorreta
- Copiar novamente do Resend
- Reiniciar servidor após mudar .env.local

---

## 💡 DICAS

### Para Desenvolvimento/Teste:
```
Use email pessoal como destinatário de teste
Não precisa verificar domínio
Use domínio sandbox do Resend
```

### Para Produção:
```
✅ Verificar domínio morethanmoney.pt
✅ Adicionar registos DNS corretamente  
✅ Usar API key de produção
✅ Testar fluxo completo
```

---

## 📊 PLANOS RESEND

### Free (Recomendado para Início)
- 100 emails/dia
- 1 domínio
- Suporte por email
- **Custo: $0/mês**

### Pro (Para Escalar)
- 50,000 emails/mês
- Domínios ilimitados
- Analytics avançado
- Suporte prioritário
- **Custo: $20/mês**

---

## 🎯 RESUMO RÁPIDO

### Para TESTAR agora (sem domínio):
```bash
# 1. Criar conta Resend
# 2. Copiar API key
# 3. Adicionar ao .env.local
# 4. Reiniciar servidor
# 5. Testar com email sandbox
```

### Para PRODUÇÃO (com domínio):
```bash
# 1. Criar conta Resend
# 2. Adicionar domínio morethanmoney.pt
# 3. Configurar DNS (3 registos)
# 4. Aguardar verificação
# 5. Copiar API key
# 6. Adicionar ao .env.local
# 7. Deploy
```

---

## ✅ CHECKLIST

### Configuração Mínima (Funciona):
- [ ] Criar conta Resend
- [ ] Copiar API key
- [ ] Adicionar ao .env.local
- [ ] Reiniciar servidor

### Configuração Completa (Produção):
- [ ] Criar conta Resend
- [ ] Adicionar domínio morethanmoney.pt
- [ ] Adicionar 3 registos DNS
- [ ] Verificar domínio
- [ ] Copiar API key
- [ ] Adicionar ao .env.local
- [ ] Testar envio
- [ ] Verificar recebimento

---

## 🚀 PRÓXIMO PASSO

**Escolha uma opção:**

### Opção 1: Configurar Agora (10 min)
1. Ir para https://resend.com
2. Seguir passos acima
3. ✅ Email funcionando!

### Opção 2: Configurar Depois
1. Sistema funciona sem email
2. Aprovação manual no admin
3. Configurar quando tiver domínio pronto

---

**💡 RECOMENDAÇÃO:**
Configure ao menos a conta Resend agora (2 min) para ter a API key.
Domínio pode verificar depois quando for para produção.

**📧 SUPORTE RESEND:**
- Documentação: https://resend.com/docs
- Discord: https://resend.com/discord
- Email: support@resend.com

---

**🎉 GUIA COMPLETO! PRONTO PARA CONFIGURAR EMAIL!**

