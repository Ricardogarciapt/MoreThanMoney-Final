# ⚠️ LIMITAÇÃO DO VERCEL HOBBY PLAN - CRON JOBS

## 🚨 **PROBLEMA**

O plano **Hobby** do Vercel **SOMENTE PERMITE 1 CRON JOB POR DIA**.

Não é possível adicionar múltiplos crons! Cada cron só pode executar 1x por dia.

Isso significa que alertas de preço não podem ser verificados em tempo real (a cada minuto ou 15 minutos).

---

## ✅ **SOLUÇÕES POSSÍVEIS**

### **1. Upgrade para Vercel Pro** (Recomendado)
- Custa $20/mês
- Permite crons ilimitados
- Pode executar a cada minuto
- Melhor para alertas em tempo real

### **2. Usar Serviço Externo** (Gratuito)
- **cron-job.org** - Permite crons gratuitos a cada minuto
- **EasyCron** - Permite crons gratuitos a cada 5 minutos
- **UptimeRobot** - Monitoramento gratuito

**Configuração**:
```
URL: https://www.morethanmoney.pt/api/notifications/check-alerts
Schedule: A cada 5 minutos
Method: GET
```

### **3. Usar Webhooks Externos**
- Configurar webhooks em serviços de trading
- Serviço externo chama a API quando preço muda

### **4. Ajustar Cron para 1 vez por dia** (Atual)
```json
{
  "path": "/api/notifications/check-alerts",
  "schedule": "0 9 * * *"  // 9h da manhã todos os dias
}
```

---

## 📊 **IMPACTO ATUAL**

### **Cron Jobs Configurados**:
- ✅ **DCA Daily Check** - 1 vez por dia (9h) - **OK**
- ✅ **DCA Daily Post** - 1 vez por dia (9h) - **OK**
- ⚠️ **Check Alerts** - 1 vez por hora - **LIMITADO**

### **Notificações**:
- ✅ **DCA** - Funciona (1x por dia)
- ✅ **Social Feed** - Funciona (em tempo real)
- ⚠️ **Alertas de Preço** - Funciona mas verifica apenas 1x por hora (não ideal)

---

## 🎯 **RECOMENDAÇÃO**

Para alertas de preço em tempo real:

1. **Usar cron-job.org** (grátis) para verificar a cada 5 minutos
2. OU **Upgrade para Vercel Pro** ($20/mês)
3. OU **Aceitar verificação 1x por dia** (menos preciso)

---

**Status Atual**: ⚠️ Configurado para 1x por hora (aceita limitação Hobby)

