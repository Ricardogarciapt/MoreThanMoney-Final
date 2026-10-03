/**
 * ESTRATÉGIAS POR SINAIS — MTM Auto Edge / King / Wolf e a conta «Todos os sinais». Só decisões
 * puras (com teste em lib/mtmfunded/__tests__/estrategias-sinais.check.ts); os canos estão em
 * ./executar.ts e ./todos-os-sinais.ts.
 *
 * De onde vêm os sinais: do canal PrimeVerse (PѴ TRADE INSIGHTS), lido pelo pv-relay na VPS. Cada
 * setup diz quem o publicou («🔔 NEW SIGNAL ALERT by fxedge»); os seguimentos (ENTRY HIT, TP HIT,
 * SL → BE, CLOSED, CANCELLED) são RESPOSTAS ao setup. Formatos reais vistos a 15/09 (anonimizados
 * nos testes):
 *
 *   🔔 NEW SIGNAL ALERT by fxedge            ← setup (Pair/Type/Entry[ - Entry2]/Stop Loss/TP1..TP5)
 *   🟢 ENTRY HIT | XAUUSD 🔴                 ← o preço chegou à entrada: é AQUI que se abre
 *   ✅ TP2 HIT +60 pips ✅✅ 🔥🔥             ← alvo (o nosso motor já faz as parciais pelo preço)
 *   🛡️ SL → BE | XAUUSD 🔴 | @ 4357.00 | fxedge  ← stop para a entrada
 *   🛡️ BREAKEVEN | XAUUSD 🔴 | TP1, TP2 secured | fxedge
 *   ❌ SL HIT -100 pips                        ← stop (o nosso SL fecha sozinho)
 *   ✅ TRADE CLOSED | XAUUSD 🟢 | TP1 secured | +30.0 pips | fxedge   ← resumo: a trade acabou
 *   🔔 CLOSED | US30 🟢\nProvider exited - consider closing or moving to BE ← saída manual
 *   🚫 CANCELLED | XAUUSD 🟢 | entry missed     ← pendente que nunca encheu
 *
 * Os nomes dos traders no canal são `fxedge`, `kingfkg` e `g_wolf` (o pedido falava em «kingfkge»
 * e «gwolf» — ficam como apelidos).
 *
 * Pips: SEMPRE pela convenção de lib/mtmcopy/trade-outcome.ts (ouro 0,1 · JPY 0,01 · forex 0,0001
 * · índices e cripto em PONTOS = 1). As distâncias vão para a base em PREÇO (migração 072).
 */
import { pipSizeForSymbol } from '../../mtmcopy/trade-outcome'
import { volumeDaParte, type Gestao, type TpParcial } from '../simulado/avancadas'
import type { Direcao, Simbolo } from '../simulado/matematica'

// ── estratégias ──────────────────────────────────────────────────────────────

export interface EstrategiaPrimeverse {
  slug: string
  nome: string
  trader: string
  apelidos: string[]
  /** Comentário à MT5 das posições (≤ 31). */
  comentario: string
  /**
   * A estratégia ainda ABRE posições novas?
   *
   * A 29/09/2026 o dono ficou só com a Edge: a King e a Wolf saíram, e os providers delas estão
   * desligados. Mas não se apagam da lista — quem tem uma posição antiga delas tem de a poder
   * FECHAR, e o histórico tem de continuar a saber dizer o nome da estratégia que a abriu.
   *
   * Por isso a distinção: a lista conhece as três, e só as vivas é que se OFERECEM a quem cria
   * uma conta. Ver `ESTRATEGIAS_PRIMEVERSE_VIVAS`.
   */
  viva: boolean
}

export const ESTRATEGIAS_PRIMEVERSE: EstrategiaPrimeverse[] = [
  { slug: 'mtm-auto-edge', nome: 'MTM Auto Edge', trader: 'fxedge', apelidos: ['fx_edge', 'fx-edge'], comentario: 'MTM Auto Edge', viva: true },
  { slug: 'mtm-auto-king', nome: 'MTM Auto King', trader: 'kingfkg', apelidos: ['kingfkge', 'king_fkg', 'king-fkg'], comentario: 'MTM Auto King', viva: false },
  { slug: 'mtm-auto-wolf', nome: 'MTM Auto Wolf', trader: 'g_wolf', apelidos: ['gwolf', 'g-wolf', 'g.wolf'], comentario: 'MTM Auto Wolf', viva: false },
]

