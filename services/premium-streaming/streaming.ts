/**
 * MTM PREMIUM STREAMING — o processo longo do VPS que substitui as leituras RPC do monitor Premium.
 *
 * Porque existe: o monitor de preço Premium (Vercel, chamado ~1×/s pelo loop do VPS) pedia
 * `getPositions` e, com trailing em tempo real, `getSymbolPrice` por posição, a cada passagem.
 * Uma função serverless não segura websockets; este processo sim. Mantém uma ligação de STREAMING
 * por conta (o SDK guarda o `terminalState` em memória, a MetaApi empurra as mudanças) e escreve a
 * fotografia em `metaapi_snapshot`. O monitor lê a linha — zero créditos RPC em regime normal.
 *
 * Contas: `PREMIUM_STREAMING_CONTAS` (ids MetaApi separados por vírgulas). Vazia → o processo não
 * faz nada e fica parado (o monitor, com a mesma variável vazia na Vercel, usa o RPC).
 *
 * ── REGRAS ─────────────────────────────────────────────────────────────────
 *  · Escreve no máximo 1×/s por conta, só quando posições/preços mudam, e um batimento de 2 s para
 *    a fotografia não parecer velha num mercado parado (metaapi-snapshot-regras.ts).
 *  · Perdeu a sincronização → escreve `sincronizado=false` JÁ. O monitor deixa de confiar e volta ao
 *    RPC. Ao sair (SIGTERM) faz o mesmo.
 *  · Nunca envia ordens. Não decide nada de gestão. Só lê e publica.
 *  · Erro de limite da MetaApi ao ligar → espera 15 min antes de tentar outra vez (a entrega das
 *    trades aos subscritores usa o mesmo token e tem prioridade).
 *
 * Construir e instalar: deploy/vps-stream/premium-streaming/README.md
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { carregarSdk, eLimiteMetaApi, metaApiPartilhada, registarErroMetaApi } from '../funded-motor/metaapi-partilhada'
import {
  assinaturaSnapshot,
  contasStreaming,
  decidirPublicacao,
  posicaoParaSnapshot,
  type EstadoPublicacao,
  type PosicaoSnapshot,
  type PrecoSnapshot,
} from '../../lib/mtmcopy/metaapi-snapshot-regras'

type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

const env = (k: string) => process.env[k]?.trim() ?? ''
const CFG = {
  supabaseUrl: env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseKey: env('SUPABASE_SERVICE_ROLE_KEY'),
  token: env('METAAPI_TOKEN'),
  contas: contasStreaming(env('PREMIUM_STREAMING_CONTAS')),
  intervaloMs: Number(env('PREMIUM_STREAMING_INTERVALO_MS') || 1000),
  batimentoMs: Number(env('PREMIUM_STREAMING_BATIMENTO_MS') || 2000),
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

const RELIGAR_MIN_MS = 60_000
const RELIGAR_MAX_MS = 15 * 60_000

class ContaStreaming {
  private ligacao: Qualquer = null
  private sincronizadas = new Set<string>()
  private aLigar = false
  private fechado = false
  private atraso = RELIGAR_MIN_MS
  private subscritos = new Set<string>()
  private estado: EstadoPublicacao = { assinatura: null, publicadoEm: 0, sincronizado: null }
  private aEscrever = false
  publicacoes = 0

  constructor(readonly id: string, private db: SupabaseClient) {}

  private curto() { return this.id.slice(0, 8) }

  get sincronizada(): boolean {
    return !!this.ligacao && this.sincronizadas.size > 0
  }

  iniciar(): void { void this.ligar() }

  private perdeu(instancia: string | null, porque: string) {
    const tinha = this.sincronizadas.size > 0
    if (instancia == null) this.sincronizadas.clear()
    else { this.sincronizadas.delete(instancia); this.sincronizadas.delete('inicial') }
    if (tinha && !this.sincronizadas.size) log(`[streaming] ${this.curto()} dessincronizada (${porque})`)
    void this.talvezPublicar()
  }

  private async ligar(): Promise<void> {
    if (this.fechado || this.aLigar || this.ligacao) return
    this.aLigar = true
    let c: Qualquer = null
    try {
      const sdk = carregarSdk()
      const conta = await metaApiPartilhada(CFG.token).metatraderAccountApi.getAccount(this.id)
      // historyStartTime = agora: não precisamos do histórico de negócios.
      c = conta.getStreamingConnection(undefined, new Date())
      const eu = this
      const seguro = (f: () => void) => { try { f() } catch (e) { log(`[streaming] ouvinte ${eu.curto()}:`, e instanceof Error ? e.message : e) } }
      class Ouvinte extends sdk.SynchronizationListener {
        async onSynchronizationStarted(i: string) { seguro(() => eu.perdeu(String(i), 'ressincronização')) }
        async onPendingOrdersSynchronized(i: string) {
          seguro(() => {
            const antes = eu.sincronizadas.size
            eu.sincronizadas.add(String(i))
            eu.atraso = RELIGAR_MIN_MS
            if (!antes) log(`[streaming] ${eu.curto()} sincronizada · ${eu.ligacao?.terminalState?.positions?.length ?? 0} posição(ões)`)
            void eu.acertarSubscricoes()
          })
        }
        async onDisconnected(i: string) { seguro(() => eu.perdeu(String(i), 'desligada')) }
        async onStreamClosed(i: string) { seguro(() => eu.perdeu(String(i), 'stream fechado')) }
        async onReconnected() { seguro(() => eu.perdeu(null, 'religada')) }
        async onPositionUpdated() { seguro(() => void eu.acertarSubscricoes()) }
        async onPositionRemoved() { seguro(() => void eu.acertarSubscricoes()) }
      }
      c.addSynchronizationListener(new Ouvinte())
      this.ligacao = c
      await c.connect()
      log(`[streaming] ${this.curto()} a sincronizar`)
    } catch (e) {
      this.ligacao = null
      if (c) await c.close().catch(() => undefined)
      registarErroMetaApi(e, `premium-streaming:ligar:${this.curto()}`)
      const limite = eLimiteMetaApi(e)
      const ms = limite ? RELIGAR_MAX_MS : this.atraso
      this.atraso = Math.min(RELIGAR_MAX_MS, this.atraso * 2)
      log(`[streaming] ${this.curto()} não ligou (${limite ? 'LIMITE da MetaApi' : 'erro'}), nova tentativa em ${Math.round(ms / 60000)} min:`, e instanceof Error ? e.message : e)
      if (!this.fechado) setTimeout(() => void this.ligar(), ms).unref?.()
      return
    } finally {
      this.aLigar = false
    }
    const ligacao = c
    ligacao.waitSynchronized({ timeoutInSeconds: 180 }).then(() => {
      if (this.fechado || this.ligacao !== ligacao || this.sincronizadas.size) return
      this.sincronizadas.add('inicial')
      log(`[streaming] ${this.curto()} sincronizada (espera) · ${ligacao.terminalState?.positions?.length ?? 0} posição(ões)`)
      void this.acertarSubscricoes()
    }).catch((e: unknown) => {
      registarErroMetaApi(e, `premium-streaming:sincronizar:${this.curto()}`)
      if (!this.sincronizada) log(`[streaming] ${this.curto()} ainda não sincronizou em 180 s (o SDK continua):`, e instanceof Error ? e.message : e)
    })
  }

  /** Preços SÓ dos símbolos com posição aberta: subscreve os novos, larga os que já não têm. */
  private async acertarSubscricoes(): Promise<void> {
    const c = this.ligacao
    if (!c || !this.sincronizada) return
    const queridos = new Set<string>(((c.terminalState?.positions ?? []) as Array<{ symbol?: string }>).map((p) => String(p.symbol ?? '')).filter(Boolean))
    for (const s of queridos) {
      if (this.subscritos.has(s)) continue
      this.subscritos.add(s)
      try {
        await c.subscribeToMarketData(s, [{ type: 'quotes', intervalInMilliseconds: CFG.intervaloMs }])
      } catch (e) {
        this.subscritos.delete(s)
        registarErroMetaApi(e, `premium-streaming:subscrever:${s}`)
        log(`[streaming] ${this.curto()} não subscreveu ${s}:`, e instanceof Error ? e.message : e)
      }
    }
    for (const s of [...this.subscritos]) {
      if (queridos.has(s)) continue
      this.subscritos.delete(s)
      await c.unsubscribeFromMarketData(s).catch(() => undefined)
    }
  }

  private fotografia(): { posicoes: PosicaoSnapshot[]; precos: Record<string, PrecoSnapshot>; sincronizado: boolean } {
    const sincronizado = this.sincronizada && !this.fechado
    if (!sincronizado) return { posicoes: [], precos: {}, sincronizado: false }
    const ts = this.ligacao.terminalState
    const posicoes = ((ts?.positions ?? []) as Record<string, unknown>[])
      .map((p) => posicaoParaSnapshot(p))
      .filter((p): p is PosicaoSnapshot => !!p)
    const precos: Record<string, PrecoSnapshot> = {}
    for (const s of new Set(posicoes.map((p) => p.symbol))) {
      const q = ts?.price?.(s) as { bid?: number; ask?: number; time?: Date | string } | undefined
      if (!q || !(Number(q.bid) > 0) || !(Number(q.ask) > 0)) continue
      const em = q.time ? new Date(q.time).getTime() : Date.now()
      precos[s] = { bid: Number(q.bid), ask: Number(q.ask), em: Number.isFinite(em) ? em : Date.now() }
    }
    return { posicoes, precos, sincronizado: true }
  }

  async talvezPublicar(forcar = false): Promise<void> {
    if (this.aEscrever) return
    const f = this.fotografia()
    const assinatura = assinaturaSnapshot(f.posicoes, f.precos, f.sincronizado)
    const agora = Date.now()
    if (!forcar && !decidirPublicacao(this.estado, assinatura, f.sincronizado, agora, CFG.intervaloMs, CFG.batimentoMs)) return
    // Sem sincronização e a linha já o diz: o batimento não serve de nada (o monitor ignora-a).
    if (!forcar && !f.sincronizado && this.estado.publicadoEm > 0 && this.estado.sincronizado !== true) return
    this.aEscrever = true
    try {
      const { error } = await this.db.from('metaapi_snapshot').upsert(
        { account_id: this.id, posicoes: f.posicoes, precos: f.precos, sincronizado: f.sincronizado, em: new Date(agora).toISOString() },
        { onConflict: 'account_id' },
      )
      if (error) throw new Error(error.message)
      this.estado = { assinatura, publicadoEm: agora, sincronizado: f.sincronizado }
      this.publicacoes++
    } catch (e) {
      log(`[streaming] ${this.curto()} escrita falhou:`, e instanceof Error ? e.message : e)
    } finally {
      this.aEscrever = false
    }
  }

  resumo(): string {
    return `${this.curto()}:${this.sincronizada ? 'sync' : 'NÃO-sync'} pos=${this.ligacao?.terminalState?.positions?.length ?? '—'} sub=${this.subscritos.size} escritas=${this.publicacoes}`
  }

  async fechar(): Promise<void> {
    this.fechado = true
    await this.talvezPublicar(true)
    await this.ligacao?.close().catch(() => undefined)
  }
}

