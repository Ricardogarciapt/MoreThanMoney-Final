# 📊 Integração DCA Inteligente no Portfólio

## ✅ O Que Foi Implementado

### 1. **Crypto Analyser v2.json**
Arquivo de configuração baseado no workflow n8n com todas as regras de análise DCA:
- ✅ Análise técnica (RSI, MACD, SMA, Volume)
- ✅ Análise de sentiment (News API + OpenAI)
- ✅ Recomendações curto/longo prazo
- ✅ Zonas DCA inteligentes
- ✅ Estratégias para spot e leveraged trading

**Localização**: `/public/crypto-analyser-v2.json`

### 2. **API de Análise DCA**
Nova API que implementa toda a lógica do Crypto Analyser:
- ✅ Busca dados de candlesticks da Binance (15m, 1h, 4h, 1d)
- ✅ Busca notícias relacionadas (News API)
- ✅ Análise de sentiment com OpenAI
- ✅ Cálculo de indicadores técnicos (RSI, SMAs, Volume)
- ✅ Geração de recomendações DCA

**Localização**: `/app/api/portfolio/dca-analysis/route.ts`

**Endpoint**: `GET /api/portfolio/dca-analysis?symbol=BTC`

### 3. **Componente DCA Analysis Tab**
Componente React completo para exibir a análise DCA:
- ✅ Seleção de ativos crypto
- ✅ Exibição de indicadores técnicos
- ✅ Análise de sentiment (curto e longo prazo)
- ✅ Recomendações de compra/venda
- ✅ Zonas DCA inteligentes
- ✅ Níveis de confiança

**Localização**: `/components/dca-analysis-tab.tsx`

## 🔄 Fluxo de Dados

```
1. Usuário seleciona um ativo (BTC, ETH, SOL, etc.)
   ↓
2. Frontend chama /api/portfolio/dca-analysis?symbol=BTC
   ↓
3. API busca dados em paralelo:
   ├─ Binance: Candlesticks 15m, 1h, 4h, 1d
   ├─ News API: Notícias dos últimos 3 dias
   └─ OpenAI: Análise de sentiment
   ↓
4. API calcula:
   ├─ RSI, SMAs (20, 50, 200), Volume Ratio
   ├─ Sentiment scores (curto/longo prazo)
   └─ Recomendações DCA baseadas em regras
   ↓
5. API retorna JSON completo com:
   ├─ Indicadores técnicos
   ├─ Sentiment analysis
   ├─ Recomendações (curto + longo prazo)
   └─ Zonas DCA sugeridas
   ↓
6. Frontend renderiza:
   ├─ Cards de indicadores
   ├─ Cards de sentiment
   ├─ Cards de recomendações
   └─ Lista de zonas DCA
```

## 📋 Como Integrar na Página /portfolios

### Opção 1: Adicionar como Tab (Recomendado)

Adicione o código abaixo após a linha 286 do arquivo `/app/portfolios/page.tsx`:

```typescript
import DCAAnalysisTab from "@/components/dca-analysis-tab"

// Dentro do componente, antes do return:
const cryptoAssets = portfolioData?.byCategory?.crypto?.map(asset => ({
  symbol: asset.symbol,
  name: asset.name
})) || []

// Dentro do JSX, adicione as tabs:
<Tabs defaultValue="assets" className="w-full">
  <TabsList className="grid w-full grid-cols-3 bg-gray-900 border-[#D2A63C]/30">
    <TabsTrigger value="assets">Ativos</TabsTrigger>
    <TabsTrigger value="dca">Análise DCA</TabsTrigger>
    <TabsTrigger value="performance">Performance</TabsTrigger>
  </TabsList>

  <TabsContent value="assets" className="space-y-6 mt-6">
    {/* Todo o código atual dos ativos (metrics cards + table) */}
  </TabsContent>

  <TabsContent value="dca" className="mt-6">
    <DCAAnalysisTab cryptoAssets={cryptoAssets} />
  </TabsContent>

  <TabsContent value="performance" className="mt-6">
    {/* Análise de performance futura */}
  </TabsContent>
</Tabs>
```

### Opção 2: Adicionar como Seção Separada (Mais Simples)

Adicione após a tabela de ativos (linha ~380):

```typescript
import DCAAnalysisTab from "@/components/dca-analysis-tab"

// Dentro do return, após o Card dos ativos:
{portfolioData.byCategory?.crypto && (
  <div className="mt-12">
    <DCAAnalysisTab 
      cryptoAssets={portfolioData.byCategory.crypto.map(asset => ({
        symbol: asset.symbol,
        name: asset.name
      }))} 
    />
  </div>
)}
```

## 🎯 Dados do Notion