/** As que ainda se OFEREM. É esta que a criação de contas usa — a de cima serve para LER. */
export const ESTRATEGIAS_PRIMEVERSE_VIVAS = ESTRATEGIAS_PRIMEVERSE.filter((e) => e.viva)

export function normalizarTrader(t: string | null | undefined): string {
  return String(t ?? '').replace(/[\u200b-\u200f\ufeff\u2060]/g, '').trim().toLowerCase()
}

/** A estratégia de um trader do PrimeVerse (ou null — os outros traders ficam só no chat). */
export function estrategiaDoTrader(trader: string | null | undefined): EstrategiaPrimeverse | null {
  const t = normalizarTrader(trader)
  if (!t) return null
  return ESTRATEGIAS_PRIMEVERSE.find((e) => e.trader === t || e.apelidos.includes(t)) ?? null
}

export function estrategiaPorSlug(slug: string | null | undefined): EstrategiaPrimeverse | null {
  const s = String(slug ?? '').toLowerCase()
  return ESTRATEGIAS_PRIMEVERSE.find((e) => e.slug === s) ?? null
}

// ── parser das mensagens do canal (espelho do services/pv-relay/relay.py) ────

export type TipoMensagemPv =
  | 'setup' | 'entry_hit' | 'tp_hit' | 'sl_be' | 'breakeven' | 'sl_hit' | 'trade_closed' | 'provider_closed' | 'cancelled'

export interface MensagemPv {
  tipo: TipoMensagemPv
  trader?: string
  symbol?: string
  direction?: Direcao
  orderType?: 'market' | 'limit'
  entry?: number
  entry2?: number
  sl?: number | null
  tps?: number[]
  style?: string | null
  /** TP n (tp_hit/trade_closed) */
  nivel?: number
  pips?: number
  /** preço do BE (sl_be) */
  preco?: number
}

const limpar = (t: string) => String(t ?? '').replace(/[\u200b-\u200f\ufeff\u2060]/g, '')

function normSimbolo(s: string): string {
  const u = s.toUpperCase().trim()
  if (/XAU|GOLD/.test(u)) return 'XAUUSD'
  if (/BTC/.test(u)) return 'BTCUSD'
  if (/ETH/.test(u)) return 'ETHUSD'
  return u.replace(/[/\s]/g, '')
}

/** 🟢 = compra, 🔴 = venda (nas linhas «| SÍMBOLO 🟢 |»). */
function direcaoDoEmoji(t: string): Direcao | undefined {
  const depois = t.split('|').slice(1).join('|')
  if (/🟢/u.test(depois)) return 'buy'
  if (/🔴/u.test(depois)) return 'sell'
  return undefined
}

export function classificarMensagemPrimeverse(texto: string): MensagemPv | null {
  const t = limpar(texto)
  const setup = /NEW SIGNAL ALERT\s+by\s+([A-Za-z0-9_\-.]+)/i.exec(t)
  if (setup) {
    const par = /Pair:\s*([A-Za-z0-9/]+)/i.exec(t)
    const tipo = /Type:\s*(BUY|SELL)/i.exec(t)
    const ent = /Entry:\s*([0-9]+(?:\.[0-9]+)?)(?:\s*-\s*([0-9]+(?:\.[0-9]+)?))?/i.exec(t)
    if (!par || !tipo || !ent) return null
    const sl = /Stop\s*Loss:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(t)
    const tps = [...t.matchAll(/TP\d\s*:\s*([0-9]+(?:\.[0-9]+)?)/gi)].map((m) => Number(m[1]))
    const style = /Style:\s*([A-Za-z]+)/i.exec(t)
    return {
      tipo: 'setup',
      trader: normalizarTrader(setup[1]),
      symbol: normSimbolo(par[1]),
      direction: tipo[1].toUpperCase() === 'SELL' ? 'sell' : 'buy',
      orderType: /\b(buy|sell)\s*limit\b/i.test(t) ? 'limit' : 'market',
      entry: Number(ent[1]),
      ...(ent[2] ? { entry2: Number(ent[2]) } : {}),
      sl: sl ? Number(sl[1]) : null,
      tps,
      style: style ? style[1] : null,
    }
  }
  const primeira = t.split('\n')[0]
  const simb = /\|\s*([A-Z0-9/]{3,12})\s*[🟢🔴]/u.exec(primeira)
  const base = { ...(simb ? { symbol: normSimbolo(simb[1]) } : {}), ...(direcaoDoEmoji(primeira) ? { direction: direcaoDoEmoji(primeira) } : {}) }
  if (/ENTRY\s*HIT/i.test(primeira)) return { tipo: 'entry_hit', ...base }
  if (/\bCANCEL/i.test(primeira)) return { tipo: 'cancelled', ...base }
  const tpHit = /TP(\d)\s*HIT(?:\s*\+?\s*([0-9]+(?:\.[0-9]+)?)\s*pips)?/i.exec(primeira)
  if (tpHit) return { tipo: 'tp_hit', nivel: Number(tpHit[1]), ...(tpHit[2] ? { pips: Number(tpHit[2]) } : {}), ...base }
  const slHit = /SL\s*HIT\s*-?\s*([0-9]+(?:\.[0-9]+)?)?/i.exec(primeira)
  if (slHit) return { tipo: 'sl_hit', ...(slHit[1] ? { pips: -Number(slHit[1]) } : {}), ...base }
  const slBe = /SL\s*(?:→|->|to)\s*BE\b.*?@\s*([0-9]+(?:\.[0-9]+)?)/i.exec(primeira)
  if (slBe) return { tipo: 'sl_be', preco: Number(slBe[1]), ...base }
  if (/BREAKEVEN/i.test(primeira)) return { tipo: 'breakeven', ...base }
  const fechada = /TRADE\s*CLOSED.*?TP(\d)\s*secured(?:.*?([+-]?[0-9]+(?:\.[0-9]+)?)\s*pips)?/i.exec(primeira)
  if (fechada) return { tipo: 'trade_closed', nivel: Number(fechada[1]), ...(fechada[2] ? { pips: Number(fechada[2]) } : {}), ...base }
  if (/TRADE\s*CLOSED/i.test(primeira)) return { tipo: 'trade_closed', ...base }
  if (/^\W*CLOSED\b/i.test(primeira) || /provider exited/i.test(t)) return { tipo: 'provider_closed', ...base }
  return null
}

