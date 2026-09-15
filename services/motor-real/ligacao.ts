/**
 * UMA LIGAÇÃO DE STREAMING A UMA CONTA REAL (MetaApi). Só LÊ: posições, preços e especificações ficam
 * na memória do SDK (terminalState) e o motor lê-os a cada tick. Nunca envia ordens por aqui — as
 * ordens do live vão por REST /trade (live.ts), nunca pela ligação partilhada.
 *
 * Herdado do mtm-premium-streaming (que este serviço substitui): as contas da fotografia continuam a
 * escrever `metaapi_snapshot` com as MESMAS regras (≤1×/s quando muda, batimento 2 s, dessincronizada
 * JÁ), para o monitor Premium da Vercel continuar a ler como hoje.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assinaturaSnapshot,
  decidirPublicacao,
  posicaoParaSnapshot,
  type EstadoPublicacao,
  type PosicaoSnapshot,
  type PrecoSnapshot,
} from '../../lib/mtmcopy/metaapi-snapshot-regras'
import type { PosicaoGestao } from '../../lib/gestao-real/premium'
import type { SymbolPointSpec } from '../../lib/mtmcopy/pip-points'

type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

export interface OpcoesLigacao {
  conta: string
  chaveToken: string
  api: Qualquer
  sdk: Qualquer
  db: SupabaseClient
  /** Escreve metaapi_snapshot (contas do monitor Premium). */
  fotografia: boolean
  intervaloCotacoesMs: number
  intervaloFotoMs: number
  batimentoFotoMs: number
  /** Erro ao ligar: o motor decide o recuo. */
  aoFalhar: (e: unknown) => void
  /** Sincronização perdida ou refeita: o motor re-semeia os itens e a linha de base. */
  aoRessincronizar: () => void
}

export class LigacaoReal {
  private ligacao: Qualquer = null
  private sincronizadas = new Set<string>()
  private aLigar = false
  private fechado = false
  private subscritos = new Set<string>()
  private estadoFoto: EstadoPublicacao = { assinatura: null, publicadoEm: 0, sincronizado: null }
  private aEscrever = false
  escritasFoto = 0
  ultimoTickEm = 0
  ligadaEm = Date.now()

  constructor(readonly o: OpcoesLigacao) {}

  get conta(): string { return this.o.conta }
  private curto() { return this.o.conta.slice(0, 8) }

  get sincronizada(): boolean {
    return !!this.ligacao && this.sincronizadas.size > 0 && !this.fechado
  }

  iniciar(): void { void this.ligar() }

  private perdeu(instancia: string | null, porque: string) {
    const tinha = this.sincronizadas.size > 0
    if (instancia == null) this.sincronizadas.clear()
    else { this.sincronizadas.delete(instancia); this.sincronizadas.delete('inicial') }
    if (tinha && !this.sincronizadas.size) {
      log(`[ligacao] ${this.curto()} dessincronizada (${porque})`)
      this.o.aoRessincronizar()
    }
    if (this.o.fotografia) void this.talvezPublicar()
  }

  private sincronizou(instancia: string, como: string) {
    const antes = this.sincronizadas.size
    this.sincronizadas.add(instancia)
    if (!antes) {
      log(`[ligacao] ${this.curto()} sincronizada (${como}) · ${this.ligacao?.terminalState?.positions?.length ?? 0} posição(ões)`)
      this.o.aoRessincronizar()
    }
    void this.acertarSubscricoes()
  }

  private async ligar(): Promise<void> {
    if (this.fechado || this.aLigar || this.ligacao) return
    this.aLigar = true
    let c: Qualquer = null
    try {
      const conta = await this.o.api.metatraderAccountApi.getAccount(this.o.conta)
      c = conta.getStreamingConnection(undefined, new Date())
      const eu = this
      const seguro = (f: () => void) => { try { f() } catch (e) { log(`[ligacao] ouvinte ${eu.curto()}:`, e instanceof Error ? e.message : e) } }
      class Ouvinte extends this.o.sdk.SynchronizationListener {
        async onSynchronizationStarted(i: string) { seguro(() => eu.perdeu(String(i), 'ressincronização')) }
        async onPendingOrdersSynchronized(i: string) { seguro(() => eu.sincronizou(String(i), 'evento')) }
        async onDisconnected(i: string) { seguro(() => eu.perdeu(String(i), 'desligada')) }
        async onStreamClosed(i: string) { seguro(() => eu.perdeu(String(i), 'stream fechado')) }
        async onReconnected() { seguro(() => eu.perdeu(null, 'religada')) }
        async onPositionUpdated() { seguro(() => void eu.acertarSubscricoes()) }
        async onPositionRemoved() { seguro(() => void eu.acertarSubscricoes()) }
        async onSymbolPriceUpdated() { eu.ultimoTickEm = Date.now() }
      }
      c.addSynchronizationListener(new Ouvinte())
      this.ligacao = c
      await c.connect()
      log(`[ligacao] ${this.curto()} a sincronizar (${this.o.chaveToken})`)
    } catch (e) {
      this.ligacao = null
      if (c) await c.close().catch(() => undefined)
      this.aLigar = false
      this.o.aoFalhar(e)
      return
    } finally {
      this.aLigar = false
    }
    const ligacao = c
    ligacao.waitSynchronized({ timeoutInSeconds: 180 }).then(() => {
      if (this.fechado || this.ligacao !== ligacao || this.sincronizadas.size) return
      this.sincronizou('inicial', 'espera')
    }).catch((e: unknown) => {
      if (!this.sincronizada) log(`[ligacao] ${this.curto()} ainda não sincronizou em 180 s (o SDK continua):`, e instanceof Error ? e.message : e)
    })
  }

