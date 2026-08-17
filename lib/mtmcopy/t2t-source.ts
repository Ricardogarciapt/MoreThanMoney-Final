/**
 * ALLOWLIST + REGISTO de FONTES do Tap to Trade — módulo PURO (sem imports de servidor) para ser
 * partilhado pelo cliente (chat-channels.tsx, tap-to-trade-feed.tsx) E pelo servidor (accept do T2T),
 * sem dessincronizar. Pedido do Ricardo (2026-08-06): SÓ Premium, Sensei, James (Forex Swings),
 * PrimeVerse e Aurum Flow (ORB) são negociáveis — senão o T2T fica poluído com ecos do master-poll de
 * todos os providers, alertas MTM Scanner, GoldKiller, etc. Como vários canais são PARTILHADOS, o
 * filtro é por FONTE (assinatura no conteúdo/canal), não só por canal.
 *  - Premium      → canal 'premium-ideas'
 *  - Sensei       → canal 'sensei-scanner' (com o gate próprio de entrada validada, à parte)
 *  - James/Swings → marcador '🌊 Forex Swings' (canal 'ideias-e-sinais')
 *  - PrimeVerse   → marcador '📡 PrimeVerse' (canais partilhados por classe de ativo)
 *  - Aurum Flow   → marcador 'Aurum Flow' / 'ORB' (scanner ORB de ouro + perpétuos)
 *
 * NOVO (2026-08-06): cada user pode ESCOLHER que fontes/classes de ativo seguir (prefs na conta T2T).
 * `t2tSourceKey()` devolve a chave da fonte para casar com essas prefs; `T2T_SOURCES` é o catálogo p/ a UI.
 */
export type T2TSourceKey =
  | 'premium'
  | 'sensei'
  | 'james'
  | 'primeverse'
  | 'aurum'
  | 'goldkiller'
  | 'mtmscanner'
export type T2TAssetClass = 'gold' | 'forex' | 'crypto' | 'indices'

/** Catálogo de fontes para a UI de "O que seguir". */
export const T2T_SOURCES: { key: T2TSourceKey; label: string; hint: string }[] = [
  { key: 'premium', label: 'Premium', hint: 'Ideias Premium (ouro)' },
  { key: 'sensei', label: 'Sensei', hint: 'Sensei Scanner (entradas validadas)' },
  { key: 'goldkiller', label: 'GoldKiller', hint: 'Scanner GoldKiller (ouro)' },
  { key: 'mtmscanner', label: 'MTM Scanner', hint: 'Scanner geral MTM' },
  { key: 'james', label: 'Forex Swings', hint: 'Swings de forex (James)' },
  { key: 'primeverse', label: 'PrimeVerse', hint: 'Reencaminhados PrimeVerse' },
  { key: 'aurum', label: 'Aurum Flow', hint: 'Scanner ORB — ouro e perpétuos' },
]

/** Catálogo de classes de ativo para a UI. */
export const T2T_ASSET_CLASSES: { key: T2TAssetClass; label: string }[] = [
  { key: 'gold', label: 'Ouro' },
  { key: 'forex', label: 'Forex' },
  { key: 'crypto', label: 'Cripto' },
  { key: 'indices', label: 'Índices' },
]

/** Devolve a CHAVE da fonte T2T de uma mensagem, ou null se não for negociável. */
export function t2tSourceKey(channelSlug?: string | null, content?: string | null): T2TSourceKey | null {
  if (!channelSlug) return null
  const c = content ?? ''
  // Aurum Flow (ORB) — marcador específico, pode chegar por canais de scanner (perps/ouro).
  if (/aurum\s*flow|\baurum\b/i.test(c)) return 'aurum'
  if (/mtm\s*scanner/i.test(c)) return 'mtmscanner'
  if (channelSlug === 'premium-ideas') return 'premium'
  if (channelSlug === 'sensei-scanner') return 'sensei'
  if (channelSlug === 'sinais-goldkiller' || /gold\s*killer|goldkiller/i.test(c)) return 'goldkiller'
  if (channelSlug === 'ideias-e-sinais') return /forex\s*swings/i.test(c) ? 'james' : null
  if (
    channelSlug === 'sinais-scanner-mtm' ||
    channelSlug === 'cripto-perps' ||
    channelSlug === 'trade-ideas' ||
    channelSlug === 'trade-ideas-setup'
  ) {
    return /primeverse/i.test(c) ? 'primeverse' : null
  }
  return null
}

