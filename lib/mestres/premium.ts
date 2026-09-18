/**
 * PREMIUM PELA MESTRE SIM — decisões puras (testadas em __tests__/premium.check.ts).
 *
 * Decisão do dono (18/09): o Premium (fonte Signal Master Elite → gmi-relay → /api/telegram/relay-post)
 * passa a abrir DIRECTAMENTE na conta SIM da casa que é a mestre do Premium (espelho Premium 10K,
 * `mtmauto_providers.espelho_funded_account_id` do provider `premium-ouro`), e o motor das mestres
 * (services/copia-contas) propaga cada facto dela para as contas dos subscritores. É o mesmo cano do
 * GoldKiller/Sensei (lib/mestres/servidor/sinal-mestre.ts, `sinal_modo`).
 *
 * A rota antiga — conta MT5 mestre a21178c2 + CopyFactory `Hvmg` (e as antigas `MxsR`/`9gsL`), a
 * execução directa por grupo Telegram, o monitor de preço Premium, o espelho de saídas aos
 * subscritores, o master-poll e o motor-real — NÃO pode voltar a executar quando o Premium está no
 * motor: seriam ordens em dobro. `legadoPremiumCortado` é a regra única que todos esses caminhos lêem.
 *
 * O texto que vai para o chat/Telegram NÃO passa por aqui: o relay-post continua a publicar o literal
 * (memória premium-literal-text-pipeline). Isto só decide EXECUÇÃO.
 */

/** Slug do provider Premium em mtmauto_providers / mestres_estrategias (o T2T já o usa: lib/mestres/t2t.ts). */
export const SLUG_PREMIUM = 'premium-ouro'
/** Comentário das posições na mestre SIM (≤ 31). */
export const COMENTARIO_PREMIUM = 'MTM Auto Premium'
/**
 * Estratégias CopyFactory que copiam o Premium: `Hvmg` (conta a21178c2, a VIVA a 18/09 — 3 subscritores
 * na CopyFactory) e as duas antigas que ainda aparecem em `copyfactory_strategy_pick` / na config das
 * rotas (`MxsR` da 530d2e07, `9gsL` da c17a8c46 apagada). Com todas na lista, a re-sincronização do site
 * nunca volta a subscrever nenhuma depois do corte (lib/mestres/servidor/cortados.ts).
 */
export const PREMIUM_IDS_COPYFACTORY = ['Hvmg', 'MxsR', '9gsL'] as const

/**
 * Regras de ENTRADA do Premium que a rota antiga aplicava (site_settings.mtmcopy_signal_sources →
 * canonical-premium-signals.execution): só ouro, das 08h às 22h de Londres.
 */
export const PREMIUM_SIMBOLOS = ['XAUUSD'] as const
export const PREMIUM_JANELA = { inicio: 8, fim: 22, fuso: 'Europe/London' } as const

/**
 * Quem segue o Premium além das escolhas CopyFactory (lib/mestres/planear.ts):
 *  · `copyfactory_strategy_pick = 'premium'` (formato antigo, lido também por lib/gestao-real/espelho-premium);
 *  · execução directa por grupo Telegram (`copy_method='telegram_group'`, grupo `premium`) — hoje abrem pela
 *    processSignalDirect; com o legado cortado passam a ser servidos pelo motor.
 */
export const SEGUIDORES_EXTRA: Record<string, { picks: string[]; gruposTelegram: string[] }> = {
  [SLUG_PREMIUM]: { picks: ['premium'], gruposTelegram: ['premium'] },
}

export function seguidoresExtra(slug: string | null | undefined): { picks: string[]; gruposTelegram: string[] } {
  const s = String(slug ?? '').toLowerCase()
  const e = Object.entries(SEGUIDORES_EXTRA).find(([k]) => k.toLowerCase() === s)
  return e ? e[1] : { picks: [], gruposTelegram: [] }
}

// ── o interruptor ────────────────────────────────────────────────────────────

/**
 * O legado do Premium está CORTADO? — só com `sinal_modo='live'`: a partir daí quem abre o Premium é a
 * mestre SIM e nada da rota antiga pode abrir, gerir ou espelhar ordens. Em `sombra` o legado continua
 * (a sombra só regista o que a mestre faria). Sem linha → não cortado.
 */
export function legadoPremiumCortado(linha: { sinal_modo?: unknown } | null | undefined): boolean {
  return linha?.sinal_modo === 'live'
}

/**
 * O espelho provider (services/funded-motor/espelho-provider.ts: conta MT5 mestre → conta SIM) deixa de
 * alimentar a conta SIM quando ELA passou a ser a mestre alimentada directamente pelo sinal: senão a
 * mesma trade entrava duas vezes na SIM (sinal directo + espelho da MT5) e daí para os clientes.
 */
export function espelhoSubstituidoPelaMestre(
  linhas: Array<{ sinal_modo?: unknown; conta_mestre_id?: unknown }>,
  contaEspelhoId: string | null | undefined,
): boolean {
  if (!contaEspelhoId) return false
  const c = String(contaEspelhoId).toLowerCase()
  return linhas.some((l) => l.sinal_modo === 'live' && String(l.conta_mestre_id ?? '').toLowerCase() === c)
}

// ── entrada ──────────────────────────────────────────────────────────────────

export interface SinalLido {
  symbol: string | null
  direction: 'buy' | 'sell' | null
  entry: number | null
  sl: number | null
  tp: number[]
  zone?: [number, number] | null
  zoneFirst?: number | null
}

