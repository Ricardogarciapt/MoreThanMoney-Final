/**
 * DIMENSIONAMENTO POR CONTA — o que cada cliente escolheu, traduzido para a rota do motor
 * (copia_rotas.modo_lote/valor/lote_max/copiar_sl/copiar_tp/filtro). O cálculo do lote em si é o
 * `calcularLote` da cópia (lib/copia-contas/calculo.ts), que arredonda o risco % sempre PARA BAIXO e
 * recusa subir um lote minúsculo além do dobro do pedido.
 *
 * Regras da casa aplicadas aqui (memória do projecto):
 *  · `strategy_lots` (Ruben opção B): lote FIXO por estratégia manda sobre tudo o resto da ligação.
 *  · Modo `multiplier` do site nunca inventa lotes (bug de 20/08: 1 lote de ouro): cai para o risco
 *    `max_risk_percent` ou recusa.
 *  · Contas com bónus (Monaxa 20X): `mestres_contas.lote_fixo_forcado` — lote fixo, NUNCA risco %.
 *  · Equity Edge (prop firm por equity): sem SL/TP à corretora — o motor fecha pela mestre.
 *  · MTM Auto: o multiplicador multiplica o RISCO, não o lote (lib/executor.ts do mtm-auto); o tecto
 *    `risco_max_pct` limita o risco %.
 *
 * Puro e testado (__tests__/mestres.check.ts).
 */
import type { ModoLoteCopia } from '../copia-contas/tipos'

export interface LoteDaRota {
  modo_lote: ModoLoteCopia
  valor: number
  lote_max: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  filtro_simbolos: string[]
  max_abertas: number | null
  /** de onde veio a regra (para o admin e para o registo) */
  origem: string
}

export type ResultadoLote = { ok: true; lote: LoteDaRota } | { ok: false; motivo: string }

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const pos = (v: unknown): number | null => {
  const n = num(v)
  return n != null && n > 0 ? n : null
}

/** Prop firms que medem o drawdown pela EQUITY e não querem SL/TP da cópia na corretora. */
export const PROP_SEM_STOPS_NA_CORRETORA = new Set(['equity_edge'])

export interface LigacaoSite {
  lot_mode?: string | null
  lot_value?: number | string | null
  max_risk_percent?: number | string | null
  strategy_lots?: Record<string, unknown> | null
  copy_sl?: boolean | null
  copy_tp?: boolean | null
  symbols_whitelist?: string[] | null
  prop_firm_type?: string | null
  t2t_lot_mode?: string | null
  t2t_lot_value?: number | string | null
  t2t_source_risk?: Record<string, unknown> | null
}

function riscoLimitado(valor: number | null, tecto: number | null): number | null {
  if (valor == null) return null
  const v = tecto != null ? Math.min(valor, tecto) : valor
  return v > 0 && v <= 10 ? Number(v.toFixed(4)) : null
}

/**
 * Ligação do site (mtmcopy_connections) → regra de lote.
 * @param idsCopyFactory estratégias CopyFactory desta estratégia (as chaves de `strategy_lots`)
 * @param t2t true = rota de Tap to Trade (sizing próprio t2t_*; `t2t_source_risk[fonte]` manda)
 */
export function loteDaLigacaoSite(l: LigacaoSite, opts: { idsCopyFactory?: string[]; t2t?: boolean; fonteT2T?: string | null; loteFixoForcado?: number | null } = {}): ResultadoLote {
  const semStops = PROP_SEM_STOPS_NA_CORRETORA.has(String(l.prop_firm_type ?? '').toLowerCase())
  const base = {
    lote_max: null,
    copiar_sl: semStops ? false : l.copy_sl !== false,
    copiar_tp: semStops ? false : l.copy_tp !== false,
    filtro_simbolos: Array.isArray(l.symbols_whitelist) ? l.symbols_whitelist.map((s) => String(s).toUpperCase().trim()).filter(Boolean) : [],
    max_abertas: null,
  }
  const forcado = pos(opts.loteFixoForcado)
  if (forcado) return { ok: true, lote: { ...base, modo_lote: 'fixo', valor: forcado, origem: 'lote fixo forçado (conta com bónus)' } }

  if (!opts.t2t && l.strategy_lots && typeof l.strategy_lots === 'object') {
    for (const id of opts.idsCopyFactory ?? []) {
      // Só um NÚMERO é lote fixo. `true` (seguir pelo slug) cai para o risco % da ligação —
      // Number(true) = 1 dava 1 lote fixo (apanhado no ensaio de 18/09 em contas financiadas).
      const bruto = (l.strategy_lots as Record<string, unknown>)[id]
      const v = typeof bruto === 'number' || typeof bruto === 'string' ? pos(bruto) : null
      if (v) return { ok: true, lote: { ...base, modo_lote: 'fixo', valor: Math.min(v, 50), origem: `strategy_lots[${id}]` } }
    }
  }

  const tecto = pos(l.max_risk_percent)
  if (opts.t2t) {
    // t2t_source_risk: { '<canal>': { riscoPct, riscoMaxPct } } (ou um número, formato antigo)
    const bruto = opts.fonteT2T && l.t2t_source_risk && typeof l.t2t_source_risk === 'object'
      ? (l.t2t_source_risk as Record<string, unknown>)[opts.fonteT2T] : null
    const porFonte = bruto && typeof bruto === 'object' ? pos((bruto as Record<string, unknown>).riscoPct) : pos(bruto)
    const tectoFonte = bruto && typeof bruto === 'object' ? pos((bruto as Record<string, unknown>).riscoMaxPct) : null
    if (porFonte) {
      const r = riscoLimitado(porFonte, tectoFonte ?? tecto)
      return r ? { ok: true, lote: { ...base, modo_lote: 'risco_pct', valor: r, origem: `t2t_source_risk[${opts.fonteT2T}]` } } : { ok: false, motivo: 'risco T2T por fonte inválido' }
    }
  }
  const modo = String((opts.t2t ? l.t2t_lot_mode ?? l.lot_mode : l.lot_mode) ?? 'risk_percent').toLowerCase()
  const valor = pos(opts.t2t ? l.t2t_lot_value ?? l.lot_value : l.lot_value)
  const qual = opts.t2t ? 't2t_lot' : 'lot'

  if (modo === 'fixed' || modo === 'fixo' || modo === 'lote') {
    return valor && valor <= 50 ? { ok: true, lote: { ...base, modo_lote: 'fixo', valor, origem: `${qual}_mode=fixed` } } : { ok: false, motivo: 'lote fixo inválido' }
  }
  if (modo === 'risk_percent' || modo === 'risco' || modo === 'risco_pct') {
    const r = riscoLimitado(valor, tecto)
    return r ? { ok: true, lote: { ...base, modo_lote: 'risco_pct', valor: r, origem: `${qual}_mode=risk_percent` } } : { ok: false, motivo: 'risco % inválido (0–10)' }
  }
  // multiplier / balance / desconhecido: nunca inventar lotes — risco pelo tecto, ou recusa.
  const r = riscoLimitado(tecto, null)
  return r ? { ok: true, lote: { ...base, modo_lote: 'risco_pct', valor: r, origem: `${qual}_mode=${modo} → max_risk_percent` } } : { ok: false, motivo: `modo de lote «${modo}» sem max_risk_percent — recusado (nunca se inventa lote)` }
}

