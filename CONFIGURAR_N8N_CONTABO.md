# 🤖 CONFIGURAR N8N NA CONTABO VPS - GUIA COMPLETO

**Página Criada**: `/aimtm`  
**Acesso**: Apenas VIP e Admin  
**Servidor**: Contabo VPS

---

## 📋 O QUE FOI CRIADO

### 1. Página /aimtm
**Ficheiro**: `app/aimtm/page.tsx`

**Características**:
- ✅ Acesso restrito (VIP + Admin)
- ✅ iFrame para n8n
- ✅ Configuração de URL (admin)
- ✅ Design MTM (paleta de cores)
- ✅ Loading state
- ✅ Botão abrir em nova janela
- ✅ Guia de setup incluído

### 2. Link na Navbar
**Ficheiro**: `components/navbar.tsx`

**Localização**:
```
Navbar → Educação → AI MTM Trader
```

**Ordem do submenu**:
1. Apresentação IQONIC
2. IQonic Academy
3. Sistema Ascendia
4. **AI MTM Trader** ← NOVO
5. Educação MTM
6. AI Com Os Gemeos
7. BackOffice IQ

---

## 🚀 COMO CONFIGURAR N8N NA CONTABO

### Passo 1: Criar VPS na Contabo

**1.1. Ir para Contabo**:
```
https://contabo.com
```

**1.2. Contratar VPS**:
- **Plano recomendado**: VPS S (4 vCPU, 8GB RAM)
- **OS**: Ubuntu 22.04 LTS
- **Localização**: Europa (Portugal/Alemanha)
- **Preço**: ~5-10€/mês

**1.3. Anotar credenciais**:
- IP do servidor: `123.456.789.10`
- Username SSH: `root`
- Password SSH: `(enviado por email)`

---

### Passo 2: Conectar ao VPS

**2.1. Via Terminal** (Mac/Linux):
```bash
ssh root@123.456.789.10
# Inserir password quando solicitado
```

**2.2. Atualizar sistema**:
```bash
apt update && apt upgrade -y
```

---

### Passo 3: Instalar n8n

**3.1. Instalar Node.js**:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # Verificar: v20.x
```

**3.2. Instalar n8n globalmente**:
```bash
npm install n8n -g
```

**3.3. Criar usuário para n8n** (segurança):
```bash
adduser n8n
usermod -aG sudo n8n
su - n8n
```

---

### Passo 4: Configurar n8n

**4.1. Criar ficheiro de configuração**:
```bash
mkdir -p ~/.n8n
nano ~/.n8n/.env
```

**4.2. Adicionar variáveis**:
```bash
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://SEU_IP:5678/
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=SuaSenhaSegura123!
```

**4.3. Salvar**: `Ctrl+X → Y → Enter`

---

### Passo 5: Rodar n8n

**Opção A: Teste Rápido**
```bash
n8n start
# Abrir: http://SEU_IP:5678
```

**Opção B: Produção (com PM2)**
```bash
# Instalar PM2
npm install pm2 -g

# Iniciar n8n com PM2
pm2 start n8n --name "n8n-trader"

# Auto-start no boot
pm2 startup
pm2 save

