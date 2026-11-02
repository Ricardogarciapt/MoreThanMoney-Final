/**
 * A FICHA DE CÓPIA DE UMA CONTA — a regra pura do que o admin pode mudar numa conta de subscritor a
 * partir da gaveta da conta (Centro › Contas, backoffice Gestão › Contas & cópia).
 *
 * Porque existe: as rotas das mestres (`copia_rotas` com `mestres=true`) são DERIVADAS do que o
 * cliente escolheu (lib/mestres/planear.ts). Mexer na rota à mão não serve — a sincronização
 * seguinte desfá-la. Então o admin mexe na FONTE do desejo e o servidor ressincroniza:
 *
 *  · `site:<id>`  → mtmcopy_connections: lot_mode/lot_value/max_risk_percent, copy_sl/copy_tp,
 *                   símbolos, trailing MTMcopier, e `strategy_lots[slug]` (true = risco %, número = lote fixo)
 *  · `auto:<id>`  → mtmauto_accounts (risco, lote, BE, trailing, espelhar saídas, limites diários) e
 *                   mtmauto_subscriptions por estratégia (modo de risco, risco %, lote fixo, BE/trailing)
 *  · chave física → mestres_contas (lote fixo forçado, máx. posições, risco total, máx. lote total)
 *
 * Os limites são os da casa: os do bridge da app-mobile (lib/mtm-auto-bridge.ts) para a MTM Auto,
 * os de lib/mestres/lote.ts para o site (risco 0–10 %, lote ≤ 50) e o check da 116 para
 * mestres_contas. Puro — testado em __tests__/ficha-copia.check.ts.
 */

export type FonteFicha = 'site' | 'auto'

export type PedidoFicha =
  | { accao: 'parametros'; ref: string; campos: Record<string, unknown> }
  | { accao: 'subscricao'; ref: string; slug: string; campos: Record<string, unknown> }
  | { accao: 'ligar'; ref: string; slug: string; lote: number | null }
  | { accao: 'desligar'; ref: string; slug: string }
  | { accao: 'limites'; ref: string; campos: Record<string, unknown> }
  | { accao: 'retirar'; ref: string; confirmacao: string }

export const PALAVRA_RETIRAR = 'RETIRAR'

const REF = /^(site|auto):[0-9a-f-]{36}$/i
const SLUG = /^[a-z0-9][a-z0-9._-]{0,60}$/i

/** Lê o corpo de um pedido (vem do browser: nunca confiar na forma). */
export function lerPedidoFicha(corpo: unknown): PedidoFicha | { erro: string } {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  const ref = String(c.ref ?? '').toLowerCase()
  if (!REF.test(ref)) return { erro: 'referência inválida (só site:<id> ou auto:<id>)' }
  const campos = c.campos && typeof c.campos === 'object' ? (c.campos as Record<string, unknown>) : {}
  const slug = String(c.slug ?? '').trim()
  switch (c.accao) {
    case 'parametros': return { accao: 'parametros', ref, campos }
    case 'limites': return { accao: 'limites', ref, campos }
    case 'subscricao':
      if (!SLUG.test(slug)) return { erro: 'slug inválido' }
      return { accao: 'subscricao', ref, slug, campos }
    case 'ligar': {
      if (!SLUG.test(slug)) return { erro: 'slug inválido' }
      const lote = c.lote == null || c.lote === '' ? null : Number(c.lote)
      if (lote != null && !(lote > 0 && lote <= 50)) return { erro: 'lote fixo fora de 0–50' }
      return { accao: 'ligar', ref, slug, lote }
    }
    case 'desligar':
      if (!SLUG.test(slug)) return { erro: 'slug inválido' }
      return { accao: 'desligar', ref, slug }
    case 'retirar': return { accao: 'retirar', ref, confirmacao: String(c.confirmacao ?? '').trim() }
    default: return { erro: 'accao inválida (parametros | subscricao | ligar | desligar | limites | retirar)' }
  }
}

// ── validação de campos ─────────────────────────────────────────────────────

type Regra =
  | { tipo: 'bool' }
  | { tipo: 'num'; min: number; max: number; casas?: number; nulo?: boolean }
  | { tipo: 'enum'; valores: string[] }
  | { tipo: 'simbolos' }
  | { tipo: 'tri' }

export type Patch = { ok: true; patch: Record<string, unknown>; avisos: string[] } | { ok: false; erro: string }

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(typeof v === 'string' ? v.replace(',', '.') : v)
  return Number.isFinite(n) ? n : null
}

