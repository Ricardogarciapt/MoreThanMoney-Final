/**
 * COPIADOR MTM FUNDED → CONTA DO ALUNO — o processo longo do VPS.
 *
 * Lê a outbox `funded_copy_events` (escrita por trigger na mesma transacção das posições
 * simuladas, migração 068) e replica cada facto nas contas MT5 de destino pela MetaApi. As
 * decisões vivem em lib/mtmfunded/copia (puras e testadas); aqui só há canos:
 *
 *  · ACORDAR: Supabase Realtime nos INSERT da outbox + sondagem de 2 s como rede (o Realtime cai
 *    sem avisar; a sondagem não).
 *  · RECLAMAR: `funded_copy_reclamar(n)` — `for update skip locked` com prazo. Um processo que
 *    morra a meio devolve os eventos à fila quando o prazo acaba.
 *  · ORDEM: uma fila por posição, em série (abrir → parcial → fechar nunca se trocam); posições
 *    diferentes em paralelo. Modificações em rajada colapsam na última.
 *  · REPETIR: 1 s, 5 s, 30 s, 2 min — depois disso o evento fica com `erro` e sai da fila.
 *  · LIMITE: no máximo 4 pedidos à MetaApi em paralelo por conta de destino.
 *  · DIREITO: de 60 em 60 s relê quem tem MTM Copy / MTM Auto; quem perdeu fica em pausa (as
 *    saídas das cópias abertas continuam a passar).
 *
 * ── COPIER_ESCRITA ──────────────────────────────────────────────────────────
 *   0 → decide e escreve no log (`[seco] …`), marca os eventos como vistos e NÃO envia ordens
 *       nem grava cópias. Os eventos consumidos em seco não se repetem ao passar a 1: ligar não
 *       abre trades de ontem.
 *   1 → a sério.
 *
 * Estado reconstruível 100% da base. Reiniciar é seguro.
 */
import { getSupabaseAdmin } from '../../lib/supabase-admin-client'
import { getExecSwitches } from '../../lib/mtmcopy/exec-switches'
import { carregarDireitos } from '../../lib/entitlements'
import { condutorMetaApi, type CondutorDestino } from '../../lib/mtmfunded/copia/destinos'
import { podeCopiarFunded, copiaReaisLigada, destinoPorId } from '../../lib/mtmfunded/copia/elegibilidade'
import {
  processarEvento, colapsarModificacoes, proximaTentativa, comLimite,
  type Loja, type Copiador, type CopiaPosicao, type EventoCopia,
} from '../../lib/mtmfunded/copia/processar'

const ESCRITA = process.env.COPIER_ESCRITA === '1'
const SONDAGEM_MS = Number(process.env.COPIER_SONDAGEM_MS || 2000)
const LOTE = Number(process.env.COPIER_LOTE || 50)
const POSICOES_EM_PARALELO = Number(process.env.COPIER_PARALELO || 8)

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.METAAPI_TOKEN) {
  console.error('[copier] faltam SUPABASE_SERVICE_ROLE_KEY e/ou METAAPI_TOKEN')
  process.exit(2)
}

const db = getSupabaseAdmin()
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

/** Pequena cache com prazo — o interruptor e os direitos não mudam de segundo a segundo. */
function comCache<K, V>(ms: number, f: (k: K) => Promise<V>) {
  const m = new Map<string, { v: V; em: number }>()
  return async (k: K) => {
    const chave = JSON.stringify(k)
    const c = m.get(chave)
    if (c && Date.now() - c.em < ms) return c.v
    const v = await f(k)
    m.set(chave, { v, em: Date.now() })
    return v
  }
}

const interruptor = comCache(10_000, async () => (await getExecSwitches()).funded_copier)
const reais = comCache(30_000, async () => copiaReaisLigada())
const direitos = comCache(60_000, async (userId: string) => {
  const d = await carregarDireitos(userId)
  return { ok: podeCopiarFunded(d), admin: d.admin }
})
const destinos = comCache(15_000, async (k: { tipo: Copiador['destino_tipo']; id: string }) => destinoPorId(k.tipo, k.id))

const CAMPOS_COPIA = 'id, copier_id, funded_position_id, dest_position_id, dest_symbol, volume_origem, dest_volume_origem, fechado_pct, estado, erro, client_id, preco_origem, preco_destino, latencia_ms, parciais_aplicados, enviado_em'

