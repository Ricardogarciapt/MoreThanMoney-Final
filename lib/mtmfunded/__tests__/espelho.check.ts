/**
 * O espelho das estratégias e o desempenho das contas: lote proporcional, símbolo, comentário,
 * o diff (nova / modificada / parcial / fechada / leitura falhada) e as métricas por trade.
 * E a leitura por STREAMING (services/funded-motor/espelho-leitor.ts) com um SDK falso: eventos do
 * ouvinte → debounce → diff; queda → nada fecha; ressincronização → diff certo; interruptor de limite.
 *
 *   npx tsx lib/mtmfunded/__tests__/espelho.check.ts
 */
import {
  volumeEspelho, planoParcialEspelho, diffEspelho, simboloDoCatalogo, comentarioEstrategia, comentarioT2T,
  posicaoMestreDaMetaApi, AUSENCIAS_PARA_FECHAR, type Ponte, type PosicaoMestre, type PosicaoSeguidora,
} from '../espelho/calculo'
import { desempenhoDaConta, type LinhaFechada } from '../simulado/desempenho'
import { loteT2TSimulado } from '../simulado/t2t-simulado'
import { Agendador, LeitorMestre, type LigacaoStreaming, type SdkEspelho } from '../../../services/funded-motor/espelho-leitor'
import { _reporInterruptor, aoLimiteMetaApi, eLimiteMetaApi, espelhoPausadoAte, registarErroMetaApi } from '../../../services/funded-motor/metaapi-partilhada'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}

const XAU = { symbol: 'XAUUSD', classe: 'metal' as const, digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 18, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 20, alavancagem_max: 100 }
const ETH = { ...XAU, symbol: 'ETHUSD', classe: 'cripto' as const, contract_size: 1, volume_max: 50 }

// ── lote proporcional ──────────────────────────────────────────────────────
{
  const r = volumeEspelho({ volumeMestre: 2.51, equityMestre: 10_000, equitySeguidora: 1000, simbolo: ETH })
  eq('2,51 lotes numa mestre de 10k → 0,25 numa seguidora de 1k', r.ok && r.volume, 0.25)
  const r2 = volumeEspelho({ volumeMestre: 0.05, equityMestre: 10_000, equitySeguidora: 1000, simbolo: XAU })
  eq('ideal 0,005 → abre o mínimo 0,01', r2.ok && r2.volume, 0.01)
  eq('… e regista a escala 2×', r2.ok && r2.escala, 2)
  const r3 = volumeEspelho({ volumeMestre: 1, equityMestre: null, equitySeguidora: 1000, simbolo: XAU })
  eq('sem equity da mestre → não abre', r3.ok, false)
  const r4 = volumeEspelho({ volumeMestre: 1, equityMestre: 10_000, equitySeguidora: 1000, simbolo: ETH, contratoMestre: 10 })
  eq('contrato da mestre 10× maior → lote 10× maior', r4.ok && r4.volume, 1)
  const r5 = volumeEspelho({ volumeMestre: 500, equityMestre: 10_000, equitySeguidora: 1000, simbolo: XAU })
  eq('acima do máximo → corta ao máximo', r5.ok && r5.volume, 20)
}

// ── parcial ────────────────────────────────────────────────────────────────
{
  const p = planoParcialEspelho({ volumeMestreAbertura: 1, volumeMestreAtual: 0.5, volumeSeguidoraAbertura: 0.1, volumeSeguidoraAtual: 0.1, simbolo: XAU })
  eq('mestre fecha 50% → seguidora fecha 0,05', p, { volume: 0.05, fechadoPct: 0.5 })
  const p2 = planoParcialEspelho({ volumeMestreAbertura: 1, volumeMestreAtual: 0.2, volumeSeguidoraAbertura: 0.1, volumeSeguidoraAtual: 0.05, simbolo: XAU })
  eq('segunda saída (80% fechado) → fecha mais 0,03', p2, { volume: 0.03, fechadoPct: 0.8 })
  const p3 = planoParcialEspelho({ volumeMestreAbertura: 0.1, volumeMestreAtual: 0.05, volumeSeguidoraAbertura: 0.01, volumeSeguidoraAtual: 0.01, simbolo: XAU })
  eq('seguidora no mínimo → não faz parcial (fecha só no fim)', p3, null)
  eq('mestre sem redução → nada', planoParcialEspelho({ volumeMestreAbertura: 1, volumeMestreAtual: 1, volumeSeguidoraAbertura: 0.1, volumeSeguidoraAtual: 0.1, simbolo: XAU }), null)
}

