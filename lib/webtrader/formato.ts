/**
 * FORMATO DE PREÇOS NO WEBTRADER — uma função por coisa (antes havia `arred` copiado no gráfico
 * leve, no gráfico TradingView, no rascunho da ordem e nas ordens avançadas). Puro.
 *
 * A formatação para o ecrã (`usd`, `px`) continua em components/funded/api.ts; as contas de pips em
 * lib/mtmfunded/simulado/matematica.ts (`pips`).
 */

/** Um preço arredondado às casas do símbolo (o que o servidor guarda). */
export function arredAosDigitos(v: number, digits: number): number {
  return Number(v.toFixed(Math.max(0, Math.min(10, Math.trunc(digits)))))
}
