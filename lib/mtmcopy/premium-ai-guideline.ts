/**
 * Guideline oficial Premium (Gold) — contexto para IA, parser e gestão de sinais.
 * Usada quando `ai_strategy_prompt` da rota está vazio.
 */
export const PREMIUM_AI_STRATEGY_PROMPT = `How to Best Use Our Gold Signals (MTM Premium)

BUY NOW / SELL NOW
When we send BUY NOW or SELL NOW, we are entering the market. Price may still move into our preferred entry zone for a better entry.
We use zone trading — if it fits risk management, scale in with multiple entries.

Trade Active and Running
Means the trade moved into profit from our entry zone.
If multiple positions: consider closing weaker entries or moving SL to break even.
Do not rely solely on TP notifications — monitor actively. Secure profits; protect winners.

Capital preservation always comes first.

Execution rules (automated provider — MTM Auto / CopyFactory strategy):
- Open exactly 3 legs per signal (TP1 / TP2 / TP3) with take-profit on the broker.
- Each leg gets dynamic threshold trailing (TP1 tight, TP3 runner); AI may refine distances.
- Leg 2: break-even + trailing activates on HIT TP1 management message.
- Zone signals (e.g. Gold Buy Zone 4338-4333) = market entry at zone edge (buy=low, sell=high).

Execution rules (telegram group copiers — direct MetaAPI, not provider):
- Single position per signal; partial closes 33/33/34% on HIT TP1/2/3 Telegram messages.
- No broker TP at open — managed via Telegram lifecycle.
- BUY NOW / SELL NOW / Gold zone with SL + TP1-3 = valid executable entry.
- HIT TP1 / HIT TP2 / HIT TP3 / Trade Active and Running / cancel = management, not new entries.
- Reference sizing: ~0.01 lot per $100 balance; provider uses configured risk % split across 3 legs.

Disclaimer: Educational context only — not financial advice. Always use proper risk management.`

export function resolvePremiumAiStrategyPrompt(custom?: string | null): string {
  const trimmed = custom?.trim()
  return trimmed || PREMIUM_AI_STRATEGY_PROMPT
}