Os dados virão da database do Notion ([https://harmonious-comma-e85.notion.site/Portefolio-Cripto-e-Stocks-76557dddfbc348aba2f6e24ea1f5133e](https://harmonious-comma-e85.notion.site/Portefolio-Cripto-e-Stocks-76557dddfbc348aba2f6e24ea1f5133e)) via API `/api/portfolio/sync`.

A análise DCA será aplicada automaticamente a qualquer ativo crypto retornado do Notion que tenha um símbolo válido na Binance (BTC, ETH, SOL, etc.).

## 📊 Exemplo de Resposta da API

```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": "2025-10-10T15:30:00Z",
    "currentPrice": "63450.25",
    "technical_indicators": {
      "rsi_1d": "58.3",
      "sma20": "62800.50",
      "sma50": "61200.30",
      "sma200": "58900.75",
      "volume_ratio": "1.45"
    },
    "sentiment": {
      "shortTermSentiment": {
        "category": "Positive",
        "score": 0.65,
        "rationale": "Aprovação de ETFs aumenta confiança institucional..."
      },
      "longTermSentiment": {
        "category": "Positive",
        "score": 0.75,
        "rationale": "Halving se aproximando. Adoção institucional crescente..."
      }
    },
    "recommendations": {
      "curto_prazo": {
        "acao": "Comprar seletivamente",
        "entradas": "62800.00 - 63450.25",
        "stop_loss": "60277.74",
        "take_profit": ["65353.76", "66622.76"],
        "justificacao": "RSI: 58.3. Sentiment: Positive. Aprovação de ETFs...",
        "confidence": 75
      },
      "longo_prazo": {
        "acao": "Forte Acumulação",
        "entradas": "55955.71 - 63450.25",
        "stop_loss": "50082.14",
        "take_profit": ["72967.79", "82485.33", "95175.38"],
        "justificacao": "Tendência macro bullish. Sentiment longo prazo: Positive...",
        "confidence": 85
      }
    },
    "dca_zones": [
      {
        "price_range": "57105.23 - 60277.74",
        "allocation": "40%",
        "reason": "Zona de acumulação forte (5-10% abaixo do preço atual)"
      },
      {
        "price_range": "60277.74 - 63450.25",
        "allocation": "35%",
        "reason": "Zona de valor atual"
      },
      {
        "price_range": "63450.25 - 66622.76",
        "allocation": "25%",
        "reason": "Confirmação de breakout"
      }
    ],
    "news_analyzed": 10
  }
}
```

## 🔑 Variáveis de Ambiente Necessárias

Adicione ao `.env.local`:

```env
# OpenAI (para análise de sentiment)
OPENAI_API_KEY=sk-xxx...

# News API (já configurada no código)
# 06b9c2a3e5074e0eb03ca7ea13f18014
```

## 🚀 Próximos Passos

1. **Adicionar suporte para ETFs**:
   - Criar lógica similar para ações/ETFs
   - Usar Yahoo Finance ou Alpha Vantage
   - Adaptar indicadores para timeframes de stocks

2. **Melhorar análise de sentiment**:
   - Adicionar mais fontes de notícias
   - Implementar análise de Twitter/Reddit
   - Criar score ponderado

3. **Automatizar execução DCA**:
   - Integrar com exchange (Binance API)
   - Criar ordens automáticas baseadas nas zonas
   - Notificações quando atingir zonas de compra

4. **Dashboard de Performance DCA**:
   - Tracking de compras realizadas
   - Cálculo de preço médio ponderado
   - Comparação com buy & hold

## 📱 Integração com App Mobile

O componente DCA pode ser facilmente integrado na `/app-mobile` na tab de Portfólios:

```typescript
// Em /app-mobile/page.tsx, na tab Portfolios:
import DCAAnalysisTab from "@/components/dca-analysis-tab"

// Adicionar uma seção DCA:
{selectedTab === 'portfolios' && (
  <>
    <PortfolioMobile />
    <div className="mt-8">
      <DCAAnalysisTab cryptoAssets={cryptoAssetsFromNotionOrPortfolio} />
    </div>
  </>
)}
```

## 🎨 Personalização

### Cores MTM:
- Primary: `#D2A63C` (Dourado)
- Secondary: `#BB8525` (Dourado escuro)
- Background: `#F3F3E6` (Bege claro)

Todas já aplicadas no componente DCA.

### Ícones:
- BarChart3: Indicadores técnicos
- Newspaper: Sentiment analysis
- Brain: DCA inteligente
- Target: Objetivos de longo prazo
- TrendingUp: Recomendações positivas

---

**Status**: ✅ Pronto para integração
**Compatibilidade**: React 18+, Next.js 14+
**APIs Externas**: Binance, News API, OpenAI
**Cache**: 5 minutos (candlesticks), 1 hora (notícias)