/**
 * O que um seguimento faz às posições abertas da estratégia. TP HIT e SL HIT não fazem nada: a
 * posição tem SL e parciais próprios e o motor fecha-os ao NOSSO preço (fechar ao aviso do canal
 * seria fechar ao preço de quando a mensagem chegou, que é pior e duplicava o fecho).
 */
export type AccaoSeguimento = 'nada' | 'fechar' | 'cancelar' | 'break_even'

export function accaoDoSeguimento(tipo: TipoMensagemPv | 'cancel' | 'close' | 'tp_hit' | 'sl_be' | 'sl_hit'): AccaoSeguimento {
  switch (tipo) {
    case 'cancel':
    case 'cancelled':
      return 'cancelar'
    case 'close':
    case 'trade_closed':
    case 'provider_closed':
      return 'fechar'
    case 'sl_be':
    case 'breakeven':
      return 'break_even'
    default:
      return 'nada'
  }
}

// ── configuração da estratégia ───────────────────────────────────────────────

/**
 * Gestão por defeito (o dono pode mudar por estratégia em mtmauto_providers — colunas
 * trailing_* e saidas_pct — e em `sinais_config`, migração 092):
 *
 *  · LOTE: 0,01 por cada 1 000 USD de saldo (conta da casa de 10 000 = 0,10; seguidora de 1 000 = 0,01).
 *  · SAÍDAS (trailing profit): 50% no TP1, 25% no TP2, o resto corre com o trailing até ao último TP
 *    do sinal (rede). Uma parte abaixo do lote mínimo não se faz — numa conta de 0,01 não há parciais.
 *  · BREAK-EVEN: no TP1 (ou, sem parciais possíveis, ao atingir a distância do TP1), com +2 pips de
 *    lucro fechado (be_offset) — «lock profit».
 *  · TRAILING STOP: arranca quando o lucro chega à distância do TP1 (ou `trailing_arranca_pips`),
 *    segue a 50% da distância do stop do sinal (ou `trailing_distancia_pips`). O salto é o do motor:
 *    max(1 pip, distância/10) — `trailing_passo_pips` fica gravado mas o motor ainda não o lê.
 */
