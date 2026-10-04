/**
 * ESTIMATIVA de custo dos fornecedores pagos, em cêntimos de dólar por milhão de tokens.
 *
 * É estimativa, não factura: os preços mudam e isto não vai à página de preços. Serve para o
 * livro responder «quanto estou a gastar, por alto» — os gratuitos são 0 e não entram aqui.
 * Um modelo que não esteja na tabela conta 0 e fica assinalado como `estimado: false`.
 */
const TABELA: Record<string, { entrada: number; saida: number }> = {
  // OpenAI (USD/M tokens → cêntimos): 4o-mini 0,15 / 0,60; 4o 2,50 / 10,00
  'gpt-4o-mini': { entrada: 15, saida: 60 },
  'gpt-4o': { entrada: 250, saida: 1000 },
  // Anthropic: Sonnet 3,00 / 15,00; Opus 15,00 / 75,00; Haiku 0,80 / 4,00 (ordens de grandeza
  // das gerações anteriores — ver console.anthropic.com para o modelo em uso)
  sonnet: { entrada: 300, saida: 1500 },
  opus: { entrada: 1500, saida: 7500 },
  haiku: { entrada: 80, saida: 400 },
}

export function estimarCustoCents(modelo: string, tokensEntrada = 0, tokensSaida = 0): number {
  const chave = Object.keys(TABELA).find((k) => modelo.includes(k))
  if (!chave) return 0
  const p = TABELA[chave]
  return Math.round(((tokensEntrada * p.entrada + tokensSaida * p.saida) / 1_000_000) * 100) / 100
}
