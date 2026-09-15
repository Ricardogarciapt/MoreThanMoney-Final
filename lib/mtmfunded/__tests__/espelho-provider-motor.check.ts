/**
 * Espelho provider de ponta a ponta com uma base em memória e um SDK MetaApi falso:
 * evento de posição → abre na conta espelho · ticks → BE/trailing escritos · queda → posições
 * abertas/fechadas enquanto caída reconciliadas na ressincronização · fecho pelo motor → comparação
 * gravada · fecho HUMANO da mestre (deal) → seguido. Zero RPC.
 *
 *   npx tsx lib/mtmfunded/__tests__/espelho-provider-motor.check.ts
 */
import type { LigacaoStreaming, SdkEspelho } from '../../../services/funded-motor/espelho-leitor'
import type { Simbolo } from '../simulado/matematica'

process.env.ESPELHO_PROVIDER_ESPERA_DEAL_MS = '20'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── base em memória (só o subconjunto do PostgREST que o espelho usa) ──────────
type Linha = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const tabelas: Record<string, Linha[]> = {}
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const T = (n: string) => (tabelas[n] ??= [])

function valor(l: Linha, campo: string): unknown {
  const m = campo.match(/^(\w+)->>(\w+)$/)
  if (m) return (l[m[1]] as Linha | null)?.[m[2]] ?? null
  return l[campo]
}
function projectar(l: Linha, sel: string): Linha {
  if (!sel || sel.trim() === '*') return { ...l }
  const out: Linha = {}
  for (const parte of sel.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [alias, campo] = parte.includes(':') ? parte.split(':') : [parte.replace(/.*->>/, ''), parte]
    out[alias] = valor(l, campo)
  }
  return out
}

class Q implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filtros: Array<(l: Linha) => boolean> = []
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private sel = '*'
  private dados: Linha | Linha[] | null = null
  private unico: 'single' | 'maybe' | null = null
  private conflito: string[] = []
  private voltarLinhas = false
  constructor(private tabela: string) {}
  select(s = '*') { this.sel = s; if (this.op !== 'select') this.voltarLinhas = true; return this }
  insert(d: Linha | Linha[]) { this.op = 'insert'; this.dados = d; return this }
  update(d: Linha) { this.op = 'update'; this.dados = d; return this }
  upsert(d: Linha, o?: { onConflict?: string }) { this.op = 'upsert'; this.dados = d; this.conflito = (o?.onConflict ?? 'id').split(','); return this }
  eq(c: string, v: unknown) { this.filtros.push((l) => valor(l, c) === v); return this }
  neq(c: string, v: unknown) { this.filtros.push((l) => valor(l, c) !== v); return this }
  in(c: string, vs: unknown[]) { this.filtros.push((l) => vs.includes(valor(l, c))); return this }
  is(c: string, v: null) { this.filtros.push((l) => valor(l, c) == v); return this } // eslint-disable-line eqeqeq
  not(c: string, _op: string, _v: null) { this.filtros.push((l) => valor(l, c) != null); return this }
  gte(c: string, v: string) { this.filtros.push((l) => String(valor(l, c)) >= v); return this }
  or(expr: string) {
    const conds = expr.split(',').map((x) => x.split('.'))
    this.filtros.push((l) => conds.some(([c, , v]) => String(l[c]) === v))
    return this
  }
  order() { return this }
  limit() { return this }
  single() { this.unico = 'single'; return this }
  maybeSingle() { this.unico = 'maybe'; return this }
  private correr(): { data: unknown; error: { message: string; code?: string } | null } {
    const t = T(this.tabela)
    const passa = (l: Linha) => this.filtros.every((f) => f(l))
    let linhas: Linha[] = []
    if (this.op === 'select') linhas = t.filter(passa)
    else if (this.op === 'insert') {
      for (const d of Array.isArray(this.dados) ? this.dados : [this.dados!]) {
        if (this.tabela === 'funded_espelho_posicoes' && t.some((x) => x.follower_account_id === d.follower_account_id && x.master_account_id === d.master_account_id && x.master_position_id === d.master_position_id)) {
          return { data: null, error: { message: 'duplicate', code: '23505' } }
        }
        const nova = { id: uid(), created_at: new Date().toISOString(), aberta_em: new Date().toISOString(), ...d }
        t.push(nova)
        linhas.push(nova)
      }
    } else if (this.op === 'update') {
      linhas = t.filter(passa)
      for (const l of linhas) Object.assign(l, this.dados)
    } else {
      const d = this.dados as Linha
      const existente = t.find((x) => this.conflito.every((c) => x[c] === d[c]))
      if (existente) Object.assign(existente, d)
      else t.push({ id: uid(), created_at: new Date().toISOString(), ...d })
    }
    const proj = linhas.map((l) => projectar(l, this.sel))
    if (this.unico) {
      if (this.unico === 'single' && proj.length !== 1) return { data: null, error: { message: 'not single' } }
      return { data: proj[0] ?? null, error: null }
    }
    return { data: this.op === 'select' || this.voltarLinhas ? proj : null, error: null }
  }
  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.correr()).then(ok, ko)
  }
}

