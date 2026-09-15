/**
 * ESPELHO — A LEITURA DAS CONTAS-MESTRE, por STREAMING (sem RPC em regime normal).
 *
 * Porque é que isto existe: a versão anterior fazia `getPositions` por RPC de 3 em 3 s em cada
 * mestre. A MetaApi cortou-a — «The ws:getPositions API allows 180000 cpu credits per 1h» — e o
 * token é o MESMO do MTM Auto e do MTM Copy, que também leem as provider por getPositions. O
 * espelho não pode gastar créditos RPC.
 *
 * Como lê agora: uma ligação de STREAMING por mestre (`account.getStreamingConnection()`), igual
 * à do feed de preços (feed.ts). A MetaApi empurra as mudanças; o SDK mantém `terminalState`
 * em memória. Ler as posições passa a ser ler memória — zero pedidos.
 *
 *  · Um ouvinte (SynchronizationListener) avisa quando algo muda: posição actualizada/removida,
 *    posições substituídas numa ressincronização, fim de sincronização, queda.
 *  · O Agendador junta rajadas de eventos (250 ms), repete 3 s depois enquanto houver trabalho
 *    (abrir à espera de preço, 2.ª leitura antes de fechar) e reconcilia tudo de 60 em 60 s a
 *    partir da memória.
 *
 * ── A REGRA QUE NÃO SE PARTE ─────────────────────────────────────────────────
 * Enquanto a ligação da mestre não está sincronizada (a ligar, caída, a ressincronizar) a leitura
 * é `null` = «leitura falhou». O diff nunca fecha nada com `null`. A `época` sobe a cada queda,
 * para quem conta ausências recomeçar do zero depois de voltar.
 *
 * RPC: NENHUM. Nem de recurso — a entrega das trades das provider aos subscritores (CopyFactory,
 * MTM Auto, MTM Copy) usa o mesmo token e tem prioridade absoluta. Uma mestre que não sincroniza
 * fica simplesmente sem espelho até sincronizar. A ligação usa a instância PARTILHADA do SDK
 * (metaapi-partilhada.ts): se o feed de preços já ouve a mesma conta, não se abre outra subscrição.
 * Um erro de limite ao ligar liga o interruptor global (o espelho inteiro pára 1 h).
 *
 * Sem Supabase nem Next: o teste (lib/mtmfunded/__tests__/espelho.check.ts) injecta um SDK falso.
 */
import { posicaoMestreDaMetaApi, type PosicaoMestre } from '../../lib/mtmfunded/espelho/calculo'
import { carregarSdk, eLimiteMetaApi, metaApiPartilhada } from './metaapi-partilhada'

// ── o SDK (injectável) ───────────────────────────────────────────────────────

export interface LigacaoStreaming {
  terminalState: {
    positions: Record<string, unknown>[]
    accountInformation?: { equity?: number } | null
    specification?: (symbol: string) => { contractSize?: number } | undefined
  }
  addSynchronizationListener(l: unknown): void
  removeSynchronizationListener?(l: unknown): void
  connect(): Promise<void>
  waitSynchronized(opts?: { timeoutInSeconds?: number }): Promise<void>
  close(): Promise<void>
}

export interface SdkEspelho {
  /** A classe base dos ouvintes (o SDK exige que se estenda). */
  Base: new () => object
  streaming(id: string): Promise<LigacaoStreaming>
}

/** O SDK real, pela instância partilhada com o feed (uma ligação por conta, nunca duas). */
export function sdkMetaApi(token: string): SdkEspelho {
  const sdk = carregarSdk()
  return {
    Base: sdk.SynchronizationListener,
    // historyStartTime = agora: o espelho não precisa do histórico de deals, e sem isto a
    // sincronização descarregava o histórico inteiro da conta. (Se a ligação já existir — a do
    // feed — o SDK devolve-a e ignora este argumento.)
    streaming: async (id) => (await metaApiPartilhada(token).metatraderAccountApi.getAccount(id)).getStreamingConnection(undefined, new Date()),
  }
}

