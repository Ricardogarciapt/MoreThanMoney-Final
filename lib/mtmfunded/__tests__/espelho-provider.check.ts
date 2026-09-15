/**
 * Espelho provider: gestão da estratégia (BE, trailing, parciais) contra ticks gravados, por
 * configuração de estratégia; diff da mestre (eventos e ressincronização depois de uma queda);
 * leitura por eventos com um SDK falso; latências, comparação, veredicto e feeds.
 *
 *   npx tsx lib/mtmfunded/__tests__/espelho-provider.check.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  alvosDaTrade, configEspelho, decidirGestaoProvider, diffMestre, escadaDeSaidas, gestaoInicial, Latencias, montarComparacao,
  msEntre, percentil, pipsPonderados, razaoDeGestao, regrasDoProvider, seguirSaidaMestre, veredictoEspelho,
  type ConhecidaMestre, type RegrasEstrategia,
} from '../espelho/provider'
import { amostraFeed, resumirFeed, usarRecurso } from '../espelho/feeds'
import { tocaSl, type Simbolo } from '../simulado/matematica'
import type { PosicaoMestre } from '../espelho/calculo'
import { LeitorMestre, type LigacaoStreaming, type SdkEspelho } from '../../../services/funded-motor/espelho-leitor'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}

const XAU: Simbolo = { symbol: 'XAUUSD', classe: 'metal', digits: 2, contract_size: 100, pip_size: 0.1, spread_pontos: 20, comissao_lote: 0, volume_min: 0.01, volume_step: 0.01, volume_max: 50, alavancagem_max: 100 }
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'ticks-xauusd-espelho-provider.json'), 'utf8')) as { ticks: Array<{ t: number; bid: number; ask: number }> }

interface Evento { t: number; tipo: string; valor: number; volume?: number }

/** Reproduz os ticks numa posição do espelho como o motor faria: SL do motor primeiro, depois a gestão. */
function reproduzir(regras: RegrasEstrategia, entrada: number, slInicial: number, alvos: number[], volume: number, ticks: Array<{ t: number; bid: number; ask: number }>) {
  const est = gestaoInicial(regras, XAU, { direcao: 'buy', entrada, sl: slInicial, volume }, alvos)
  const pos = { id: 'e1', direcao: 'buy' as const, entrada, volume, sl: slInicial as number | null, tp: alvos[alvos.length - 1] ?? null }
  const ev: Evento[] = []
  const saidas: Array<{ preco: number; volume: number; em: string; motivo: string }> = []
  let adiados = 0
  for (const k of ticks) {
    if (pos.volume <= 0) break
    const p = { symbol: 'XAUUSD', bid: k.bid, ask: k.ask }
    if (tocaSl({ symbol: 'XAUUSD', direcao: 'buy', volume: pos.volume, preco_entrada: entrada, sl: pos.sl, tp: null, comissao: 0, swap: 0 }, p)) {
      ev.push({ t: k.t, tipo: 'sl', valor: pos.sl!, volume: pos.volume })
      saidas.push({ preco: pos.sl!, volume: pos.volume, em: String(k.t), motivo: 'sl' })
      pos.volume = 0
      break
    }
    const d = decidirGestaoProvider(pos, est, regras, XAU, p, {}, k.t)
    if (d.beFeito) est.gestao.be_feito = true
    if (d.slAdiado) adiados++
    for (const x of d.parciais) {
      ev.push({ t: k.t, tipo: x.fechaTudo ? 'tp_final' : `tp${x.indice + 1}`, valor: x.preco, volume: x.volume })
      saidas.push({ preco: x.preco, volume: x.volume, em: String(k.t), motivo: 'tp' })
      pos.volume = Math.round((pos.volume - x.volume) * 100) / 100
    }
    est.gestao.tps = d.tps
    if (d.novoSl != null) {
      ev.push({ t: k.t, tipo: d.motivoSl!, valor: d.novoSl })
      pos.sl = d.novoSl
      est.ultimaEscritaSlEm = k.t
    }
  }
  return { ev, saidas, pos, adiados }
}