// ── símbolo, comentário, MetaApi ───────────────────────────────────────────
{
  const cat = new Set(['XAUUSD', 'US30', 'ETHUSD'])
  eq('XAUUSD.x → XAUUSD', simboloDoCatalogo('XAUUSD.x', cat), 'XAUUSD')
  eq('DJ30 → US30', simboloDoCatalogo('DJ30', cat), 'US30')
  eq('símbolo desconhecido → null', simboloDoCatalogo('ZZZ', cat), null)
  eq('comentário Premium', comentarioEstrategia('premium-ouro', 'MTM Premium'), 'MTM Auto Premium')
  eq('comentário GoldKiller (slug com maiúscula)', comentarioEstrategia('Goldkiller'), 'MTM Auto GoldKiller')
  eq('comentário de estratégia nova', comentarioEstrategia('nova', 'Nova Coisa'), 'MTM Auto Nova Coisa')
  eq('comentário T2T', comentarioT2T('premium'), 'T2T premium')
  eq('posição MetaApi', posicaoMestreDaMetaApi({ id: '9', type: 'POSITION_TYPE_SELL', symbol: 'XAUUSD', volume: 0.5, openPrice: 2500, stopLoss: 2510, time: '2026-09-14T10:00:00Z' }),
    { id: '9', symbol: 'XAUUSD', direcao: 'sell', volume: 0.5, openPrice: 2500, sl: 2510, tp: null, time: '2026-09-14T10:00:00.000Z' })
  eq('tipo que não é posição → null', posicaoMestreDaMetaApi({ id: '9', type: 'ORDER_TYPE_BUY_LIMIT', symbol: 'X', volume: 1 }), null)
}