// ── uma mestre ───────────────────────────────────────────────────────────────

export interface OpcoesLeitor {
  log: (...a: unknown[]) => void
  /** Chamado a cada evento relevante (o Agendador faz o debounce). */
  aoMudar: (id: string) => void
  /** Um erro da MetaApi (o motor liga o interruptor global se for limite). */
  aoErroMetaApi?: (e: unknown, origem: string) => void
  /** Espera inicial pela sincronização (s). Passado o prazo a ligação continua a tentar sozinha. */
  esperaSincronizacaoS?: number
}

const ATRASO_RELIGAR_MIN_MS = 60_000
const ATRASO_RELIGAR_MAX_MS = 15 * 60_000
/** Marca de «já estava sincronizada quando cheguei» (ligação partilhada com o feed). */
const INICIAL = 'inicial'

export class LeitorMestre {
  private ligacao: LigacaoStreaming | null = null
  private ouvinte: object | null = null
  private sincronizadas = new Set<string>()
  private fechado = false
  private aLigar = false
  private retry: NodeJS.Timeout | null = null
  private atrasoReligar = ATRASO_RELIGAR_MIN_MS
  /** Sobe a cada perda de sincronização: as ausências contadas antes deixam de valer. */
  epoca = 0
  private epocaConsumida = -1

  /**
   * true na 1.ª leitura deste leitor e na 1.ª depois de cada queda: quem conta ausências deve
   * recomeçar do zero (uma posição «ausente» antes da queda não conta para a fechar depois).
   */
  houveQuebraDesdeUltimaLeitura(): boolean {
    const mudou = this.epocaConsumida !== this.epoca
    this.epocaConsumida = this.epoca
    return mudou
  }

  constructor(readonly id: string, private sdk: SdkEspelho, private o: OpcoesLeitor) {}

  private curto() { return this.id.slice(0, 8) }

  get sincronizada(): boolean {
    return !!this.ligacao && this.sincronizadas.size > 0
  }

  iniciar(): void {
    void this.ligar()
  }

  private agendarReligar(ms: number) {
    if (this.fechado) return
    if (this.retry) clearTimeout(this.retry)
    this.retry = setTimeout(() => { this.retry = null; void this.ligar() }, ms)
    this.retry.unref?.()
  }

  private perdeu(instancia: string | null, porque: string) {
    const tinha = this.sincronizadas.size > 0
    if (instancia == null) this.sincronizadas.clear()
    else { this.sincronizadas.delete(instancia); this.sincronizadas.delete(INICIAL) }
    // Qualquer queda (mesmo de uma só réplica) invalida as ausências contadas — conservador.
    this.epoca++
    if (tinha && this.sincronizadas.size === 0) this.o.log(`[espelho] mestre ${this.curto()} dessincronizada (${porque}) — não fecha nada até voltar`)
    this.o.aoMudar(this.id)
  }

  private criarOuvinte(): object {
    const eu = this
    const seguro = (f: () => void) => { try { f() } catch (e) { eu.o.log(`[espelho] ouvinte ${eu.curto()}:`, e instanceof Error ? e.message : e) } }
    const Base = this.sdk.Base
    class Ouvinte extends Base {
      async onPositionUpdated() { seguro(() => eu.o.aoMudar(eu.id)) }
      async onPositionRemoved() { seguro(() => eu.o.aoMudar(eu.id)) }
      async onPositionsUpdated() { seguro(() => eu.o.aoMudar(eu.id)) }
      async onPositionsReplaced() { seguro(() => eu.o.aoMudar(eu.id)) }
      async onPositionsSynchronized() { seguro(() => eu.o.aoMudar(eu.id)) }
      async onSynchronizationStarted(i: string) { seguro(() => eu.perdeu(String(i), 'ressincronização')) }
      // O terminalState só publica as posições combinadas no fim da sincronização das ordens.
      async onPendingOrdersSynchronized(i: string) {
        seguro(() => {
          const antes = eu.sincronizadas.size
          eu.sincronizadas.add(String(i))
          eu.atrasoReligar = ATRASO_RELIGAR_MIN_MS
          if (!antes) eu.o.log(`[espelho] mestre ${eu.curto()} sincronizada (streaming) · ${eu.ligacao?.terminalState.positions.length ?? 0} posição(ões)`)
          eu.o.aoMudar(eu.id)
        })
      }
      async onDisconnected(i: string) { seguro(() => eu.perdeu(String(i), 'desligada')) }
      async onStreamClosed(i: string) { seguro(() => eu.perdeu(String(i), 'stream fechado')) }
      async onReconnected() { seguro(() => eu.perdeu(null, 'religada')) }
    }
    return new Ouvinte()
  }

