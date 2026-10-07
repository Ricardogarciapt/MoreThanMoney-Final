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
 * SANIDADE DO STOP — a distância entrada→SL tem de ser plausível para um sinal do SME.
 *
 * Medido a 24/09 nos 250 sinais Premium de 25/08 a 24/09: a zona do SME tem 50 pips de largura, o
 * stop fica 50–120 pips da referência (mediana 100) e NENHUM sinal são passa dos 120. Dois passaram
 * dos 1100 — e ambos abriram na mestre:
 *
 *   «🎯 Zona: 4332 – 4227 | 🛑 SL: 4222»   (22/09 11:03, devia ser 4327 / 4322)
 *   «🎯 Zona: 4330 – 4225 | 🛑 SL: 4220»   (22/09 11:15, devia ser 4325 / 4320)
 *
 * Um dígito perdido no caminho e o stop passa de 100 para 1100 pips. O lote NÃO é calculado pelo
 * risco (`loteParaConta` é por saldo), por isso um stop 11× maior é uma perda 11× maior: na mestre
 * de 11 000 a 0,11 lotes são ~1 210 $, 11 % da conta numa trade — e o mesmo em cada conta que a
 * segue. As duas escaparam por sorte (fecharam em lucro); a próxima não tem de escapar.
 *
 * A porta que existia («SL do lado certo») deixa passar qualquer distância. Esta fecha-a pelos dois
 * lados, com folga larga de propósito: 300 pips é 2,5× o pior sinal são que se viu em 250.
 */
export const PREMIUM_SL_MIN_PIPS = 10
export const PREMIUM_SL_MAX_PIPS = 300
/** Ouro: 1 pip = 0,1 (convenção da casa, lib/mtmcopy/trade-outcome). */
const PIP_OURO = 0.1

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
  /** a zona do trader [baixo, alto] — onde a mestre entra (entradaPremium) */
  zona?: [number, number] | null
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
    // Distância do stop plausível (ver PREMIUM_SL_MAX_PIPS): um dígito perdido no sinal vale 11× o risco.
    const distancia = Math.abs(ref - sl) / PIP_OURO
    if (distancia > PREMIUM_SL_MAX_PIPS || distancia < PREMIUM_SL_MIN_PIPS) {
      return { abrir: false, motivo: `SL a ${Math.round(distancia)} pips da referência, fora do plausível (${PREMIUM_SL_MIN_PIPS}–${PREMIUM_SL_MAX_PIPS}): sinal provavelmente mal lido` }
    }
  }
  if (!dentroDaJanelaPremium(p.agora)) return { abrir: false, motivo: `fora da janela ${PREMIUM_JANELA.inicio}h–${PREMIUM_JANELA.fim}h ${PREMIUM_JANELA.fuso}` }
  if (p.pausadoHoje) return { abrir: false, motivo: 'limite diário de SL atingido (premium_daily_stop)' }
  return { abrir: true, sinal: { symbol, direcao: s.direction, referencia: ref, sl, tps, zona: s.zone ?? null } }
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

// ── entrada na ZONA do trader (07/10) ────────────────────────────────────────

/**
 * ONDE A MESTRE ENTRA — no MEIO da zona do trader, por ordem limite, e não a mercado.
 *
 * Medido a 07/10 nos 66 sinais Premium de 24/09 a 07/10 (velas de 1 min da OANDA, mesma gestão,
 * comparação emparelhada — os números absolutos de velas não valem, a diferença sim):
 *
 *   entrada a mercado (o que a mestre fazia)          −458 pips · semana 1 +304 · semana 2 −762
 *   limite no meio da zona, válida 60 min              +880 pips · semana 1 +616 · semana 2 +264
 *
 * O trader NÃO entra a mercado: «1st entry / 2nd entry / 3rd entry» são camadas DENTRO da zona, e os
 * pips que anuncia contam-se a partir delas. A mercado a mestre ficava sempre na ponta pior da zona
 * (um SELL «4278–4283» com o preço em 4278 vendia no fundo) e o stop de ~100 pips contra um TP1 de
 * 50 fazia o resto. No meio da zona o risco encolhe meia zona (~25–35 pips) e só se entra quando o
 * preço volta — que é exactamente o que o trader faz.
 *
 * O preço já DENTRO da zona para lá do meio (melhor do que o meio) → a mercado: uma limite do lado
 * errado do preço é recusada pela corretora (e pelo simulador), e esperar seria pior do que o mercado.
 */
export const PREMIUM_ENTRADA_PADRAO = {
  /** 'zona' = limite no meio da zona; 'mercado' = como era até 07/10 */
  modo: 'zona' as 'zona' | 'mercado',
  /** validade da limite — 60 min medidos (30–120 dão o mesmo sinal; 15 perde enchimentos) */
  validadeMin: 60,
  /** posições + pendentes Premium vivas ao mesmo tempo na mestre (o trader faz camadas) */
  maxVivas: 2,
}
export type EntradaPremiumConfig = typeof PREMIUM_ENTRADA_PADRAO