export interface ConfigSinais {
  lotePor1000: number
  saidasPct: number[]
  /**
   * Parciais ancoradas na FRACÇÃO DO RISCO, em vez de nos alvos do trader: `[{ r: 1, pct: 50 }]`
   * tira 50% quando o preço andou 1× a distância entrada→SL. Manda sobre `saidasPct` quando está
   * posta e a trade tem stop. Vazia/nula = nada muda (é aditiva; ninguém a tem por defeito).
   *
   * PORQUÊ. `saidasPct` sai NO TP1 DO TRADER, e o TP1 não está no mesmo sítio em traders
   * diferentes: medido a 24/09, o TP1 está a 0,30R no Edge, 0,50R no King e 0,80R no Wolf. Ou
   * seja: a mesma configuração dá três gestões diferentes, e quem manda na nossa gestão acaba por
   * ser o alvo do trader. Uma parcial a 1R sai no mesmo sítio seja qual for o trader — e é a
   * mesma razão pela qual o BE e o trailing desta casa já preferem a fracção do risco aos pips.
   *
   * Vale para o Edge/King/Wolf, mas o botão é geral: qualquer estratégia que passe por
   * `gestaoDoSinal` pode usá-lo pondo-o em `sinais_config`.
   */
  saidasFracaoDoRisco: { r: number; pct: number }[] | null
  beNoTp1: boolean
  beOffsetPips: number
  /**
   * Break-even a uma distância FIXA em pips, em vez da distância do TP1.
   *
   * O TP1 destes sinais fica a 100-150 pips da NOSSA execução (entramos na ponta funda da zona),
   * mas a reacção da zona só dá 40-60 — o BE ancorado no TP1 nunca arma e a trade devolve tudo ao
   * stop. Medido em scripts/estudos/perfil-gestao-check.ts. Quando está posto, manda sobre `beNoTp1`.
   */
  beGatilhoPips: number | null
  /**
   * Break-even a uma FRACÇÃO DO RISCO (0,30 = o preço andou 30% da distância entrada→SL).
   *
   * PRECEDÊNCIA, e é a regra desta casa para tudo o que é gestão: **a fracção do risco manda quando
   * está definida; os pips ficam como recurso** (`beFracaoDoRisco` → `beGatilhoPips` → `beNoTp1`).
   *
   * Porque é que um número em pips não chega: (1) o risco do próprio sinal não é estável — no
   * GoldKiller a mediana passou de 84 pips em Julho para 89 em Agosto e 169 em Setembro, e um
   * gatilho fixo em pips muda de significado sozinho quando a volatilidade muda de patamar;
   * (2) `pipSizeForSymbol` devolve 1 para índices e cripto (PONTOS — é a convenção da casa e está
   * certa), por isso 40 «pips» no Aurum Flow são 40 unidades DE PREÇO: num ONDOUSDT a 0,39 $ nunca
   * arma, num BTCUSDT a 120 000 $ arma ao primeiro tick. Com ~42 perpétuos de escalas diferentes
   * nenhum número absoluto serve para todos; a fracção do risco é adimensional e serve para todos.
   *
   * Medido em docs/analise-perfil-gk-aurum.md (ver a ressalva: nenhum destes perfis é
   * estatisticamente distinguível de zero).
   */
  beFracaoDoRisco: number | null
  /** Folga do BE em fracção do risco (0,05 = +5% do risco de lucro fechado). Manda sobre `beOffsetPips`. */
  beOffsetFracaoDoRisco: number | null
  trailingInicioPips: number | null
  /** Arranque do trailing em fracção do risco. Manda sobre `trailingInicioPips` (e sobre a distância ao TP1). */
  trailingInicioFracaoDoRisco: number | null
  trailingDistanciaPips: number | null
  trailingPassoPips: number | null
  /** fração da distância do stop usada como trailing quando não há pips configurados */
  trailingFracaoDoRisco: number
  /**
   * Desliga o trailing de vez. Sem isto não havia forma de o tirar: com o arranque vazio, o
   * trailing cai para a distância ao TP1 e a distância para metade do risco — ficava sempre ligado.
   * Posto no GoldKiller a 16/09, onde o BE sozinho mediu melhor do que o BE com trailing.
   */
  semTrailing: boolean
  /** abrir mesmo que o mesmo trade já esteja aberto nesta conta por outra estratégia */
  permitirDuplicado: boolean
  /** fechar quando o trader fecha («TRADE CLOSED» / «CLOSED») e ir a BE com o «SL → BE» dele */
  seguirFechosDaFonte: boolean
}

export const CONFIG_PADRAO: ConfigSinais = {
  lotePor1000: 0.01,
  saidasPct: [50, 25],
  saidasFracaoDoRisco: null,
  beNoTp1: true,
  beOffsetPips: 2,
  beGatilhoPips: null,
  beFracaoDoRisco: null,
  beOffsetFracaoDoRisco: null,
  trailingInicioPips: null,
  trailingInicioFracaoDoRisco: null,
  trailingDistanciaPips: null,
  trailingPassoPips: null,
  trailingFracaoDoRisco: 0.5,
  semTrailing: false,
  permitirDuplicado: false,
  seguirFechosDaFonte: true,
}

