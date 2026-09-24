/**
 * Ativos que cada utilizador recebe por defeito nos Alertas MTM (o resto liga nos
 * settings).
 *
 * Estava declarado em dois sítios com a mesma lista à mão — no route handler
 * `app/api/mtm-alerts/subscriptions` e em `components/mobile/trading-alerts-mobile`
 * — o que dava para os dois deixarem de bater certo sem ninguém dar por isso.
 * Além disso, um ficheiro `route.ts` do Next só pode exportar handlers e um punhado
 * de constantes de configuração; exportar isto de lá era, por si só, inválido.
 */
export const DEFAULT_ALERT_SYMBOLS = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDCAD",
  "USDJPY",
  "BTCUSD",
  "US30",
]
