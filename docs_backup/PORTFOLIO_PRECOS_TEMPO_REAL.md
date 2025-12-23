# 📊 Sistema de Portfólio com Preços em Tempo Real

## ✅ Implementação Completa

### 🎯 O Problema Resolvido
A página `/portfolios` não estava a buscar preços reais dos ativos. Agora está 100% sincronizada com:
- **Notion** (dados dos ativos)
- **CoinGecko** (preços crypto)
- **Yahoo Finance** (preços stocks)
- **OpenAI** (fallback quando APIs falham)

## 🔄 Fluxo do Sistema

```
┌─────────────────┐
│   Frontend      │
│  /portfolios    │
└────────┬────────┘
         │
         │ GET /api/portfolio/sync
         ▼
┌─────────────────────────────────────┐
│  API Route                          │
│  /api/portfolio/sync/route.ts       │
├─────────────────────────────────────┤
│  1. Busca dados do Notion           │
│  2. Para cada ativo:                │
│     ├─ Crypto → CoinGecko           │
│     ├─ Stocks → Yahoo Finance       │
│     └─ Fallback → OpenAI            │
│  3. Calcula métricas (PNL, etc.)    │
│  4. Retorna JSON completo           │
└────────┬────────────────────────────┘
         │
         │ JSON Response
         ▼
┌─────────────────────────────────────┐
│  Frontend recebe e exibe:           │
│  ✅ Preços atualizados              │
│  ✅ PNL calculado                   │
│  ✅ Performance %                   │
│  ✅ Métricas do portfolio           │
└─────────────────────────────────────┘
```

## 📋 Estrutura do Notion

### Propriedades Necessárias:

| Propriedade | Tipo | Descrição | Exemplo |
|------------|------|-----------|---------|
| **Nome** | Title | Nome do ativo | Bitcoin, Apple Inc. |
| **Símbolo** | Rich Text | Ticker | BTC, AAPL, ETH |
| **Preço de Entrada** | Number | Preço de compra | 42000 |
| **Target 1** | Number | Primeiro alvo | 50000 |
| **Target 2** | Number | Segundo alvo | 60000 |
| **Target 3** | Number | Terceiro alvo | 75000 |
| **Stop Loss** | Number | Stop loss | 38000 |
| **Categoria** | Select | crypto / stocks / forex / commodity | crypto |
| **Status** | Select | active / closed / watching | active |

### Exemplo de Entrada no Notion:

```
Nome: Bitcoin
Símbolo: BTC
Preço de Entrada: 42000
Target 1: 50000
Target 2: 60000
Target 3: 75000
Stop Loss: 38000
Categoria: crypto
Status: active
```

## 🔑 Variáveis de Ambiente

Adicione ao `.env.local`:

```env
# Notion API
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_PORTFOLIO_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI (opcional, para fallback)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 🚀 Como Configurar o Notion

### Passo 1: Criar Integration
1. Acesse: https://www.notion.so/my-integrations
2. Clique em "+ New integration"
3. Nome: "MTM Portfolio API"
4. Workspace: Selecione seu workspace
5. Copie o "Internal Integration Token" → `NOTION_API_KEY`

### Passo 2: Criar Database
1. Crie uma nova página no Notion
2. Adicione uma Database (Table)
3. Nome: "Portfólio Cripto e Stocks MTM"
4. Adicione todas as propriedades da tabela acima

### Passo 3: Partilhar com Integration
1. Abra a database
2. Clique em "..." (mais opções)
3. "Add connections"
4. Selecione "MTM Portfolio API"

### Passo 4: Obter Database ID
1. Abra a database no Notion
2. Na URL: `https://notion.so/workspace/{DATABASE_ID}?v={view_id}`
3. Copie o `DATABASE_ID` → `NOTION_PORTFOLIO_DATABASE_ID`

## 💰 Fontes de Preços

### 1. CoinGecko (Crypto) ✅
- **API**: Gratuita, sem API key
- **URL**: `https://api.coingecko.com/api/v3/simple/price`
- **Símbolos suportados**: 
  - BTC, ETH, SOL, ADA, DOT, LINK, MATIC, AVAX, ATOM, UNI
  - XRP, BNB, DOGE, LTC, BCH, ALGO, VET, FIL, ICP, NEAR
  - E mais 100+ criptomoedas

### 2. Yahoo Finance (Stocks) ✅
- **API**: Gratuita, sem API key
- **URL**: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
- **Símbolos suportados**: 
  - AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, NFLX
  - Todos os símbolos NYSE, NASDAQ, etc.

### 3. OpenAI GPT-4 (Fallback) 🤖
- **API**: Requer OPENAI_API_KEY
- **Uso**: Quando CoinGecko e Yahoo Finance falham
- **Método**: Pergunta diretamente ao GPT-4 o preço atual
- **Custo**: ~$0.01 por 1000 tokens

## 📊 Resposta da API

### Exemplo de JSON retornado:

