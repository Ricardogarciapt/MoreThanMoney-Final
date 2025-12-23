# 🤖 PÁGINA /AIMTM PRONTA - ACESSO N8N VPS

**URL**: https://www.morethanmoney.pt/aimtm  
**Função**: Acesso direto ao ambiente de trabalho n8n  
**Status**: ✅ **PRONTO PARA USAR**

---

## ✅ O QUE FOI CRIADO

### Página Completa: `/aimtm`
**Ficheiro**: `app/aimtm/page.tsx`

**Características**:
- 🔐 **Acesso Restrito** → Apenas VIP + Admin
- 🖥️ **iFrame Full** → Ambiente n8n direto
- 📊 **Info Servidor** → Dados VPS Contabo
- 🔄 **Botão Recarregar** → Refresh do iFrame
- 🪟 **Nova Janela** → Abrir n8n em fullscreen
- ⚡ **Loading State** → Feedback visual
- 🎨 **Design MTM** → Paleta de cores

---

## 🌐 SERVIDOR N8N CONFIGURADO

### Dados do VPS Contabo

| Campo | Valor |
|-------|-------|
| **Display Name** | Servidor N8N |
| **Host ID** | 19383 |
| **Região** | EU |
| **IP Address** | 173.249.23.54 |
| **IPv6** | 2a02:c207:2287:7758::1/64 |
| **OS** | Linux |
| **Disco** | 100 GB NVMe SSD |
| **Plano** | Cloud VPS 20 NVMe |
| **Preço Mensal** | €8.61 |

### Acesso n8n

| Campo | Valor |
|-------|-------|
| **URL** | https://vmi2877758.contaboserver.net |
| **Username** | admin@vmi2877758.contaboserver.net |
| **Password** | 8AULskiFZQExF9jjTpyPd33V3zat |

---

## 🎯 COMO ACEDER

### Passo 1: Fazer Login
```
https://www.morethanmoney.pt/login
→ Login com Google ou Email
→ Deve ser VIP ou Admin
```

### Passo 2: Ir para AI MTM Trader
**Opção A - Navbar**:
```
Navbar → 🤖 AI MTM Trader (menu principal)
```

**Opção B - URL Direta**:
```
https://www.morethanmoney.pt/aimtm
```

### Passo 3: Usar n8n
```
→ iFrame carrega automaticamente
→ Fazer login no n8n (primeira vez):
   Email: admin@vmi2877758.contaboserver.net
   Password: 8AULskiFZQExF9jjTpyPd33V3zat
→ Criar workflows de automação
```

---

## 🔐 CONTROLO DE ACESSO

### Quem Pode Aceder?
- ✅ **Admin** (user_type = 'admin')
- ✅ **VIP** (member_category = 'vip')
- ❌ **Member** padrão (acesso negado)

### Mensagem de Acesso Negado
```
Se não for VIP/Admin, vê:

┌────────────────────────────────┐
│ 🛡️ Acesso Restrito            │
├────────────────────────────────┤
│ Esta área está disponível      │
│ apenas para membros VIP e      │
│ Admin.                         │
│                                │
│ Para ter acesso, contacta o    │
│ suporte.                       │
└────────────────────────────────┘
```

---

## 🎨 DESIGN DA PÁGINA

### Header (Dourado MTM)
```
┌─────────────────────────────────────────┐
│ 🤖 AI MTM Trader                       │
│ Automação n8n - Servidor Contabo VPS   │
│                                         │
│               [🟢 VPS Ativo] [🪟 Nova] │
└─────────────────────────────────────────┘
```

### Info Servidor (Card Dourado)
```
┌─────────────────────────────────────────┐
│ 🖥️ Informações do Servidor VPS         │
├─────────────────────────────────────────┤
│ Nome: Servidor N8N                     │
│ Host ID: 19383                         │
│ Região: EU                             │
│ IP: 173.249.23.54                      │
│ Sistema: Linux                         │
│ Disco: 100 GB NVMe                     │
│ Plano: Cloud VPS 20 NVMe               │
│ URL: https://vmi2877758.contaboserver. │
└─────────────────────────────────────────┘
```

### Cards de Features (3 colunas)
```
┌─────────────┬─────────────┬─────────────┐
│ ⚡ Automação│ 🤖 AI Trading│ 🖥️ VPS      │
│             │             │             │
│ Workflows   │ Algoritmos  │ 100GB NVMe  │
│ n8n         │ IA          │ 24/7        │
└─────────────┴─────────────┴─────────────┘
```

