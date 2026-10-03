import type { DcaOpportunityLite } from './dca-ai-summary'

type PostOptions = {
  assetType: 'crypto' | 'etf'
  goodOpportunities: DcaOpportunityLite[]
  aiSummary?: string | null
}

export function formatDcaChatPost({ assetType, goodOpportunities, aiSummary }: PostOptions): string {
  const isCrypto = assetType === 'crypto'
  const title = isCrypto ? '🤖 ANÁLISE DCA CRIPTO' : '📈 ANÁLISE DCA ETF & STOCKS'
  const emoji = isCrypto ? '₿' : '📊'

  const strongBuys = goodOpportunities.filter((o) => o.recommendation === 'Forte Compra')
  const buys = goodOpportunities.filter((o) => o.recommendation === 'Compra')

  let post = `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ${title}  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📅 ${new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

💡 **Análise gerada pelo motor DCA Inteligente MTM (IA + dados de mercado em tempo real).**
_Conteúdo educativo — não constitui consultoria financeira._\n\n`

  if (aiSummary) {
    post += `🧠 **Visão IA do mercado**\n${aiSummary}\n\n`
  }

  if (strongBuys.length > 0) {
    post += `┏━━━━━━━━━━━━━━━━━━━━━┓\n`
    post += `┃ 🚀 FORTE COMPRA (${strongBuys.length}) ┃\n`
    post += `┗━━━━━━━━━━━━━━━━━━━━━┛\n\n`
    strongBuys.slice(0, 5).forEach((opp, idx) => {
      post += `${idx + 1}. **${opp.name}** (${opp.symbol})\n`
      post += `   💰 Preço: $${opp.current_price.toFixed(isCrypto ? 4 : 2)}\n`
      post += `   📉 Variação: **${opp.discount_percent.toFixed(1)}%**\n`
      if (opp.suggested_percent) {
        post += `   💎 Reforço: **${opp.suggested_percent}%** do plano\n`
      }
      post += `\n`
    })
  }

  if (buys.length > 0) {
    post += `┏━━━━━━━━━━━━━━━━━━┓\n`
    post += `┃ ⚡ COMPRA (${buys.length})    ┃\n`
    post += `┗━━━━━━━━━━━━━━━━━━┛\n\n`
    buys.slice(0, 4).forEach((opp, idx) => {
      post += `${idx + 1}. **${opp.name}** (${opp.symbol})\n`
      post += `   💰 Preço: $${opp.current_price.toFixed(isCrypto ? 4 : 2)}\n`
      post += `   📉 Variação: **${opp.discount_percent.toFixed(1)}%**\n\n`
    })
  }

  const avgDiscount =
    goodOpportunities.length > 0
      ? goodOpportunities.reduce((s, o) => s + o.discount_percent, 0) / goodOpportunities.length
      : 0

  post += `┏━━━━━━━━━━━━━━━━━━━━━━┓\n`
  post += `┃ 📊 RESUMO EXECUTIVO  ┃\n`
  post += `┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n`
  post += `${emoji} **Oportunidades:** ${goodOpportunities.length} ativos\n`
  post += `📉 **Variação média (compra):** ${avgDiscount.toFixed(1)}%\n\n`
  post += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  post += `⚡ **Estratégia DCA MoreThanMoney**\n`
  post += `🌟 Together We Go Further\n`
  post += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`
  post += `📱 Análise completa: /portfolios → Análise DCA`

  return post
}