const pos = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * NOTA: `sinais_config.modo` (ex.: `'sombra'` no MTM Scanner, migração 108) NÃO é lido aqui nem por
 * nenhum executor — é uma etiqueta para o Centro de Controlo. Quem decide se uma estratégia executa
 * é `mtmauto_providers.ativo` (e `SLUGS_QUE_NAO_EXECUTAM`). A sombra está em lib/mtmauto/sombra.
 */
export function configDoProvider(p: Record<string, unknown> | null | undefined): ConfigSinais {
  const c = { ...CONFIG_PADRAO }
  if (!p) return c
  const extra = (typeof p.sinais_config === 'object' && p.sinais_config ? p.sinais_config : {}) as Record<string, unknown>
  c.lotePor1000 = pos(extra.lotePor1000) ?? c.lotePor1000
  const saidas = Array.isArray(p.saidas_pct) && p.saidas_pct.length ? p.saidas_pct : Array.isArray(extra.saidasPct) ? extra.saidasPct : null
  if (saidas) c.saidasPct = (saidas as unknown[]).map(Number).filter((n) => n > 0).slice(0, 3)
  // Só pelo jsonb, como todas as fracções do risco: é configuração nova e não tem coluna antiga.
  if (Array.isArray(extra.saidasFracaoDoRisco)) {
    const niveis = (extra.saidasFracaoDoRisco as unknown[])
      .map((x) => (typeof x === 'object' && x ? { r: Number((x as Record<string, unknown>).r), pct: Number((x as Record<string, unknown>).pct) } : { r: NaN, pct: NaN }))
      .filter((x) => Number.isFinite(x.r) && x.r > 0 && Number.isFinite(x.pct) && x.pct > 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 3)
    c.saidasFracaoDoRisco = niveis.length ? niveis : null
  }
  if (typeof extra.beNoTp1 === 'boolean') c.beNoTp1 = extra.beNoTp1
  if (extra.beOffsetPips != null && Number(extra.beOffsetPips) >= 0) c.beOffsetPips = Number(extra.beOffsetPips)
  // Só pelo jsonb: a coluna `be_gatilho` de mtmauto_providers já tem dois sentidos na casa
  // (pips em lib/mtmauto/reconstruir-desempenho, «BE no TP nº N» em lib/mtm-auto-bridge) e não se
  // lhe acrescenta um terceiro.
  c.beGatilhoPips = pos(extra.beGatilhoPips)
  // Fracção do risco: só pelo jsonb — é configuração nova e não tem coluna antiga nenhuma.
  c.beFracaoDoRisco = pos(extra.beFracaoDoRisco)
  c.beOffsetFracaoDoRisco = pos(extra.beOffsetFracaoDoRisco)
  c.trailingInicioFracaoDoRisco = pos(extra.trailingInicioFracaoDoRisco)
  // O jsonb MANDA, as colunas antigas são o recurso (era ao contrário até 16/09, e isso queria dizer
  // que escrever em `sinais_config` não conseguia desligar o que estava na coluna — o caso do Aurum
  // Flow, preso a `trailing_arranca_pips = 40`). Assim fica como já era para `beGatilhoPips`, para o
  // resto do jsonb e como o cabeçalho de lib/gestao-real/provider.ts sempre descreveu.
  c.trailingInicioPips = pos(extra.trailingInicioPips) ?? pos(p.trailing_arranca_pips)
  c.trailingDistanciaPips = pos(extra.trailingDistanciaPips) ?? pos(p.trailing_distancia_pips)
  c.trailingPassoPips = pos(extra.trailingPassoPips) ?? pos(p.trailing_passo_pips)
  c.trailingFracaoDoRisco = pos(extra.trailingFracaoDoRisco) ?? c.trailingFracaoDoRisco
  c.semTrailing = extra.semTrailing === true
  c.permitirDuplicado = extra.permitirDuplicado === true
  if (typeof extra.seguirFechosDaFonte === 'boolean') c.seguirFechosDaFonte = extra.seguirFechosDaFonte
  return c
}

// ── lote ─────────────────────────────────────────────────────────────────────