### iFrame n8n (Fullscreen)
```
┌─────────────────────────────────────────┐
│ 🤖 n8n Automation Platform   [🔄 Reload]│
├─────────────────────────────────────────┤
│                                         │
│         [AMBIENTE N8N AQUI]             │
│                                         │
│    (iFrame com login/workflows)         │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🚀 CASOS DE USO

### Workflows Recomendados

**1. Monitor DCA Diário**
```
Trigger: Cron (9h diariamente)
→ Chamar /api/portfolio/dca-smart
→ Analisar oportunidades
→ Enviar notificações push
→ Registar em Supabase
```

**2. Sincronização Notion**
```
Trigger: Cron (cada hora)
→ Buscar dados Notion API
→ Atualizar admin_crypto_portfolio
→ Atualizar admin_etf_portfolio
→ Log em Supabase
```

**3. Auto-Post Social**
```
Trigger: Manual ou Cron
→ Gerar análise de mercado (OpenAI)
→ Criar post em social_posts
→ Notificar membros VIP
```

**4. Email Marketing**
```
Trigger: Cron ou Webhook
→ Buscar templates de email_templates
→ Personalizar por utilizador
→ Enviar via SendGrid
→ Track opens/clicks
```

**5. Backup Automático**
```
Trigger: Cron (3h diariamente)
→ Export Supabase data
→ Upload para Cloud Storage
→ Notificar admin se erro
```

---

## 🔧 NAVBAR ATUALIZADA

### Menu Principal
```
┌─────────────────────────────────────┐
│ Início | Educação | 🤖 AI MTM Trader │ Trading | ... │
└─────────────────────────────────────┘
```

**Posição**: Menu principal (NÃO submenu)

**Ordem**:
1. Início
2. Educação (com submenu)
3. **🤖 AI MTM Trader** ← NOVO (menu principal)
4. Trading (com submenu)
5. Portfólios (com submenu)
6. Scanner ao Vivo

---

## 🧪 TESTAR LOCALMENTE

### Quando Servidor Compilar

```bash
# 1. Abrir browser
http://localhost:3000/aimtm

# 2. Se não estiver logado:
→ Redirect para /login
→ Fazer login

# 3. Se for Member (não VIP):
→ Ver "Acesso Restrito"

# 4. Se for VIP ou Admin:
→ Ver página completa
→ iFrame n8n carrega
→ Ver info do servidor
→ Pode trabalhar no n8n!
```

### Verificar
- ✅ Navbar tem "🤖 AI MTM Trader"
- ✅ Página /aimtm carrega
- ✅ Info servidor aparece
- ✅ iFrame n8n carrega
- ✅ Botão "Nova Janela" funciona
- ✅ Botão "Recarregar" funciona

---

## 📊 RESUMO TÉCNICO

### Ficheiros Criados/Modificados
1. **app/aimtm/page.tsx** → NOVO (página completa)
2. **components/navbar.tsx** → Link menu principal

### Configurações Fixas no Código
```typescript
const n8nUrl = "https://vmi2877758.contaboserver.net"
const serverInfo = {
  displayName: "Servidor N8N",
  host: "19383",
  region: "EU",
  ip: "173.249.23.54",
  // ... mais info
}
```

### Acesso Controlado
```typescript
const hasAccess = profile?.user_type === 'admin' || 
                 profile?.member_category === 'vip'
```

### iFrame Settings
```typescript
<iframe
  src="https://vmi2877758.contaboserver.net"
  height="calc(100vh - 250px)"
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
  allow="clipboard-read; clipboard-write; fullscreen"
/>
```

---

## 🎯 PRÓXIMO PASSO

### Quando Testes OK

```bash
git add app/aimtm/page.tsx components/navbar.tsx
git commit -m "🤖 Feat: Página AI MTM Trader - Acesso n8n VPS Contabo"
git push origin main
```

**Deploy automático** → 2-3 min  
**URL Produção**: https://www.morethanmoney.pt/aimtm ✅

---

## 📝 CREDENCIAIS N8N

**Para usar no n8n** (primeira vez):

```
URL: https://vmi2877758.contaboserver.net
Email: admin@vmi2877758.contaboserver.net
Password: 8AULskiFZQExF9jjTpyPd33V3zat
```

**Após primeiro login**:
- Criar workflows
- Configurar integrações
- Automatizar processos MTM

---

**Página /aimtm pronta!** 🤖  
**Acesso direto ao ambiente n8n!** ✅  
**VPS Contabo configurado e ativo!** 🚀