/** `sinais_config.entradaPremium` do premium-ouro, com o padrão para o que faltar ou vier torto. */
export function lerEntradaPremium(sinaisConfig: unknown): EntradaPremiumConfig {
  const c = (sinaisConfig && typeof sinaisConfig === 'object' ? (sinaisConfig as Record<string, unknown>).entradaPremium : null) as Record<string, unknown> | null
  const out = { ...PREMIUM_ENTRADA_PADRAO }
  if (!c || typeof c !== 'object') return out
  if (c.modo === 'zona' || c.modo === 'mercado') out.modo = c.modo
  const v = Number(c.validadeMin)
  if (Number.isFinite(v) && v >= 5 && v <= 240) out.validadeMin = Math.round(v)
  const m = Number(c.maxVivas)
  if (Number.isFinite(m) && m >= 1 && m <= 5) out.maxVivas = Math.floor(m)
  return out
}

export type EntradaPremium =
  | { tipo: 'mercado'; motivo: string }
  | { tipo: 'limite'; preco: number; expiraEm: string }
  | { tipo: 'recusar'; motivo: string }

/**
 * Mercado ou limite no meio da zona? Pura (teste em __tests__/premium-zona.check.ts).
 * `preco` é o tick ao vivo; sem ele decide-se pela zona (a limite não precisa de preço fresco).
 */
export function entradaPremium(p: {
  direcao: 'buy' | 'sell'
  zona: [number, number] | null | undefined
  sl: number
  tp1: number | null
  preco: { bid: number; ask: number } | null
  cfg: EntradaPremiumConfig
  agora: Date
  digits?: number
}): EntradaPremium {
  if (p.cfg.modo === 'mercado') return { tipo: 'mercado', motivo: 'entradaPremium.modo = mercado' }
  const z = p.zona
  if (!z || !(Number(z[0]) > 0) || !(Number(z[1]) > 0)) return { tipo: 'mercado', motivo: 'sinal sem zona' }
  const f = Math.pow(10, p.digits ?? 2)
  const meio = Math.round(((Number(z[0]) + Number(z[1])) / 2) * f) / f
  const lado = p.direcao === 'buy' ? 1 : -1
  // O meio tem de ficar entre o SL e o TP1 — senão a zona foi mal lida e a limite seria um disparate.
  if ((meio - p.sl) * lado <= 0) return { tipo: 'recusar', motivo: `meio da zona (${meio}) do lado errado do SL (${p.sl})` }
  if (p.tp1 != null && (p.tp1 - meio) * lado <= 0) return { tipo: 'recusar', motivo: `meio da zona (${meio}) já para lá do TP1 (${p.tp1})` }
  if (p.preco) {
    const px = p.direcao === 'buy' ? p.preco.ask : p.preco.bid
    // Preço já melhor do que o meio (dentro da zona, do lado bom): a mercado é melhor do que a limite.
    if (Number.isFinite(px) && px > 0 && (meio - px) * lado >= 0) {
      if ((px - p.sl) * lado <= 0) return { tipo: 'recusar', motivo: `o preço (${px}) já passou o SL (${p.sl})` }
      return { tipo: 'mercado', motivo: `preço ${px} já melhor do que o meio da zona ${meio}` }
    }
  }
  return { tipo: 'limite', preco: meio, expiraEm: new Date(p.agora.getTime() + p.cfg.validadeMin * 60_000).toISOString() }
}

/**
 * A regra nova da trade anterior (substitui `bloqueioPelaAnterior` no caminho da mestre): o trader
 * faz camadas, por isso deixam-se `maxVivas` trades Premium vivas (abertas + pendentes) em vez de
 * exigir que a anterior esteja em BE e com parcial. Medido: uma de cada vez +573 pips; até 2 +880.
 */
export function bloqueioPorExposicao(vivas: number, cfg: Pick<EntradaPremiumConfig, 'maxVivas'>): string | null {
  return vivas >= cfg.maxVivas ? `já há ${vivas} trade(s) Premium vivas na mestre (máximo ${cfg.maxVivas})` : null
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

/**
 * O que o trader DIZ que fez e que a mestre tem de espelhar (07/10). A gestão por preço continua a
 * mandar nas parciais e no BE — mas há duas saídas que só se sabem pela mensagem:
 *  · «Close all now» (o trader fecha a trade e as camadas) → fechar TODO o Premium aberto/pendente;
 *  · «HIT SL» → o trader saiu; a pendente desse sinal que ainda não encheu cancela-se (a zona
 *    partiu) e o que estiver aberto fecha (o nosso SL é o dele, normalmente já fechou sozinho).
 * «HIT TP» / «running» NÃO cancelam a pendente: medido, deixar a limite viva os 60 min dá mais
 * (+880 contra +664 a cancelar no TP1) — o preço volta muitas vezes à zona e entra-se melhor.
 * Só vale para mensagens em RESPOSTA a um sinal: sem pai não se sabe que trade fechar.
 */
export function saidaDoTraderPremium(texto: string | null | undefined): 'fechar_tudo' | 'fechar_sinal' | 'nada' {
  const t = String(texto ?? '')
  // «1st entry running … 4th entry running … Close all now»: TODAS as camadas, não só a do pai.
  if (/\bclose\s+all\b/i.test(t)) return 'fechar_tudo'
  if (/\b(?:hit\s?sl|sl\s?hit|stop\s?loss\s+hit)\b/i.test(t)) return 'fechar_sinal'
  return 'nada'
}
