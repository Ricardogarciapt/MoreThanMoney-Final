/**
 * CÓPIA ENTRE CONTAS — o processo longo do VPS (mtm-copia-contas).
 *
 *   FONTES                                   OUTBOX                 MOTOR (lib/copia-contas/motor)
 *   MTM Funded ─ trigger 078/083 ───────▶ copia_eventos ──▶ reclamar ──▶ sombra: regista a acção
 *   MT4/MT5 ── streaming MetaApi ─ diff ─▶     (chave única)            live:   escritor (adaptador)
 *   TradeLocker ─ sondagem ≥2 s ─ diff ──▶
 *
 * Origens: contas de clientes (site/auto/wt/funded), contas de ESTRATÉGIA das equipas MTM Auto (prov:,
 * migração 083) e as rotas migradas do copiador MTM Funded 068 (scripts/copia-contas/migrar-funded-copiers.ts
 * — são rotas normais `funded:` e correm pelo trigger).
 *
 * ── FECHADURAS ─────────────────────────────────────────────────────────────
 *  1. site_settings.copia_contas.ligado=false → o processo não liga fontes, não reclama eventos,
 *     não escreve nada além do pulso. É o estado desta entrega.
 *  2. rota.ativa + rota.estado='aprovada' → só essas rotas contam.
 *  3. modo live só com rota.modo='live' + copia_contas_live_desbloqueado=true + COPIA_ESCRITA=1.
 *     Sem as três, o motor corre em SOMBRA e nunca chama um escritor.
 *
 * ── CHAVES METAAPI (casa × equipas) ────────────────────────────────────────
 *  Cada conta fala com a SUA chave (lib/copia-contas/tokens.ts): casa = METAAPI_TOKEN; conta de equipa =
 *  mtmauto_tenants.metaapi_token. Uma instância do SDK por chave; a da casa é a partilhada do processo.
 *  Limite na casa → todas as fontes MT da CASA fecham 1 h (os subscritores têm prioridade). Limite numa
 *  equipa → só as fontes dessa equipa fecham. Nenhum token é escrito em logs (só 'casa' | 'equipa:<id>').
 *
 * ── CUSTO E CARGA ──────────────────────────────────────────────────────────
 *  · MetaApi: UMA ligação de streaming por conta FÍSICA de origem (lib/copia-contas/fontes.ts), partilhada
 *    por todas as rotas dessa conta — clientes e estratégias. terminalState em memória; nada de
 *    getPositions em sondagem, nada de RPC. Uma fonte só existe enquanto houver rota activa.
 *  · TradeLocker: uma sondagem por conta física, ≥2 s com recuo até 60 s; sessão e conta lidas uma vez.
 *  · Supabase: eventos só nascem de factos de trading (em lote, chave única); sondagem da outbox 10 s;
 *    contas de origem relidas no máximo de 5 em 5 min; pulso 1×/min; limpeza 1×/h.
 *
 * Estado reconstruível da base. Reiniciar é seguro: a primeira fotografia de cada fonte é só base.
 */
import { getSupabaseAdmin } from '../../lib/supabase-admin-client'
import { lerContaPorRef, tokenDaConta, type ContaPorRef } from '../../lib/copia-contas/servidor/refs'
import { escritorPara, lerPosicoesTradeLocker, saldoDaOrigem } from '../../lib/copia-contas/servidor/escritores'
import { chaveEvento } from '../../lib/copia-contas/calculo'
import { colapsarModificacoes, diffPosicoes, proximaSondagemMs, proximaTentativa, reconciliarArranque, type Facto } from '../../lib/copia-contas/diff'
import { agruparFontes, desdeDaFonte, type ContaDaFonte, type FonteAgrupada } from '../../lib/copia-contas/fontes'
import { latenciaMs, processarEventoCopia, type EscritorDestino, type LojaCopia } from '../../lib/copia-contas/motor'
import { INTERRUPTORES_FECHADOS, type Interruptores } from '../../lib/copia-contas/regras'
import { RegistoPorToken, type ChaveToken, type TokenResolvido } from '../../lib/copia-contas/tokens'
import type { CopiaPosicao, EventoCopia, PosicaoOrigem, RotaCopia } from '../../lib/copia-contas/tipos'
import { aoLimiteMetaApi, carregarSdk, eLimiteMetaApi, espelhoPausadoAte, metaApiPartilhada, registarErroMetaApi } from '../funded-motor/metaapi-partilhada'

type Qualquer = any

const VERSAO = 'copia-contas/2'
const ESCRITA = process.env.COPIA_ESCRITA === '1'
const SONDAGEM_OUTBOX_MS = Math.max(2_000, Number(process.env.COPIA_SONDAGEM_MS || 10_000))
const LOTE = Number(process.env.COPIA_LOTE || 50)
const TL_MIN_MS = Math.max(2_000, Number(process.env.COPIA_TL_MIN_MS || 2_000))
const PAUSA_EQUIPA_MS = 60 * 60_000

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[copia] falta SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}

