"use client"

/**
 * FEED DIRECTO MT4/MT5 — o SDK web da MetaApi a correr NO BROWSER do cliente, com o token restrito
 * à conta dele (só leitura, 2 h — lib/webtrader/feed-directo/emitir.ts).
 *
 * PORQUÊ O SDK E NÃO UM SOCKET.IO À MÃO. O bundle `metaapi.cloud-sdk/web` pesa ~6,8 MB minificado
 * (≈1,5 MB comprimido) e só se carrega por `import()` quando se abre uma conta MT. Pesa, mas o
 * protocolo de streaming da MetaApi não é «abrir um WebSocket e ler JSON»: é socket.io 2 com
 * sincronização por instância (instanceIndex), hashes de especificações/posições/ordens,
 * sequência de pacotes por host, re-sincronização ao reconectar e limite de subscrições por região.
 * O SDK já faz tudo isso e é o mesmo que o motor usa no servidor; uma segunda implementação à mão
 * seria mais um sítio para errar com dinheiro real. Se o peso vier a doer, a saída é um bundle
 * próprio só com `metaApiWebsocket.client` + `terminalState` — não um protocolo novo.
 *
 * Regras que este ficheiro cumpre:
 *  · 1 subscrição de cotações por símbolo VISÍVEL (quotes, G1: máx. 1 tick/2,5 s); desubscreve ao
 *    sair do ecrã — cada subscrição aberta conta para a factura;
 *  · render coalescido a ~1/s (avisador); posições/ordens/conta vêm empurradas pelo stream;
 *  · ≤5 pedidos históricos concorrentes por conta, ≤1000 velas por pedido;
 *  · reconexão é do SDK (com backoff); aqui só se traduz o estado para 'ligado' | 'caido';
 *  · NUNCA envia ordens: o token nem o permite, e a interface não tem esse método.
 */
import { agregarVelas } from '@/lib/webtrader/velas'
import type { VelaC } from '@/lib/webtrader/velas'
import { criarAvisador, criarSemaforo } from './avisador'
import {
  codigoTimeframe, construirMapa, contaDeMetaApi, fichaDeSpecMetaApi, ordemDeMetaApi, ordenarVelas, posicaoDeMetaApi, simboloDaCorretora,
  timeframeParaDerivar, velaDeMetaApi, type OrdemMetaApiMinima, type PosicaoMetaApiMinima, type SpecMetaApiMinima, type VelaMetaApiMinima,
} from './normalizar'
import { LIMITES, type CotacaoFeed, type CredenciaisFeed, type EstadoFeed, type FeedConta, type FichaMinima, type MapaSimbolos } from './tipos'

type Cred = Extract<CredenciaisFeed, { plataforma: 'metaapi' }>

// ── a superfície do SDK que se usa (tipada à mão: o d.ts do SDK é enorme e muda de versão) ───

interface PrecoSdk { symbol: string; bid: number; ask: number; time: Date | string }
interface TerminalStateSdk {
  connected: boolean
  connectedToBroker: boolean
  accountInformation: Record<string, unknown> | undefined
  positions: PosicaoMetaApiMinima[]
  orders: OrdemMetaApiMinima[]
  specifications: SpecMetaApiMinima[]
  specification(symbol: string): SpecMetaApiMinima | undefined
  price(symbol: string): PrecoSdk | undefined
}
interface LigacaoSdk {
  connect(): Promise<unknown>
  close(): Promise<void>
  waitSynchronized(o?: { timeoutInSeconds?: number }): Promise<unknown>
  subscribeToMarketData(symbol: string, subs: Array<{ type: string }>, timeoutInSeconds?: number): Promise<unknown>
  unsubscribeFromMarketData(symbol: string, subs: Array<{ type: string }>): Promise<unknown>
  addSynchronizationListener(l: object): void
  removeSynchronizationListener(l: object): void
  readonly terminalState: TerminalStateSdk
  readonly synchronized: boolean
}
interface ContaSdk {
  getStreamingConnection(historyStorage?: unknown, historyStartTime?: Date): LigacaoSdk
  getHistoricalCandles(symbol: string, timeframe: string, startTime?: Date, limit?: number): Promise<VelaMetaApiMinima[]>
}
interface MetaApiSdk {
  metatraderAccountApi: { getAccount(id: string): Promise<ContaSdk> }
  close(): void
}
interface ModuloSdk {
  default: new (token: string, opts?: Record<string, unknown>) => MetaApiSdk
  SynchronizationListener: new () => object
}

let moduloSdk: Promise<ModuloSdk> | null = null
function carregarSdk(): Promise<ModuloSdk> {
  if (!moduloSdk) {
    moduloSdk = (import('metaapi.cloud-sdk/web') as unknown as Promise<ModuloSdk>).catch((e) => { moduloSdk = null; throw e })
  }
  return moduloSdk
}

const FRESCO_MS = 10_000

