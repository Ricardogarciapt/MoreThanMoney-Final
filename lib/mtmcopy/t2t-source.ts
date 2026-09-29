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
 *  - Aurum Flow   → marcador 'Aurum Flow' / 'ORB' (scanner ORB de PERPÉTUOS CRIPTO)
 *
 * NOVO (2026-08-06): cada user pode ESCOLHER que fontes/classes de ativo seguir (prefs na conta T2T).
 * `t2tSourceKey()` devolve a chave da fonte para casar com essas prefs; `T2T_SOURCES` é o catálogo p/ a UI.
 */
import { isOwnLifecycleAnnouncement } from './signal-lifecycle'
import { RE_ESTRATEGIAS_EKW } from '../sinais/formato-sinal'
export type T2TSourceKey =
  | 'premium'
  | 'sensei'
  | 'james'
  | 'primeverse'
  | 'aurum'
  | 'goldkiller'
  | 'mtmscanner'
  | 'forexideas'
export type T2TAssetClass = 'gold' | 'forex' | 'crypto' | 'indices'

/** Catálogo de fontes para a UI de "O que seguir". */
export const T2T_SOURCES: { key: T2TSourceKey; label: string; hint: string }[] = [
  { key: 'premium', label: 'Premium', hint: 'Ideias Premium (ouro)' },
  { key: 'sensei', label: 'Sensei', hint: 'Sensei Scanner (entradas validadas)' },
  { key: 'goldkiller', label: 'GoldKiller', hint: 'Scanner GoldKiller (ouro)' },
  { key: 'mtmscanner', label: 'MTM Scanner', hint: 'Scanner geral MTM' },
  { key: 'forexideas', label: 'Ideias de Forex', hint: 'Sinais do canal Ideias de Forex' },
  { key: 'james', label: 'Forex Swings', hint: 'Swings de forex (James)' },
  // A chave interna continua 'primeverse' (gravada em t2t_sources dos clientes); o que se MOSTRA
  // é a estratégia MTM Auto — o nome da fonte externa não aparece em lado nenhum. A Wolf e a King
  // saíram das listas vivas; sobra a Edge.
  { key: 'primeverse', label: 'MTM Auto Edge', hint: 'Estratégia Edge (fxEdge)' },
  // A Aurum Flow passou a ser SÓ cripto — deixou de ser «ouro e perpétuos».
  { key: 'aurum', label: 'Aurum Flow Cripto', hint: 'Perpétuos cripto (Aurum Flow ORB)' },
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
  if (/mtm\s*scanner/i.test(c)) {
    // MTM Scanner: só FOREX é negociável no T2T. Ouro/BTC do scanner PUBLICA mas NÃO dá tap to trade
    // (pedido Ricardo — ouro/BTC ficam para Premium/GoldKiller/Sensei).
    if (/XAU|GOLD|OURO|XAG|SILVER|\bBTC\b|BITCOIN/i.test(c)) return null
    return 'mtmscanner'
  }
  // Estratégias MTM Auto (formato único, canal `sinais-scanner-mtm`). Vem antes das regras por
  // canal: a etiqueta da estratégia é a assinatura da fonte. A expressão continua a apanhar a Wolf
  // e a King porque há mensagens já publicadas com elas — só a Edge é que continua viva.
  if (RE_ESTRATEGIAS_EKW.test(c)) return 'primeverse'
  if (channelSlug === 'premium-ideas') return 'premium'
  // Chat «Ideias de Cripto» (slug `aurum-flow`, que se mantém) e o slug antigo `golden-moves`,
  // que fica enquanto houver mensagens publicadas com ele.
  if (channelSlug === 'aurum-flow' || channelSlug === 'golden-moves') return 'aurum'
  if (channelSlug === 'sensei-scanner') return 'sensei'
  if (channelSlug === 'sinais-goldkiller' || /gold\s*killer|goldkiller/i.test(c)) return 'goldkiller'
  if (channelSlug === 'ideias-e-sinais') return /forex\s*swings/i.test(c) ? 'james' : null
  if (
    channelSlug === 'sinais-scanner-mtm' ||
    channelSlug === 'cripto-perps' ||
    channelSlug === 'trade-ideas' ||
    channelSlug === 'trade-ideas-setup'
  ) {
    if (/primeverse/i.test(c)) return 'primeverse'
    // O canal `sinais-scanner-mtm` é o «MTM Auto Edge»: tudo o que lá cai é dessa estratégia
    // (as mensagens antigas trazem o marcador antigo, apanhado acima).
    if (channelSlug === 'sinais-scanner-mtm') return 'primeverse'
    // Perpétuos cripto (Aurum Flow ORB / MTM Perps): passam a gerar botão no T2T. O botão
    // NÃO abre ordem na conta do cliente — ver `t2tMode`: nos perps é SEGUIR a posição, com a
    // gestão a correr no motor real sobre a ordem-mestre da Bybit.
    if (channelSlug === 'cripto-perps') return 'aurum'
    // "Ideias de Forex" (canal próprio): os sinais do canal são negociáveis no T2T e passam a ser
    // geridos pelo motor de preço em tempo real (entry-hit → parciais → BE → trailing → fecho),
    // na conta de quem aceitar. Pedido Ricardo 2026-08-18. `isT2TEntrySignal` continua a exigir
    // direção + preço + alvo, por isso mensagens de conversa/gestão não geram botão.
    if (channelSlug === 'trade-ideas-setup') return 'forexideas'
    return null
  }
  return null
}