  private async ligar(): Promise<void> {
    if (this.fechado || this.aLigar || this.ligacao) return
    this.aLigar = true
    let c: LigacaoStreaming | null = null
    try {
      c = await this.sdk.streaming(this.id)
      if (this.fechado) { await c.close().catch(() => undefined); return }
      this.ouvinte = this.criarOuvinte()
      c.addSynchronizationListener(this.ouvinte)
      this.ligacao = c
      await c.connect()
      this.o.log(`[espelho] mestre ${this.curto()} a sincronizar por streaming`)
    } catch (e) {
      // connect() falhado fecha a ligação por dentro do SDK: recria-se mais tarde, nunca em ciclo apertado.
      this.ligacao = null
      if (c) {
        if (this.ouvinte) c.removeSynchronizationListener?.(this.ouvinte)
        await c.close().catch(() => undefined)
      }
      const limite = eLimiteMetaApi(e)
      this.o.aoErroMetaApi?.(e, `espelho:ligar:${this.curto()}`)
      const ms = limite ? ATRASO_RELIGAR_MAX_MS : this.atrasoReligar
      this.atrasoReligar = Math.min(ATRASO_RELIGAR_MAX_MS, this.atrasoReligar * 2)
      this.o.log(`[espelho] mestre ${this.curto()} não ligou (${limite ? 'LIMITE da MetaApi' : 'erro'}), nova tentativa em ${Math.round(ms / 60000)} min:`, e instanceof Error ? e.message : e)
      this.agendarReligar(ms)
      return
    } finally {
      this.aLigar = false
    }
    // Espera a 1.ª sincronização só para registar no log; os eventos já fazem o resto. Um timeout
    // aqui NÃO fecha a ligação: o SDK continua a sincronizar e religar sozinho.
    const espera = this.o.esperaSincronizacaoS ?? 180
    const ligacao = c
    ligacao.waitSynchronized({ timeoutInSeconds: espera }).then(() => {
      // Ligação partilhada que JÁ estava sincronizada (a do feed): os eventos de fim de
      // sincronização passaram antes de o ouvinte existir. waitSynchronized só resolve depois de
      // o terminalState ter as posições combinadas, por isso a memória é fiável a partir daqui.
      if (this.fechado || this.ligacao !== ligacao || this.sincronizadas.size) return
      this.sincronizadas.add(INICIAL)
      this.o.log(`[espelho] mestre ${this.curto()} sincronizada (ligação já existente) · ${ligacao.terminalState.positions.length} posição(ões)`)
      this.o.aoMudar(this.id)
    }).catch((e: unknown) => {
      this.o.aoErroMetaApi?.(e, `espelho:sincronizar:${this.curto()}`)
      if (this.fechado || this.sincronizada) return
      this.o.log(`[espelho] mestre ${this.curto()} ainda não sincronizou em ${espera}s (o SDK continua a tentar):`, e instanceof Error ? e.message : e)
    })
  }

