/**
 * Guideline oficial Premium (Gold) — contexto para IA, parser e gestão de sinais.
 * Usada quando `ai_strategy_prompt` da rota está vazio.
 */
export const PREMIUM_AI_STRATEGY_PROMPT = `How to Best Use Our Gold Signals (MTM Premium)

Signal source & methodology (SIGNAL MASTER ELITE, re-published as MTM Premium):
Gold (XAUUSD) zone strategy — position building. Enter initial position when the signal is posted;
layer additional entries as price goes DEEPER into the zone (never add once price is OUTSIDE the zone).
Two valid entry styles: (A) Market execution on the signal; (B) Zone entry — wait for price inside the
zone and layer in. Zone entry gives a tighter stop and bigger R:R. Trades are usually sent during the
LONDON session (from ~07:30 UK time toward the NY open).

Entry types (parseable):
- "BUY NOW" / "SELL NOW" / "GOLD BUY/SELL" with a zone + SL + TPs = NEW POSITION (executable entry).
- "Gold Buy Zone 4338-4333" (zone) = market entry at the favourable zone edge (buy=low edge, sell=high edge),
  or pending-until-reaction when the zone-entry engine is live.

Stops & targets (defaults when the signal omits them):
- SL ≈ 40 pips from the zone entry; ≈ 60 pips from a market execution (wider). Use the signal's SL when given.
- TP1 30 pips · TP2 50 pips · TP3 70 pips · TP4 100 pips (runner). TP4 is the runner leg.

Trade management (lifecycle messages = management, NOT new entries):
- "Trade Active and Running" = trade moved into profit from the entry zone → consider closing weaker
  layers / move SL to break-even. If it's "active and running IN THE ZONE", that signals weakness →
  break-even inside the zone and look to bank profit before TP1 (reduce risk).
- On HIT TP1: move to break-even + trailing stop that follows price from TP1 (protect capital first — never
  let a TP1 winner turn into an SL loss). After TP1 there may be a re-entry back at break-even holding
  toward TP3, leaving runners for TP4.
- "HIT TP1/TP2/TP3/TP4", "set BE", "breakeven", "move SL", "running +NN pips", "cancel" = management only.
- If SL is hit: do NOT re-enter to recover — wait for the next "NEW POSITION". Don't chase late or FOMO
  entries that already ran to TP; wait for a better entry in the zone or the next trade.

Capital preservation always comes first.

Execution rules (automated provider — MTM Auto / CopyFactory strategy):
- Open 1 position per signal at the zone edge (single leg) — no broker TP at open. (Layered multi-leg
  entries are the source's manual method; the automated leg enters once at the favourable edge.)
- Partial closes 33/33/34% on HIT TP1 / HIT TP2 / HIT TP3; runner beyond TP3 trails toward TP4.
- After HIT TP1: break-even + trailing stop that follows price from TP1.
- Default risk: 0.5% per trade on provider account (Gold Did follows Premium; keeps its own branding).
- Zone signals = market entry at zone edge; when the zone-entry engine is live, hold pending until the
  in-zone reaction triggers.

Execution rules (telegram group copiers — direct MetaAPI, not provider):
- Single position per signal; partial closes 33/33/34% on HIT TP1/2/3; runner trails toward TP4.
- No broker TP at open — managed via the Telegram lifecycle above.
- Reference sizing: ~0.01 lot per $100 balance; provider uses configured risk % (default 0.5%).

Disclaimer: Educational context only — not financial advice. Always use proper risk management.`

export function resolvePremiumAiStrategyPrompt(custom?: string | null): string {
  const trimmed = custom?.trim()
  return trimmed || PREMIUM_AI_STRATEGY_PROMPT
}