// ── regras e alvos ─────────────────────────────────────────────────────────
{
  const r = regrasDoProvider({ slug: 'premium-ouro' })
  eq('defaults do MTM Auto: saídas 50/30/20, sem BE por TP, trailing a 5 s', [r.saidasPct, r.beDepoisTp, r.trailingTempoReal], [[50, 30, 20], null, false])
  eq('be_gatilho fora de 1..3 é apertado', regrasDoProvider({ be_gatilho: 7 }).beDepoisTp, 3)
  eq('alvos: só do lado do lucro, ordenados, sem repetidos, TP da mestre junto', alvosDaTrade('buy', 2500, [2520, 2510, 2490, 2510], 2540), [2510, 2520, 2540])
  eq('alvos de venda por ordem descendente', alvosDaTrade('sell', 2500, [2480, 2490], null), [2490, 2480])
  eq('escada normalizada a 2 alvos (75/15/10 → 83.33/16.67)', escadaDeSaidas([75, 15, 10], 2), [83.33, 16.67])
  eq('escada soma sempre 100', escadaDeSaidas([33, 33, 34], 3).reduce((a, b) => a + b, 0), 100)
  eq('config: defeito segue só fechos humanos', configEspelho(null), { seguirFechos: 'humanos', seguirParciais: false, copiarNiveisIniciais: true })
  const cfg = configEspelho({})
  eq('segue fecho humano, não o SL/TP/EA da mestre', [seguirSaidaMestre(cfg, 'DEAL_REASON_MOBILE', true), seguirSaidaMestre(cfg, 'DEAL_REASON_SL', true), seguirSaidaMestre(cfg, 'DEAL_REASON_EXPERT', true)], [true, false, false])
  eq('parciais da mestre não se seguem por defeito', seguirSaidaMestre(cfg, 'DEAL_REASON_CLIENT', false), false)
  eq('«todos» segue também o SL da mestre', seguirSaidaMestre(configEspelho({ seguirFechos: 'todos' }), 'DEAL_REASON_SL', true), true)
  eq('razões', ['DEAL_REASON_TP', 'DEAL_REASON_SO', 'DEAL_REASON_WEB', 'X'].map(razaoDeGestao), ['tp', 'stop_out', 'humana', 'desconhecida'])
}

// ── estratégia tipo Premium: arranque 12 pips, trailing 30 pips passo 2, 3 alvos, BE no TP1 ─────
{
  const regras: RegrasEstrategia = { slug: 'premium-ouro', beDepoisTp: 1, trailingArrancaPips: 12, trailingDistanciaPips: 30, trailingPassoPips: 2, saidasPct: [50, 30, 20], trailingTempoReal: true }
  const r = reproduzir(regras, 2500.2, 2480, [2510, 2520, 2540], 1, fixture.ticks)
  const tipos = r.ev.map((e) => e.tipo)
  const be = r.ev.find((e) => e.tipo === 'break_even')
  eq('BE a +12 pips: SL na entrada + 5 pips (2500.70) no tick de 2501.40', [be?.t, be?.valor], [3000, 2500.7])
  eq('TP1 fecha 50% a 2510 e TP2 30% a 2520', r.ev.filter((e) => /^tp\d/.test(e.tipo)).map((e) => [e.tipo, e.valor, e.volume]), [['tp1', 2510, 0.5], ['tp2', 2520, 0.3]])
  const trail = r.ev.filter((e) => e.tipo === 'trailing')
  eq('trailing só aperta', trail.every((e, i) => i === 0 || e.valor > trail[i - 1].valor), true)
  eq('trailing nunca abaixo do piso do BE', trail.every((e) => e.valor >= 2500.7), true)
  const movs = r.ev.filter((e) => e.tipo === 'trailing' || e.tipo === 'break_even')
  eq('cada escrita de trailing ≥ 1 s depois da anterior (tempo real)', trail.every((e) => { const i = movs.indexOf(e); return i === 0 || e.t - movs[i - 1].t >= 1000 }), true)
  eq('rajada < 1 s → escrita adiada, não perdida', r.adiados > 0, true)
  eq('último SL do trailing = pico 2525.00 − 30 pips', trail[trail.length - 1]?.valor, 2522)
  eq('o resto (20%) sai no SL do trailing no recuo a 2521.90', r.ev[r.ev.length - 1], { t: 19300, tipo: 'sl', valor: 2522, volume: 0.2 })
  eq('sequência completa', tipos.filter((t, i) => t !== tipos[i - 1]), ['break_even', 'trailing', 'tp1', 'trailing', 'tp2', 'trailing', 'sl'])
  eq('pips ponderados: 50%×98 + 30%×198 + 20%×218 = 152', pipsPonderados('buy', 2500.2, r.saidas, 1, 0.1), 152)
}

