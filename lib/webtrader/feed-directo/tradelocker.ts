"use client"

/**
 * FEED DIRECTO TRADELOCKER — `fetch` do browser do cliente à API pública da TradeLocker
 * (live|demo.tradelocker.com/backend-api, CORS `*`), com o accessToken curto que o servidor emitiu
 * (lib/webtrader/feed-directo/emitir.ts). O refreshToken nunca chega aqui: quando o Bearer caduca
 * (401) o hook volta a pedir ao servidor.
 *
 * A TradeLocker NÃO tem WebSocket de preços, por isso tudo é sondagem, dentro dos limites públicos:
 *  · cotações: `GET /trade/quotes?routeId&tradableInstrumentId`, 1 pedido por símbolo VISÍVEL a
 *    cada ~1,5 s, nunca acima de 10/s (fila ritmada a 110 ms);
 *  · posições + ordens + estado da conta: de 3 em 3 s (3 pedidos);
 *  · histórico: `GET /trade/history?routeId&tradableInstrumentId&resolution&from&to`, ≤20 000
 *    barras por pedido, 3/s (fila ritmada a 350 ms), paginado para trás quando o gráfico puxa;
 *  · tudo pára com o separador escondido.
 */
import { agregarVelas } from '@/lib/webtrader/velas'
import type { VelaC } from '@/lib/webtrader/velas'
import { criarAvisador, criarFilaRitmada } from './avisador'
import {
  codigoTimeframe, construirMapa, contaDeTL, fichaDeInstrumentoTL, posicoesEOrdensDeTL, simboloDaCorretora, timeframeParaDerivar, velasDeTL,
  type DetalheTLMinimo, type OrdemTLMinima, type PosicaoTLMinima,
} from './normalizar'
import { SEGUNDOS_TF } from './metaapi'
import { LIMITES, type CotacaoFeed, type CredenciaisFeed, type EstadoFeed, type FeedConta, type FichaMinima, type MapaSimbolos } from './tipos'
import type { ContaWT, OrdemWT, PosicaoWT } from '@/lib/webtrader/corretoras/tipos'

type Cred = Extract<CredenciaisFeed, { plataforma: 'tradelocker' }>

interface Instrumento { id: number; name: string; routeInfo: number | null; routeTrade: number | null; description?: string }

const num = (v: unknown): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }
const colunas = (bloco: unknown): string[] => {
  const cols = (bloco as { columns?: Array<{ id?: string } | string> } | undefined)?.columns
  return Array.isArray(cols) ? cols.map((c) => (typeof c === 'string' ? c : String(c?.id ?? ''))) : []
}
const porColunas = (linhas: unknown[][], cols: string[]) => linhas.map((l) => { const o: Record<string, unknown> = {}; cols.forEach((n, i) => { o[n] = l[i] }); return o })

export class ErroFeedTL extends Error {
  constructor(readonly status: number, msg: string) { super(msg); this.name = 'ErroFeedTL' }
}