  /** Cotações SÓ dos símbolos com posição aberta. */
  private async acertarSubscricoes(): Promise<void> {
    const c = this.ligacao
    if (!c || !this.sincronizada) return
    const queridos = new Set<string>(((c.terminalState?.positions ?? []) as Array<{ symbol?: string }>).map((p) => String(p.symbol ?? '')).filter(Boolean))
    for (const s of queridos) {
      if (this.subscritos.has(s)) continue
      this.subscritos.add(s)
      try {
        await c.subscribeToMarketData(s, [{ type: 'quotes', intervalInMilliseconds: this.o.intervaloCotacoesMs }])
      } catch (e) {
        this.subscritos.delete(s)
        log(`[ligacao] ${this.curto()} não subscreveu ${s}:`, e instanceof Error ? e.message : e)
      }
    }
    for (const s of [...this.subscritos]) {
      if (queridos.has(s)) continue
      this.subscritos.delete(s)
      await c.unsubscribeFromMarketData(s).catch(() => undefined)
    }
  }

  /** Posições como os monitores as veem. null = não sincronizada (nada se conclui). */
  posicoes(): PosicaoGestao[] | null {
    if (!this.sincronizada) return null
    return ((this.ligacao.terminalState?.positions ?? []) as Record<string, unknown>[])
      .map((p) => posicaoParaSnapshot(p))
      .filter((p): p is PosicaoSnapshot => !!p) as PosicaoGestao[]
  }

  /** (bid+ask)/2 — a mesma conta do getMarketPrice e da fotografia. */
  precoMedio(simbolo: string): number | null {
    if (!this.sincronizada) return null
    const q = this.ligacao.terminalState?.price?.(simbolo) as { bid?: number; ask?: number } | undefined
    if (!q || !(Number(q.bid) > 0) || !(Number(q.ask) > 0)) return null
    return (Number(q.bid) + Number(q.ask)) / 2
  }

  especificacao(simbolo: string): SymbolPointSpec | null {
    if (!this.sincronizada) return null
    const s = this.ligacao.terminalState?.specification?.(simbolo) as { point?: number; pipSize?: number; digits?: number } | undefined
    return s && Number(s.point) > 0 ? { point: Number(s.point), pipSize: s.pipSize, digits: s.digits } : null
  }

  // ── fotografia (compatível com o mtm-premium-streaming) ──────────────────────────
  async talvezPublicar(forcar = false): Promise<void> {
    if (!this.o.fotografia || this.aEscrever) return
    const sincronizado = this.sincronizada
    const posicoes = sincronizado ? (this.posicoes() as unknown as PosicaoSnapshot[]) : []
    const precos: Record<string, PrecoSnapshot> = {}
    if (sincronizado) {
      for (const s of new Set(posicoes.map((p) => p.symbol))) {
        const q = this.ligacao.terminalState?.price?.(s) as { bid?: number; ask?: number; time?: Date | string } | undefined
        if (!q || !(Number(q.bid) > 0) || !(Number(q.ask) > 0)) continue
        const em = q.time ? new Date(q.time).getTime() : Date.now()
        precos[s] = { bid: Number(q.bid), ask: Number(q.ask), em: Number.isFinite(em) ? em : Date.now() }
      }
    }
    const assinatura = assinaturaSnapshot(posicoes, precos, sincronizado)
    const agora = Date.now()
    if (!forcar && !decidirPublicacao(this.estadoFoto, assinatura, sincronizado, agora, this.o.intervaloFotoMs, this.o.batimentoFotoMs)) return
    if (!forcar && !sincronizado && this.estadoFoto.publicadoEm > 0 && this.estadoFoto.sincronizado !== true) return
    this.aEscrever = true
    try {
      const { error } = await this.o.db.from('metaapi_snapshot').upsert(
        { account_id: this.o.conta, posicoes, precos, sincronizado, em: new Date(agora).toISOString() },
        { onConflict: 'account_id' },
      )
      if (error) throw new Error(error.message)
      this.estadoFoto = { assinatura, publicadoEm: agora, sincronizado }
      this.escritasFoto++
    } catch (e) {
      log(`[ligacao] ${this.curto()} fotografia falhou:`, e instanceof Error ? e.message : e)
    } finally {
      this.aEscrever = false
    }
  }

  resumo(): { conta: string; chave: string; sync: boolean; posicoes: number | null; subscritos: number; ultimoTickHaS: number | null; fotos: number } {
    return {
      conta: this.curto(),
      chave: this.o.chaveToken,
      sync: this.sincronizada,
      posicoes: this.sincronizada ? (this.ligacao.terminalState?.positions?.length ?? 0) : null,
      subscritos: this.subscritos.size,
      ultimoTickHaS: this.ultimoTickEm ? Math.round((Date.now() - this.ultimoTickEm) / 1000) : null,
      fotos: this.escritasFoto,
    }
  }

  async fechar(): Promise<void> {
    this.fechado = true
    if (this.o.fotografia) await this.talvezPublicar(true)
    await this.ligacao?.close().catch(() => undefined)
    this.ligacao = null
  }
}