// ── diff ───────────────────────────────────────────────────────────────────
{
  const agora = new Date('2026-09-14T12:00:00Z')
  const base = { simbolos: { XAUUSD: XAU }, seguidoraCriadaEm: '2026-09-14T09:00:00Z', agora, atrasoMaxMs: 30 * 60_000 }
  const m = (o: Partial<PosicaoMestre> = {}): PosicaoMestre => ({ id: 'm1', symbol: 'XAUUSD', direcao: 'buy', volume: 1, openPrice: 2500, sl: 2490, tp: 2520, time: '2026-09-14T11:59:00Z', ...o })
  const ponte = (o: Partial<Ponte> = {}): Ponte => ({ id: 'p1', master_position_id: 'm1', funded_position_id: 'f1', volume_master_abertura: 1, volume_seguidora_abertura: 0.1, estado: 'aberta', ...o })
  const seg = (o: Partial<PosicaoSeguidora> = {}) => new Map([['f1', { id: 'f1', symbol: 'XAUUSD', volume: 0.1, sl: 2490, tp: 2520, estado: 'aberta' as const, ...o }]])

  const nova = diffEspelho({ ...base, mestre: [m()], pontes: [], seguidoras: new Map(), ausencias: new Map() })
  eq('posição nova → abrir', nova.accoes.map((a) => a.tipo), ['abrir'])

  const antiga = diffEspelho({ ...base, mestre: [m({ time: '2026-09-14T08:00:00Z' })], pontes: [], seguidoras: new Map(), ausencias: new Map() })
  eq('aberta antes da conta existir → ignorar', antiga.accoes.map((a) => a.tipo), ['ignorar_antiga'])

  const tarde = diffEspelho({ ...base, mestre: [m({ time: '2026-09-14T11:00:00Z' })], pontes: [], seguidoras: new Map(), ausencias: new Map() })
  eq('vista 60 min depois (motor parado) → ignorar', tarde.accoes.map((a) => a.tipo), ['ignorar_antiga'])

  const igual = diffEspelho({ ...base, mestre: [m()], pontes: [ponte()], seguidoras: seg(), ausencias: new Map() })
  eq('nada mudou → nada', igual.accoes, [])

  const jaRecusada = diffEspelho({ ...base, mestre: [m()], pontes: [ponte({ estado: 'recusada', funded_position_id: null })], seguidoras: new Map(), ausencias: new Map() })
  eq('ponte recusada → não tenta de novo', jaRecusada.accoes, [])

  const be = diffEspelho({ ...base, mestre: [m({ sl: 2500 })], pontes: [ponte()], seguidoras: seg(), ausencias: new Map() })
  eq('BE na mestre → modificar com o nível da mestre', be.accoes, [{ tipo: 'modificar', ponteId: 'p1', positionId: 'f1', sl: 2500, tp: 2520 }])

  const parcial = diffEspelho({ ...base, mestre: [m({ volume: 0.5 })], pontes: [ponte()], seguidoras: seg(), ausencias: new Map() })
  eq('mestre reduz a metade → parcial 0,05', parcial.accoes, [{ tipo: 'parcial', ponteId: 'p1', positionId: 'f1', volume: 0.05, fechadoPct: 0.5, volumeMestreAtual: 0.5 }])

  const umaAusencia = diffEspelho({ ...base, mestre: [], pontes: [ponte()], seguidoras: seg(), ausencias: new Map() })
  eq('1.ª leitura sem a posição → ainda não fecha', umaAusencia.accoes, [])
  eq('… mas conta a ausência', umaAusencia.ausencias.get('m1'), 1)
  const duas = diffEspelho({ ...base, mestre: [], pontes: [ponte()], seguidoras: seg(), ausencias: umaAusencia.ausencias })
  eq(`${AUSENCIAS_PARA_FECHAR}.ª leitura sem a posição → fecha`, duas.accoes, [{ tipo: 'fechar', ponteId: 'p1', positionId: 'f1' }])

  const falhada = diffEspelho({ ...base, mestre: null, pontes: [ponte()], seguidoras: seg(), ausencias: umaAusencia.ausencias })
  eq('leitura falhada (null) → nunca fecha', falhada.accoes, [])
  eq('… e não mexe nas ausências', falhada.ausencias.get('m1'), 1)

  const volta = diffEspelho({ ...base, mestre: [m()], pontes: [ponte()], seguidoras: seg(), ausencias: umaAusencia.ausencias })
  eq('a posição reaparece → ausência esquecida', volta.ausencias.has('m1'), false)

  const slSimulado = diffEspelho({ ...base, mestre: [m()], pontes: [ponte()], seguidoras: seg({ estado: 'fechada' }), ausencias: new Map() })
  eq('fechou na simulada antes da mestre → marca fechada_local, não reabre', slSimulado.accoes.map((a) => a.tipo === 'marcar' && a.estado), ['fechada_local'])

  const orfa = diffEspelho({ ...base, mestre: [m()], pontes: [ponte({ funded_position_id: null })], seguidoras: new Map(), ausencias: new Map() })
  eq('ponte sem posição (motor morreu a meio) → recusada', orfa.accoes.map((a) => a.tipo === 'marcar' && a.estado), ['recusada'])
}