const rpcs: string[] = []
const db = {
  from: (t: string) => new Q(t),
  rpc: async (nome: string, a: Linha) => {
    rpcs.push(nome)
    const P = T('funded_positions')
    if (nome === 'funded_somar_saldo') return { data: null, error: null }
    if (nome === 'funded_fechar_posicao') {
      const l = P.find((x) => x.id === a.p_id && x.estado === 'aberta')
      if (!l) return { data: false, error: null }
      Object.assign(l, { estado: 'fechada', preco_fecho: a.p_preco, pnl: a.p_pnl, motivo_fecho: a.p_motivo, tick_fecho: a.p_tick, fechada_em: new Date().toISOString() })
      return { data: true, error: null }
    }
    if (nome === 'funded_fechar_parcial') {
      const m = P.find((x) => x.id === a.p_mae && x.estado === 'aberta')
      if (!m || a.p_volume >= m.volume) return { data: null, error: null }
      m.volume = Math.round((m.volume - a.p_volume) * 100) / 100
      const f = { id: uid(), mae_id: m.id, estado: 'fechada', volume: a.p_volume, preco_fecho: a.p_preco, pnl: a.p_pnl, motivo_fecho: 'manual', tick_fecho: a.p_tick, fechada_em: new Date().toISOString(), account_id: m.account_id }
      P.push(f)
      return { data: f.id, error: null }
    }
    return { data: null, error: { message: `rpc ${nome}?` } }
  },
}

// ── SDK falso ────────────────────────────────────────────────────────────────
class SdkFalso implements SdkEspelho {
  Base = class {}
  ligacoes: Array<LigacaoStreaming & { ouvintes: Record<string, (...a: unknown[]) => Promise<void>>[] }> = []
  pedidosRpc = 0
  async streaming(): Promise<LigacaoStreaming> {
    const sdk = this
    const c = {
      ouvintes: [] as Record<string, (...a: unknown[]) => Promise<void>>[],
      terminalState: { positions: [] as Record<string, unknown>[], accountInformation: { equity: 10_000 }, specification: () => ({ contractSize: 100 }) },
      addSynchronizationListener(l: unknown) { this.ouvintes.push(l as Record<string, (...a: unknown[]) => Promise<void>>) },
      removeSynchronizationListener(l: unknown) { this.ouvintes = this.ouvintes.filter((x) => x !== l) },
      async connect() {},
      async waitSynchronized() { await new Promise(() => undefined) },
      async close() {},
      getPositions: async () => { sdk.pedidosRpc++; return [] },
    }
    this.ligacoes.push(c)
    return c
  }
  async evento(nome: string, ...args: unknown[]) {
    for (const c of this.ligacoes) for (const l of c.ouvintes) await l[nome]?.(...args)
  }
}

