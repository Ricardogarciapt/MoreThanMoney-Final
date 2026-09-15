/**
 * CÓPIA ENTRE CONTAS — o processo longo do VPS (mtm-copia-contas).
 *
 *   FONTES                                   OUTBOX                 MOTOR (lib/copia-contas/motor)
 *   MTM Funded ─ trigger 078 ───────────▶ copia_eventos ──▶ reclamar ──▶ sombra: regista a acção
 *   MT4/MT5 ── streaming MetaApi ─ diff ─▶     (chave única)            live:   escritor (adaptador)
 *   TradeLocker ─ sondagem ≥2 s ─ diff ──▶
 *
 * ── FECHADURAS ─────────────────────────────────────────────────────────────
 *  1. site_settings.copia_contas.ligado=false → o processo não liga fontes, não reclama eventos,
 *     não escreve nada além do pulso. É o estado desta entrega.
 *  2. rota.ativa + rota.estado='aprovada' → só essas rotas contam.
 *  3. modo live só com rota.modo='live' + copia_contas_live_desbloqueado=true + COPIA_ESCRITA=1.
 *     Sem as três, o motor corre em SOMBRA e nunca chama um escritor.
 *
 * ── CUSTO E CARGA ──────────────────────────────────────────────────────────
 *  · MetaApi: UMA ligação de streaming por conta de origem MT (terminalState em memória; nada de
 *    getPositions em sondagem, nada de RPC). A mesma instância do SDK para todas. Ao primeiro erro de
 *    limite da MetaApi, as fontes fecham 1 h (a entrega aos subscritores tem prioridade e usa o mesmo
 *    token). Uma fonte MT só existe enquanto houver rota activa.
 *  · Supabase: eventos só nascem de factos de trading (em lote, chave única → sem duplicados); o
 *    Realtime acorda o consumidor e a sondagem de rede é de 10 s; pulso 1×/min; limpeza 1×/h.
 *
 * Estado reconstruível da base. Reiniciar é seguro: a primeira fotografia de cada fonte é só base.
 */
import { getSupabaseAdmin } from '../../lib/supabase-admin-client'
import { lerContaPorRef } from '../../lib/copia-contas/servidor/refs'
import { escritorPara, lerPosicoesTradeLocker, saldoDaOrigem } from '../../lib/copia-contas/servidor/escritores'
import { chaveEvento } from '../../lib/copia-contas/calculo'
import { colapsarModificacoes, diffPosicoes, proximaSondagemMs, proximaTentativa, reconciliarArranque, type Facto } from '../../lib/copia-contas/diff'
import { latenciaMs, processarEventoCopia, type EscritorDestino, type LojaCopia } from '../../lib/copia-contas/motor'
import { INTERRUPTORES_FECHADOS, type Interruptores } from '../../lib/copia-contas/regras'
import type { CopiaPosicao, EventoCopia, PosicaoOrigem, RotaCopia } from '../../lib/copia-contas/tipos'
import { aoLimiteMetaApi, carregarSdk, espelhoPausadoAte, metaApiPartilhada, registarErroMetaApi } from '../funded-motor/metaapi-partilhada'

type Qualquer = any

const VERSAO = 'copia-contas/1'
const ESCRITA = process.env.COPIA_ESCRITA === '1'
const SONDAGEM_OUTBOX_MS = Math.max(2_000, Number(process.env.COPIA_SONDAGEM_MS || 10_000))
const LOTE = Number(process.env.COPIA_LOTE || 50)
const TL_MIN_MS = Math.max(2_000, Number(process.env.COPIA_TL_MIN_MS || 2_000))

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[copia] falta SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const db = getSupabaseAdmin()
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)
const stats = { factos: 0, eventos: 0, sombra: 0, ok: 0, recusados: 0, erros: 0, saltados: 0 }

let interruptores: Interruptores = { ...INTERRUPTORES_FECHADOS }
let rotas: RotaCopia[] = []

// ── rotas e interruptores (30 s) ───────────────────────────────────────────────