```json
{
  "success": true,
  "data": {
    "assets": [
      {
        "symbol": "BTC",
        "name": "Bitcoin",
        "entry_price": 42000,
        "current_price": 63450.25,
        "target_1": 50000,
        "target_2": 60000,
        "target_3": 75000,
        "stop_loss": 38000,
        "category": "crypto",
        "status": "active"
      },
      {
        "symbol": "ETH",
        "name": "Ethereum",
        "entry_price": 2800,
        "current_price": 3245.75,
        "target_1": 3500,
        "target_2": 4200,
        "target_3": 5000,
        "stop_loss": 2500,
        "category": "crypto",
        "status": "active"
      }
    ],
    "byCategory": {
      "crypto": [ /* assets crypto */ ],
      "stocks": [ /* assets stocks */ ]
    },
    "metrics": {
      "totalInvestment": 100000,
      "currentValue": 125000,
      "totalPNL": 25000,
      "totalPNLPercent": 25,
      "totalAssets": 10,
      "activeAssets": 8
    },
    "lastUpdated": "2025-10-10T14:30:00.000Z"
  }
}
```

## 🎨 Interface do Frontend

### Métricas Exibidas:
- ✅ **Valor Total Investido**: Soma de todos os preços de entrada
- ✅ **Valor Atual**: Soma de todos os preços atuais
- ✅ **PNL Total**: Diferença entre valor atual e investido
- ✅ **Performance %**: Percentual de ganho/perda

### Tabela de Ativos:
- Nome e Símbolo
- Preço de Entrada
- **Preço Atual** (sincronizado em tempo real)
- PNL ($ e %)
- Target 1
- Stop Loss
- Status (Active/Closed/Watching)

### Filtros:
- Por categoria (Crypto, Stocks, Forex, Commodity)
- Contadores de ativos por categoria

## ⏰ Atualização Automática

### Configurações:
- **Atualização Automática**: A cada 2 minutos (120000ms)
- **Botão Manual**: Disponível para atualização imediata
- **Cache**: 60 segundos por símbolo (evita rate limiting)
- **Loading States**: Spinner enquanto carrega

### Código de Atualização:
```typescript
useEffect(() => {
  loadPortfolioData()

  // Atualizar a cada 2 minutos
  const interval = setInterval(() => {
    loadPortfolioData()
  }, 120000)

  return () => clearInterval(interval)
}, [])
```

## 🔧 Troubleshooting

### Problema: "Notion Database ID não configurado"
**Solução**: Verificar se `NOTION_PORTFOLIO_DATABASE_ID` está no `.env.local`

### Problema: Preços não atualizam
**Solução**: 
1. Verificar se há conexão com internet
2. Verificar console do navegador para erros
3. Verificar rate limiting das APIs (max 60 req/min para CoinGecko)

### Problema: "Erro ao buscar preço de {símbolo}"
**Solução**:
1. Verificar se o símbolo está correto
2. Para crypto: Usar símbolos do CoinGecko (BTC, ETH, etc.)
3. Para stocks: Usar símbolos do Yahoo Finance (AAPL, MSFT, etc.)
4. Adicionar `OPENAI_API_KEY` para fallback

### Problema: Database do Notion vazia
**Solução**:
1. Verificar se a database foi partilhada com a integration
2. Verificar se há entradas na database
3. Verificar se as propriedades têm os nomes corretos

## 📈 Métricas e Cálculos

### PNL (Profit and Loss):
```typescript
const pnl = current_price - entry_price
const pnlPercent = (pnl / entry_price) * 100
```

### Performance Total:
```typescript
const totalInvestment = assets.reduce((sum, asset) => sum + asset.entry_price, 0)
const currentValue = assets.reduce((sum, asset) => sum + asset.current_price, 0)
const totalPNL = currentValue - totalInvestment
const totalPNLPercent = (totalPNL / totalInvestment) * 100
```

## 🎯 Próximos Passos (Opcional)

### Melhorias Possíveis:
1. **Alertas de Preço**: Notificar quando atingir targets ou stop loss
2. **Histórico de Preços**: Gráficos de performance ao longo do tempo
3. **Análise Técnica**: Indicadores (RSI, MACD, etc.)
4. **Portfolio Pessoal**: Permitir usuário criar seu próprio portfolio
5. **Exportação**: PDF/Excel com relatório completo

## 📞 Suporte

### APIs Utilizadas:
- CoinGecko: https://www.coingecko.com/en/api
- Yahoo Finance: https://finance.yahoo.com
- Notion API: https://developers.notion.com
- OpenAI: https://platform.openai.com

### Links Úteis:
- Documentação Notion API: https://developers.notion.com/docs
- CoinGecko API Docs: https://www.coingecko.com/en/api/documentation
- Yahoo Finance: Não tem documentação oficial, mas é amplamente usado

---

**Data de Implementação**: 10 de Outubro de 2025
**Versão**: 2.0.0
**Status**: ✅ Produção

**Funcionalidades**:
- ✅ Sincronização com Notion
- ✅ Preços em tempo real (CoinGecko + Yahoo Finance)
- ✅ Fallback com OpenAI
- ✅ Cálculo automático de PNL
- ✅ Interface responsiva
- ✅ Atualização automática a cada 2 minutos
- ✅ Filtros por categoria
- ✅ Botão de atualização manual
