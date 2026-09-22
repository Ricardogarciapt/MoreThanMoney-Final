/**
 * FEED SECUNDÁRIO — cotações TradeLocker, a comparar com a MetaApi (e recurso atrás de uma flag).
 *
 * A TradeLocker não tem streaming público de cotações: é `GET /trade/quotes` (rota INFO) por
 * símbolo, com a sessão de lib/tradelocker/client.ts. Por isso isto é uma SONDAGEM DE PREÇOS (não
 * de posições), numa ronda sequencial pelos símbolos que o espelho usa, e só corre com
 * ESPELHO_FEED_TL=1. Não gasta créditos MetaApi.
 *
 * O que faz:
 *  · mede, por símbolo: diferença do preço médio (pips), spreads, idade do preço MetaApi, tempo de
 *    resposta da TradeLocker — resumo no pulso do motor (servicos_pulso) de minuto a minuto;
 *  · ESPELHO_FEED_TL_RECURSO=1 → quando o preço MetaApi de um símbolo tem mais de 5 s e o da
 *    TradeLocker é fresco, injecta-o no motor (`aoRecurso`). ATENÇÃO: é outra corretora — fecha
 *    SL/TP de TODAS as contas simuladas com esse preço. Por defeito desligado.
 *
 * Variáveis: TL_FEED_EMAIL, TL_FEED_PASSWORD, TL_FEED_SERVER, TL_FEED_ENV (demo|live),
 * TL_FEED_ACCOUNT_ID, TL_FEED_ACCNUM, ESPELHO_FEED_TL_MS (intervalo entre rondas, defeito 2000),
 * TL_FEED_PARALELO (pedidos em simultâneo por ronda, defeito 4 — com a ronda em série, cada índice
 * só se refrescava a cada N × RTT e ficava acima dos 5 s que a execução exige).
 */
import { TradeLockerSessao, type TLEnv } from '../../lib/tradelocker/client'
import { rankedBrokerSymbols } from '../../lib/mtmcopy/symbol-resolver'
import { amostraFeed, resumirFeed, usarRecurso, type AmostraFeed, type Cotacao } from '../../lib/mtmfunded/espelho/feeds'

export interface OpcoesFeedTL {
  simbolos: () => Iterable<string>
  principal: (sym: string) => Cotacao | null
  pip: (sym: string) => number | null
  aoRecurso?: (sym: string, c: Cotacao) => void
  log: (...a: unknown[]) => void
}

interface Instrumento { id: number; rotaInfo: number }

export function feedTradeLockerDoAmbiente(o: OpcoesFeedTL): ComparadorTradeLocker | null {
  if (process.env.ESPELHO_FEED_TL !== '1') return null
  const email = process.env.TL_FEED_EMAIL
  const password = process.env.TL_FEED_PASSWORD
  const server = process.env.TL_FEED_SERVER
  const accountId = process.env.TL_FEED_ACCOUNT_ID
  const accNum = process.env.TL_FEED_ACCNUM
  if (!email || !password || !server || !accountId || !accNum) {
    o.log('[feed-tl] ESPELHO_FEED_TL=1 mas faltam TL_FEED_EMAIL/PASSWORD/SERVER/ACCOUNT_ID/ACCNUM — desligado')
    return null
  }
  const env: TLEnv = process.env.TL_FEED_ENV === 'live' ? 'live' : 'demo'
  const sessao = new TradeLockerSessao({ email, password, server, env }, accountId, accNum)
  return new ComparadorTradeLocker(sessao, o, Number(process.env.ESPELHO_FEED_TL_MS || 2000), process.env.ESPELHO_FEED_TL_RECURSO === '1',
    Math.max(1, Number(process.env.TL_FEED_PARALELO || 4)))
}

export class ComparadorTradeLocker {
  private ativo = false
  private instrumentos = new Map<string, Instrumento | null>()
  private amostras = new Map<string, AmostraFeed[]>()
  private falhas = 0
  private ultimo = new Map<string, Cotacao>()
  private recursos = 0

  constructor(
    private sessao: Pick<TradeLockerSessao, 'instrumentos' | 'cotacao'>,
    private o: OpcoesFeedTL,
    private intervaloMs: number,
    private recurso: boolean,
    private paralelo = 1,
  ) {}

  iniciar(): void {
    this.ativo = true
    this.o.log(`[feed-tl] comparador TradeLocker ligado · ronda ${this.intervaloMs} ms · recurso ${this.recurso ? 'LIGADO' : 'desligado'}`)
    void this.ciclo()
  }

  private async instrumento(sym: string): Promise<Instrumento | null> {
    if (this.instrumentos.has(sym)) return this.instrumentos.get(sym)!
    const lista = await this.sessao.instrumentos()
    const nome = rankedBrokerSymbols(sym, lista.map((i) => i.name))[0]
    const i = lista.find((x) => x.name === nome)
    const rota = i?.routes.find((r) => r.type === 'INFO') ?? i?.routes[0]
    const out = i && rota ? { id: i.tradableInstrumentId, rotaInfo: rota.id } : null
    this.instrumentos.set(sym, out)
    if (!out) this.o.log(`[feed-tl] ${sym} não existe na TradeLocker`)
    return out
  }

  private async ciclo(): Promise<void> {
    while (this.ativo) {
      const inicio = Date.now()
      const lista = [...this.o.simbolos()]
      let proximo = 0
      const trabalhador = async () => {
        while (this.ativo && proximo < lista.length) await this.umSimbolo(lista[proximo++])
      }
      await Promise.all(Array.from({ length: Math.min(this.paralelo, lista.length) }, trabalhador))
      await new Promise((r) => setTimeout(r, Math.max(250, this.intervaloMs - (Date.now() - inicio))))
    }
  }

  private async umSimbolo(sym: string): Promise<void> {
    try {
      const inst = await this.instrumento(sym)
      if (!inst) return
      const t0 = Date.now()
      const q = await this.sessao.cotacao(inst.id, inst.rotaInfo)
      const rtt = Date.now() - t0
      if (!(q.bid && q.ask)) return
      const c: Cotacao = { bid: q.bid, ask: q.ask, em: Date.now() }
      this.ultimo.set(sym, c)
      const principal = this.o.principal(sym)
      const pip = this.o.pip(sym)
      const a = pip ? amostraFeed(principal, c, pip, rtt) : null
      if (a) {
        const l = this.amostras.get(sym) ?? []
        l.push(a)
        if (l.length > 300) l.shift()
        this.amostras.set(sym, l)
      }
      if (this.recurso && this.o.aoRecurso && usarRecurso(principal ? Date.now() - principal.em : null, true)) {
        this.recursos++
        this.o.aoRecurso(sym, c)
      }
    } catch (e) {
      this.falhas++
      if (this.falhas % 20 === 1) this.o.log(`[feed-tl] ${sym}:`, e instanceof Error ? e.message : e)
    }
  }

  /** Resumo para o pulso (e reinicia as falhas/recursos do minuto). */
  resumo(): Record<string, unknown> {
    const porSimbolo = Object.fromEntries([...this.amostras].map(([s, a]) => [s, resumirFeed(a)]))
    const out = { porSimbolo, falhasMinuto: this.falhas, recursosMinuto: this.recursos }
    this.falhas = 0
    this.recursos = 0
    return out
  }

  parar(): void {
    this.ativo = false
  }
}