const db = getSupabaseAdmin()
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)
const stats = { factos: 0, eventos: 0, sombra: 0, ok: 0, recusados: 0, erros: 0, saltados: 0 }

let interruptores: Interruptores = { ...INTERRUPTORES_FECHADOS }
let rotas: RotaCopia[] = []

// ── SDK por chave ──────────────────────────────────────────────────────────────

const sdks = new RegistoPorToken<Qualquer>((t: TokenResolvido) => {
  if (t.chave === 'casa') return metaApiPartilhada(t.token)
  const sdk = carregarSdk()
  const MetaApi = sdk.default ?? sdk
  return new MetaApi(t.token)
})

/** Pausa da chave: casa = interruptor partilhado do motor; equipa = só essa equipa. */
const pausaDaChave = (chave: ChaveToken) => (chave === 'casa' ? espelhoPausadoAte() : sdks.pausadaAte(chave))

function registarErroDaChave(chave: ChaveToken, e: unknown, origem: string): boolean {
  if (chave === 'casa') return registarErroMetaApi(e, origem)
  if (!eLimiteMetaApi(e)) return false
  sdks.pausar(chave, Date.now() + PAUSA_EQUIPA_MS)
  void pararFontesDaChave(chave)
  return true
}

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

// ── contas de origem (cache 5 min por ref) ─────────────────────────────────────

const contas = new Map<string, { c: (ContaPorRef & { chaveToken: ChaveToken | null; token: string | null }) | null; em: number }>()

async function contaDaOrigem(ref: string) {
  const g = contas.get(ref)
  if (g && Date.now() - g.em < 300_000) return g.c
  const conta = await lerContaPorRef(ref).catch(() => null)
  const t = conta && (conta.plataforma === 'mt4' || conta.plataforma === 'mt5') ? await tokenDaConta(conta).catch(() => null) : null
  const c = conta ? { ...conta, chaveToken: t?.chave ?? null, token: t?.token ?? null } : null
  contas.set(ref, { c, em: Date.now() })
  return c
}

// ── factos → outbox (em lote, deduplicados pela chave) ─────────────────────────

interface Fonte { chave: string; chaveToken: ChaveToken | null; rotas: RotaCopia[]; parar(): Promise<void>; resumo(): string }
const fontes = new Map<string, Fonte>()

async function publicarFactos(f: Fonte, factos: Facto[]): Promise<void> {
  if (!factos.length) return
  const { manter } = colapsarModificacoes(factos)
  // A lista de rotas em memória tem até 30 s. Uma estratégia que trocou de fonte (mestre ↔ espelho,
  // mtmauto_trocar_fonte_execucao) muda a origem_chave das rotas NA HORA: relê-se (por PK, só quando há
  // factos de trading) para a fonte antiga nunca publicar em rotas que já não são dela.
  const origemChave = f.chave.slice(f.chave.indexOf('|') + 1)
  const { data: vivas, error: eVivas } = await db.from('copia_rotas').select('id').in('id', f.rotas.map((r) => r.id))
    .eq('origem_chave', origemChave).eq('ativa', true).eq('estado', 'aprovada')
  if (eVivas) { log('[erro] confirmar rotas da fonte', eVivas.message); return }
  const ids = new Set((vivas ?? []).map((r) => String(r.id)))
  const linhas = f.rotas.filter((r) => ids.has(r.id)).flatMap((r) => manter
    .filter((x) => x.tipo !== 'open' || !r.aprovada_em || !x.payload.aberta_em || Date.parse(x.payload.aberta_em) >= Date.parse(r.aprovada_em))
    .map((x) => ({
      rota_id: r.id, origem_posicao_id: x.posicaoId, tipo: x.tipo, payload: x.payload,
      chave: chaveEvento(r.id, x.posicaoId, x.tipo, x.discriminador), origem_em: new Date().toISOString(),
    })))
  if (!linhas.length) return
  stats.factos += linhas.length
  const { error } = await db.from('copia_eventos').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true })
  if (error) log('[erro] publicar factos', f.chave.replace(/^equipa:[^|]+/, 'equipa'), error.message)
}