/**
 * Fontes cujo Tap to Trade é acompanhado pelo MOTOR: trailing stop a seguir o preço a cada
 * passagem (1 s) e, por consequência, trailing de lucro — o stop sobe e nunca desce, por isso o
 * que já foi ganho deixa de poder ser devolvido.
 *
 * FORA: `james` (Forex Swings). É swing de vários dias e a regra dele é explícita — sem trailing,
 * ver [[trading-execution-rules]]: um stop a seguir o preço tirava-o da trade no primeiro recuo
 * normal de um swing. As "Ideias de Forex" (`forexideas`, canal próprio no Telegram) NÃO são o
 * James e ficam DENTRO, a pedido do Ricardo.
 */
const T2T_FONTES_SEM_TRAILING = new Set<T2TSourceKey>(['james'])

export function t2tUsaTrailing(channelSlug?: string | null, content?: string | null): boolean {
  const src = t2tSourceKey(channelSlug, content)
  if (!src) return false
  return !T2T_FONTES_SEM_TRAILING.has(src)
}

/**
 * FONTES QUE SE PUBLICAM MAS NÃO SE EXECUTAM.
 *
 * O MTM Scanner (que entra pelo canal «Ideias de Forex») foi medido a 29/09/2026 e **não tem
 * borda nenhuma** — nem no conjunto, nem em nenhum subconjunto. 18 765 sinais, oito horizontes,
 * sete cortes com correcção para comparações múltiplas: zero sobrevive. E a causa não é
 * estatística, é aritmética: o retorno médio é **+0,027 ATR** e o meio-spread ida-e-volta custa
 * **0,657 ATR**. O custo é vinte e quatro vezes o sinal. Num EURGBP o spread sozinho vale mais
 * do que uma vela de 15 minutos inteira.
 *
 * Até esse dia havia código cujo único trabalho era pôr um botão de aceitar nestes sinais (o
 * webhook marcava o remetente «📊 MTM Scanner · Forex» *para o T2T reconhecer a fonte*). Fica
 * escrito porquê, para que ninguém o volte a ligar por parecer uma omissão.
 *
 * O canal CONTINUA a publicar — são ~2 300 ideias por mês e valem como leitura. O que deixa de
 * existir é o caminho que as levava a dinheiro real. Ver docs/mtmscanner-borda.md.
 *
 * As chaves ficam no catálogo de propósito: estão gravadas nas preferências `t2t_sources` das
 * contas dos clientes, e tirá-las de lá descartava em silêncio o que eles escolheram.
 */