async function recarregar(): Promise<void> {
  const { data: s } = await db.from('site_settings').select('key, value').in('key', ['copia_contas', 'copia_contas_live_desbloqueado'])
  const m = new Map((s ?? []).map((r) => [String(r.key), r.value as unknown]))
  interruptores = {
    globalLigado: (m.get('copia_contas') as { ligado?: boolean } | undefined)?.ligado === true,
    liveDesbloqueado: m.get('copia_contas_live_desbloqueado') === true,
    escritaNoProcesso: ESCRITA,
  }
  if (!interruptores.globalLigado) { rotas = []; return }
  const { data, error } = await db.from('copia_rotas').select('*').eq('estado', 'aprovada').eq('ativa', true)
  if (error) { log('[erro] ler rotas', error.message); return }
  rotas = (data ?? []) as unknown as RotaCopia[]
}

const rotasDaOrigem = (ref: string) => rotas.filter((r) => r.origem_ref === ref)

// ── factos → outbox (em lote, deduplicados pela chave) ─────────────────────────

async function publicarFactos(origemRef: string, factos: Facto[]): Promise<void> {
  if (!factos.length) return
  const { manter } = colapsarModificacoes(factos)
  const linhas = rotasDaOrigem(origemRef).flatMap((r) => manter
    .filter((f) => f.tipo !== 'open' || !r.aprovada_em || !f.payload.aberta_em || Date.parse(f.payload.aberta_em) >= Date.parse(r.aprovada_em))
    .map((f) => ({
      rota_id: r.id, origem_posicao_id: f.posicaoId, tipo: f.tipo, payload: f.payload,
      chave: chaveEvento(r.id, f.posicaoId, f.tipo, f.discriminador), origem_em: new Date().toISOString(),
    })))
  if (!linhas.length) return
  stats.factos += linhas.length
  const { error } = await db.from('copia_eventos').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true })
  if (error) log('[erro] publicar factos', origemRef, error.message)
}

/** Primeira fotografia de uma fonte: o que mudou enquanto o processo esteve parado. */
async function factosDeArranque(origemRef: string, atual: PosicaoOrigem[]): Promise<Facto[]> {
  const ids = rotasDaOrigem(origemRef).map((r) => r.id)
  if (!ids.length) return []
  const { data, error } = await db.from('copia_posicoes').select('rota_id, origem_posicao_id, volume_origem_abertura, fechado_pct, direcao, destino_simbolo')
    .in('rota_id', ids).in('estado', ['sombra', 'enviando', 'aberta'])
  if (error) { log('[erro] reconciliar arranque', origemRef, error.message); return [] }
  const unicas = new Map<string, { origem_posicao_id: string; volume_origem_abertura: number; fechado_pct: number; direcao: 'buy' | 'sell' | null; destino_simbolo: string | null }>()
  for (const c of data ?? []) {
    const k = String(c.origem_posicao_id)
    const atualC = unicas.get(k)
    const fechado = Number(c.fechado_pct ?? 0)
    // várias rotas da mesma origem: a que assume MAIS volume aberto decide (a chave por rota deduplica)
    if (!atualC || fechado < atualC.fechado_pct) unicas.set(k, { origem_posicao_id: k, volume_origem_abertura: Number(c.volume_origem_abertura), fechado_pct: fechado, direcao: (c.direcao as 'buy' | 'sell' | null) ?? null, destino_simbolo: (c.destino_simbolo as string) ?? null })
  }
  const factos = reconciliarArranque([...unicas.values()], atual)
  if (factos.length) log(`[arranque] ${origemRef}: ${factos.map((f) => `${f.tipo}:${f.posicaoId}`).join(', ')}`)
  return factos
}

// ── fonte MT4/MT5: streaming ───────────────────────────────────────────────────

function posicaoDoTerminal(p: Record<string, unknown>): PosicaoOrigem | null {
  if (!p?.id || !p.symbol) return null
  return {
    id: String(p.id), symbol: String(p.symbol), direcao: /SELL/i.test(String(p.type)) ? 'sell' : 'buy',
    volume: Number(p.volume ?? 0), preco: p.openPrice == null ? null : Number(p.openPrice),
    sl: p.stopLoss ? Number(p.stopLoss) : null, tp: p.takeProfit ? Number(p.takeProfit) : null,
    abertaEm: p.time ? new Date(p.time as string).toISOString() : null,
  }
}

interface Fonte { ref: string; parar(): Promise<void>; resumo(): string }