export async function criarFeedMetaApi(credInicial: Cred, opcoes: { preferencias?: Record<string, string> } = {}): Promise<FeedConta> {
  const sdk = await carregarSdk()
  const avisador = criarAvisador(1000)
  const semaforo = criarSemaforo(LIMITES.metaapi.historicosConcorrentes)

  let cred = credInicial
  let api: MetaApiSdk | null = null
  let conta: ContaSdk | null = null
  let ligacao: LigacaoSdk | null = null
  let ouvinte: object | null = null
  let estado: EstadoFeed = 'caido'
  let erro: string | null = null
  let mapa: MapaSimbolos = { paraCorretora: {}, paraCanonico: {} }
  let fechado = false
  const cotacoes: Record<string, CotacaoFeed> = {}
  /** símbolos da corretora subscritos (quotes) */
  const subscritos = new Set<string>()
  let visiveis: string[] = []

  const reavaliar = () => {
    const t = ligacao?.terminalState
    const ok = !!t && t.connected && t.connectedToBroker && !!ligacao?.synchronized
    const antes = estado
    estado = ok ? 'ligado' : 'caido'
    if (antes !== estado) avisador.avisarJa()
  }

  const reconstruirMapa = () => {
    const specs = ligacao?.terminalState.specifications ?? []
    if (!specs.length) return
    mapa = construirMapa(specs.map((s) => s.symbol), opcoes.preferencias)
  }

  const aoPreco = (p: PrecoSdk) => {
    const canonico = mapa.paraCanonico[p.symbol]
    if (!canonico) return
    const ms = p.time instanceof Date ? p.time.getTime() : Date.parse(String(p.time))
    cotacoes[canonico] = { bid: Number(p.bid), ask: Number(p.ask), em: Number.isFinite(ms) ? ms : Date.now() }
  }

  const sincronizarSubscricoes = async () => {
    if (!ligacao || fechado) return
    const querer = new Set<string>()
    for (const c of visiveis) { const s = simboloDaCorretora(mapa, c); if (s) querer.add(s) }
    for (const s of [...subscritos]) {
      if (querer.has(s)) continue
      subscritos.delete(s)
      ligacao.unsubscribeFromMarketData(s, [{ type: 'quotes' }]).catch(() => {})
    }
    for (const s of querer) {
      if (subscritos.has(s)) continue
      subscritos.add(s)
      ligacao.subscribeToMarketData(s, [{ type: 'quotes' }], 30).then(() => {
        // O terminal já tem o último preço: não se espera pelo primeiro tick para pintar o ecrã.
        const p = ligacao?.terminalState.price(s)
        if (p) { aoPreco(p); avisador.avisar() }
      }).catch(() => { subscritos.delete(s) })
    }
  }

  const ligarInterno = async () => {
    const Listener = sdk.SynchronizationListener
    api = new sdk.default(cred.token, { region: cred.regiao, application: 'MetaApi', requestTimeout: 60 })
    conta = await api.metatraderAccountApi.getAccount(cred.accountId)
    // historyStartTime = agora: sem descarregar meses de deals para o browser (o histórico fica no servidor).
    ligacao = conta.getStreamingConnection(undefined, new Date())
    class Ouvinte extends Listener {
      async onConnected() { reavaliar() }
      async onDisconnected() { reavaliar() }
      async onBrokerConnectionStatusChanged() { reavaliar() }
      async onStreamClosed() { reavaliar() }
      async onSynchronizationStarted() { reconstruirMapa() }
      async onPositionsSynchronized() { reconstruirMapa(); reavaliar(); void sincronizarSubscricoes(); avisador.avisarJa() }
      async onAccountInformationUpdated() { avisador.avisar() }
      async onPositionsReplaced() { avisador.avisarJa() }
      async onPositionsUpdated() { avisador.avisarJa() }
      async onPositionUpdated() { avisador.avisarJa() }
      async onPositionRemoved() { avisador.avisarJa() }
      async onPendingOrdersReplaced() { avisador.avisarJa() }
      async onPendingOrdersUpdated() { avisador.avisarJa() }
      async onPendingOrderUpdated() { avisador.avisarJa() }
      async onPendingOrderCompleted() { avisador.avisarJa() }
      async onSymbolSpecificationsUpdated() { reconstruirMapa() }
      async onSymbolSpecificationUpdated() { reconstruirMapa() }
      async onSymbolPriceUpdated(_i: string, p: PrecoSdk) { aoPreco(p); avisador.avisar() }
      async onSymbolPricesUpdated(_i: string, ps: PrecoSdk[]) { for (const p of ps) aoPreco(p); avisador.avisar() }
    }
    ouvinte = new Ouvinte()
    ligacao.addSynchronizationListener(ouvinte)
    await ligacao.connect()
    erro = null
    // Não se bloqueia o ecrã à espera: o estado passa a 'ligado' quando as posições sincronizarem.
    ligacao.waitSynchronized({ timeoutInSeconds: 120 }).then(() => { reconstruirMapa(); reavaliar(); void sincronizarSubscricoes() }).catch(() => {
      if (!fechado) { erro = 'A conta ainda não sincronizou com a corretora.'; reavaliar() }
    })
  }

  const desligarInterno = async () => {
    const l = ligacao
    ligacao = null
    subscritos.clear()
    try { if (l && ouvinte) l.removeSynchronizationListener(ouvinte) } catch { /* já fechada */ }
    try { await l?.close() } catch { /* já fechada */ }
    try { api?.close() } catch { /* ok */ }
    api = null; conta = null; ouvinte = null
  }

  const velasDe = async (simbolo: string, codigo: string, limite: number, ate?: number): Promise<VelaC[]> => {
    if (!conta) return []
    const paginas: VelaC[] = []
    let restam = Math.max(1, limite)
    let ateAtual = ate
    // Páginas de ≤1000 para trás até ter `limite` (ou até a MetaApi não dar mais).
    for (let i = 0; i < 20 && restam > 0; i++) {
      const n = Math.min(LIMITES.metaapi.velasPorPedido, restam)
      const c = conta
      const brutas = await semaforo(() => c.getHistoricalCandles(simbolo, codigo, ateAtual ? new Date(ateAtual * 1000) : undefined, n))
      const velas = ordenarVelas(brutas.map(velaDeMetaApi))
      if (!velas.length) break
      paginas.unshift(...velas)
      restam -= velas.length
      if (velas.length < n) break
      ateAtual = velas[0].t - 1
    }
    return ordenarVelas(paginas)
  }

  const feed: FeedConta = {
    plataforma: 'metaapi',
    get estado() { return estado },
    get erro() { return erro },
    get mapa() { return mapa },
    async ligar() {
      if (fechado) return
      try { await ligarInterno() } catch (e) {
        erro = e instanceof Error ? e.message : 'Não foi possível ligar à MetaApi.'
        estado = 'caido'
        avisador.avisarJa()
        throw e
      }
    },
    verSimbolos(canonicos) {
      visiveis = [...new Set(canonicos.map((s) => s.toUpperCase()))]
      void sincronizarSubscricoes()
    },
    cotacao(c) { return cotacoes[c.toUpperCase()] ?? null },
    cotacoes() { return { ...cotacoes } },
    async velas(canonico, tf, limite, ate) {
      const simbolo = simboloDaCorretora(mapa, canonico)
      if (!simbolo) return []
      const seg = SEGUNDOS[tf]
      if (!seg) return []
      const directo = codigoTimeframe(seg, 'metaapi', cred.versao)
      if (directo) return velasDe(simbolo, directo, limite, ate)
      const fonte = timeframeParaDerivar(seg, 'metaapi', cred.versao)
      if (!fonte) return []
      const razao = seg / fonte.seg
      const base = await velasDe(simbolo, fonte.codigo, Math.min(20_000, limite * razao), ate)
      return agregarVelas(base, seg).slice(-limite)
    },
    posicoes() { return ligacao?.synchronized ? ligacao.terminalState.positions.map((p) => posicaoDeMetaApi(p, mapa)) : null },
    ordens() { return ligacao?.synchronized ? ligacao.terminalState.orders.map((o) => ordemDeMetaApi(o, mapa)).filter((o): o is NonNullable<typeof o> => o != null) : null },
    conta() { return contaDeMetaApi(ligacao?.terminalState.accountInformation as Parameters<typeof contaDeMetaApi>[0]) },
    simbolos() { return Object.keys(mapa.paraCanonico) },
    ficha(canonico): FichaMinima | null {
      const simbolo = simboloDaCorretora(mapa, canonico)
      const spec = simbolo ? ligacao?.terminalState.specification(simbolo) : undefined
      return spec ? fichaDeSpecMetaApi(mapa.paraCanonico[simbolo!] ?? canonico.toUpperCase(), spec) : null
    },
    actualizarAgora() { avisador.avisarJa() },
    async renovar(c) {
      if (c.plataforma !== 'metaapi' || fechado) return
      cred = c
      await desligarInterno()
      await ligarInterno()
    },
    aoMudar: avisador.aoMudar,
    desligar() {
      fechado = true
      void desligarInterno()
      avisador.fechar()
    },
  }
  return feed
}

/** Segundos de cada chave de timeframe do gráfico (a lista completa vive em grafico-tipos.ts). */
const SEGUNDOS: Record<string, number> = {
  M1: 60, M2: 120, M3: 180, M4: 240, M5: 300, M6: 360, M10: 600, M12: 720, M15: 900, M20: 1200, M30: 1800,
  H1: 3600, H2: 7200, H3: 10800, H4: 14400, H6: 21600, H8: 28800, H12: 43200, D1: 86400, W1: 604800, MN1: 2592000,
}
export const SEGUNDOS_TF = SEGUNDOS
export const FRESCO_CONTA_MS = FRESCO_MS