/** Uma mensagem é T2T negociável? (allowlist de fonte) */
export function isAllowedT2TSource(channelSlug?: string | null, content?: string | null): boolean {
  return t2tSourceKey(channelSlug, content) !== null
}

// Follow-ups / gestão (TP hit, BE, fecho, SL, cancelado) — não são ENTRADAS.
const T2T_FOLLOWUP_RE =
  /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|close\s*all|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i
// Performance / resumo / recap (London/New York Performance, Total Win/Loss/Net PIPS…) — NUNCA são T2T.
const T2T_PERF_RE =
  /(performance|resultado\s+do\s+dia|resumo|recap|relat[óo]rio|estat[íi]stic|balan[çc]o|total\s+(de\s+)?pips|total\s+(win|loss|net)|pips\s+(de\s+)?(hoje|esta\s+semana|do\s+dia)|fecho\s+do\s+dia|lucro\s+do\s+dia)/i
const T2T_DIR_RE = /(\b(buy|sell|long|short|compra|venda)\b|🟢|🔴|🔵)/i

/**
 * É uma ENTRADA T2T negociável (para gerar sinal + notificação "⚡ Tap to Trade")?
 * Exclui mensagens de acompanhamento/gestão e de performance/resumo — que NÃO devem virar T2T.
 * (As mensagens de gestão do Premium servem para gerir a trade já aceite, não para abrir nova.)
 */
export function isT2TEntrySignal(channelSlug?: string | null, content?: string | null): boolean {
  if (!content) return false
  if (!isAllowedT2TSource(channelSlug, content)) return false
  if (T2T_PERF_RE.test(content)) return false      // performance / resumo do dia
  if (T2T_FOLLOWUP_RE.test(content)) return false  // update/gestão/saída — não é entrada
  if (!T2T_DIR_RE.test(content)) return false       // precisa de direção
  if (!/\d{2,}/.test(content)) return false          // precisa de preço
  // Entrada COMPLETA: exige alvo (TP). Exclui updates só-SL / "Ref:".
  if (!/\btp\s*\d|\btp\s*:|take\s*profit|🎯/i.test(content)) return false
  return true
}

/** Classe de ativo de um sinal, a partir do conteúdo (mesma heurística do feed). */
export function t2tAssetClass(content?: string | null): T2TAssetClass | 'other' {
  const c = (content ?? '').toUpperCase()
  if (/XAU|GOLD|OURO/.test(c)) return 'gold'
  if (/BTC|ETH|SOL|XRP|USDT|USDC|PERP|CRYPTO|CRIPTO/.test(c)) return 'crypto'
  if (/NAS100|US30|US500|GER40|SPX|DOW|UK100|JP225|NDX|US100/.test(c)) return 'indices'
  if (/[A-Z]{3}USD|USD[A-Z]{3}|EUR|GBP|JPY|AUD|CAD|CHF|NZD/.test(c)) return 'forex'
  return 'other'
}

/**
 * Casa uma mensagem com as PREFERÊNCIAS do user. Listas vazias/nulas = seguir tudo.
 * Usado no feed (cliente) para mostrar só o que o user escolheu seguir.
 */
export function matchesT2TPrefs(
  channelSlug: string | null | undefined,
  content: string | null | undefined,
  prefs?: { sources?: string[] | null; assetClasses?: string[] | null } | null,
): boolean {
  const src = t2tSourceKey(channelSlug, content)
  if (!src) return false
  const sources = prefs?.sources
  if (Array.isArray(sources) && sources.length > 0 && !sources.includes(src)) return false
  const classes = prefs?.assetClasses
  if (Array.isArray(classes) && classes.length > 0) {
    const cls = t2tAssetClass(content)
    if (cls === 'other' || !classes.includes(cls)) return false
  }
  return true
}