const T2T_FONTES_SO_LEITURA = new Set<T2TSourceKey>(['mtmscanner', 'forexideas'])

/** Uma mensagem é T2T negociável? (allowlist de fonte, menos as que são só de leitura) */
export function isAllowedT2TSource(channelSlug?: string | null, content?: string | null): boolean {
  const src = t2tSourceKey(channelSlug, content)
  if (!src) return false
  return !T2T_FONTES_SO_LEITURA.has(src)
}

/** Só para quem precisa de saber que a fonte existe mas não se executa (UI, avisos). */
export function fonteSoLeitura(src: T2TSourceKey): boolean {
  return T2T_FONTES_SO_LEITURA.has(src)
}

// Follow-ups / gestão (TP hit, BE, fecho, SL, cancelado) — não são ENTRADAS.
const T2T_FOLLOWUP_RE =
  /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|close\s*all|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i
// Performance / resumo / recap (London/New York Performance, Total Win/Loss/Net PIPS…) — NUNCA são T2T.
const T2T_PERF_RE =
  /(performance|resultado\s+do\s+dia|resumo|recap|relat[óo]rio|estat[íi]stic|balan[çc]o|total\s+(de\s+)?pips|total\s+(win|loss|net)|pips\s+(de\s+)?(hoje|esta\s+semana|do\s+dia)|fecho\s+do\s+dia|lucro\s+do\s+dia)/i
// O gerúndio conta como direção: "I'm buying BTCUSDT" é como o Gold Did e a Aurum Flow
// escrevem uma entrada. Sem isto a mensagem não passava por sinal.
const T2T_DIR_RE = /(\b(buy|buying|sell|selling|long|short|compra|comprando|venda|vendendo)\b|🟢|🔴|🔵)/i

/**
 * É uma mensagem de GESTÃO de uma trade já publicada (TP atingido, break-even, parcial,
 * fecho, cancelamento)? Serve para não acordar toda a gente por um TP que não é dela — a
 * mensagem aparece no chat na mesma, em thread no sinal.
 */
export function isManagementFollowup(content?: string | null): boolean {
  const c = content ?? ''
  if (!c.trim()) return false
  return T2T_FOLLOWUP_RE.test(c) || /\brunning\b|\+\s*\d+\s*pips?\b|take\s+partials?|manage\s+(the\s+)?trade/i.test(c)
}

/**
 * É uma ENTRADA T2T negociável (para gerar sinal + notificação "⚡ Tap to Trade")?
 * Exclui mensagens de acompanhamento/gestão e de performance/resumo — que NÃO devem virar T2T.
 * (As mensagens de gestão do Premium servem para gerir a trade já aceite, não para abrir nova.)
 */
export function isT2TEntrySignal(channelSlug?: string | null, content?: string | null): boolean {
  if (!content) return false
  // Um anúncio NOSSO ("🎯 Alvo 1 · XAUUSD 🔵 COMPRA · +75 pips") tem direção, números e o 🎯 —
  // passava por entrada e ganhava botão de Tap to Trade. Pior: os follow-ups seguintes
  // penduravam-se nele em vez do sinal verdadeiro.
  if (isOwnLifecycleAnnouncement(content)) return false
  if (!isAllowedT2TSource(channelSlug, content)) return false
  if (T2T_PERF_RE.test(content)) return false      // performance / resumo do dia
  if (T2T_FOLLOWUP_RE.test(content)) return false  // update/gestão/saída — não é entrada
  if (!T2T_DIR_RE.test(content)) return false       // precisa de direção
  if (!/\d{2,}/.test(content)) return false          // precisa de preço
  // Entrada COMPLETA: exige alvo (TP). Exclui updates só-SL / "Ref:".
  // "TP 1 4635.15" (com espaço) e "TP1 4645" contam como alvo, tal como "TP1:" e "Take Profit".
  if (!/\btp\s*\d|\btp\s*:|\btp\s+\d{2,}|take\s*profit|🎯/i.test(content)) return false
  return true
}