function aplicarRegras(campos: Record<string, unknown>, regras: Record<string, Regra>, nomes: Record<string, string>): Patch {
  const patch: Record<string, unknown> = {}
  const avisos: string[] = []
  for (const [chave, bruto] of Object.entries(campos)) {
    const regra = regras[chave]
    if (!regra) return { ok: false, erro: `campo «${chave}» não se edita por aqui` }
    const nome = nomes[chave] ?? chave
    switch (regra.tipo) {
      case 'bool':
        if (typeof bruto !== 'boolean') return { ok: false, erro: `${nome}: tem de ser sim/não` }
        patch[chave] = bruto
        break
      case 'tri':
        // herdar da conta (null) · sim · não
        if (bruto === null || bruto === '' || bruto === 'herda') { patch[chave] = null; break }
        if (typeof bruto !== 'boolean') return { ok: false, erro: `${nome}: tem de ser sim, não ou herdar` }
        patch[chave] = bruto
        break
      case 'num': {
        const n = num(bruto)
        if (n == null) {
          if (regra.nulo) { patch[chave] = null; break }
          return { ok: false, erro: `${nome}: número inválido` }
        }
        if (n < regra.min || n > regra.max) return { ok: false, erro: `${nome}: tem de ficar entre ${regra.min} e ${regra.max}` }
        patch[chave] = regra.casas != null ? Number(n.toFixed(regra.casas)) : n
        break
      }
      case 'enum': {
        const v = String(bruto ?? '').toLowerCase()
        if (!regra.valores.includes(v)) return { ok: false, erro: `${nome}: só ${regra.valores.join(' | ')}` }
        patch[chave] = v
        break
      }
      case 'simbolos': {
        const lista = Array.isArray(bruto) ? bruto : typeof bruto === 'string' ? bruto.split(/[\s,;]+/) : null
        if (!lista) return { ok: false, erro: `${nome}: lista de símbolos inválida` }
        const limpos = [...new Set(lista.map((s) => String(s).toUpperCase().trim()).filter(Boolean))]
        if (limpos.some((s) => !/^[A-Z0-9._#!-]{2,20}$/.test(s))) return { ok: false, erro: `${nome}: símbolo com caracteres estranhos` }
        patch[chave] = limpos
        break
      }
    }
  }
  if (!Object.keys(patch).length) return { ok: false, erro: 'nada para alterar' }
  return { ok: true, patch, avisos }
}

/** Ligação do site (mtmcopy_connections). Risco 0–10 % como em lib/mestres/lote.ts; lote ≤ 50. */
const REGRAS_SITE: Record<string, Regra> = {
  lot_mode: { tipo: 'enum', valores: ['risk_percent', 'fixed'] },
  lot_value: { tipo: 'num', min: 0.01, max: 50, casas: 4 },
  max_risk_percent: { tipo: 'num', min: 0.1, max: 10, casas: 4, nulo: true },
  copy_sl: { tipo: 'bool' },
  copy_tp: { tipo: 'bool' },
  symbols_whitelist: { tipo: 'simbolos' },
  auto_trailing_stop: { tipo: 'bool' },
  trailing_stop_points: { tipo: 'num', min: 1, max: 100_000, casas: 0, nulo: true },
}
export const NOMES_SITE: Record<string, string> = {
  lot_mode: 'Modo de lote', lot_value: 'Valor (lote fixo ou risco %)', max_risk_percent: 'Tecto de risco %', copy_sl: 'Copiar SL', copy_tp: 'Copiar TP',
  symbols_whitelist: 'Símbolos permitidos', auto_trailing_stop: 'Trailing stop (MTMcopier)', trailing_stop_points: 'Distância do trailing (pontos)',
}

/** Conta da MTM Auto (mtmauto_accounts) — os mesmos limites do bridge da app-mobile. */
const REGRAS_AUTO: Record<string, Regra> = {
  modo_lote: { tipo: 'enum', valores: ['risk_percent', 'fixed', 'multiplier'] },
  lote_valor: { tipo: 'num', min: 0.01, max: 50, casas: 4 },
  risco_pct: { tipo: 'num', min: 0.1, max: 5, casas: 4 },
  risco_max_pct: { tipo: 'num', min: 0.1, max: 5, casas: 4 },
  multiplicador: { tipo: 'num', min: 0.1, max: 10, casas: 2 },
  max_posicoes: { tipo: 'num', min: 1, max: 50, casas: 0 },
  copiar_sl: { tipo: 'bool' },
  copiar_tp: { tipo: 'bool' },
  simbolos_permitidos: { tipo: 'simbolos' },
  be_ativo: { tipo: 'bool' },
  be_gatilho: { tipo: 'num', min: 1, max: 3, casas: 2 },
  trailing_ativo: { tipo: 'bool' },
  espelhar_saidas: { tipo: 'bool' },
  copia_ativa: { tipo: 'bool' },
  protecao_equity: { tipo: 'bool' },
  equity_minima: { tipo: 'num', min: 1, max: 100_000_000, casas: 2, nulo: true },
  perda_diaria_max: { tipo: 'num', min: 1, max: 100_000_000, casas: 2, nulo: true },
  ganho_diario_max: { tipo: 'num', min: 1, max: 100_000_000, casas: 2, nulo: true },
}
export const NOMES_AUTO: Record<string, string> = {
  modo_lote: 'Modo de lote', lote_valor: 'Lote fixo', risco_pct: 'Risco % por operação', risco_max_pct: 'Tecto de risco %', multiplicador: 'Multiplicador',
  max_posicoes: 'Máx. posições', copiar_sl: 'Copiar SL', copiar_tp: 'Copiar TP', simbolos_permitidos: 'Símbolos permitidos', be_ativo: 'Auto break-even',
  be_gatilho: 'Gatilho do BE', trailing_ativo: 'Trailing stop', espelhar_saidas: 'Seguir as saídas do educador', copia_ativa: 'Cópia activa', protecao_equity: 'Protecção de equity',
  equity_minima: 'Equity mínima (saldo de risco)', perda_diaria_max: 'Perda diária máx.', ganho_diario_max: 'Ganho diário máx.',
}

/** Subscrição a uma estratégia na MTM Auto (mtmauto_subscriptions). `null` em BE/trailing = herda da conta. */
const REGRAS_SUB: Record<string, Regra> = {
  modo_risco: { tipo: 'enum', valores: ['conta', 'risco', 'lote', 'multiplicador'] },
  risco_pct: { tipo: 'num', min: 0.1, max: 5, casas: 4, nulo: true },
  lote_fixo: { tipo: 'num', min: 0.01, max: 50, casas: 4, nulo: true },
  multiplicador: { tipo: 'num', min: 0.1, max: 10, casas: 2, nulo: true },
  max_posicoes: { tipo: 'num', min: 1, max: 50, casas: 0, nulo: true },
  be_ativo: { tipo: 'tri' },
  trailing_ativo: { tipo: 'tri' },
  auto_aceitar: { tipo: 'bool' },
  simbolos: { tipo: 'simbolos' },
}
export const NOMES_SUB: Record<string, string> = {
  modo_risco: 'Modo de risco', risco_pct: 'Risco %', lote_fixo: 'Lote fixo', multiplicador: 'Multiplicador', max_posicoes: 'Máx. posições',
  be_ativo: 'Auto break-even', trailing_ativo: 'Trailing stop', auto_aceitar: 'Aceitação automática', simbolos: 'Símbolos',
}

/** Limites do motor por conta física (mestres_contas, 116). O modo sombra/live NÃO passa por aqui (palavra LIVE no painel). */
const REGRAS_LIMITES: Record<string, Regra> = {
  lote_fixo_forcado: { tipo: 'num', min: 0.01, max: 5, casas: 2, nulo: true },
  max_posicoes: { tipo: 'num', min: 1, max: 200, casas: 0 },
  max_risco_total_pct: { tipo: 'num', min: 0.1, max: 50, casas: 2 },
  max_lote_total: { tipo: 'num', min: 0.01, max: 1000, casas: 2, nulo: true },
}
export const NOMES_LIMITES: Record<string, string> = {
  lote_fixo_forcado: 'Lote fixo forçado (contas com bónus)', max_posicoes: 'Máx. posições na conta', max_risco_total_pct: 'Risco total máx. %', max_lote_total: 'Lote total máx.',
}

export function patchLigacaoSite(campos: Record<string, unknown>): Patch {
  const r = aplicarRegras(campos, REGRAS_SITE, NOMES_SITE)
  if (!r.ok) return r
  if (r.patch.lot_mode === 'fixed' && r.patch.lot_value == null) r.avisos.push('modo fixo: confirma o lote em «Valor»')
  if (r.patch.lot_mode === 'risk_percent' && typeof r.patch.lot_value === 'number' && r.patch.lot_value > 10) return { ok: false, erro: 'em risco % o valor tem de ficar entre 0,1 e 10' }
  return r
}

export function patchContaAuto(campos: Record<string, unknown>): Patch {
  const r = aplicarRegras(campos, REGRAS_AUTO, NOMES_AUTO)
  if (!r.ok) return r
  if (typeof r.patch.risco_pct === 'number' && typeof r.patch.risco_max_pct === 'number' && r.patch.risco_pct > r.patch.risco_max_pct) {
    return { ok: false, erro: 'o risco % não pode passar o tecto de risco' }
  }
  if (r.patch.be_ativo === false && r.patch.trailing_ativo === false) r.avisos.push('BE e trailing desligados: o SL da mestre passa a ser copiado tal e qual (copiar_modificacoes)')
  return r
}

export function patchSubscricaoAuto(campos: Record<string, unknown>): Patch {
  const r = aplicarRegras(campos, REGRAS_SUB, NOMES_SUB)
  if (!r.ok) return r
  if (r.patch.modo_risco === 'lote' && r.patch.lote_fixo == null && !('lote_fixo' in campos)) r.avisos.push('modo lote sem lote fixo: o motor usa 0,01')
  if (r.patch.modo_risco === 'risco' && r.patch.risco_pct == null && !('risco_pct' in campos)) r.avisos.push('modo risco sem risco %: cai para o risco da conta')
  return r
}

export function patchMestresConta(campos: Record<string, unknown>): Patch {
  if ('notas' in campos) return { ok: false, erro: 'as notas não se editam por aqui' }
  return aplicarRegras(campos, REGRAS_LIMITES, NOMES_LIMITES)
}

/**
 * RETIRAR a conta da cópia — o que se escreve na fonte para a conta deixar de seguir TODAS as
 * estratégias. Nunca apaga linhas: `planoDeEscrita` pausa as rotas com posições abertas até fecharem
 * e desliga as que não têm nada. A conta em si (ligação MetaApi / linha MTM Auto) fica.
 *
 *  · site: `strategy_lots` vazio e `copyfactory_strategy_pick` a null (os dois caminhos de
 *    `ligacaoSegueEstrategia`). Se seguia por GRUPO de Telegram (Premium: `copy_method`
 *    `telegram_group` ou vazio), `copy_method` passa a `strategy` — é a única forma de
 *    `ligacaoSegueGrupoTelegram` dizer não, porque uma lista de grupos vazia vale «premium».
 *  · auto: devolve a lista de subscrições a desactivar (ativo=false, auto_aceitar=false).
 */
export function patchRetirarSite(l: { copy_method?: string | null }): Record<string, unknown> {
  const patch: Record<string, unknown> = { strategy_lots: {}, copyfactory_strategy_pick: null }
  const metodo = l.copy_method ?? 'telegram_group'
  if (metodo === 'telegram_group') patch.copy_method = 'strategy'
  return patch
}

// ── o que a ficha mostra ────────────────────────────────────────────────────

export interface EstrategiaDaFicha {
  slug: string
  nome: string
  providerId: string
  /** a estratégia aceita contas MTM Auto como seguidoras (mestres_estrategias.incluir_mtmauto) */
  incluirMtmauto: boolean
  modoMotor: string
  /** a conta segue esta estratégia pela fonte (site: strategy_lots/pick/grupo; auto: subscrição activa + auto-aceitar) */
  segue: boolean
  /** como entrou (site): 'strategy_lots' | 'pick' | 'grupo Telegram'; (auto): 'subscrição' */
  via: string | null
  /** site: o valor em strategy_lots (true = risco da ligação; número = lote fixo) */
  loteSite: number | true | null
  /** o que a regra de lote dá para a rota (lib/mestres/lote.ts), ou o motivo da recusa */
  lotePrevisto: { ok: true; texto: string; origem: string } | { ok: false; motivo: string } | null
  /** auto: a subscrição (null = não existe) */
  subscricao: {
    id: string; ativo: boolean; autoAceitar: boolean; contaId: string | null; modoRisco: string | null; riscoPct: number | null; loteFixo: number | null
    multiplicador: number | null; maxPosicoes: number | null; beAtivo: boolean | null; trailingAtivo: boolean | null; simbolos: string[]
    /** a subscrição aponta para OUTRA conta deste utilizador */
    noutraConta: boolean
  } | null
  /** a rota derivada que existe hoje em copia_rotas (null = ainda não nasceu) */
  rota: { id: string; ativa: boolean; modo: string; estado: string; modoLote: string; valor: number; pausadaMotivo: string | null; copiarParciais: boolean; copiarModificacoes: boolean; abertas: number } | null
}

/** «risco 0,4 %», «0,02 lotes» — o lote da rota em palavras (mesmo formato do quadro de cópias). */
export function textoLote(modo: string, valor: number): string {
  const n = (v: number) => v.toLocaleString('pt-PT', { maximumFractionDigits: 4 })
  switch (modo) {
    case 'fixo': return `${n(valor)} lotes`
    case 'risco_pct': return `risco ${n(valor)} %`
    case 'multiplicador': return `×${n(valor)}`
    case 'proporcional_saldo': return `proporcional ao saldo (×${n(valor)})`
    default: return `${modo} ${n(valor)}`
  }
}