async function main() {
  if (!CFG.contas.length) {
    log('[streaming] PREMIUM_STREAMING_CONTAS vazia — nada a fazer (o monitor usa o RPC). A dormir.')
    setInterval(() => undefined, 3_600_000)
    return
  }
  if (!CFG.supabaseUrl || !CFG.supabaseKey || !CFG.token) {
    console.error('[streaming] faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / METAAPI_TOKEN')
    process.exit(2)
  }
  const db = createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const contas = CFG.contas.map((id) => new ContaStreaming(id, db))
  log(`[streaming] ${contas.length} conta(s): ${CFG.contas.map((c) => c.slice(0, 8)).join(', ')}`)
  for (const c of contas) c.iniciar()

  // Tick curto; a regra de publicação decide se escreve (≤1×/s, só quando muda, batimento 2 s).
  const tick = setInterval(() => { for (const c of contas) void c.talvezPublicar() }, 250)
  const pulso = setInterval(() => log('[pulso]', contas.map((c) => c.resumo()).join(' · ')), 60_000)

  let aSair = false
  const sair = async (sinal: string) => {
    if (aSair) return
    aSair = true
    log(`[streaming] ${sinal} — a marcar as fotografias como dessincronizadas e a sair`)
    clearInterval(tick)
    clearInterval(pulso)
    await Promise.race([Promise.all(contas.map((c) => c.fechar())), new Promise((r) => setTimeout(r, 5_000))])
    process.exit(0)
  }
  process.on('SIGTERM', () => void sair('SIGTERM'))
  process.on('SIGINT', () => void sair('SIGINT'))
}

void main()