function fonteMt(ref: string, accountId: string): Fonte {
  let ligacao: Qualquer = null
  let fechado = false
  let sincronizada = false
  let foto: Map<string, PosicaoOrigem> | null = null
  let agendado: NodeJS.Timeout | null = null
  const curto = accountId.slice(0, 8)

  const ler = () => {
    if (agendado || fechado) return
    agendado = setTimeout(() => {
      agendado = null
      if (!ligacao || !sincronizada) return // dessincronizada = «não sei»: nenhum facto
      const atual = ((ligacao.terminalState?.positions ?? []) as Record<string, unknown>[]).map(posicaoDoTerminal).filter((p): p is PosicaoOrigem => !!p)
      const desde = Math.min(...rotasDaOrigem(ref).map((r) => (r.aprovada_em ? Date.parse(r.aprovada_em) : Date.now())))
      const primeira = foto == null
      const r = diffPosicoes(foto, atual, { desdeMs: Number.isFinite(desde) ? desde : null })
      foto = r.fotografia
      void (async () => publicarFactos(ref, [...(primeira ? await factosDeArranque(ref, atual) : []), ...r.factos]))()
    }, 300)
  }

  const ligar = async () => {
    if (fechado) return
    if (espelhoPausadoAte()) { setTimeout(() => void ligar(), espelhoPausadoAte() - Date.now() + 1_000).unref?.(); return }
    try {
      const sdk = carregarSdk()
      const conta = await metaApiPartilhada(String(process.env.METAAPI_TOKEN)).metatraderAccountApi.getAccount(accountId)
      const c = conta.getStreamingConnection(undefined, new Date())
      class Ouvinte extends sdk.SynchronizationListener {
        async onSynchronizationStarted() { sincronizada = false }
        async onPositionsSynchronized() { sincronizada = true; ler() }
        async onPendingOrdersSynchronized() { sincronizada = true; ler() }
        async onDisconnected() { sincronizada = false }
        async onStreamClosed() { sincronizada = false }
        async onPositionUpdated() { ler() }
        async onPositionRemoved() { ler() }
        async onPositionsUpdated() { ler() }
      }
      c.addSynchronizationListener(new Ouvinte())
      ligacao = c
      await c.connect()
      log(`[fonte mt] ${curto} a sincronizar`)
    } catch (e) {
      ligacao = null
      const limite = registarErroMetaApi(e, `copia-contas:${curto}`)
      log(`[fonte mt] ${curto} não ligou${limite ? ' (LIMITE MetaApi: fontes em pausa 1 h)' : ''}:`, e instanceof Error ? e.message : e)
      if (!fechado) setTimeout(() => void ligar(), limite ? 3_600_000 : 120_000).unref?.()
    }
  }
  void ligar()
  return {
    ref,
    async parar() { fechado = true; if (agendado) clearTimeout(agendado); await ligacao?.close?.().catch(() => undefined); ligacao = null },
    resumo: () => `mt:${curto}:${sincronizada ? 'sync' : 'NÃO-sync'}:${foto?.size ?? '—'}`,
  }
}

// ── fonte TradeLocker: sondagem partilhada por conta ───────────────────────────

function fonteTl(ref: string): Fonte {
  let fechado = false
  let foto: Map<string, PosicaoOrigem> | null = null
  let intervalo = TL_MIN_MS
  let t: NodeJS.Timeout | null = null
  const passo = async () => {
    if (fechado) return
    const atual = await lerPosicoesTradeLocker(ref).catch(() => null)
    intervalo = proximaSondagemMs(intervalo, atual != null, TL_MIN_MS)
    if (atual != null) {
      const desde = Math.min(...rotasDaOrigem(ref).map((r) => (r.aprovada_em ? Date.parse(r.aprovada_em) : Date.now())))
      const primeira = foto == null
      const r = diffPosicoes(foto, atual, { desdeMs: Number.isFinite(desde) ? desde : null })
      foto = r.fotografia
      await publicarFactos(ref, [...(primeira ? await factosDeArranque(ref, atual) : []), ...r.factos])
    }
    if (!fechado) t = setTimeout(() => void passo(), intervalo)
  }
  void passo()
  return { ref, async parar() { fechado = true; if (t) clearTimeout(t) }, resumo: () => `tl:${ref.slice(5, 13)}:${intervalo}ms:${foto?.size ?? '—'}` }
}

const fontes = new Map<string, Fonte>()

