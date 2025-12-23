# 📧 CONFIGURAR EMAIL COM GMAIL - 5 MINUTOS

**Método:** Gmail + Nodemailer (SMTP)  
**Custo:** Grátis  
**Limite:** 500 emails/dia

---

## ✅ PASSO A PASSO

### PASSO 1: Ativar Verificação em 2 Etapas (2 min)

#### 1.1 Aceder à Conta Google
```
1. Ir para: https://myaccount.google.com/security
2. Login com: morethanmoneypt@gmail.com
```

#### 1.2 Ativar Verificação em 2 Etapas
```
1. Procurar seção "Verificação em 2 etapas"
2. Clicar "Começar"
3. Seguir passos (adicionar telefone)
4. Confirmar ativação
✅ Verificação em 2 etapas ativada!
```

---

### PASSO 2: Gerar Senha de App (2 min)

#### 2.1 Aceder a Senhas de App
```
1. Voltar para: https://myaccount.google.com/security
2. Procurar "Senhas de apps" ou "App passwords"
3. Clicar em "Senhas de apps"
```

#### 2.2 Criar Nova Senha de App
```
1. Nome da app: MoreThanMoney Email Service
2. Clicar "Criar"
3. ⚠️ COPIAR A SENHA GERADA (16 caracteres)
   Exemplo: abcd efgh ijkl mnop
```

#### 2.3 Remover Espaços
```
Senha gerada: abcd efgh ijkl mnop
Usar sem espaços: abcdefghijklmnop
```

---

### PASSO 3: Configurar no Projeto (1 min)

#### 3.1 Abrir arquivo env.local
```
Abrir: env.local
```

#### 3.2 Atualizar variáveis
```env
# Encontrar estas linhas:
GMAIL_USER=morethanmoneypt@gmail.com
GMAIL_APP_PASSWORD=sua_senha_de_app_aqui

# Substituir por:
GMAIL_USER=morethanmoneypt@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
```
*Usar a senha de 16 caracteres que copiou

#### 3.3 Salvar
```
Ctrl+S (ou Cmd+S)
```

---

### PASSO 4: Atualizar APIs para usar Gmail

Já implementei! Os arquivos foram atualizados para usar `email-service.ts` com Nodemailer.

---

### PASSO 5: Reiniciar Servidor (30 seg)

```bash
# Parar servidor atual:
Ctrl+C

# Reiniciar:
npm run dev

# Aguardar:
✓ Ready in 2s
```

---

### PASSO 6: Testar Email (2 min)

#### 6.1 Registar Novo Utilizador
```
1. Ir para: http://localhost:3000/register
2. Preencher:
   - Nome: Teste Gmail
   - Email: seu_email_pessoal@gmail.com
   - Username: teste_gmail
   - Password: teste123
3. Clicar "Criar Conta"
```

#### 6.2 Verificar Email Recebido
```
1. Abrir Gmail: morethanmoneypt@gmail.com
2. Verificar nova mensagem
3. Assunto: "🔔 Novo Pedido de Registo"
4. Ver botões de aprovação
✅ Email funcionando!
```

---

## 📊 COMPARAÇÃO: GMAIL vs RESEND

### Gmail (RECOMENDADO AGORA)
- ✅ Grátis
- ✅ 500 emails/dia
- ✅ Configuração: 5 minutos
- ✅ Sem verificação de domínio
- ✅ Funciona imediatamente
- ⚠️ Limite diário: 500

### Resend (PARA PRODUÇÃO)
- ✅ 100 emails/dia (grátis)
- ✅ 50,000 emails/mês ($20)
- ✅ Analytics avançado
- ⚠️ Requer verificação de domínio
- ⚠️ Configuração: 15 minutos

---

## 🔒 SEGURANÇA - SENHA DE APP

### O que é?
- Senha específica para aplicações
- Diferente da senha da conta Gmail
- Pode ser revogada a qualquer momento
- Não compromete a conta principal

### Como funciona?
```
Conta Gmail → Verificação em 2 etapas → Senhas de App
```

### Se esquecer/perder:
```
1. Revogar senha antiga
2. Criar nova senha de app
3. Atualizar env.local
4. Reiniciar servidor
```

---

## ⚠️ PROBLEMAS COMUNS

### Problema 1: "Invalid login"
**Causa:** Verificação em 2 etapas não ativada  
**Solução:** Ativar no Passo 1

### Problema 2: "Username or password not accepted"
**Causa:** Usando senha normal em vez de senha de app  
**Solução:** Gerar senha de app no Passo 2

### Problema 3: Email não chega
**Causa:** Senha incorreta ou espaços na senha  
**Solução:** Copiar senha sem espaços

### Problema 4: Erro 535
**Causa:** Credenciais inválidas  
**Solução:** 
1. Verificar GMAIL_USER está correto
2. Gerar nova senha de app
3. Copiar sem espaços

---

## 🎯 RESUMO RÁPIDO (3 MIN)

### Para quem tem pressa:

```bash
# 1. Ativar verificação em 2 etapas na conta Gmail
# 2. Gerar senha de app (16 caracteres)
# 3. Adicionar ao env.local:

GMAIL_USER=morethanmoneypt@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop

# 4. Reiniciar servidor
npm run dev

# 5. Testar registo
http://localhost:3000/register

# 6. Verificar email em morethanmoneypt@gmail.com
```

---

## ✅ VANTAGENS DO GMAIL

### Para Desenvolvimento:
- ✅ Grátis
- ✅ Rápido de configurar
- ✅ Familiar
- ✅ Confiável
- ✅ 500 emails/dia suficiente

### Para Produção Inicial:
- ✅ Funciona perfeitamente
- ✅ Sem custos
- ✅ Fácil de migrar depois
- ✅ Profissional

---

## 🚀 LINKS ÚTEIS

### Gmail:
- Conta Google: https://myaccount.google.com/security
- Senhas de App: https://myaccount.google.com/apppasswords

### Documentação:
- Nodemailer: https://nodemailer.com/
- Gmail SMTP: https://support.google.com/mail/answer/7126229

---

## 📝 CHECKLIST

### Configuração Gmail:
- [ ] Login na conta morethanmoneypt@gmail.com
- [ ] Ativar verificação em 2 etapas
- [ ] Gerar senha de app
- [ ] Copiar senha (16 caracteres, sem espaços)
- [ ] Adicionar ao env.local
- [ ] Reiniciar servidor
- [ ] Testar envio de email

---

## 🎊 DEPOIS DE CONFIGURAR

### Sistema completo funcionará:
- ✅ Novos registos → Email para admin
- ✅ Aprovação one-click → Email de boas-vindas
- ✅ Verificação de email → Acesso liberado
- ✅ Notificações automáticas
- ✅ Design com paleta dourada

---

**💡 RECOMENDAÇÃO:**
Use Gmail agora para começar. Migre para Resend depois se precisar de mais volume ou analytics.

**⏱️ TEMPO TOTAL: 5 MINUTOS**

---

**🚀 SIGA O GUIA ACIMA E TERÁ EMAILS FUNCIONANDO EM 5 MINUTOS!**

