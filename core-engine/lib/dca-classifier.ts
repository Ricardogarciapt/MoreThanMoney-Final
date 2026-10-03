export type DcaRecommendation = 'Forte Compra' | 'Compra' | 'Aguardar' | 'Não Reforçar'

export type DcaClassification = {
  recommendation: DcaRecommendation
  confidence: number
  suggestedAmount: number
  suggestedPercent: number
  rationale: string
}

/** Crypto — volatilidade alta, janelas mais amplas. */
export function classifyCryptoDailyChange(
  dailyChangePercent: number,
  plannedInvestment: number,
): DcaClassification {
  if (dailyChangePercent <= -8) {
    return {
      recommendation: 'Forte Compra',
      confidence: 85,
      suggestedAmount: plannedInvestment * 2,
      suggestedPercent: 20,
      rationale: `Depreciação diária forte (${dailyChangePercent.toFixed(2)}%). Janela agressiva de reforço DCA.`,
    }
  }
  if (dailyChangePercent <= -4) {
    return {
      recommendation: 'Compra',
      confidence: 72,
      suggestedAmount: plannedInvestment * 1.5,
      suggestedPercent: 15,
      rationale: `Depreciação diária relevante (${dailyChangePercent.toFixed(2)}%). Reforço recomendado.`,
    }
  }
  if (dailyChangePercent <= 1.5) {
    return {
      recommendation: 'Aguardar',
      confidence: 55,
      suggestedAmount: plannedInvestment * 0.5,
      suggestedPercent: 5,
      rationale: `Variação diária controlada (${dailyChangePercent.toFixed(2)}%). Manter reforço moderado.`,
    }
  }
  return {
    recommendation: 'Não Reforçar',
    confidence: 35,
    suggestedAmount: 0,
    suggestedPercent: 0,
    rationale: `Valorização diária elevada (+${dailyChangePercent.toFixed(2)}%). Evitar perseguir preço no curto prazo.`,
  }
}

/** ETF/Stocks — movimentos diários mais contidos, limiares ajustados. */
export function classifyEtfDailyChange(
  dailyChangePercent: number,
  plannedWeeklyInvestment: number,
): DcaClassification {
  const weekly = plannedWeeklyInvestment > 0 ? plannedWeeklyInvestment : 25

  if (dailyChangePercent <= -3.5) {
    return {
      recommendation: 'Forte Compra',
      confidence: 82,
      suggestedAmount: weekly * 2,
      suggestedPercent: 20,
      rationale: `Correcção diária significativa (${dailyChangePercent.toFixed(2)}%). Oportunidade de reforço semanal acelerado no ETF.`,
    }
  }
  if (dailyChangePercent <= -1.8) {
    return {
      recommendation: 'Compra',
      confidence: 70,
      suggestedAmount: weekly * 1.5,
      suggestedPercent: 15,
      rationale: `Pullback diário (${dailyChangePercent.toFixed(2)}%). Bom momento para reforço DCA semanal.`,
    }
  }
  if (dailyChangePercent <= 0.6) {
    return {
      recommendation: 'Aguardar',
      confidence: 58,
      suggestedAmount: weekly * 0.5,
      suggestedPercent: 5,
      rationale: `Mercado estável (${dailyChangePercent.toFixed(2)}%). Manter plano DCA base.`,
    }
  }
  return {
    recommendation: 'Não Reforçar',
    confidence: 40,
    suggestedAmount: 0,
    suggestedPercent: 0,
    rationale: `Rally diário (+${dailyChangePercent.toFixed(2)}%). Deixa o preço respirar antes de reforçar.`,
  }
}