async function acertarFontes(): Promise<void> {
  const queridas = new Map<string, RotaCopia>()
  if (interruptores.globalLigado && !espelhoPausadoAte()) {
    for (const r of rotas) if (r.origem_tipo !== 'mtmfunded') queridas.set(r.origem_ref, r)
  }
  for (const [ref, f] of fontes) {
    if (queridas.has(ref)) continue
    await f.parar()
    fontes.delete(ref)
    log('[fonte] parada', ref)
  }
  for (const [ref, r] of queridas) {
    if (fontes.has(ref)) continue
    if (r.origem_tipo === 'tradelocker') { fontes.set(ref, fonteTl(ref)); log('[fonte] tradelocker', ref); continue }
    const conta = await lerContaPorRef(ref)
    if (!conta?.metaapiAccountId) { log('[fonte] sem conta MetaApi', ref); continue }
    fontes.set(ref, fonteMt(ref, conta.metaapiAccountId))
  }
}

aoLimiteMetaApi(() => { void (async () => { for (const [ref, f] of fontes) { await f.parar(); fontes.delete(ref) } })() })

// ── consumidor ─────────────────────────────────────────────────────────────────

const escritores = new Map<string, { e: EscritorDestino | null; em: number }>()
async function escritor(destinoRef: string): Promise<EscritorDestino | null> {
  const c = escritores.get(destinoRef)
  if (c && Date.now() - c.em < 60_000) return c.e
  const e = await escritorPara(destinoRef).catch(() => null)
  escritores.set(destinoRef, { e, em: Date.now() })
  return e
}