export async function criarFeedTradeLocker(credInicial: Cred, opcoes: { preferencias?: Record<string, string> } = {}): Promise<FeedConta> {
  const avisador = criarAvisador()
  const filaCotacoes = criarFilaRitmada(Math.ceil(1000 / LIMITES.tradelocker.cotacoesPorSegundo) + 10)
  const filaHistorico = criarFilaRitmada(Math.ceil(1000 / LIMITES.tradelocker.historicoPorSegundo) + 20)

  let cred = credInicial
  let estado: EstadoFeed = 'caido'
  let erro: string | null = null
  let fechado = false
  let mapa: MapaSimbolos = { paraCorretora: {}, paraCanonico: {} }
  const instrumentos = new Map<string, Instrumento>()
  const nomes = new Map<number, string>()
  const detalhes = new Map<number, DetalheTLMinimo>()
  let cols = { conta: [] as string[], posicoes: [] as string[], ordens: [] as string[] }
  const cotacoes: Record<string, CotacaoFeed> = {}
  let posicoes: PosicaoWT[] | null = null
  let ordens: OrdemWT[] | null = null
  let conta: ContaWT | null = null
  let visiveis: string[] = []
  let timerRetrato: ReturnType<typeof setTimeout> | null = null
  let timerCotacoes: ReturnType<typeof setTimeout> | null = null
  let falhasSeguidas = 0

  const escondido = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  async function pedir<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    let r: Response
    try {
      r = await fetch(`${cred.baseUrl}${path}${qs ? `?${qs}` : ''}`, {
        headers: { accept: 'application/json', Authorization: `Bearer ${cred.accessToken}`, accNum: cred.accNum },
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      throw new ErroFeedTL(0, 'Sem resposta da TradeLocker.')
    }
    if (r.status === 401) throw new ErroFeedTL(401, 'A credencial do feed expirou.')
    if (r.status === 429) throw new ErroFeedTL(429, 'Demasiados pedidos à TradeLocker.')
    if (!r.ok) throw new ErroFeedTL(r.status, `TradeLocker ${r.status}`)
    return (await r.json()) as T
  }

  const marcar = (ok: boolean, e?: unknown) => {
    const antes = estado
    if (ok) { falhasSeguidas = 0; estado = 'ligado'; erro = null }
    else {
      falhasSeguidas++
      if (e instanceof ErroFeedTL) erro = e.message
      // Uma falha isolada (429, rede a soluçar) não derruba a fonte; três seguidas sim.
      if (falhasSeguidas >= 3 || (e instanceof ErroFeedTL && e.status === 401)) estado = 'caido'
    }
    if (antes !== estado) avisador.avisarJa()
  }

  const carregarBase = async () => {
    const [cfg, inst] = await Promise.all([
      pedir<{ d?: Record<string, unknown> }>('/trade/config'),
      pedir<{ d?: { instruments?: Array<{ tradableInstrumentId: number; name: string; description?: string; routes?: Array<{ id: number; type: string }> }> } }>(`/trade/accounts/${cred.accountId}/instruments`),
    ])
    const d = cfg?.d ?? {}
    cols = { conta: colunas(d.accountDetailsConfig), posicoes: colunas(d.positionsConfig), ordens: colunas(d.ordersConfig) }
    instrumentos.clear(); nomes.clear()
    for (const i of inst?.d?.instruments ?? []) {
      const rotas = Array.isArray(i.routes) ? i.routes : []
      const info = rotas.find((r) => String(r.type).toUpperCase() === 'INFO')?.id ?? cred.routeIds.info[0] ?? null
      const trade = rotas.find((r) => String(r.type).toUpperCase() === 'TRADE')?.id ?? null
      instrumentos.set(i.name, { id: Number(i.tradableInstrumentId), name: i.name, routeInfo: info == null ? null : Number(info), routeTrade: trade == null ? null : Number(trade), description: i.description })
      nomes.set(Number(i.tradableInstrumentId), i.name)
    }
    mapa = construirMapa([...instrumentos.keys()], opcoes.preferencias)
  }

  const lerRetrato = async () => {
    if (fechado) return
    try {
      const [pos, ord, est] = await Promise.all([
        pedir<unknown>(`/trade/accounts/${cred.accountId}/positions`),
        pedir<unknown>(`/trade/accounts/${cred.accountId}/orders`),
        pedir<unknown>(`/trade/accounts/${cred.accountId}/state`),
      ])
      const linhasP = porColunas(((pos as { d?: { positions?: unknown[][] } })?.d?.positions ?? []), cols.posicoes)
      const linhasO = porColunas(((ord as { d?: { orders?: unknown[][] } })?.d?.orders ?? []), cols.ordens)
      const p: PosicaoTLMinima[] = linhasP.map((o) => ({
        id: String(o.id ?? ''), tradableInstrumentId: Number(o.tradableInstrumentId), side: String(o.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
        qty: Number(o.qty), avgPrice: Number(o.avgPrice), stopLossId: o.stopLossId != null && String(o.stopLossId) !== '0' ? String(o.stopLossId) : null,
        takeProfitId: o.takeProfitId != null && String(o.takeProfitId) !== '0' ? String(o.takeProfitId) : null, openDate: num(o.openDate), unrealizedPl: num(o.unrealizedPl),
      }))
      const o: OrdemTLMinima[] = linhasO.map((x) => ({
        id: String(x.id ?? ''), tradableInstrumentId: Number(x.tradableInstrumentId), side: String(x.side).toLowerCase() === 'sell' ? 'sell' : 'buy', qty: Number(x.qty),
        type: String(x.type ?? '').toLowerCase(), status: String(x.status ?? '').toLowerCase(), price: num(x.price), stopPrice: num(x.stopPrice),
        positionId: x.positionId != null && String(x.positionId) !== '0' ? String(x.positionId) : null, stopLoss: num(x.stopLoss), takeProfit: num(x.takeProfit), createdDate: num(x.createdDate),
      }))
      const r = posicoesEOrdensDeTL(p, o, nomes, mapa)
      posicoes = r.posicoes; ordens = r.ordens
      const arr = ((est as { d?: { accountDetailsData?: unknown[] } })?.d?.accountDetailsData ?? []) as unknown[]
      const bruto: Record<string, number> = {}
      cols.conta.forEach((n, i) => { const v = num(arr[i]); if (v != null) bruto[n] = v })
      conta = contaDeTL(bruto, conta?.moeda ?? null)
      marcar(true)
      avisador.avisarJa()
    } catch (e) {
      marcar(false, e)
    } finally {
      if (!fechado) {
        if (timerRetrato) clearTimeout(timerRetrato)
        timerRetrato = setTimeout(() => void lerRetrato(), escondido() ? 15_000 : LIMITES.tradelocker.sondagemPosicoesMs)
      }
    }
  }

  const lerCotacoes = async () => {
    if (fechado) return
    const alvo = escondido() ? [] : visiveis.map((c) => simboloDaCorretora(mapa, c)).filter((s): s is string => !!s)
    await Promise.all(alvo.map((s) => {
      const i = instrumentos.get(s)
      if (!i || i.routeInfo == null) return Promise.resolve()
      return filaCotacoes(() => pedir<{ d?: { ap?: number; bp?: number } }>('/trade/quotes', { routeId: i.routeInfo!, tradableInstrumentId: i.id }))
        .then((j) => {
          const bid = num(j?.d?.bp), ask = num(j?.d?.ap)
          const canonico = mapa.paraCanonico[s]
          if (bid != null && ask != null && canonico) cotacoes[canonico] = { bid, ask, em: Date.now() }
          marcar(true)
        })
        .catch((e) => marcar(false, e))
    }))
    avisador.avisar()
    if (!fechado) {
      if (timerCotacoes) clearTimeout(timerCotacoes)
      // Com muitos símbolos à vista a volta demora mais do que 1,5 s: o ritmo é o da fila, não o do relógio.
      timerCotacoes = setTimeout(() => void lerCotacoes(), escondido() ? 5000 : LIMITES.tradelocker.cotacaoMs)
    }
  }

  const detalhe = async (i: Instrumento): Promise<DetalheTLMinimo | null> => {
    const c = detalhes.get(i.id)
    if (c) return c
    if (i.routeInfo == null) return null
    try {
      const j = await pedir<{ d?: DetalheTLMinimo }>(`/trade/instruments/${i.id}`, { routeId: i.routeInfo })
      const d = j?.d ?? null
      if (d) detalhes.set(i.id, d)
      return d
    } catch { return null }
  }

  const velasDe = async (i: Instrumento, codigo: string, seg: number, limite: number, ate?: number): Promise<VelaC[]> => {
    if (i.routeInfo == null) return []
    const fim = (ate ?? Math.floor(Date.now() / 1000)) * 1000
    // ×1,6 para cobrir fins-de-semana e feriados sem ficar aquém das `limite` velas pedidas.
    const inicio = fim - Math.min(limite, LIMITES.tradelocker.velasPorPedido) * seg * 1000 * 1.6
    const j = await filaHistorico(() => pedir<unknown>('/trade/history', { routeId: i.routeInfo!, tradableInstrumentId: i.id, resolution: codigo, from: Math.floor(inicio), to: Math.floor(fim) }))
    return velasDeTL(j).filter((v) => !ate || v.t < ate).slice(-limite)
  }

  const feed: FeedConta = {
    plataforma: 'tradelocker',
    get estado() { return estado },
    get erro() { return erro },
    get mapa() { return mapa },
    async ligar() {
      if (fechado) return
      try {
        await carregarBase()
        void lerRetrato()
        void lerCotacoes()
      } catch (e) {
        marcar(false, e)
        estado = 'caido'
        avisador.avisarJa()
        throw e
      }
    },
    verSimbolos(canonicos) { visiveis = [...new Set(canonicos.map((s) => s.toUpperCase()))] },
    cotacao(c) { return cotacoes[c.toUpperCase()] ?? null },
    cotacoes() { return { ...cotacoes } },
    async velas(canonico, tf, limite, ate) {
      const s = simboloDaCorretora(mapa, canonico)
      const i = s ? instrumentos.get(s) : undefined
      const seg = SEGUNDOS_TF[tf]
      if (!i || !seg) return []
      const directo = codigoTimeframe(seg, 'tradelocker')
      if (directo) return velasDe(i, directo, seg, limite, ate)
      const fonte = timeframeParaDerivar(seg, 'tradelocker')
      if (!fonte) return []
      const base = await velasDe(i, fonte.codigo, fonte.seg, Math.min(LIMITES.tradelocker.velasPorPedido, limite * (seg / fonte.seg)), ate)
      return agregarVelas(base, seg).slice(-limite)
    },
    posicoes() { return posicoes },
    ordens() { return ordens },
    conta() { return conta },
    simbolos() { return [...instrumentos.keys()] },
    ficha(canonico): FichaMinima | null {
      const s = simboloDaCorretora(mapa, canonico)
      const i = s ? instrumentos.get(s) : undefined
      if (!i) return null
      const d = detalhes.get(i.id)
      // Sem detalhe ainda: pede-se em fundo e avisa-se quando chegar; entretanto a ficha é o mínimo.
      if (!d) { void detalhe(i).then((x) => { if (x) avisador.avisar() }); return fichaDeInstrumentoTL(mapa.paraCanonico[s!] ?? canonico.toUpperCase(), { name: i.name, description: i.description }) }
      return fichaDeInstrumentoTL(mapa.paraCanonico[s!] ?? canonico.toUpperCase(), { ...d, name: i.name, description: d.description ?? i.description })
    },
    actualizarAgora() { if (timerRetrato) clearTimeout(timerRetrato); timerRetrato = setTimeout(() => void lerRetrato(), 400) },
    async renovar(c) {
      if (c.plataforma !== 'tradelocker' || fechado) return
      cred = c
      falhasSeguidas = 0
      if (estado === 'caido') { estado = 'ligado'; avisador.avisarJa() }
    },
    aoMudar: avisador.aoMudar,
    desligar() {
      fechado = true
      if (timerRetrato) clearTimeout(timerRetrato)
      if (timerCotacoes) clearTimeout(timerCotacoes)
      avisador.fechar()
    },
  }
  return feed
}
