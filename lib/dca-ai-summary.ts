/**
 * Resumo executivo IA para DCA Inteligente (crypto ou ETF).
 * Vai pela porta única da IA (`chamarIA`). Devolve `null` quando não há resposta — quem chama
 * mostra o painel sem resumo; não se inventa parágrafo nenhum.
 */
import { chamarIA, mensagemIndisponivel } from '@/lib/ia/chamar'

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
  if (opportunities.length === 0) return null

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
    const r = await chamarIA({
      tarefa: 'dca-resumo',
      mensagens: [{ role: 'user', content: prompt }],
      maxTokens: 320,
      temperatura: 0.4,
      preferencia: 'rapido',
    })
    return r.texto.trim() || null
  } catch (e) {
    console.warn('[dca-ai-summary]', mensagemIndisponivel(e))
    return null
  }
}