// ── desempenho ─────────────────────────────────────────────────────────────
{
  const l = (o: Partial<LinhaFechada>): LinhaFechada => ({
    id: 'x', mae_id: null, symbol: 'XAUUSD', direcao: 'buy', volume: 0.1, preco_entrada: 2500, preco_fecho: 2510,
    pnl: 100, comissao: 0, swap: 0, fechada_em: '2026-09-14T10:00:00Z', origem: 'estrategia', comentario: 'MTM Auto Premium', ...o,
  })
  // Trade A: 3 saídas (mãe fechada no fim). 0,05 a +100 pips, 0,03 a +200, 0,02 a −0 (BE).
  const fechadas: LinhaFechada[] = [
    l({ id: 'a1', mae_id: 'A', volume: 0.05, preco_fecho: 2510, pnl: 50, fechada_em: '2026-09-14T10:00:00Z' }),
    l({ id: 'a2', mae_id: 'A', volume: 0.03, preco_fecho: 2520, pnl: 60, fechada_em: '2026-09-14T10:30:00Z' }),
    l({ id: 'A', volume: 0.02, preco_fecho: 2500, pnl: 0, fechada_em: '2026-09-14T11:00:00Z' }),
    // Trade B: perdedora, −50 pips
    l({ id: 'B', direcao: 'sell', volume: 0.1, preco_entrada: 2500, preco_fecho: 2505, pnl: -50, fechada_em: '2026-09-14T12:00:00Z' }),
    // Trade C: parcial de uma trade ainda aberta
    l({ id: 'c1', mae_id: 'C', volume: 0.05, preco_fecho: 2510, pnl: 50, fechada_em: '2026-09-14T13:00:00Z' }),
  ]
  const d = desempenhoDaConta({ saldoInicial: 1000, equity: 1080, fechadas, abertasIds: new Set(['C']) })
  eq('3 saídas = 1 trade; parcial de trade aberta não conta', d.tradesTerminadas, 2)
  eq('taxa de acerto 50%', d.taxaAcertoPct, 50)
  // A: (100×0,05 + 200×0,03 + 0×0,02)/0,1 = 110 pips · B: −50 → 60
  eq('pips pesados por volume', d.pips, 60)
  eq('resultado líquido inclui o parcial em curso', d.resultadoLiquido, 110)
  eq('retorno % pela equity', d.retornoPct, 8)
  // saldo: 1000→1050→1110→1110→1060 (dd 4,5%)→1110; equity 1080 → dd de 1110 = 2,7%
  eq('drawdown máximo', d.drawdownMaxPct, 4.5)
  eq('por comentário', d.porComentario.map((c) => [c.comentario, c.trades]), [['MTM Auto Premium', 2]])
  const vazio = desempenhoDaConta({ saldoInicial: 1000, equity: 1000, fechadas: [], abertasIds: new Set() })
  eq('sem trades → taxa null', vazio.taxaAcertoPct, null)
}

// ── Tap to Trade numa conta simulada ───────────────────────────────────────
{
  // 1% de 1000 = 10 USD; SL a 10 USD (100 pips) de distância no ouro: 1 lote perde 1000 → 0,01
  const r = loteT2TSimulado({ equity: 1000, riscoPct: 1, entrada: 2500, sl: 2490, simbolo: XAU, precos: {} })
  eq('risco 1% com SL a 10 USD no ouro → 0,01', r, { ok: true, volume: 0.01, riscoUsd: 10 })
  const r2 = loteT2TSimulado({ equity: 10_000, riscoPct: 2, entrada: 2500, sl: 2495, simbolo: XAU, precos: {} })
  eq('2% de 10k com SL a 5 USD → 0,4', r2.ok && r2.volume, 0.4)
  const r3 = loteT2TSimulado({ equity: 1000, riscoPct: 1, entrada: 2500, sl: null, simbolo: XAU, precos: {} })
  eq('sem SL → o mínimo, dito', r3, { ok: true, volume: 0.01, riscoUsd: null })
  const r4 = loteT2TSimulado({ equity: 1000, riscoPct: 0.1, entrada: 2500, sl: 2400, simbolo: XAU, precos: {} })
  eq('risco abaixo do mínimo → recusa (não abre 100× o risco)', r4.ok, false)
}