export interface SinalPremiumMestre {
  symbol: string
  direcao: 'buy' | 'sell'
  /** referência do sinal (1.º valor da zona, como o trader o escreveu; senão a entrada) — só para registo e dedupe */
  referencia: number | null
  sl: number
  tps: number[]
}

export type DecisaoSinalPremium = { abrir: true; sinal: SinalPremiumMestre } | { abrir: false; motivo: string }

export function simboloPremium(s: string | null | undefined): string | null {
  const u = String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!u) return null
  if (/XAU|GOLD/.test(u)) return 'XAUUSD'
  return u
}

/** Hora (0–23) no fuso dado. */
export function horaNoFuso(agora: Date, fuso: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: fuso, hour: '2-digit', hour12: false }).format(agora)
  return Number(h) % 24
}

export function dentroDaJanelaPremium(agora: Date): boolean {
  const h = horaNoFuso(agora, PREMIUM_JANELA.fuso)
  return h >= PREMIUM_JANELA.inicio && h < PREMIUM_JANELA.fim
}

/**
 * Um sinal Premium pode abrir na mestre? Mesmas portas da rota antiga: só ouro, janela 08–22 Londres,
 * limite diário de SL (site_settings.premium_daily_stop), stops sãos (SL do lado certo, pelo menos um TP).
 * O Premium entra a MERCADO (zona desligada desde 26/08) com os níveis ABSOLUTOS do trader.
 */
export function decidirSinalPremium(p: { sinal: SinalLido | null; agora: Date; pausadoHoje?: boolean }): DecisaoSinalPremium {
  const s = p.sinal
  if (!s || !s.symbol || !s.direction) return { abrir: false, motivo: 'sem sinal de entrada' }
  const symbol = simboloPremium(s.symbol)
  if (!symbol || !(PREMIUM_SIMBOLOS as readonly string[]).includes(symbol)) return { abrir: false, motivo: `símbolo fora do Premium (${s.symbol})` }
  const sl = Number(s.sl)
  if (!(sl > 0)) return { abrir: false, motivo: 'sem SL' }
  const tps = (s.tp ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0)
  if (!tps.length) return { abrir: false, motivo: 'sem TP' }
  const referencia = Number(s.zoneFirst ?? s.entry ?? NaN)
  const ref = Number.isFinite(referencia) && referencia > 0 ? referencia : null
  if (ref != null) {
    const lado = s.direction === 'buy' ? 1 : -1
    if ((ref - sl) * lado <= 0) return { abrir: false, motivo: `SL do lado errado (${sl} vs ${ref})` }
    if ((tps[0] - ref) * lado <= 0) return { abrir: false, motivo: `TP1 do lado errado (${tps[0]} vs ${ref})` }
  }
  if (!dentroDaJanelaPremium(p.agora)) return { abrir: false, motivo: `fora da janela ${PREMIUM_JANELA.inicio}h–${PREMIUM_JANELA.fim}h ${PREMIUM_JANELA.fuso}` }
  if (p.pausadoHoje) return { abrir: false, motivo: 'limite diário de SL atingido (premium_daily_stop)' }
  return { abrir: true, sinal: { symbol, direcao: s.direction, referencia: ref, sl, tps } }
}

/** Posição aberta da mestre (funded_positions), o bastante para a regra da trade anterior. */
export interface PosicaoMestrePremium {
  symbol: string
  direcao: string
  preco_entrada: number | null
  sl: number | null
  volume: number | null
  volume_inicial: number | null
  be_feito?: boolean | null
}

/**
 * A regra da rota antiga (premium-single.shouldSkipDuplicatePremiumEntry, pedido do Ricardo): não se abre
 * um Premium novo enquanto a trade Premium anterior no mesmo símbolo tiver RISCO VIVO (SL ainda não em
 * break-even) OU ainda não tiver tirado o 1.º parcial — mesmo que já esteja em BE.
 */
export function bloqueioPelaAnterior(abertas: PosicaoMestrePremium[], symbol: string): string | null {
  const alvo = simboloPremium(symbol)
  for (const a of abertas) {
    if (simboloPremium(a.symbol) !== alvo) continue
    const entrada = Number(a.preco_entrada)
    const sl = a.sl == null ? null : Number(a.sl)
    const compra = a.direcao === 'buy'
    const emBe = a.be_feito === true || (sl != null && Number.isFinite(entrada) && (compra ? sl >= entrada : sl <= entrada))
    if (!emBe) return 'trade Premium anterior com risco vivo (SL ainda não em BE)'
    const vi = Number(a.volume_inicial)
    const v = Number(a.volume)
    const semParcial = !(vi > 0) || !(v > 0) || v >= vi * 0.98
    if (semParcial) return 'trade Premium anterior ainda sem o 1.º parcial'
  }
  return null
}

// ── seguimentos ──────────────────────────────────────────────────────────────

/**
 * O que um seguimento do trader faz na mestre: NADA às posições. A gestão do Premium na mestre é por
 * PREÇO (sinais_config do premium-ouro: BE, parciais, trailing) — exactamente o que a rota antiga fazia
 * com o monitor de preço ligado, que ignorava os HIT TP/BE/«trade active» do canal (fechavam no BE antes
 * do TP1: 0 parciais em 27 trades). Só o «SL hit» conta para o limite diário de SL.
 */
export type AccaoSeguimentoPremium = 'contar_sl' | 'nada'

export function accaoSeguimentoPremium(kind: string | null | undefined): AccaoSeguimentoPremium {
  return kind === 'sl_hit' ? 'contar_sl' : 'nada'
}