const numOuNull = (v: unknown) => (v == null ? null : Number(v))
function copiaDaLinha(r: Record<string, unknown>): CopiaPosicao {
  return {
    ...(r as unknown as CopiaPosicao),
    volume_origem: Number(r.volume_origem), dest_volume_origem: numOuNull(r.dest_volume_origem),
    fechado_pct: Number(r.fechado_pct ?? 0), preco_origem: numOuNull(r.preco_origem), preco_destino: numOuNull(r.preco_destino),
    parciais_aplicados: (r.parciais_aplicados as string[]) ?? [],
  }
}
function copiadorDaLinha(r: Record<string, unknown>): Copiador {
  return {
    ...(r as unknown as Copiador),
    valor: numOuNull(r.valor), lote_max: numOuNull(r.lote_max), max_posicoes: numOuNull(r.max_posicoes),
    perda_diaria_max: numOuNull(r.perda_diaria_max), ancora_equity: numOuNull(r.ancora_equity),
    simbolos: (r.simbolos as string[]) ?? [],
  }
}

const loja: Loja = {
  async copiadores(accountId) {
    const { data, error } = await db.from('funded_copiers').select('*').eq('account_id', accountId)
    if (error) throw new Error(`ler copiadores: ${error.message}`)
    return (data ?? []).map(copiadorDaLinha)
  },
  async conta(accountId) {
    const { data, error } = await db.from('mtm_trading_accounts').select('estado, sim_saldo, mt5_login, user_id').eq('id', accountId).maybeSingle()
    if (error) throw new Error(`ler conta: ${error.message}`)
    return data ? { estado: String(data.estado), saldo: Number(data.sim_saldo ?? 0), login: (data.mt5_login as string) ?? null, userId: String(data.user_id) } : null
  },
  async destino(c) {
    const d = await destinos({ tipo: c.destino_tipo, id: c.destino_id })
    return d ? { metaapiAccountId: d.metaapiAccountId, ligado: d.ligado, demo: d.demo } : null
  },
  async copia(copierId, pos) {
    const { data, error } = await db.from('funded_copy_positions').select(CAMPOS_COPIA).eq('copier_id', copierId).eq('funded_position_id', pos).maybeSingle()
    if (error) throw new Error(`ler cópia: ${error.message}`)
    return data ? copiaDaLinha(data) : null
  },
  async inserirCopia(c) {
    const { error } = await db.from('funded_copy_positions').insert(c)
    if (error?.code === '23505') return false
    if (error) throw new Error(`gravar cópia: ${error.message}`)
    return true
  },
  async atualizarCopia(id, patch) {
    const { error } = await db.from('funded_copy_positions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(`actualizar cópia: ${error.message}`)
  },
  async copiasAbertas(copierId) {
    const { count, error } = await db.from('funded_copy_positions').select('id', { count: 'exact', head: true })
      .eq('copier_id', copierId).in('estado', ['enviando', 'aberta'])
    if (error) throw new Error(`contar cópias: ${error.message}`)
    return count ?? 0
  },
  async idsDestinoUsados(c) {
    const { data: irmaos } = await db.from('funded_copiers').select('id').eq('destino_tipo', c.destino_tipo).eq('destino_id', c.destino_id)
    const copierIds = [...new Set([c.id, ...(irmaos ?? []).map((r) => String(r.id))])]
    const { data, error } = await db.from('funded_copy_positions').select('dest_position_id')
      .in('copier_id', copierIds).in('estado', ['aberta', 'enviando']).not('dest_position_id', 'is', null)
    if (error) throw new Error(`ler ids do destino: ${error.message}`)
    return new Set((data ?? []).map((r) => String(r.dest_position_id)))
  },
  async atualizarCopiador(id, patch) {
    await db.from('funded_copiers').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  },
  direito: (userId) => direitos(userId),
  interruptor: () => interruptor(undefined),
  reaisLigadas: () => reais(undefined),
}

// TODO(fase 2): TradeLocker — despachar por `destino_tipo` (condutorTradeLocker em destinos.ts).
// Hoje um copiador tradelocker nem chega a abrir: `destinoPorId` não o encontra e a abertura é recusada.
const condutor: CondutorDestino = comLimite(condutorMetaApi, 4)

// ── a fila ───────────────────────────────────────────────────────────────────

let aCorrer = false
let pedidoDeNovo = false
const stats = { eventos: 0, ok: 0, repetidos: 0, erros: 0, saltados: 0 }

async function marcar(ev: EventoCopia, patch: Record<string, unknown>) {
  const { error } = await db.from('funded_copy_events').update({ ...patch, reclamado_ate: null }).eq('id', ev.id)
  if (error) log('[erro] marcar evento', ev.id, error.message)
}

async function tratarFilaDaPosicao(eventos: EventoCopia[]) {
  const { aProcessar, saltados } = colapsarModificacoes(eventos)
  for (const s of saltados) {
    stats.saltados++
    await marcar(s, { processado_em: new Date().toISOString(), erro: null, tentativas: s.tentativas + 1 })
  }
  for (let i = 0; i < aProcessar.length; i++) {
    const ev = aProcessar[i]
    stats.eventos++
    let r
    try {
      r = await processarEvento(ev, loja, condutor, { escrita: ESCRITA, log })
    } catch (e) {
      r = { ok: false as const, erro: e instanceof Error ? e.message : String(e), notas: [] }
    }
    const tentativas = ev.tentativas + 1
    if (r.ok) {
      stats.ok++
      if (r.notas.length) log(`[${ev.tipo}] #${ev.id} ${ev.position_id.slice(0, 8)} → ${r.notas.join(' · ')}`)
      await marcar(ev, { processado_em: new Date().toISOString(), erro: ESCRITA ? null : `seco: ${r.notas.join(' · ').slice(0, 500)}`, tentativas, proxima_em: null })
      continue
    }
    const prox = proximaTentativa(ev.tentativas)
    if (prox.desistir) {
      stats.erros++
      log(`[erro] #${ev.id} ${ev.tipo} desiste ao fim de ${tentativas}: ${r.erro}`)
      await marcar(ev, { processado_em: new Date().toISOString(), erro: r.erro.slice(0, 500), tentativas })
    } else {
      stats.repetidos++
      log(`[repetir] #${ev.id} ${ev.tipo} em ${prox.emMs / 1000}s: ${r.erro}`)
      await marcar(ev, { erro: r.erro.slice(0, 500), tentativas, proxima_em: new Date(Date.now() + prox.emMs).toISOString() })
    }
    // Os seguintes da mesma posição esperam por este: devolvem-se à fila sem contar tentativa.
    for (const resto of aProcessar.slice(i + 1)) await marcar(resto, {})
    return
  }
}

async function passagem() {
  if (aCorrer) { pedidoDeNovo = true; return }
  aCorrer = true
  try {
    do {
      pedidoDeNovo = false
      const { data, error } = await db.rpc('funded_copy_reclamar', { n: LOTE, p_prazo_s: 180 })
      if (error) { log('[erro] reclamar', error.message); break }
      const eventos = ((data ?? []) as EventoCopia[]).map((e) => ({ ...e, id: Number(e.id) }))
      if (!eventos.length) break
      const porPosicao = new Map<string, EventoCopia[]>()
      for (const e of eventos) porPosicao.set(e.position_id, [...(porPosicao.get(e.position_id) ?? []), e])
      const filas = [...porPosicao.values()]
      for (let i = 0; i < filas.length; i += POSICOES_EM_PARALELO) {
        await Promise.all(filas.slice(i, i + POSICOES_EM_PARALELO).map(tratarFilaDaPosicao))
      }
      if (eventos.length >= LOTE) pedidoDeNovo = true
    } while (pedidoDeNovo)
  } catch (e) {
    log('[erro] passagem', e instanceof Error ? e.message : e)
  } finally {
    aCorrer = false
  }
}

// ── direito perdido → pausa ─────────────────────────────────────────────────

async function verificarDireitos() {
  const { data } = await db.from('funded_copiers').select('id, user_id').eq('ativo', true)
  const porUser = new Map<string, string[]>()
  for (const r of data ?? []) porUser.set(String(r.user_id), [...(porUser.get(String(r.user_id)) ?? []), String(r.id)])
  for (const [userId, ids] of porUser) {
    try {
      const d = await carregarDireitos(userId)
      if (podeCopiarFunded(d)) continue
      log(`[direito] ${userId.slice(0, 8)} sem MTM Copy / MTM Auto → pausa ${ids.length} copiador(es)${ESCRITA ? '' : ' (seco)'}`)
      if (ESCRITA) {
        await db.from('funded_copiers').update({ ativo: false, pausado_motivo: 'sem MTM Copy / MTM Auto activo', updated_at: new Date().toISOString() }).in('id', ids)
      }
    } catch (e) {
      // Não conseguir LER o direito não é perdê-lo.
      log('[aviso] direitos', userId.slice(0, 8), e instanceof Error ? e.message : e)
    }
  }
}

// ── arranque ─────────────────────────────────────────────────────────────────

log(`[copier] a arrancar — escrita=${ESCRITA ? '1 (a sério)' : '0 (seco)'} sondagem=${SONDAGEM_MS}ms`)

db.channel('funded-copy-events')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'funded_copy_events' }, () => { void passagem() })
  .subscribe((estado) => log('[realtime]', estado))

setInterval(() => { void passagem() }, SONDAGEM_MS)
setInterval(() => { void verificarDireitos() }, 60_000)
setInterval(() => {
  log(`[pulso] eventos=${stats.eventos} ok=${stats.ok} repetir=${stats.repetidos} erro=${stats.erros} colapsados=${stats.saltados}`)
}, 60_000)
void verificarDireitos()
void passagem()

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => { log(`[copier] ${sinal} — a sair`); process.exit(0) })
}