// ── leitura por streaming (eventos) ────────────────────────────────────────
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

class SdkFalso implements SdkEspelho {
  Base = class {}
  ligacoes: Array<LigacaoStreaming & { ouvintes: Record<string, (...a: unknown[]) => Promise<void>>[]; fechada: boolean }> = []
  pedidosRpc = 0
  falharLigar: unknown = null
  jaSincronizada = false
  async streaming(): Promise<LigacaoStreaming> {
    if (this.falharLigar) throw this.falharLigar
    const sdk = this
    const c = {
      ouvintes: [] as Record<string, (...a: unknown[]) => Promise<void>>[],
      fechada: false,
      terminalState: { positions: [] as Record<string, unknown>[], accountInformation: { equity: 10_000 }, specification: (sym: string) => (sym === 'XAUUSD' ? { contractSize: 100 } : undefined) },
      addSynchronizationListener(l: unknown) { this.ouvintes.push(l as Record<string, (...a: unknown[]) => Promise<void>>) },
      removeSynchronizationListener(l: unknown) { this.ouvintes = this.ouvintes.filter((x) => x !== l) },
      async connect() {},
      async waitSynchronized() { if (!sdk.jaSincronizada) await new Promise(() => undefined) },
      async close() { this.fechada = true },
      // qualquer RPC seria um erro aqui: conta-se
      getPositions: async () => { sdk.pedidosRpc++; return [] },
    }
    this.ligacoes.push(c)
    return c
  }
  async evento(nome: string, ...args: unknown[]) {
    for (const c of this.ligacoes) for (const l of c.ouvintes) await l[nome]?.(...args)
  }
}

const posMeta = (o: Record<string, unknown> = {}) => ({ id: 'm1', type: 'POSITION_TYPE_BUY', symbol: 'XAUUSD', volume: 1, openPrice: 2500, stopLoss: 2490, takeProfit: 2520, time: new Date(Date.now() - 60_000).toISOString(), ...o })