/** Primeira fotografia de uma fonte: o que mudou enquanto o processo esteve parado. */
async function factosDeArranque(f: Fonte, atual: PosicaoOrigem[]): Promise<Facto[]> {
  const ids = f.rotas.map((r) => r.id)
  if (!ids.length) return []
  const { data, error } = await db.from('copia_posicoes').select('rota_id, origem_posicao_id, volume_origem_abertura, fechado_pct, direcao, destino_simbolo')
    .in('rota_id', ids).in('estado', ['sombra', 'enviando', 'aberta'])
  if (error) { log('[erro] reconciliar arranque', error.message); return [] }
  const unicas = new Map<string, { origem_posicao_id: string; volume_origem_abertura: number; fechado_pct: number; direcao: 'buy' | 'sell' | null; destino_simbolo: string | null }>()
  for (const c of data ?? []) {
    const k = String(c.origem_posicao_id)
    const atualC = unicas.get(k)
    const fechado = Number(c.fechado_pct ?? 0)
    // várias rotas da mesma origem: a que assume MAIS volume aberto decide (a chave por rota deduplica)
    if (!atualC || fechado < atualC.fechado_pct) unicas.set(k, { origem_posicao_id: k, volume_origem_abertura: Number(c.volume_origem_abertura), fechado_pct: fechado, direcao: (c.direcao as 'buy' | 'sell' | null) ?? null, destino_simbolo: (c.destino_simbolo as string) ?? null })
  }
  const factos = reconciliarArranque([...unicas.values()], atual)
  if (factos.length) log(`[arranque] ${f.rotas.length} rota(s): ${factos.map((x) => `${x.tipo}:${x.posicaoId}`).join(', ')}`)
  return factos
}

// ── fonte MT4/MT5: streaming, uma por conta física por chave ───────────────────

function posicaoDoTerminal(p: Record<string, unknown>): PosicaoOrigem | null {
  if (!p?.id || !p.symbol) return null
  return {
    id: String(p.id), symbol: String(p.symbol), direcao: /SELL/i.test(String(p.type)) ? 'sell' : 'buy',
    volume: Number(p.volume ?? 0), preco: p.openPrice == null ? null : Number(p.openPrice),
    sl: p.stopLoss ? Number(p.stopLoss) : null, tp: p.takeProfit ? Number(p.takeProfit) : null,
    abertaEm: p.time ? new Date(p.time as string).toISOString() : null,
  }
}

function fonteMt(g: FonteAgrupada, t: TokenResolvido): Fonte {
  let ligacao: Qualquer = null
  let fechado = false
  let sincronizada = false
  let foto: Map<string, PosicaoOrigem> | null = null
  let agendado: NodeJS.Timeout | null = null
  const accountId = g.metaapiAccountId!
  const curto = `${t.chave === 'casa' ? 'casa' : 'equipa'}:${accountId.slice(0, 8)}`

  const fonte: Fonte = {
    chave: g.chave, chaveToken: t.chave, rotas: g.rotas,
    async parar() { fechado = true; if (agendado) clearTimeout(agendado); await ligacao?.close?.().catch(() => undefined); ligacao = null },
    resumo: () => `mt:${curto}:${sincronizada ? 'sync' : 'NÃO-sync'}:${foto?.size ?? '—'}:${fonte.rotas.length}r`,
  }

  const ler = () => {
    if (agendado || fechado) return
    agendado = setTimeout(() => {
      agendado = null
      if (!ligacao || !sincronizada) return // dessincronizada = «não sei»: nenhum facto
      const atual = ((ligacao.terminalState?.positions ?? []) as Record<string, unknown>[]).map(posicaoDoTerminal).filter((p): p is PosicaoOrigem => !!p)
      const primeira = foto == null
      const r = diffPosicoes(foto, atual, { desdeMs: desdeDaFonte(fonte.rotas) })
      foto = r.fotografia
      void (async () => publicarFactos(fonte, [...(primeira ? await factosDeArranque(fonte, atual) : []), ...r.factos]))()
    }, 300)
  }

  const ligar = async () => {
    if (fechado) return
    const pausa = pausaDaChave(t.chave)
    if (pausa) { setTimeout(() => void ligar(), pausa - Date.now() + 1_000).unref?.(); return }
    try {
      const sdk = carregarSdk()
      const conta = await sdks.cliente(t).metatraderAccountApi.getAccount(accountId)
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
      log(`[fonte mt] ${curto} a sincronizar (${fonte.rotas.length} rota(s))`)
    } catch (e) {
      ligacao = null
      const limite = registarErroDaChave(t.chave, e, `copia-contas:${curto}`)
      log(`[fonte mt] ${curto} não ligou${limite ? ' (LIMITE MetaApi desta chave: fontes dela em pausa 1 h)' : ''}:`, e instanceof Error ? e.message.slice(0, 200) : e)
      if (!fechado) setTimeout(() => void ligar(), limite ? 3_600_000 : 120_000).unref?.()
    }
  }
  void ligar()
  return fonte
}

// ── fonte TradeLocker: sondagem partilhada por conta física ────────────────────