// ── estratégia tipo Sensei: sem arranque nem distância → fracções do risco; um só alvo ───────────
{
  const regras: RegrasEstrategia = { slug: 'sensei', beDepoisTp: null, trailingArrancaPips: null, trailingDistanciaPips: null, trailingPassoPips: null, saidasPct: [50, 30, 20], trailingTempoReal: false }
  const est = gestaoInicial(regras, XAU, { direcao: 'buy', entrada: 2500, sl: 2495, volume: 0.5 }, [2530])
  eq('risco 50 pips → gatilho 40% (2.0) e distância 50% (2.5), sem parciais com 1 alvo', [est.gatilho, est.distancia, est.gestao.tps], [2, 2.5, null])
  const ticks = [
    { t: 0, bid: 2500.5, ask: 2500.7 }, { t: 1000, bid: 2502.1, ask: 2502.3 }, { t: 2000, bid: 2504.0, ask: 2504.2 },
    { t: 7000, bid: 2506.0, ask: 2506.2 }, { t: 8000, bid: 2507.5, ask: 2507.7 }, { t: 13000, bid: 2508.0, ask: 2508.2 },
  ]
  const r = reproduzir(regras, 2500, 2495, [2530], 0.5, ticks)
  eq('BE a +2.0 com piso 2500.5; trailing a cada 5 s (cron): 2503.5 às 7 s e 2505.5 às 13 s', r.ev.map((e) => [e.t, e.tipo, e.valor]), [[1000, 'break_even', 2500.5], [7000, 'trailing', 2503.5], [13000, 'trailing', 2505.5]])
}

// ── BE só depois do TP2 (arranque fora de alcance) ─────────────────────────
{
  const regras: RegrasEstrategia = { slug: 'x', beDepoisTp: 2, trailingArrancaPips: 1000, trailingDistanciaPips: 30, trailingPassoPips: 2, saidasPct: [50, 30, 20], trailingTempoReal: true }
  const r = reproduzir(regras, 2500.2, 2480, [2510, 2520, 2540], 1, fixture.ticks)
  const be = r.ev.find((e) => e.tipo === 'break_even')
  eq('sem trailing (arranque 100 $) e BE só no tick a seguir ao TP2', [r.ev.some((e) => e.tipo === 'trailing'), be?.t, be?.valor], [false, 16300, 2500.7])
}

// ── diff da mestre: eventos, leitura falhada, ressincronização ─────────────
{
  const pm = (o: Partial<PosicaoMestre>): PosicaoMestre => ({ id: 'a', symbol: 'XAUUSD.s', direcao: 'buy', volume: 1, openPrice: 2500, sl: 2480, tp: 2540, time: '2026-09-15T10:00:00Z', ...o })
  const conhecidas = new Map<string, ConhecidaMestre>([['a', { volume: 1, sl: 2480, tp: 2540 }], ['b', { volume: 0.5, sl: null, tp: null }]])
  eq('leitura null → nada muda (nunca fecha por falha)', diffMestre(conhecidas, null), { novas: [], alteradas: [], removidas: [] })
  const d = diffMestre(conhecidas, [pm({ sl: 2500.5, volume: 0.5 }), pm({ id: 'c' })])
  eq('ressincronização: SL+parcial em a, c nova, b fechou durante a queda', [d.alteradas.map((x) => [x.atual.id, x.slMudou, x.volumeDesceu]), d.novas.map((x) => x.id), d.removidas], [[['a', true, true]], ['c'], ['b']])
  eq('sem mudanças → vazio', diffMestre(new Map([['a', { volume: 1, sl: 2480, tp: 2540 }]]), [pm({})]), { novas: [], alteradas: [], removidas: [] })
}

