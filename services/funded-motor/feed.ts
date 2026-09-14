/**
 * A FONTE DE PREÇOS DO MOTOR — uma conta da PU Prime na MetaApi.
 *
 * Um só feed serve TODAS as contas simuladas: o custo não cresce por aluno, que é a razão toda de
 * o MTM Funded ter motor próprio (spec, secção 3). A conta é uma que já pagamos para o MTM Auto.
 *
 * Dois caminhos, atrás da mesma interface (`FontePrecos`), para a fonte se poder trocar depois
 * (um MT5 próprio no VPS, spec secção 10) sem mexer no motor:
 *  · STREAMING (principal) — `subscribeToMarketData`, um tick por mudança de preço;
 *  · RPC (recurso) — `getSymbolPrice` símbolo a símbolo, ~1s, quando o streaming não liga ou
 *    fica mudo. É mais lento e mais caro em pedidos, mas um motor sem preços não fecha um SL.
 *
 * O SDK carrega-se com `require` e sem tipos: é o build CommonJS de Node (`metaapi.cloud-sdk/node`),
 * o único que corre fora de um bundler de browser — e o esbuild empacota-o dentro do motor.js,
 * para o VPS não precisar de node_modules.
 *
 * A instância do SDK é a PARTILHADA com o espelho (metaapi-partilhada.ts): uma ligação por conta.
 * Qualquer erro de limite da MetaApi visto aqui liga o interruptor que pára o espelho 1 h.
 */
import { carregarSdk, metaApiPartilhada, registarErroMetaApi } from './metaapi-partilhada'

export interface Tick {
  /** Símbolo da CORRETORA (ex.: XAUUSD.s). O motor traduz para o canónico. */
  fonte: string
  bid: number
  ask: number
  /** Instante do tick (UTC). */
  em: Date
  /** Desvio da hora do servidor da corretora face a UTC, em minutos, quando o tick o traz. */
  desvioMin: number | null
}

export interface FontePrecos {
  nome: string
  iniciar(aoTick: (t: Tick) => void): Promise<void>
  /** O conjunto de símbolos (da corretora) que se quer a receber. Idempotente. */
  definirSimbolos(fontes: Set<string>): Promise<void>
  /** Os símbolos que a corretora deixa negociar (tradeMode FULL), quando a fonte os conhece. */
  simbolosDaCorretora(): string[]
  parar(): Promise<void>
}

type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

/** brokerTime ('2026-09-14 18:47:02.504', hora do servidor) − time (UTC) → minutos, ao quarto de hora. */
function desvioDe(p: { time?: Date | string; brokerTime?: string }): number | null {
  if (!p.brokerTime || !p.time) return null
  const servidor = Date.parse(p.brokerTime.replace(' ', 'T') + 'Z')
  const utc = new Date(p.time).getTime()
  if (!Number.isFinite(servidor) || !Number.isFinite(utc)) return null
  return Math.round((servidor - utc) / 900_000) * 15
}

export class FonteStreaming implements FontePrecos {
  nome = 'streaming'
  private ligacao: Qualquer
  private subscritos = new Set<string>()

  constructor(private token: string, private contaId: string, private intervaloMs = 1000) {}

  async iniciar(aoTick: (t: Tick) => void): Promise<void> {
    const sdk = carregarSdk()
    const api = metaApiPartilhada(this.token)
    const conta = await api.metatraderAccountApi.getAccount(this.contaId)
    this.ligacao = conta.getStreamingConnection()

    // O ouvinte TEM de estender a classe do SDK: um objecto solto rebenta em cada evento que
    // não implementa («listener.onConnected is not a function»).
    const Base = sdk.SynchronizationListener
    class Ouvinte extends Base {
      onSymbolPriceUpdated(_i: string, p: Qualquer) {
        if (!p?.symbol || !(p.bid > 0) || !(p.ask > 0)) return
        aoTick({ fonte: p.symbol, bid: p.bid, ask: p.ask, em: p.time ? new Date(p.time) : new Date(), desvioMin: desvioDe(p) })
      }
    }
    this.ligacao.addSynchronizationListener(new Ouvinte())
    await this.ligacao.connect()
    await this.ligacao.waitSynchronized({ timeoutInSeconds: 180 })
  }

  async definirSimbolos(fontes: Set<string>): Promise<void> {
    if (!this.ligacao) return
    for (const s of fontes) {
      if (this.subscritos.has(s)) continue
      try {
        await this.ligacao.subscribeToMarketData(s, [{ type: 'quotes', intervalInMilliseconds: this.intervaloMs }])
        this.subscritos.add(s)
      } catch (e) {
        registarErroMetaApi(e, `feed:subscrever:${s}`)
        console.warn(`[feed] não subscreveu ${s}:`, e instanceof Error ? e.message : e)
      }
    }
    for (const s of [...this.subscritos]) {
      if (fontes.has(s)) continue
      await this.ligacao.unsubscribeFromMarketData(s).catch(() => undefined)
      this.subscritos.delete(s)
    }
  }

  simbolosDaCorretora(): string[] {
    const specs = (this.ligacao?.terminalState?.specifications ?? []) as Array<{ symbol: string; tradeMode?: string }>
    return specs.filter((s) => s.tradeMode === 'SYMBOL_TRADE_MODE_FULL').map((s) => s.symbol)
  }

  async parar(): Promise<void> {
    await this.ligacao?.close().catch(() => undefined)
  }
}

/** Recurso: pergunta o preço de cada símbolo, um de cada vez, em ciclo. */
export class FonteRpc implements FontePrecos {
  nome = 'rpc'
  private ligacao: Qualquer
  private simbolos: string[] = []
  private ativo = false

  constructor(private token: string, private contaId: string, private intervaloMs = 1000) {}

  async iniciar(aoTick: (t: Tick) => void): Promise<void> {
    const api = metaApiPartilhada(this.token)
    const conta = await api.metatraderAccountApi.getAccount(this.contaId)
    this.ligacao = conta.getRPCConnection()
    await this.ligacao.connect()
    await this.ligacao.waitSynchronized(180)
    this.ativo = true
    void (async () => {
      while (this.ativo) {
        const inicio = Date.now()
        for (const s of this.simbolos) {
          try {
            const p = await this.ligacao.getSymbolPrice(s)
            if (p?.bid > 0 && p?.ask > 0) {
              aoTick({ fonte: s, bid: p.bid, ask: p.ask, em: p.time ? new Date(p.time) : new Date(), desvioMin: desvioDe(p) })
            }
          } catch (e) {
            /* um símbolo que falha não pára os outros */
            registarErroMetaApi(e, 'feed:rpc')
          }
        }
        await new Promise((r) => setTimeout(r, Math.max(100, this.intervaloMs - (Date.now() - inicio))))
      }
    })()
  }

  async definirSimbolos(fontes: Set<string>): Promise<void> {
    this.simbolos = [...fontes]
  }

  simbolosDaCorretora(): string[] {
    return []
  }

  async parar(): Promise<void> {
    this.ativo = false
    await this.ligacao?.close().catch(() => undefined)
  }
}