/**
 * O que faz o botão de Tap to Trade desta mensagem.
 *
 *  - 'execute' → abre a ordem na conta do cliente (comportamento de sempre).
 *  - 'follow'  → NÃO abre nada: marca o sinal como seguido e o cliente passa a receber a
 *                gestão do motor real (entrada, parciais, break-even, fecho) sobre a
 *                ordem-mestre. É assim nos perpétuos, onde a posição vive na Bybit e não na
 *                conta MT5 de cada um.
 *
 * Exceção pedida pelo Ricardo: BTCUSD/BTCUSDT continuam a EXECUTAR, porque existem como
 * instrumento nas contas MT5 dos clientes — os restantes perpétuos não.
 */
export type T2TMode = 'execute' | 'follow'

/**
 * Cripto que EXISTE como instrumento nas contas MT5 dos clientes — logo, negociável no T2T.
 *
 * A lista saiu dos símbolos reais das contas (PU Prime e VT Markets oferecem os mesmos): BTC,
 * ETH, LTC, XRP, SOL, ADA, DOT, BCH, BNB e DOGE contra USD. Antes só o BTC passava, e um sinal
 * de ETH nos perpétuos caía em «seguir» quando o cliente até o podia abrir na conta dele.
 *
 * O sufixo `USDT`/`.P` é do mundo dos perpétuos; aceita-se na leitura porque o sinal vem escrito
 * assim, e é o PAR que decide, não o sufixo.
 */
const CRIPTO_NO_MT5 = /\b(BTC|ETH|LTC|XRP|SOL|ADA|DOT|BCH|BNB|DOGE)(USD|USDT)?(\.P)?\b/i

/** Perpétuo (USDT / .P / PERP) que NÃO existe nas contas MT5 dos clientes? */
const PERP_RE = /\b[A-Z0-9]{2,12}(USDT|USDC)(\.P)?\b|\b[A-Z0-9]{2,12}\.P\b|\bPERP\b/

/**
 * Canais onde vivem os perpétuos. Desde a fusão (18/09) o «Perpétuos de Cripto» e a Aurum Flow são
 * um canal só (`aurum-flow`, hoje chamado «Ideias de Cripto»). Quem decide é o SÍMBOLO, não o
 * canal: a cripto que existe nas contas MT5 executa; o perpétuo que não existe lá segue.
 */
const CANAIS_PERPS = new Set(['cripto-perps', 'aurum-flow'])

/**
 * Mensagem de PERPÉTUO (cripto) num canal de perpétuos? É o que decide o botão «TAP to Copy»
 * (copiar os parâmetros para a exchange) em vez do Tap to Trade. No canal «Ideias de Cripto» a
 * cripto que existe nas contas MT5 tem Tap to Trade normal.
 */
export function ehSinalDePerpetuo(channelSlug?: string | null, content?: string | null): boolean {
  if (!CANAIS_PERPS.has(String(channelSlug ?? ''))) return false
  if (channelSlug === 'cripto-perps') return true
  const c = content ?? ''
  return PERP_RE.test(c) || CRIPTO_NO_MT5.test(c)
}

export function t2tMode(channelSlug?: string | null, content?: string | null): T2TMode {
  if (!CANAIS_PERPS.has(String(channelSlug ?? ''))) return 'execute'
  const c = content ?? ''
  if (CRIPTO_NO_MT5.test(c)) return 'execute'
  if (channelSlug === 'cripto-perps') return 'follow'
  return PERP_RE.test(c) ? 'follow' : 'execute'
}

/** Rótulo do botão, para o chat e para a notificação não prometerem coisas diferentes. */
export function t2tButtonLabel(mode: T2TMode): string {
  return mode === 'follow' ? 'Seguir posição' : 'Aceitar trade'
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