// ── comparação, latências, veredicto ────────────────────────────────────────
{
  const linha = montarComparacao({
    estrategia: 'premium-ouro', masterAccountId: 'M', espelhoAccountId: 'E', pip: 0.1,
    mestre: { id: '1', symbol: 'XAUUSD', direcao: 'buy', volumeAbertura: 1, entrada: 2500, abertaEm: 'x', saidas: [{ preco: 2510, volume: 1, em: 'x', motivo: 'tp' }], slMov: [], fechadaEm: 'y' },
    espelho: { positionId: 'p', volumeAbertura: 0.1, entrada: 2500.3, abertaEm: 'x', saidas: [{ preco: 2512, volume: 0.05, em: 'x', motivo: 'tp' }, { preco: 2505, volume: 0.05, em: 'x', motivo: 'sl' }], slMov: [], fechadaEm: 'y' },
    latenciaEntradaMs: 180, latenciaRedeMs: 420,
  })
  eq('comparação: mestre +100, espelho (117+47)/2 = 82, diferença −18, deslize +3 pips', [linha.master_pips, linha.espelho_pips, linha.diferenca_pips, linha.deslize_entrada_pips, linha.estado], [100, 82, -18, 3, 'completa'])
  eq('sem espelho → so_mestre', montarComparacao({ estrategia: 's', masterAccountId: 'M', espelhoAccountId: 'E', pip: 0.1, mestre: { id: '2', symbol: 'XAUUSD', direcao: 'sell', volumeAbertura: 1, entrada: 2500, abertaEm: null, saidas: [], slMov: [], fechadaEm: 'y' }, espelho: null, latenciaEntradaMs: null, latenciaRedeMs: null }).estado, 'so_mestre')

  const lat = new Latencias(5)
  for (const v of [10, 20, 30, 40, 50, 60, 70]) lat.registar(v)
  eq('anel guarda as últimas 5 amostras', lat.resumo(), { n: 5, p50: 50, p95: 70, max: 70 })
  lat.registar(-1); lat.registar(null)
  eq('negativos e nulos não entram', lat.resumo().n, 5)
  eq('percentil p95 de 1..20 = 19', percentil(Array.from({ length: 20 }, (_, i) => i + 1), 95), 19)
  eq('msEntre ISO → epoch', msEntre('2026-09-15T10:00:00.000Z', Date.parse('2026-09-15T10:00:01.250Z')), 1250)

  const boa = { estado: 'completa' as const, latencia_entrada_ms: 300, deslize_entrada_pips: 0.5, master_pips: 50, espelho_pips: 51, diferenca_pips: 1 }
  const v1 = veredictoEspelho(Array.from({ length: 30 }, () => boa), [400, 600, 900])
  eq('30 trades, dif +1, latências baixas, propagação medida → alinhado', [v1.alinhado, v1.razoes], [true, []])
  const v2 = veredictoEspelho([...Array.from({ length: 30 }, () => boa), { ...boa, estado: 'so_mestre' }], [400])
  eq('uma trade perdida → não alinhado', [v2.alinhado, v2.razoes.length], [false, 1])
  const v3 = veredictoEspelho(Array.from({ length: 30 }, () => ({ ...boa, diferenca_pips: 5 })), [400])
  eq('espelho MUITO melhor também não está alinhado (|dif| > 3)', v3.alinhado, false)
  const v4 = veredictoEspelho(Array.from({ length: 30 }, () => boa), [])
  eq('sem propagação medida → não alinhado', v4.razoes, ['sem medição de propagação (nenhuma rota em sombra a partir da conta espelho)'])
  const v5 = veredictoEspelho(Array.from({ length: 30 }, () => boa), Array.from({ length: 20 }, (_, i) => (i < 18 ? 500 : 10_000)))
  eq('propagação p95 10 s (motor de cópia a sondar de 10 em 10 s) → não alinhado', v5.alinhado, false)
}

// ── feeds ────────────────────────────────────────────────────────────────
{
  const a = amostraFeed({ bid: 2500, ask: 2500.2, em: 1000 }, { bid: 2500.3, ask: 2500.6, em: 1500 }, 0.1, 120, 1800)
  eq('amostra: meio +3.5 pips, spreads 2 vs 3, idade 800 ms, rtt 120', a, { difMeioPips: 3.5, spreadPrincipalPips: 2, spreadSecundarioPips: 3, idadePrincipalMs: 800, rttMs: 120 })
  eq('sem principal → sem amostra', amostraFeed(null, { bid: 1, ask: 2, em: 0 }, 0.1, 1), null)
  const r = resumirFeed([a!, { ...a!, difMeioPips: -1, rttMs: 300 }], 2)
  eq('resumo: |dif| p50 1, p95 3.5, rtt p95 300, falhas 2', [r.difMeioAbsP50, r.difMeioAbsP95, r.rttP95, r.falhas], [1, 3.5, 300, 2])
  eq('recurso só com principal velho e secundário fresco', [usarRecurso(6000, true), usarRecurso(1000, true), usarRecurso(null, true), usarRecurso(9000, false)], [true, false, true, false])
}