function fonteTl(g: FonteAgrupada, conta: ContaPorRef): Fonte {
  let fechado = false
  let foto: Map<string, PosicaoOrigem> | null = null
  let intervalo = TL_MIN_MS
  let t: NodeJS.Timeout | null = null
  const fonte: Fonte = {
    chave: g.chave, chaveToken: null, rotas: g.rotas,
    async parar() { fechado = true; if (t) clearTimeout(t) },
    resumo: () => `tl:${g.chave.slice(3, 24)}:${intervalo}ms:${foto?.size ?? '—'}:${fonte.rotas.length}r`,
  }
  const passo = async () => {
    if (fechado) return
    const atual = await lerPosicoesTradeLocker(conta).catch(() => null)
    intervalo = proximaSondagemMs(intervalo, atual != null, TL_MIN_MS)
    if (atual != null) {
      const primeira = foto == null
      const r = diffPosicoes(foto, atual, { desdeMs: desdeDaFonte(fonte.rotas) })
      foto = r.fotografia
      await publicarFactos(fonte, [...(primeira ? await factosDeArranque(fonte, atual) : []), ...r.factos])
    }
    if (!fechado) t = setTimeout(() => void passo(), intervalo)
  }
  void passo()
  return fonte
}

async function pararFontesDaChave(chave: ChaveToken): Promise<void> {
  for (const [k, f] of fontes) {
    if (f.chaveToken !== chave) continue
    await f.parar()
    fontes.delete(k)
  }
}

async function acertarFontes(): Promise<void> {
  const vivas = interruptores.globalLigado ? rotas.filter((r) => r.origem_tipo !== 'mtmfunded') : []
  const mapaContas = new Map<string, ContaDaFonte | null>()
  const cheias = new Map<string, Awaited<ReturnType<typeof contaDaOrigem>>>()
  for (const ref of new Set(vivas.map((r) => r.origem_ref))) {
    const c = await contaDaOrigem(ref)
    cheias.set(ref, c)
    mapaContas.set(ref, c ? { ref: c.ref, plataforma: c.plataforma, metaapiAccountId: c.metaapiAccountId ?? null, chaveToken: c.chaveToken } : null)
  }
  const { fontes: queridas, semFonte } = agruparFontes(vivas, mapaContas)
  for (const s of semFonte) log('[fonte] rota sem fonte', s.rotaId.slice(0, 8), s.motivo)

  for (const [k, f] of fontes) {
    const q = queridas.get(k)
    if (q && !(f.chaveToken && pausaDaChave(f.chaveToken))) { f.rotas = q.rotas; continue } // rotas actualizadas sem religar
    await f.parar()
    fontes.delete(k)
    log('[fonte] parada', k.replace(/^equipa:[^|]+/, 'equipa'))
  }
  for (const [k, g] of queridas) {
    if (fontes.has(k)) continue
    const conta = cheias.get(g.ref)
    if (!conta) continue
    if (g.tipo === 'tl') { fontes.set(k, fonteTl(g, conta)); log('[fonte] tradelocker', g.rotas.length, 'rota(s)'); continue }
    if (!conta.token || !conta.chaveToken || pausaDaChave(conta.chaveToken)) continue
    fontes.set(k, fonteMt(g, { chave: conta.chaveToken, token: conta.token }))
  }
}

// Limite na CASA: as fontes da casa fecham (as das equipas continuam — chaves diferentes).
aoLimiteMetaApi(() => { void pararFontesDaChave('casa') })

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
  const equipasEmPausa = [...new Set([...fontes.values()].map((f) => f.chaveToken).filter((c): c is ChaveToken => !!c && c !== 'casa' && sdks.pausadaAte(c) > 0))].length
  const estado = {
    ligado: interruptores.globalLigado, live_desbloqueado: interruptores.liveDesbloqueado, escrita: ESCRITA,
    rotas: rotas.length, fontes: [...fontes.values()].map((f) => f.resumo()), chaves_sdk: sdks.tamanho,
    pausa_limite_casa_ate: espelhoPausadoAte() || null, equipas_em_pausa: equipasEmPausa, ...stats,
  }
  log('[pulso]', JSON.stringify(estado))
  await db.from('servicos_pulso').upsert({ servico: 'mtm-copia-contas', host: process.env.HOSTNAME ?? null, versao: VERSAO, estado, em: new Date().toISOString() }, { onConflict: 'servico' })
}

// ── arranque ───────────────────────────────────────────────────────────────────

async function ciclo(): Promise<void> {
  await recarregar().catch((e) => log('[erro] recarregar', e instanceof Error ? e.message : e))
  await acertarFontes().catch((e) => log('[erro] fontes', e instanceof Error ? e.message : e))
}

log(`[copia] a arrancar — ${VERSAO} escrita=${ESCRITA ? '1' : '0 (sombra)'} sondagem=${SONDAGEM_OUTBOX_MS}ms (sem Realtime: BD frágil)`)
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
