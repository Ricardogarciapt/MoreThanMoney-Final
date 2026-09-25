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
 * TL_FEED_LIMITE_MS baixa o limite a partir do qual a cotação da TradeLocker entra (defeito 5000).
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
  /**
   * Limite de idade, POR SÍMBOLO, a partir do qual a cotação da TradeLocker entra (ms).
   *
   * 25/09: o forex passou a poder entrar por aqui, porque nesse dia as três fontes dele caíram ao
   * mesmo tempo (conector MT5 pendurado no limite de 100 gráficos, Yahoo a devolver 429 à VPS,
   * MetaApi desligada por decisão) e o webtrader ficou 4h20 com o EURUSD parado. Mas a TradeLocker
   * é OUTRA corretora: se entrasse ao mesmo ritmo dos índices (1,2 s) andaria a discutir o preço
   * com o conector (~95 ms) e o par saltava entre os dois. Para essas classes devolve-se um limite
   * folgado — só entra quando NÃO há mais nada. `null` = o limite geral (TL_FEED_LIMITE_MS).
   */
  limitePara?: (sym: string) => number | null
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
    Math.max(1, Number(process.env.TL_FEED_PARALELO || 4)),
    Math.max(0, Number(process.env.TL_FEED_LIMITE_MS || 5000)))
}

export class ComparadorTradeLocker {
  private ativo = false
  private instrumentos = new Map<string, Instrumento | null>()
  private amostras = new Map<string, AmostraFeed[]>()
  private falhas = 0
  private ultimo = new Map<string, Cotacao>()
  private recursos = 0
  /**
   * TRAVÃO AUTOMÁTICO — a TradeLocker limita o ritmo e responde «Too many requests».
   *
   * 25/09: com 5 símbolos e TL_FEED_PARALELO=3 o limite aparecia de meio em meio minuto, e a partir
   * daqui a lista cresce (o forex passou a ser coberto como último recurso). Bater sempre na mesma
   * parede não serve: a cada limite recua-se um paralelo e espaça-se a ronda, e volta-se a apertar
   * devagar depois de um minuto limpo. Assim o feed encontra sozinho o ritmo que a corretora aceita.
   */
  private paraleloVivo = 0
  private folgaMs = 0
  private limitadas = 0
  private ultimoLimite = 0

  constructor(
    private sessao: Pick<TradeLockerSessao, 'instrumentos' | 'cotacao'>,
    private o: OpcoesFeedTL,
    private intervaloMs: number,
    private recurso: boolean,
    private paralelo = 1,
    /**
     * A partir de que idade do preço PRINCIPAL é que o da TradeLocker entra.
     *
     * Estava fixo em 5 s e era isso que deixava o forex lento: o Yahoo entrega EURUSD a cada ~4 s,
     * nunca passava dos 5, e a cotação da TradeLocker — que chega em menos de 2 — era medida e
     * deitada fora. Com um limite mais baixo entra a mais fresca. ATENÇÃO: é outra corretora, e o
     * preço dela fecha SL/TP nas contas simuladas; por isso é uma variável, não uma decisão minha.
     */
    private limiteRecursoMs = 5000,
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
      if (!this.paraleloVivo) this.paraleloVivo = this.paralelo
      const trabalhador = async () => {
        while (this.ativo && proximo < lista.length) await this.umSimbolo(lista[proximo++])
      }
      await Promise.all(Array.from({ length: Math.min(this.paraleloVivo, lista.length) }, trabalhador))
      this.ajustarRitmo()
      await new Promise((r) => setTimeout(r, Math.max(250, this.intervaloMs + this.folgaMs - (Date.now() - inicio))))
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
      const limite = this.o.limitePara?.(sym) ?? this.limiteRecursoMs
      if (this.recurso && this.o.aoRecurso && usarRecurso(principal ? Date.now() - principal.em : null, true, limite)) {
        this.recursos++
        this.o.aoRecurso(sym, c)
      }
    } catch (e) {
      this.falhas++
      const msg = e instanceof Error ? e.message : String(e)
      // O travão só reage ao LIMITE; um símbolo que não existe, ou a rede, não devem abrandar a ronda.
      if (/demasiados pedidos|too many requests|\b429\b/i.test(msg)) this.limitadas++
      if (this.falhas % 20 === 1) this.o.log(`[feed-tl] ${sym}:`, msg)
    }
  }

  /** Apertar ou aliviar conforme a corretora aceitou a ronda anterior. */
  private ajustarRitmo(): void {
    if (this.limitadas > 0) {
      this.limitadas = 0
      this.ultimoLimite = Date.now()
      const antes = `${this.paraleloVivo}×+${this.folgaMs}ms`
      if (this.paraleloVivo > 1) this.paraleloVivo--
      else this.folgaMs = Math.min(5000, this.folgaMs + 500)
      this.o.log(`[feed-tl] limite da corretora — a recuar ${antes} → ${this.paraleloVivo}×+${this.folgaMs}ms`)
      return
    }
    // Um minuto inteiro sem levar limite: devolve-se um passo do que se tirou.
    if (!this.ultimoLimite || Date.now() - this.ultimoLimite < 60_000) return
    if (this.folgaMs > 0) this.folgaMs = Math.max(0, this.folgaMs - 500)
    else if (this.paraleloVivo < this.paralelo) this.paraleloVivo++
    else return
    this.ultimoLimite = Date.now()
    this.o.log(`[feed-tl] um minuto sem limites — a apertar para ${this.paraleloVivo}×+${this.folgaMs}ms`)
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