async function main() {
  const { iniciarEspelhoProvider, simbolosDoProvider } = await import('../../../services/funded-motor/espelho-provider')
  const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 20, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 50, alavancagem_max: 100 }
  const CONTA = uid()
  T('mtmauto_providers').push({ id: uid(), slug: 'premium-ouro', nome: 'Premium', metaapi_account_id: 'MESTRE', espelho_funded_account_id: CONTA, espelho_provider_ativo: true, espelho_config: {}, be_gatilho: 1, trailing_arranca_pips: 12, trailing_distancia_pips: 30, trailing_passo_pips: 2, saidas_pct: [50, 30, 20], trailing_tempo_real: true })
  T('mtm_trading_accounts').push({ id: CONTA, sim_saldo: 100_000, sim_equity: 100_000, alavancagem: 100, motor: 'sim', estado: 'ativa', conta_casa: true })

  const precos: Record<string, { symbol: string; bid: number; ask: number }> = {}
  const precoEm = new Map<string, number>()
  const px = (bid: number) => { precos.XAUUSD = { symbol: 'XAUUSD', bid, ask: Math.round((bid + 0.2) * 100) / 100 }; precoEm.set('XAUUSD', Date.now()) }
  px(2500)
  const sdk = new SdkFalso()
  const logs: string[] = []
  const ctl = iniciarEspelhoProvider({
    db: db as never, metaapiToken: 'x', escrita: true, log: (...a) => logs.push(a.map(String).join(' ')),
    simbolos: new Map([['XAUUSD', XAU]]), precos, precoEm, negociavel: () => true, marcarSuja: () => undefined, sdk,
  })
  await dormir(30)
  const c = sdk.ligacoes[0]
  eq('uma ligação à mestre, por streaming', sdk.ligacoes.length, 1)

  // 1.ª sincronização: uma posição ANTIGA (antes de ligar) não se copia
  const antiga = { id: 'old', type: 'POSITION_TYPE_BUY', symbol: 'XAUUSD.s', volume: 1, openPrice: 2400, stopLoss: 2390, time: new Date(Date.now() - 3600_000).toISOString() }
  c.terminalState.positions = [antiga]
  await sdk.evento('onSynchronizationStarted', 'i0')
  await sdk.evento('onPendingOrdersSynchronized', 'i0')
  await dormir(20)
  eq('posição anterior ao arranque não abre', T('funded_positions').length, 0)

  // evento: posição nova na mestre → abre já
  const p1 = { id: 'p1', type: 'POSITION_TYPE_BUY', symbol: 'XAUUSD.s', volume: 1, openPrice: 2500.1, stopLoss: 2480, takeProfit: 2540, time: new Date().toISOString(), updateTime: new Date().toISOString() }
  c.terminalState.positions = [antiga, p1]
  await sdk.evento('onPositionUpdated', 'i0', p1)
  await sdk.evento('onPositionUpdated', 'i0', p1) // repetido
  await dormir(30)
  const pos1 = T('funded_positions').find((x) => x.ideia_ref === 'espelho-provider:premium-ouro:p1')
  eq('abriu UMA vez ao nosso ask, SL/TP da mestre, lote proporcional (100k/10k × 1 = 10)', [T('funded_positions').length, pos1?.preco_entrada, pos1?.sl, pos1?.tp, pos1?.volume], [1, 2500.2, 2480, 2540, 10])
  eq('ponte + linha em_curso', [T('funded_espelho_posicoes').filter((x) => x.estado === 'aberta').length, T('espelho_comparacao')[0]?.estado], [1, 'em_curso'])
  eq('latência evento→escrita medida', typeof T('espelho_comparacao')[0]?.latencia_entrada_ms, 'number')
  eq('símbolo passa a rápido', simbolosDoProvider.has('XAUUSD'), true)

  // ticks: BE a +12 pips
  for (const b of [2500.5, 2501.0, 2501.5]) { px(b); ctl.aoTick('XAUUSD', Date.now()); await dormir(15) }
  eq('BE escrito na base: SL 2500.70', pos1?.sl, 2500.7)
  // mestre move o SL dela: registado, mas o espelho NÃO copia (gestão própria)
  const p1be = { ...p1, stopLoss: 2505, updateTime: new Date().toISOString() }
  await sdk.evento('onPositionUpdated', 'i0', p1be)
  await dormir(10)
  eq('SL da mestre não mexe no espelho', pos1?.sl, 2500.7)
  px(2506); ctl.aoTick('XAUUSD', Date.now()); await dormir(15)
  eq('trailing a menos de 1 s do BE fica adiado (tempo real = máx. 1 escrita/s)', pos1?.sl, 2500.7)
  await dormir(1000)
  px(2506.1); px(2506); ctl.aoTick('XAUUSD', Date.now()); await dormir(15)
  eq('trailing do espelho: 2506 − 30 pips = 2503.00', pos1?.sl, 2503)

  // queda: enquanto caída, a mestre fecha p1 (SL dela) e abre p2
  await sdk.evento('onDisconnected', 'i0')
  const p2 = { id: 'p2', type: 'POSITION_TYPE_SELL', symbol: 'XAUUSD.s', volume: 0.5, openPrice: 2505.9, stopLoss: 2520, takeProfit: 2490, time: new Date().toISOString() }
  c.terminalState.positions = [antiga, p2]
  await sdk.evento('onPositionRemoved', 'i0', 'p1') // evento durante a queda: ignorado
  await dormir(40)
  eq('durante a queda nada fecha nem abre', [T('funded_positions').filter((x) => x.estado === 'aberta').length, T('espelho_comparacao').length], [1, 1])
  await sdk.evento('onDealAdded', 'i0', { id: 'd1', positionId: 'p1', entryType: 'DEAL_ENTRY_OUT', volume: 1, price: 2505, reason: 'DEAL_REASON_SL', time: new Date().toISOString() })
  await sdk.evento('onSynchronizationStarted', 'i0')
  await sdk.evento('onPendingOrdersSynchronized', 'i0')
  await dormir(80)
  const pos2 = T('funded_positions').find((x) => x.ideia_ref === 'espelho-provider:premium-ouro:p2')
  eq('ressincronização: p2 (aberta na queda) abre ao nosso bid', [pos2?.direcao, pos2?.preco_entrada], ['sell', 2506])
  eq('p1 fechou na mestre por SL (gestão) → o espelho mantém-se aberto com a gestão própria', pos1?.estado, 'aberta')

  // o motor fecha p1 pelo SL do espelho → comparação completa
  Object.assign(pos1!, { estado: 'fechada', preco_fecho: 2503, motivo_fecho: 'sl', fechada_em: new Date().toISOString() })
  ctl.aoFechoLocal(pos1!.id)
  await dormir(40)
  const comp1 = T('espelho_comparacao').find((x) => x.master_position_id === 'p1')
  eq('comparação p1: mestre +49 pips (SL 2505 desde 2500.1), espelho +28 pips (SL 2503 desde 2500.2), dif −21', [comp1?.estado, comp1?.master_pips, comp1?.espelho_pips, comp1?.diferenca_pips], ['completa', 49, 28, -21])
  eq('movimentos de SL registados dos dois lados', [comp1?.master_sl_movimentos.length, comp1?.espelho_sl_movimentos.length], [2, 3])

  // fecho HUMANO da mestre em p2 → o espelho segue
  px(2500)
  await sdk.evento('onDealAdded', 'i0', { id: 'd2', positionId: 'p2', entryType: 'DEAL_ENTRY_OUT', volume: 0.5, price: 2500.2, reason: 'DEAL_REASON_MOBILE', time: new Date().toISOString() })
  c.terminalState.positions = [antiga]
  await sdk.evento('onPositionRemoved', 'i0', 'p2')
  await dormir(80)
  const comp2 = T('espelho_comparacao').find((x) => x.master_position_id === 'p2')
  eq('fecho humano seguido: espelho fechado ao nosso ask 2500.20, comparação completa', [pos2?.estado, pos2?.motivo_fecho, pos2?.preco_fecho, comp2?.estado, comp2?.master_pips, comp2?.espelho_pips], ['fechada', 'estrategia', 2500.2, 'completa', 57, 58])
  eq('zero RPC à MetaApi', sdk.pedidosRpc, 0)
  const est = ctl.estado() as { provedores: Array<{ slug: string; sincronizada: boolean }>; latencias: Record<string, { n: number }> }
  eq('estado para o pulso: sincronizada, latências com amostras', [est.provedores[0].sincronizada, est.latencias.entrada.n, est.latencias.tickSl.n > 0], [true, 2, true])
  await ctl.parar()
}

main().then(() => {
  if (mau) { console.error(`\n${mau} falha(s), ${ok} certo(s)`); process.exit(1) }
  console.log(`espelho-provider (motor): todos certos (${ok})`)
  process.exit(0)
}).catch((e) => { console.error(e); process.exit(1) })