# Verificar status
pm2 status
```

---

### Passo 6: Configurar Firewall

**6.1. Abrir porta 5678**:
```bash
ufw allow 5678/tcp
ufw allow 22/tcp  # SSH
ufw enable
ufw status
```

---

### Passo 7: (OPCIONAL) Configurar Domínio + SSL

**7.1. Registar domínio** (ex: `n8n.morethanmoney.pt`)

**7.2. Apontar DNS**:
```
Tipo: A
Nome: n8n
Valor: SEU_IP_CONTABO
TTL: 300
```

**7.3. Instalar Nginx**:
```bash
apt install nginx -y
```

**7.4. Configurar reverse proxy**:
```bash
nano /etc/nginx/sites-available/n8n
```

**Conteúdo**:
```nginx
server {
    listen 80;
    server_name n8n.morethanmoney.pt;

    location / {
        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**7.5. Ativar site**:
```bash
ln -s /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

**7.6. Instalar SSL (Let's Encrypt)**:
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d n8n.morethanmoney.pt
# Seguir prompts
```

**7.7. Atualizar n8n config**:
```bash
nano ~/.n8n/.env
```

Mudar para:
```bash
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.morethanmoney.pt/
```

**7.8. Reiniciar n8n**:
```bash
pm2 restart n8n-trader
```

---

## 🔧 CONFIGURAR NA PLATAFORMA MTM

### Passo 8: Adicionar URL no Site

**8.1. Fazer login como Admin**:
```
https://www.morethanmoney.pt/admin
```

**8.2. Ir para /aimtm**:
```
https://www.morethanmoney.pt/aimtm
```

**8.3. Clicar "Configurar"**

**8.4. Inserir dados**:
- **URL**: `https://n8n.morethanmoney.pt` (com SSL)
  ou `http://SEU_IP:5678` (sem SSL)
- **Username**: `admin` (se configurou)
- **Password**: `SuaSenhaSegura123!` (se configurou)

**8.5. Clicar "Salvar Configuração"**

**8.6. Recarregar página**:
- iFrame deve aparecer com n8n ✅

---

## 🎯 WORKFLOWS N8N PARA TRADING

### Sugestões de Automação

**1. Monitor de Preços**:
```
Trigger: Cron (cada 5 min)
→ CoinGecko API (obter preços)
→ Comparar com targets
→ Se alerta: Enviar notificação push
```

**2. DCA Automático**:
```
Trigger: Cron (diário 9h)
→ Analisar oportunidades DCA
→ Inserir no Supabase (dca_opportunities)
→ Notificar membros VIP
```

**3. Social Feed Auto-Post**:
```
Trigger: Webhook ou Manual
→ Criar análise de mercado
→ Gerar imagem/chart
→ Postar no social_posts
```

**4. Sincronização Notion**:
```
Trigger: Cron (cada hora)
→ Buscar portfolios do Notion
→ Atualizar Supabase (admin_crypto_portfolio)
→ Notificar se novos ativos
```

**5. Email Marketing**:
```
Trigger: Manual ou Cron
→ Buscar templates do Supabase
→ Personalizar por utilizador
→ Enviar via API (SendGrid/Mailgun)
```

---

## 🔐 SEGURANÇA

### Recomendações Essenciais

**1. Sempre usar HTTPS** (SSL obrigatório em produção)

**2. Ativar autenticação n8n**:
```bash
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=SenhaForte123!@#
```

**3. Firewall configurado**:
```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect para HTTPS)
ufw allow 443/tcp   # HTTPS
ufw deny 5678/tcp   # Bloquear acesso direto (usar Nginx proxy)
```

**4. Backups regulares**:
```bash
# Backup workflows n8n
pm2 save
tar -czf n8n-backup-$(date +%Y%m%d).tar.gz ~/.n8n/

# Automatizar com cron
crontab -e
# Adicionar:
0 3 * * * tar -czf ~/backups/n8n-$(date +\%Y\%m\%d).tar.gz ~/.n8n/
```

**5. Monitorização**:
```bash
# Ver logs
pm2 logs n8n-trader

# Ver status
pm2 status

# Reiniciar se necessário
pm2 restart n8n-trader
```

---

## 📊 INTEGRAÇÕES RECOMENDADAS

### APIs a Conectar no n8n

**Trading**:
- CoinGecko (preços crypto)
- TradingView (sinais)
- Binance API (execução - se aplicável)

**Comunicação**:
- Supabase (database MTM)
- SendGrid/Mailgun (emails)
- Telegram Bot (notificações)
- WhatsApp Business API

**Dados**:
- Notion API (portfolios)
- Google Sheets (logs)
- Airtable (CRM)

**IA**:
- OpenAI API (análises)
- Anthropic Claude (relatórios)
- Google Gemini (insights)

---

## 🧪 TESTAR CONFIGURAÇÃO

### Teste 1: Acesso Básico
```
1. Abrir: https://www.morethanmoney.pt/aimtm
2. Fazer login (se não estiver)
3. Verificar:
   ✅ Página carrega
   ✅ iFrame aparece (se configurado)
   ✅ SEM erros console
```

### Teste 2: Acesso Restrito
```
1. Logout
2. Login com conta Member (não VIP)
3. Tentar aceder /aimtm
4. Verificar:
   ✅ Mensagem "Acesso Restrito"
   ✅ Não permite acesso
```

### Teste 3: iFrame n8n
```
1. Login como Admin/VIP
2. Ir para /aimtm
3. Configurar URL n8n
4. Verificar:
   ✅ iFrame carrega
   ✅ n8n interface visível
   ✅ Pode criar workflows
```

---

## 💡 DICAS AVANÇADAS

### Auto-Deploy com Git
```bash
# No VPS, criar script de atualização
nano ~/update-n8n.sh
```

```bash
#!/bin/bash
echo "🔄 Atualizando n8n..."
npm update -g n8n
pm2 restart n8n-trader
echo "✅ n8n atualizado!"
```

```bash
chmod +x ~/update-n8n.sh
```

### Monitorização com UptimeRobot
```
1. Criar conta: https://uptimerobot.com
2. Adicionar monitor:
   - URL: https://n8n.morethanmoney.pt
   - Tipo: HTTP(s)
   - Intervalo: 5 min
3. Notificações: Email/Telegram
```

### Performance Tuning
```bash
# No .env do n8n
N8N_LOG_LEVEL=warn  # Reduzir logs
N8N_METRICS=true    # Ativar métricas
EXECUTIONS_DATA_PRUNE=true  # Limpar execuções antigas
EXECUTIONS_DATA_MAX_AGE=168  # Manter 7 dias
```

---

## 📞 SUPORTE

### Problemas Comuns

**1. n8n não inicia**:
```bash
pm2 logs n8n-trader
# Ver erros
```

**2. iFrame vazio/branco**:
- Verificar: URL correta?
- Verificar: HTTPS/HTTP match?
- Verificar: CORS configurado?

**3. "Acesso Negado"**:
- Verificar: User é VIP ou Admin?
- Verificar: Login feito?

**4. Firewall bloqueando**:
```bash
ufw status
ufw allow 5678/tcp  # Se acesso direto
```

---

## ✅ CHECKLIST CONFIGURAÇÃO

### No VPS Contabo
- [ ] VPS criado e a correr
- [ ] Ubuntu 22.04 LTS instalado
- [ ] Node.js 20.x instalado
- [ ] n8n instalado globalmente
- [ ] PM2 instalado e configurado
- [ ] n8n a correr (pm2 status)
- [ ] Firewall configurado
- [ ] (Opcional) Domínio apontado
- [ ] (Opcional) SSL instalado

### Na Plataforma MTM
- [x] Página /aimtm criada
- [x] Link na navbar adicionado
- [x] Acesso restrito (VIP+Admin)
- [ ] URL configurada no admin
- [ ] Testado e funcional

---

## 🎯 PRÓXIMO PASSO

### Se NÃO tem VPS ainda:
1. Criar VPS na Contabo
2. Seguir Passos 1-7 acima
3. Configurar URL no /aimtm

### Se JÁ tem VPS n8n:
1. Anotar URL do n8n (ex: `https://n8n.seudominio.com`)
2. Ir para: https://www.morethanmoney.pt/aimtm
3. Clicar "Configurar"
4. Inserir URL
5. Salvar
6. ✅ Pronto!

---

## 📊 BENEFÍCIOS

**Para o Negócio**:
- ✅ Automação de análises DCA
- ✅ Auto-posting de conteúdo
- ✅ Notificações push automatizadas
- ✅ Sincronização Notion → Supabase
- ✅ Email marketing sequências

**Para os Membros**:
- ✅ Sinais de trading 24/7
- ✅ Alertas personalizados
- ✅ Relatórios automáticos
- ✅ Atualizações em tempo real

---

## 🔗 RECURSOS ÚTEIS

**Documentação**:
- n8n Docs: https://docs.n8n.io
- Contabo Help: https://contabo.com/support
- PM2 Docs: https://pm2.keymetrics.io

**Tutoriais**:
- n8n + Supabase: https://n8n.io/integrations/supabase
- n8n + Telegram: https://n8n.io/integrations/telegram
- n8n + OpenAI: https://n8n.io/integrations/openai

---

**Página /aimtm criada e pronta!** 🚀  
**Acesso**: https://www.morethanmoney.pt/aimtm  
**Quando configurar VPS → Inserir URL!** ✨