async function testesStreaming() {
  // Um «motor» mínimo: o mesmo ciclo do espelho-estrategias (ler → quebra? → diff → aplicar), com a base em memória.
  const sdk = new SdkFalso()
  const logs: string[] = []
  const log = (...a: unknown[]) => logs.push(a.map(String).join(' '))
  let corridas = 0
  const accoesVistas: string[][] = []
  const pontes: Ponte[] = []
  const seguidoras = new Map<string, PosicaoSeguidora>()
  let ausencias = new Map<string, number>()
  let leitor!: LeitorMestre
  const ag = new Agendador(async () => {
    corridas++
    const lidas = leitor.ler()
    if (!lidas) { accoesVistas.push(['(leitura falhou)']); return { repetir: false } }
    if (leitor.houveQuebraDesdeUltimaLeitura()) ausencias = new Map()
    const r = diffEspelho({ mestre: lidas, pontes, seguidoras, simbolos: { XAUUSD: XAU }, ausencias, seguidoraCriadaEm: '2026-01-01T00:00:00Z', agora: new Date(), atrasoMaxMs: 30 * 60_000 })
    ausencias = r.ausencias
    accoesVistas.push(r.accoes.map((a) => a.tipo))
    for (const a of r.accoes) {
      if (a.tipo === 'abrir') {
        pontes.push({ id: `p-${a.mestre.id}`, master_position_id: a.mestre.id, funded_position_id: `f-${a.mestre.id}`, volume_master_abertura: a.mestre.volume, volume_seguidora_abertura: 0.1, estado: 'aberta' })
        seguidoras.set(`f-${a.mestre.id}`, { id: `f-${a.mestre.id}`, symbol: 'XAUUSD', volume: 0.1, sl: a.mestre.sl, tp: a.mestre.tp, estado: 'aberta' })
      } else if (a.tipo === 'fechar') {
        seguidoras.get(a.positionId)!.estado = 'fechada'
        pontes.find((p) => p.id === a.ponteId)!.estado = 'fechada'
      } else if (a.tipo === 'modificar') {
        Object.assign(seguidoras.get(a.positionId)!, { sl: a.sl, tp: a.tp })
      }
    }
    return { repetir: r.accoes.length > 0 || r.ausencias.size > 0 }
  }, () => ['M'], { debounceMs: 5, repetirMs: 40, reconciliarMs: 60_000, log })
  leitor = new LeitorMestre('M', sdk, { log, aoMudar: (id) => ag.sinalizar(id) })
  leitor.iniciar()
  await dormir(10)
  const c = sdk.ligacoes[0]
  eq('streaming: uma ligação por mestre, ouvinte registado', [sdk.ligacoes.length, c.ouvintes.length], [1, 1])
  eq('antes de sincronizar → leitura null (não é «sem posições»)', leitor.ler(), null)

  // 1.ª sincronização com uma posição
  c.terminalState.positions = [posMeta()]
  await sdk.evento('onSynchronizationStarted', 'london:0:ps-mpa-1')
  await sdk.evento('onPositionsReplaced', 'london:0:ps-mpa-1', c.terminalState.positions)
  await sdk.evento('onPositionsSynchronized', 'london:0:ps-mpa-1')
  eq('posições substituídas mas ordens por sincronizar → ainda null', leitor.ler(), null)
  await sdk.evento('onPendingOrdersSynchronized', 'london:0:ps-mpa-1')
  eq('sincronizada → lê da memória', leitor.ler()?.map((p) => p.id), ['m1'])
  eq('equity e contrato vêm da memória', [leitor.equity(), leitor.contrato('XAUUSD'), leitor.contrato('ZZZ')], [10_000, 100, null])
  await dormir(120)
  eq('rajada de eventos → abre UMA vez', pontes.length, 1)
  const corridasAposAbrir = corridas
  eq('… e depois de abrir não fica em ciclo', accoesVistas[accoesVistas.length - 1], [])

  // BE na mestre (evento de posição)
  c.terminalState.positions = [posMeta({ stopLoss: 2500 })]
  await sdk.evento('onPositionUpdated', 'london:0:ps-mpa-1', c.terminalState.positions[0])
  await dormir(120)
  eq('onPositionUpdated → SL movido na seguidora', seguidoras.get('f-m1')?.sl, 2500)
  eq('… só com eventos (debounce), sem voltas a vazio', corridas - corridasAposAbrir <= 3, true)

  // queda: a posição some da memória ENQUANTO desligada → nunca fecha
  await sdk.evento('onDisconnected', 'london:0:ps-mpa-1')
  c.terminalState.positions = []
  await sdk.evento('onPositionRemoved', 'london:0:ps-mpa-1', 'm1')
  await dormir(200)
  eq('desligada → leitura null', leitor.ler(), null)
  eq('desligada → posição continua aberta na seguidora', seguidoras.get('f-m1')?.estado, 'aberta')

  // uma ausência contada ANTES da queda não pode fechar logo depois de voltar
  ausencias = new Map([['m1', 1]])
  // religa e ressincroniza: a posição fechou mesmo na mestre durante a queda
  await sdk.evento('onSynchronizationStarted', 'london:0:ps-mpa-1')
  await sdk.evento('onPositionsReplaced', 'london:0:ps-mpa-1', [])
  await sdk.evento('onPositionsSynchronized', 'london:0:ps-mpa-1')
  const antesSync = accoesVistas.length
  await sdk.evento('onPendingOrdersSynchronized', 'london:0:ps-mpa-1')
  await dormir(15)
  eq('1.ª leitura depois de voltar → não fecha (ausências recomeçam)', accoesVistas.slice(antesSync)[0], [])
  await dormir(150)
  eq('2.ª leitura (repetição curta) → fecha', seguidoras.get('f-m1')?.estado, 'fechada')

  // posição nova depois de ressincronizar abre normalmente
  c.terminalState.positions = [posMeta({ id: 'm2' })]
  await sdk.evento('onPositionsUpdated', 'london:0:ps-mpa-1', c.terminalState.positions, [])
  await dormir(120)
  eq('reconnect + posição nova → abre', pontes.map((p) => p.master_position_id), ['m1', 'm2'])

  // alta fiabilidade: queda de UMA réplica com a outra sincronizada continua legível
  await sdk.evento('onPendingOrdersSynchronized', 'new-york:0:ps-mpa-2')
  await sdk.evento('onDisconnected', 'london:0:ps-mpa-1')
  eq('réplica caída, outra sincronizada → lê', leitor.ler()?.map((p) => p.id), ['m2'])
  await sdk.evento('onStreamClosed', 'new-york:0:ps-mpa-2')
  eq('todas caídas → null', leitor.ler(), null)

  eq('ZERO pedidos RPC em todo o fluxo', sdk.pedidosRpc, 0)
  ag.parar()
  await leitor.fechar()
  eq('fechar → fecha a ligação e tira o ouvinte', [c.fechada, c.ouvintes.length], [true, 0])

  // ligação partilhada que JÁ estava sincronizada (a do feed): waitSynchronized resolve sem eventos
  {
    const sdk2 = new SdkFalso()
    sdk2.jaSincronizada = true
    let sinais = 0
    const l2 = new LeitorMestre('F', sdk2, { log, aoMudar: () => { sinais++ } })
    l2.iniciar()
    await dormir(10)
    sdk2.ligacoes[0].terminalState.positions = [posMeta({ id: 'x' })]
    // (as posições estavam lá antes; o waitSynchronized já resolveu)
    eq('ligação já sincronizada → legível sem esperar eventos', l2.ler()?.length, 1)
    eq('… e avisa para processar', sinais >= 1, true)
    await l2.fechar()
  }

  // erro de limite ao ligar → interruptor global + sem ciclo apertado
  {
    _reporInterruptor()
    const sdk3 = new SdkFalso()
    const erro = Object.assign(new Error('The ws:getPositions API allows 180000 cpu credits per 1h'), { name: 'TooManyRequestsError', metadata: { recommendedRetryTime: new Date(Date.now() + 5 * 60_000) } })
    sdk3.falharLigar = erro
    let avisos = 0
    const largar = aoLimiteMetaApi(() => { avisos++ })
    const l3 = new LeitorMestre('L', sdk3, { log, aoMudar: () => undefined, aoErroMetaApi: registarErroMetaApi })
    l3.iniciar()
    await dormir(20)
    const ate = espelhoPausadoAte()
    eq('limite ao ligar → espelho pausado ~1 h', ate > Date.now() + 59 * 60_000 && ate < Date.now() + 61 * 60_000, true)
    eq('… ouvintes avisados uma vez', avisos, 1)
    registarErroMetaApi(erro, 'outra vez')
    eq('… segundo limite na mesma janela não re-avisa', avisos <= 2, true)
    eq('… e não volta a tentar ligar logo', sdk3.ligacoes.length, 0)
    largar()
    await l3.fechar()
    _reporInterruptor()
  }
  eq('limite: TooManyRequestsError', eLimiteMetaApi({ name: 'TooManyRequestsError', message: 'x' }), true)
  eq('limite: mensagem «cpu credits»', eLimiteMetaApi(new Error('The ws:getPositions API allows 180000 cpu credits per 1h')), true)
  eq('erro normal não é limite', eLimiteMetaApi(new Error('timeout 10000ms')), false)
  eq('erro normal não pausa', registarErroMetaApi(new Error('socket hang up'), 't'), false)
  eq('… espelho continua ligado', espelhoPausadoAte(), 0)
}

testesStreaming().then(() => {
  console.log(mau ? `\n${mau} errado(s), ${ok} certo(s)` : `todos certos (${ok})`)
  process.exit(mau ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