export interface SubscricaoAuto {
  modo_risco?: string | null
  risco_pct?: number | string | null
  lote_fixo?: number | string | null
  multiplicador?: number | string | null
  max_posicoes?: number | null
  simbolos?: string[] | null
}

export interface ContaAuto {
  modo_lote?: string | null
  lote_valor?: number | string | null
  risco_pct?: number | string | null
  risco_max_pct?: number | string | null
  multiplicador?: number | string | null
  copiar_sl?: boolean | null
  copiar_tp?: boolean | null
  max_posicoes?: number | null
  simbolos_permitidos?: string[] | null
  prop_firm?: string | null
  preset?: string | null
}

/** Subscrição + conta do MTM Auto → regra de lote (mesma leitura do executor do mtm-auto). */
export function loteDaSubscricaoAuto(s: SubscricaoAuto, c: ContaAuto, opts: { loteFixoForcado?: number | null } = {}): ResultadoLote {
  const up = (a?: string[] | null) => (Array.isArray(a) ? a.map((x) => String(x).toUpperCase().trim()).filter(Boolean) : [])
  const daSub = up(s.simbolos)
  const daConta = up(c.simbolos_permitidos)
  const filtro = daSub.length && daConta.length ? daSub.filter((x) => daConta.includes(x)) : daSub.length ? daSub : daConta
  if (daSub.length && daConta.length && !filtro.length) return { ok: false, motivo: 'símbolos da subscrição e da conta não se cruzam' }
  const semStops = PROP_SEM_STOPS_NA_CORRETORA.has(String(c.prop_firm ?? c.preset ?? '').toLowerCase())
  const base = {
    lote_max: null,
    copiar_sl: semStops ? false : c.copiar_sl !== false,
    copiar_tp: semStops ? false : c.copiar_tp !== false,
    filtro_simbolos: filtro,
    max_abertas: num(s.max_posicoes) ?? num(c.max_posicoes),
  }
  const forcado = pos(opts.loteFixoForcado)
  if (forcado) return { ok: true, lote: { ...base, modo_lote: 'fixo', valor: forcado, origem: 'lote fixo forçado (conta com bónus)' } }

  const modoSub = s.modo_risco && s.modo_risco !== 'conta' ? s.modo_risco : null
  const modo = String(modoSub ?? c.modo_lote ?? 'risk_percent').toLowerCase()
  if (modo === 'lote' || modo === 'fixed' || modo === 'fixo') {
    const v = pos(s.lote_fixo ?? c.lote_valor) ?? 0.01
    return v <= 50 ? { ok: true, lote: { ...base, modo_lote: 'fixo', valor: v, origem: 'mtm-auto lote fixo' } } : { ok: false, motivo: 'lote fixo inválido' }
  }
  const mult = pos(modoSub === 'multiplicador' ? s.multiplicador : c.multiplicador) ?? 1
  const risco = pos(s.risco_pct ?? c.risco_pct)
  if (!risco) return { ok: false, motivo: 'sem risco % na subscrição nem na conta' }
  const bruto = modo === 'multiplier' || modo === 'multiplicador' ? risco * mult : risco
  const r = riscoLimitado(bruto, pos(c.risco_max_pct))
  return r ? { ok: true, lote: { ...base, modo_lote: 'risco_pct', valor: r, origem: `mtm-auto ${modo}` } } : { ok: false, motivo: 'risco % inválido (0–10)' }
}

/**
 * Valor de 1,0 de preço por lote, na moeda da conta, a partir do valor do tick da corretora
 * (MetaApi: `lossTickValue`/`profitTickValue` do preço + `tickSize` da especificação). É o que faz o
 * risco % funcionar em pares cuja moeda de lucro não é a da conta (USDJPY numa conta em USD, EURGBP…);
 * sem isto o risco % era recusado nesses pares.
 */
export function valorPorPrecoDoTick(tickValue: number | null | undefined, tickSize: number | null | undefined): number | null {
  if (!(tickValue != null && tickValue > 0 && tickSize != null && tickSize > 0)) return null
  const v = tickValue / tickSize
  return Number.isFinite(v) && v > 0 ? v : null
}