export function loteParaConta(saldo: number, cfg: Pick<ConfigSinais, 'lotePor1000'>, s: Pick<Simbolo, 'volume_min' | 'volume_step' | 'volume_max'>): number {
  const bruto = (Math.max(0, saldo) / 1000) * cfg.lotePor1000
  const passos = Math.floor(bruto / s.volume_step + 1e-9)
  const v = Math.round(passos * s.volume_step * 100) / 100
  return Math.min(s.volume_max, Math.max(s.volume_min, v))
}

// ── niveis e gestão ──────────────────────────────────────────────────────────

export interface NiveisSinal {
  direcao: Direcao
  /** entrada do sinal (null = mercado) */
  entrada: number | null
  sl: number | null
  tps: number[]
}

/**
 * Os niveis ao preço a que NÓS entrámos, mantendo as distâncias do sinal (o ENTRY HIT chega com o
 * preço já ao lado da entrada, mas nunca exactamente nela). Alvos que ficariam do lado errado saem.
 */
export function niveisAncorados(n: NiveisSinal, precoExecucao: number, digits: number): { sl: number | null; tps: number[] } {
  const f = Math.pow(10, digits)
  const arred = (x: number) => Math.round(x * f) / f
  const ref = n.entrada && n.entrada > 0 ? n.entrada : precoExecucao
  const desvio = precoExecucao - ref
  // Um desvio de mais de 25% é um sinal errado (ou outro instrumento): não se re-ancora nada.
  const util = Math.abs(desvio) / precoExecucao < 0.25 ? desvio : 0
  const sinal = n.direcao === 'buy' ? 1 : -1
  let sl = n.sl != null && n.sl > 0 ? arred(n.sl + util) : null
  if (sl != null && (precoExecucao - sl) * sinal <= 0) sl = null
  const tps = n.tps
    .filter((x) => Number.isFinite(x) && x > 0)
    .map((x) => arred(x + util))
    .filter((x) => (x - precoExecucao) * sinal > 0)
  return { sl, tps }
}

export interface PedidoGestao {
  simbolo: Simbolo
  direcao: Direcao
  precoExecucao: number
  volume: number
  sl: number | null
  tps: number[]
  cfg: ConfigSinais
}

/**
 * A gestão a gravar na posição (072) + o TP final. Tudo em PREÇO. Válida para `validarGestao`:
 * no máximo 3 parciais, cada uma ≥ lote mínimo, BE offset < gatilho.
 */