  /** As posições agora, da memória. `null` = leitura não fiável (não sincronizada). */
  ler(): PosicaoMestre[] | null {
    if (this.sincronizada) {
      const brutas = this.ligacao!.terminalState.positions
      if (!Array.isArray(brutas)) return null
      return brutas.map((p) => posicaoMestreDaMetaApi(p)).filter((x): x is PosicaoMestre => x != null)
    }
    return null
  }

  /** Equity da mestre (base da proporção), da memória. */
  equity(): number | null {
    const v = Number(this.ligacao?.terminalState.accountInformation?.equity)
    return this.sincronizada && v > 0 ? v : null
  }

  /** Tamanho do contrato do símbolo da mestre, da memória (especificações sincronizadas). */
  contrato(simbolo: string): number | null {
    try {
      const v = Number(this.ligacao?.terminalState.specification?.(simbolo)?.contractSize)
      return v > 0 ? v : null
    } catch {
      return null
    }
  }

  async fechar(): Promise<void> {
    this.fechado = true
    if (this.retry) clearTimeout(this.retry)
    const c = this.ligacao
    this.ligacao = null
    this.sincronizadas.clear()
    if (c) {
      if (this.ouvinte) c.removeSynchronizationListener?.(this.ouvinte)
      await c.close().catch(() => undefined)
    }
  }
}

// ── o agendador ──────────────────────────────────────────────────────────────

export interface OpcoesAgendador {
  debounceMs?: number
  repetirMs?: number
  reconciliarMs?: number
  log?: (...a: unknown[]) => void
}

/**
 * Corre `processar(id)` por mestre: nunca dois ao mesmo tempo para a mesma mestre, rajadas de
 * eventos juntas, repetição curta enquanto `processar` pedir, e uma reconciliação periódica.
 */
export class Agendador {
  private debounce = new Map<string, NodeJS.Timeout>()
  private repetir = new Map<string, NodeJS.Timeout>()
  private ocupado = new Set<string>()
  private pendente = new Set<string>()
  private reconciliar: NodeJS.Timeout | null = null
  private parado = false
  readonly debounceMs: number
  readonly repetirMs: number

  constructor(
    private processar: (id: string) => Promise<{ repetir: boolean }>,
    private ids: () => Iterable<string>,
    o: OpcoesAgendador = {},
  ) {
    this.debounceMs = o.debounceMs ?? 250
    this.repetirMs = o.repetirMs ?? 3000
    const rec = o.reconciliarMs ?? 60_000
    this.log = o.log ?? (() => undefined)
    this.reconciliar = setInterval(() => { for (const id of this.ids()) this.sinalizar(id) }, rec)
  }

  private log: (...a: unknown[]) => void

  sinalizar(id: string): void {
    if (this.parado || this.debounce.has(id)) return
    const t = setTimeout(() => { this.debounce.delete(id); void this.correr(id) }, this.debounceMs)
    this.debounce.set(id, t)
  }

  private async correr(id: string): Promise<void> {
    if (this.parado) return
    if (this.ocupado.has(id)) { this.pendente.add(id); return }
    this.ocupado.add(id)
    const r0 = this.repetir.get(id)
    if (r0) { clearTimeout(r0); this.repetir.delete(id) }
    let repetir = false
    try {
      repetir = (await this.processar(id)).repetir
    } catch (e) {
      this.log(`[espelho] mestre ${id.slice(0, 8)}:`, e instanceof Error ? e.message : e)
    } finally {
      this.ocupado.delete(id)
    }
    if (this.parado) return
    if (this.pendente.delete(id)) return this.sinalizar(id)
    if (repetir && !this.repetir.has(id)) {
      this.repetir.set(id, setTimeout(() => { this.repetir.delete(id); this.sinalizar(id) }, this.repetirMs))
    }
  }

  parar(): void {
    this.parado = true
    if (this.reconciliar) clearInterval(this.reconciliar)
    for (const t of [...this.debounce.values(), ...this.repetir.values()]) clearTimeout(t)
    this.debounce.clear()
    this.repetir.clear()
  }
}