// ── leitura por eventos com SDK falso: evento → aoEvento, queda → ressincronização ─────────────
class SdkFalso implements SdkEspelho {
  Base = class {}
  ligacoes: Array<LigacaoStreaming & { ouvintes: Record<string, (...a: unknown[]) => Promise<void>>[] }> = []
  pedidosRpc = 0
  async streaming(): Promise<LigacaoStreaming> {
    const sdk = this
    const c = {
      ouvintes: [] as Record<string, (...a: unknown[]) => Promise<void>>[],
      terminalState: { positions: [] as Record<string, unknown>[], accountInformation: { equity: 10_000 } },
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

async function testesEventos() {
  const sdk = new SdkFalso()
  const vistos: Array<[string, unknown, number]> = []
  const leitor = new LeitorMestre('M', sdk, { log: () => undefined, aoMudar: () => undefined, aoEvento: (t, d, em) => vistos.push([t, d, em]) })
  leitor.iniciar()
  await new Promise((r) => setTimeout(r, 10))
  const c = sdk.ligacoes[0]
  const pos = { id: 'p1', type: 'POSITION_TYPE_BUY', symbol: 'XAUUSD.s', volume: 1, openPrice: 2500, stopLoss: 2480, time: new Date().toISOString() }
  c.terminalState.positions = [pos]
  await sdk.evento('onSynchronizationStarted', 'i0')
  await sdk.evento('onPendingOrdersSynchronized', 'i0')
  eq('fim da sincronização → evento «sincronizada» e leitura fiável', [vistos.map((v) => v[0]), leitor.ler()?.map((p) => p.id)], [['queda', 'sincronizada'], ['p1']])

  const antes = Date.now()
  await sdk.evento('onPositionUpdated', 'i0', { ...pos, stopLoss: 2500.5 })
  await sdk.evento('onDealAdded', 'i0', { id: 'd1', positionId: 'p1', entryType: 'DEAL_ENTRY_OUT', volume: 0.5, price: 2510, reason: 'DEAL_REASON_TP' })
  const [ultPos, ultDeal] = vistos.slice(-2)
  eq('onPositionUpdated e onDealAdded chegam no próprio evento, com a hora de chegada', [ultPos[0], (ultPos[1] as { stopLoss: number }).stopLoss, ultDeal[0], ultPos[2] >= antes], ['posicao', 2500.5, 'deal', true])

  await sdk.evento('onPositionsUpdated', 'i0', [{ ...pos, id: 'p2' }], ['p1'])
  eq('onPositionsUpdated desdobra-se em posição + removida', vistos.slice(-2).map((v) => [v[0], typeof v[1] === 'string' ? v[1] : (v[1] as { id: string }).id]), [['posicao', 'p2'], ['removida', 'p1']])

  // queda → nada fiável → ressincroniza com o estado novo
  await sdk.evento('onDisconnected', 'i0')
  eq('queda → leitura null', leitor.ler(), null)
  c.terminalState.positions = [{ ...pos, id: 'p3' }]
  await sdk.evento('onSynchronizationStarted', 'i0')
  await sdk.evento('onPendingOrdersSynchronized', 'i0')
  eq('religada → «sincronizada» outra vez e o diff vê p3 nova e p1 fechada', [vistos[vistos.length - 1][0], diffMestre(new Map([['p1', { volume: 1, sl: 2480, tp: null }]]), leitor.ler())], ['sincronizada', { novas: [{ id: 'p3', symbol: 'XAUUSD.s', direcao: 'buy', volume: 1, openPrice: 2500, sl: 2480, tp: null, time: pos.time }], alteradas: [], removidas: ['p1'] }])
  eq('zero pedidos RPC', sdk.pedidosRpc, 0)
  await leitor.fechar()
}

testesEventos().then(() => {
  if (mau) { console.error(`\n${mau} falha(s), ${ok} certo(s)`); process.exit(1) }
  console.log(`espelho-provider: todos certos (${ok})`)
}).catch((e) => { console.error(e); process.exit(1) })