export function gestaoDoSinal(p: PedidoGestao): { gestao: Partial<Gestao>; tpFinal: number | null; parciais: number } {
  const pip = pipSizeForSymbol(p.simbolo.symbol)
  const f = Math.pow(10, p.simbolo.digits)
  const arred = (x: number) => Math.round(x * f) / f
  const dist = (x: number) => Math.abs(x - p.precoExecucao)
  const tp1 = p.tps[0] ?? null
  const tpFinal = p.tps.length ? p.tps[p.tps.length - 1] : null

  // O risco do sinal (entrada→SL) em PREÇO: é a régua das fracções. Sem stop não há risco e as
  // fracções não se podem resolver — cai-se no que estiver em pips.
  const risco = p.sl != null ? dist(p.sl) : null
  const sentido = p.direcao === 'buy' ? 1 : -1

  // parciais: só as que dão lote mínimo, só ANTES do TP final (é lá que a posição fecha)
  const tps: TpParcial[] = []
  if (p.cfg.saidasFracaoDoRisco && risco != null && risco > 0) {
    // Ancoradas no risco: o alvo é o nosso, não o do trader. Uma que caia em cima ou além do TP
    // final não se grava — fecharia junto com a posição e não seria parcial nenhuma.
    for (const n of p.cfg.saidasFracaoDoRisco) {
      if (tps.length >= 3) break
      const preco = arred(p.precoExecucao + sentido * risco * n.r)
      if (tpFinal != null && (preco - tpFinal) * sentido >= 0) break
      if (volumeDaParte(p.simbolo, p.volume, n.pct) == null) break
      tps.push({ preco, pct: n.pct, atingido: false })
    }
  } else {
    for (const [i, pct] of p.cfg.saidasPct.entries()) {
      const preco = p.tps[i]
      if (preco == null || i >= p.tps.length - 1 || tps.length >= 3) break
      if (volumeDaParte(p.simbolo, p.volume, pct) == null) break
      tps.push({ preco: arred(preco), pct, atingido: false })
    }
  }
  const g: Partial<Gestao> = {}
  if (tps.length) g.tps = tps

  const offset = arred(p.cfg.beOffsetPips * pip)
  // PRECEDÊNCIA: fracção do risco → pips → TP1 (ver `beFracaoDoRisco`).
  if (p.cfg.beFracaoDoRisco != null && risco != null && risco > 0) {
    const gatilho = arred(risco * p.cfg.beFracaoDoRisco)
    // A folga também em fracção do risco quando está posta; senão fica a que está em pips.
    const folga = p.cfg.beOffsetFracaoDoRisco != null ? arred(risco * p.cfg.beOffsetFracaoDoRisco) : offset
    if (gatilho > 0) {
      g.be_gatilho = gatilho
      // `validarGestao` (072) exige folga < gatilho: um BE que fechasse acima do gatilho era uma
      // posição fechada no instante em que o gatilho arma.
      g.be_offset = folga < gatilho ? folga : 0
    }
  } else if (p.cfg.beGatilhoPips != null) {
    const gatilho = arred(p.cfg.beGatilhoPips * pip)
    if (gatilho > 0) {
      g.be_gatilho = gatilho
      g.be_offset = offset < gatilho ? offset : 0
    }
  } else if (p.cfg.beNoTp1 && tp1 != null) {
    // `be_no_tp1` quer dizer, no motor, «BE quando a PRIMEIRA PARCIAL for atingida» — e com as
    // parciais ancoradas no risco isso mudava o BE de sítio sem ninguém pedir (no Edge saltava de
    // 0,30R para 1R e desaparecia a protecção que faz os 82% de vitórias). Nesse caso o BE fica
    // onde sempre esteve, à distância do TP1, mas dito pelo gatilho — as duas decisões separadas.
    if (tps.length && !p.cfg.saidasFracaoDoRisco) {
      g.be_no_tp1 = true
      g.be_offset = offset
    } else {
      const gatilho = arred(dist(tp1))
      if (gatilho > 0) {
        g.be_gatilho = gatilho
        g.be_offset = offset < gatilho ? offset : 0
      }
    }
  }

  const distancia = p.cfg.trailingDistanciaPips != null
    ? p.cfg.trailingDistanciaPips * pip
    : risco != null ? risco * p.cfg.trailingFracaoDoRisco : null
  if (!p.cfg.semTrailing && distancia != null && distancia >= p.simbolo.pip_size) {
    g.trailing_distancia = arred(distancia)
    // A mesma precedência do BE: fracção do risco → pips → distância ao TP1.
    const inicio = p.cfg.trailingInicioFracaoDoRisco != null && risco != null && risco > 0
      ? risco * p.cfg.trailingInicioFracaoDoRisco
      : p.cfg.trailingInicioPips != null ? p.cfg.trailingInicioPips * pip : tp1 != null ? dist(tp1) : null
    g.trailing_ativacao = inicio != null && inicio > 0 ? arred(inicio) : null
  }
  return { gestao: g, tpFinal: tpFinal != null ? arred(tpFinal) : null, parciais: tps.length }
}

// ── identidade do sinal e duplicados ─────────────────────────────────────────

/** Hora UTC do sinal (para as chaves: um reenvio do relay dentro da hora cai na mesma chave). */
export function horaDoSinal(em: Date | string | number = Date.now()): string {
  return new Date(em).toISOString().slice(0, 13)
}

/**
 * Chave de idempotência de UM sinal de UMA fonte. Com o id da mensagem do Telegram (relay novo) é
 * exacta; sem ele, os niveis do sinal + a hora — o relay reenvia um ENTRY HIT que deu timeout e
 * sem isto abria-se duas vezes.
 */
export function chaveDoSinal(p: { fonte: string; msgId?: string | number | null; symbol: string; direcao: Direcao; entrada: number | null; sl: number | null; hora?: string }): string {
  if (p.msgId != null && String(p.msgId).trim()) return `${p.fonte}:msg:${String(p.msgId).trim()}`.slice(0, 200)
  const n = (x: number | null) => (x == null ? '-' : String(Number(x)))
  return `${p.fonte}:${p.symbol.toUpperCase()}:${p.direcao}:${n(p.entrada)}:${n(p.sl)}:${p.hora ?? horaDoSinal()}`.slice(0, 200)
}

/**
 * Impressão digital do TRADE, independente da fonte: o mesmo par, direcção e entrada (arredondada a
 * 10 pips/pontos) na mesma hora. É o que impede a conta «Todos os sinais» de abrir duas vezes o
 * mesmo trade que chegou pelo chat Premium e pela estratégia, ou por dois canais.
 */
