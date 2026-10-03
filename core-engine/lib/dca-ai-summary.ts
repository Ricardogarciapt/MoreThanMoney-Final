/** Resumo executivo IA para DCA Inteligente (crypto ou ETF). */

export type DcaOpportunityLite = {
  symbol: string
  name: string
  current_price: number
  discount_percent: number
  recommendation: string
  suggested_percent?: number
}

export async function generateDcaAiSummary(
  assetType: 'crypto' | 'etf',
  opportunities: DcaOpportunityLite[],
  summary: {
    strong_buy_count: number
    buy_count: number
    total_assets_analyzed: number
  },
): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey || opportunities.length === 0) return null

  const top = [...opportunities]
    .filter((o) => o.recommendation === 'Forte Compra' || o.recommendation === 'Compra')
    .slice(0, 6)

  const marketLabel = assetType === 'crypto' ? 'criptomoedas' : 'ETFs e stocks'
  const prompt = `És analista quantitativo MoreThanMoney (PT-PT, tom profissional mas acessível).
Analisa o portefólio MTM de ${marketLabel} e escreve um resumo executivo de 4-6 frases para investidores DCA.

Contexto:
- Ativos analisados: ${summary.total_assets_analyzed}
- Forte Compra: ${summary.strong_buy_count}
- Compra: ${summary.buy_count}
- Data: ${new Date().toLocaleDateString('pt-PT')}

Top oportunidades:
${top.map((o) => `- ${o.name} (${o.symbol}): ${o.recommendation}, variação ${o.discount_percent.toFixed(1)}%, preço $${o.current_price.toFixed(2)}`).join('\n')}

Regras:
- Conteúdo educativo, não constitui consultoria financeira
- Menciona se o mercado favorece reforço agressivo, moderado ou paciência
- Sem garantias de retorno
- Responde só com o parágrafo, sem título`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_DCA_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 320,
        temperature: 0.4,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    return text || null
  } catch {
    return null
  }
}