const loja = (rota: RotaCopia): LojaCopia => ({
  async copia(rotaId, pos) {
    const { data, error } = await db.from('copia_posicoes').select('*').eq('rota_id', rotaId).eq('origem_posicao_id', pos).maybeSingle()
    if (error) throw new Error(`ler cópia: ${error.message}`)
    return data ? ({ ...data, volume_origem_abertura: Number(data.volume_origem_abertura), volume_destino_abertura: data.volume_destino_abertura == null ? null : Number(data.volume_destino_abertura), fechado_pct: Number(data.fechado_pct ?? 0) } as CopiaPosicao) : null
  },
  async inserirCopia(c) {
    const { error } = await db.from('copia_posicoes').insert(c)
    if (error?.code === '23505') return false
    if (error) throw new Error(`gravar cópia: ${error.message}`)
    return true
  },
  async atualizarCopia(id, patch) {
    const { error } = await db.from('copia_posicoes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(`actualizar cópia: ${error.message}`)
  },
  async abertasNaRota(rotaId) {
    const { count } = await db.from('copia_posicoes').select('id', { count: 'exact', head: true }).eq('rota_id', rotaId).in('estado', ['sombra', 'enviando', 'aberta'])
    return count ?? 0
  },
  saldoOrigem: () => saldoDaOrigem(rota.origem_ref),
})

let aCorrer = false
let deNovo = false

async function consumir(): Promise<void> {
  if (!interruptores.globalLigado) return
  if (aCorrer) { deNovo = true; return }
  aCorrer = true
  try {
    do {
      deNovo = false
      const { data, error } = await db.rpc('copia_reclamar', { n: LOTE, p_prazo_s: 180 })
      if (error) { log('[erro] reclamar', error.message); break }
      const eventos = ((data ?? []) as EventoCopia[]).map((e) => ({ ...e, id: Number(e.id) }))
      if (!eventos.length) break
      const porRota = new Map(rotas.map((r) => [r.id, r]))
      const filas = new Map<string, EventoCopia[]>()
      for (const e of eventos) filas.set(`${e.rota_id}|${e.origem_posicao_id}`, [...(filas.get(`${e.rota_id}|${e.origem_posicao_id}`) ?? []), e])
      await Promise.all([...filas.values()].map(async (fila) => {
        for (let i = 0; i < fila.length; i++) {
          const ev = fila[i]
          // Rota fora da lista (pausada/apagada entretanto): lê-se da base para decidir (saídas passam).
          let rota = porRota.get(ev.rota_id) ?? null
          if (!rota) {
            const { data: r } = await db.from('copia_rotas').select('*').eq('id', ev.rota_id).maybeSingle()
            rota = (r as unknown as RotaCopia) ?? null
          }
          const e = rota ? await escritor(rota.destino_ref) : null
          const d = await processarEventoCopia(ev, rota, rota ? loja(rota) : (null as never), e, { interruptores, log })
          stats.eventos++
          if (d.resultado === 'sombra') stats.sombra++
          else if (d.resultado === 'ok') stats.ok++
          else if (d.resultado === 'recusado') stats.recusados++
          else if (d.resultado === 'saltado') stats.saltados++
          else stats.erros++
          const agora = Date.now()
          if (d.repetir) {
            const p = proximaTentativa(ev.tentativas)
            if (!p.desistir) {
              await db.from('copia_eventos').update({ erro: String(d.erro ?? '').slice(0, 500), tentativas: ev.tentativas + 1, proxima_em: new Date(agora + p.emMs).toISOString(), reclamado_ate: null }).eq('id', ev.id)
              for (const resto of fila.slice(i + 1)) await db.from('copia_eventos').update({ reclamado_ate: null }).eq('id', resto.id)
              return
            }
          }
          await db.from('copia_eventos').update({
            processado_em: new Date(agora).toISOString(), resultado: d.resultado, acao_pretendida: d.acaoPretendida, acao_real: d.acaoReal ?? null,
            latencia_ms: latenciaMs(ev, agora), erro: d.erro ? String(d.erro).slice(0, 500) : null, tentativas: ev.tentativas + 1, reclamado_ate: null,
          }).eq('id', ev.id)
          if (d.resultado !== 'saltado') log(`[${d.modo}] ${ev.tipo} #${ev.id} rota ${ev.rota_id.slice(0, 8)} → ${d.resultado} ${JSON.stringify(d.acaoPretendida)}${d.erro ? ` · ${d.erro}` : ''}`)
        }
      }))
      if (eventos.length >= LOTE) deNovo = true
    } while (deNovo)
  } catch (e) {
    log('[erro] consumir', e instanceof Error ? e.message : e)
  } finally {
    aCorrer = false
  }
}

// ── pulso e limpeza ────────────────────────────────────────────────────────────

async function pulso(): Promise<void> {
  const estado = {
    ligado: interruptores.globalLigado, live_desbloqueado: interruptores.liveDesbloqueado, escrita: ESCRITA,
    rotas: rotas.length, fontes: [...fontes.values()].map((f) => f.resumo()), pausa_limite_ate: espelhoPausadoAte() || null, ...stats,
  }
  log('[pulso]', JSON.stringify(estado))
  await db.from('servicos_pulso').upsert({ servico: 'mtm-copia-contas', host: process.env.HOSTNAME ?? null, versao: VERSAO, estado, em: new Date().toISOString() }, { onConflict: 'servico' })
}

// ── arranque ───────────────────────────────────────────────────────────────────

let canal: Qualquer = null
async function ciclo(): Promise<void> {
  await recarregar().catch((e) => log('[erro] recarregar', e instanceof Error ? e.message : e))
  await acertarFontes().catch((e) => log('[erro] fontes', e instanceof Error ? e.message : e))
  if (interruptores.globalLigado && !canal) {
    canal = db.channel('copia-eventos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'copia_eventos' }, () => { void consumir() })
      .subscribe((s) => log('[realtime]', s))
  } else if (!interruptores.globalLigado && canal) {
    await db.removeChannel(canal).catch(() => undefined)
    canal = null
  }
}

log(`[copia] a arrancar — ${VERSAO} escrita=${ESCRITA ? '1' : '0 (sombra)'} sondagem=${SONDAGEM_OUTBOX_MS}ms`)
void ciclo().then(() => consumir())
setInterval(() => { void ciclo() }, 30_000)
setInterval(() => { void consumir() }, SONDAGEM_OUTBOX_MS)
setInterval(() => { void pulso() }, 60_000)
setInterval(() => { if (interruptores.globalLigado) void db.rpc('copia_limpar', { p_dias: 7 }).then(({ data }) => log('[limpeza] eventos apagados:', data)) }, 3_600_000)
void pulso()

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    log(`[copia] ${sinal} — a fechar fontes`)
    void Promise.race([Promise.all([...fontes.values()].map((f) => f.parar())), new Promise((r) => setTimeout(r, 5_000))]).then(() => process.exit(0))
  })
}