export function impressaoDoTrade(p: { symbol: string; direcao: Direcao; entrada: number | null; hora?: string }): string {
  const pip = pipSizeForSymbol(p.symbol)
  const balde = p.entrada != null && p.entrada > 0 ? Math.round(p.entrada / (pip * 10)) : 'mkt'
  return `${p.symbol.toUpperCase()}:${p.direcao}:${balde}:${p.hora ?? horaDoSinal()}`
}

export interface PonteAberta {
  chave: string
  impressao: string | null
  symbol: string
  direcao: Direcao
  entrada: number | null
  fonte: string
  criadaEm: number
}

/** Janela e tolerância do duplicado «por conteúdo» (além da impressão exacta). */
export const JANELA_DUPLICADO_MS = 30 * 60_000
export const TOLERANCIA_DUPLICADO_PIPS = 15

export type DecisaoDuplicado = { abrir: true } | { abrir: false; motivo: 'mesma_chave' | 'mesmo_trade'; chaveOriginal: string; fonteOriginal: string }

export function decidirDuplicado(
  novo: { chave: string; impressao: string | null; symbol: string; direcao: Direcao; entrada: number | null; agora?: number },
  abertas: PonteAberta[],
  permitirDuplicado = false,
): DecisaoDuplicado {
  const mesma = abertas.find((a) => a.chave === novo.chave)
  if (mesma) return { abrir: false, motivo: 'mesma_chave', chaveOriginal: mesma.chave, fonteOriginal: mesma.fonte }
  if (permitirDuplicado) return { abrir: true }
  const agora = novo.agora ?? Date.now()
  const pip = pipSizeForSymbol(novo.symbol)
  const igual = abertas.find((a) => {
    if (a.symbol.toUpperCase() !== novo.symbol.toUpperCase() || a.direcao !== novo.direcao) return false
    if (novo.impressao && a.impressao === novo.impressao) return true
    if (agora - a.criadaEm > JANELA_DUPLICADO_MS) return false
    if (a.entrada == null || novo.entrada == null) return a.entrada == null && novo.entrada == null
    return Math.abs(a.entrada - novo.entrada) / pip <= TOLERANCIA_DUPLICADO_PIPS
  })
  if (igual) return { abrir: false, motivo: 'mesmo_trade', chaveOriginal: igual.chave, fonteOriginal: igual.fonte }
  return { abrir: true }
}

// ── comentário da fonte (conta «Todos os sinais») ────────────────────────────

const ROTULOS_FONTE: Record<string, string> = {
  premium: 'Premium',
  sensei: 'Scanner Sensei',
  goldkiller: 'GoldKiller',
  mtmscanner: 'Scanner MTM',
  aurum: 'Aurum Flow',
  forexideas: 'MTM Alertas',
  forexswings: 'Forex Swings',
  alertas: 'MTM Alertas',
  perps: 'Perps',
}

/** «PrimeVerse fxedge», «Premium», «Scanner Sensei»… — ≤ 31 caracteres, como o comentário MT5. */
export function comentarioDaFonte(p: { sourceKey?: string | null; channelSlug?: string | null; trader?: string | null }): string {
  const sk = String(p.sourceKey ?? '').toLowerCase()
  if (sk === 'primeverse') return `PrimeVerse ${normalizarTrader(p.trader)}`.trim().slice(0, 31)
  if (ROTULOS_FONTE[sk]) return ROTULOS_FONTE[sk]
  if (p.channelSlug === 'cripto-perps') return 'Perps'
  if (p.channelSlug === 'ideias-e-sinais' || p.channelSlug === 'trade-ideas') return 'MTM Alertas'
  return (sk || p.channelSlug || 'MTM').slice(0, 31)
}

/** O trader PrimeVerse escrito na entrada do chat («📡 PrimeVerse · fxedge»). */
export function traderDoConteudo(content: string | null | undefined): string | null {
  const c = String(content ?? '')
  const m = /PrimeVerse\s*[·•-]\s*([A-Za-z0-9_\-.]+)/i.exec(c)
  if (m) return normalizarTrader(m[1])
  // Formato único (18/09): a entrada traz a ESTRATÉGIA («📌 MTM Auto Edge · …»), não o trader.
  const e = /📌\s*MTM\s+Auto\s+(Edge|King|Wolf)\b/i.exec(c)
  if (e) return traderDaEstrategiaEkw(e[1])
  return null
}

function traderDaEstrategiaEkw(nome: string): string | null {
  const n = nome.toLowerCase()
  return n === 'edge' ? 'fxedge' : n === 'king' ? 'kingfkg' : n === 'wolf' ? 'g_wolf' : null
}
