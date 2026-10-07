/**
 * SINAL → ORDEM LIMITE NUMA CONTA SIMULADA (07/10) — o irmão de `abrirSinalNaConta` para quando a
 * estratégia entra na ZONA do trader em vez de a mercado (Premium: lib/mestres/premium.ts ›
 * entradaPremium). A ordem fica em `funded_orders` com a gestão (072) já gravada; é o MOTOR do VPS
 * que a enche quando o preço lá chega (funded_executar_pendente copia gestão, ideia_ref e comentário
 * para a posição) e a expira na hora marcada. Daí para a frente é uma posição como as outras: o
 * motor das mestres (services/copia-contas) leva-a às contas dos subscritores no instante em que abre.
 *
 * NUNCA DUPLICAR: a mesma ponte de `abrirSinalNaConta` (`funded_sinal_posicoes`, unique conta+chave)
 * é reclamada ANTES da ordem. A ponte de uma pendente fica `aberta` sem posição até o motor a encher;
 * `arrumarPontesPendentes` liga-a à posição (ou fecha-a quando a ordem expira/cancela).
 *
 * Nunca lança: devolve o resultado por conta.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { aplicarLoteMinimo, gestaoDoSinal, loteParaConta, type ConfigSinais } from './calculo'
import type { ResultadoAbrir } from './abrir'
import type { Direcao } from '../simulado/matematica'

export interface PedidoPendente {
  accountId: string
  estrategia: string
  chave: string
  fonte: string
  comentario: string
  symbol: string
  direcao: Direcao
  /** preço da limite (meio da zona) */
  preco: number
  expiraEm: string
  sl: number
  tps: number[]
  cfg: ConfigSinais
  /**
   * lote MÍNIMO da conta (mtm_trading_accounts.lote_minimo, 197). Ausente → lê-se da conta: a regra é
   * da CONTA e vale em qualquer caminho de entrada (a mercado em abrir.ts, por limite aqui).
   */
  loteMinimo?: number | null
}

/** `lote_minimo` da conta (197); sem a coluna ou sem valor → null. Nunca lança. */
async function loteMinimoDaConta(accountId: string): Promise<number | null> {
  try {
    const { data, error } = await getSupabaseAdmin().from('mtm_trading_accounts').select('lote_minimo').eq('id', accountId).maybeSingle()
    if (error || data?.lote_minimo == null) return null
    const n = Number(data.lote_minimo)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** Níveis absolutos do trader vistos da LIMITE: alvos do lado errado dela saem. Pura. */
export function niveisDaLimite(direcao: Direcao, preco: number, sl: number, tps: number[]): { sl: number | null; tps: number[] } {
  const lado = direcao === 'buy' ? 1 : -1
  return {
    sl: (preco - sl) * lado > 0 ? sl : null,
    tps: tps.filter((x) => Number.isFinite(x) && x > 0 && (x - preco) * lado > 0),
  }
}

export async function colocarPendenteDoSinal(p: PedidoPendente): Promise<ResultadoAbrir> {
  const db = getSupabaseAdmin()
  const base = { accountId: p.accountId }
  let ponteId: string | null = null
  try {
    const { data: ponte, error: ePonte } = await db.from('funded_sinal_posicoes').insert({
      account_id: p.accountId, estrategia: p.estrategia, chave: p.chave, impressao: null, fonte: p.fonte,
      symbol: p.symbol, direcao: p.direcao, entrada: p.preco, sl: p.sl, tps: p.tps, estado: 'a_abrir',
    }).select('id').single()
    if (ePonte || !ponte) {
      if (ePonte?.code === '23505') return { ...base, ok: false, estado: 'duplicado', motivo: 'corrida' }
      return { ...base, ok: false, estado: 'erro', motivo: ePonte?.message ?? 'ponte sem linha' }
    }
    ponteId = String(ponte.id)

    const ex = await import('../simulado/execucao')
    const { candidatosDeTicker } = await import('../simulado/ordens')
    const conta = await ex.lerConta(p.accountId)
    if (!conta || conta.motor !== 'sim' || conta.estado !== 'ativa') throw new Error('conta simulada inactiva ou inexistente')
    const candidatos = candidatosDeTicker(p.symbol)
    const simbolos = await ex.carregarSimbolos(candidatos)
    const symbol = candidatos.find((c) => simbolos[c])
    if (!symbol) throw new Error(`${p.symbol} não existe no MTM Funded`)
    const s = simbolos[symbol]

    const minimo = p.loteMinimo !== undefined ? p.loteMinimo : await loteMinimoDaConta(p.accountId)
    const volume = aplicarLoteMinimo(loteParaConta(Number(conta.sim_saldo ?? conta.saldo_inicial ?? 0), p.cfg, s), minimo, s)
    const niveis = niveisDaLimite(p.direcao, p.preco, p.sl, p.tps)
    if (niveis.sl == null) throw new Error(`SL ${p.sl} do lado errado da limite ${p.preco}`)
    // A gestão mede-se a partir do preço da LIMITE — é a esse preço que a posição nasce.
    const { gestao, tpFinal } = gestaoDoSinal({ simbolo: s, direcao: p.direcao, precoExecucao: p.preco, volume, sl: niveis.sl, tps: niveis.tps, cfg: p.cfg })
    const ordem = {
      symbol, direcao: p.direcao, tipo: 'limit' as const, volume, preco: p.preco, sl: niveis.sl, tp: tpFinal,
      expiraEm: p.expiraEm, origem: 'estrategia' as const, ideiaRef: `sinal:${p.chave}`, comentario: p.comentario,
    }
    let criada: { ordem: Record<string, unknown> }
    let semGestao = false
    try {
      criada = await ex.criarPendente(conta, { ...ordem, gestao })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof ex.ErroOrdem) || !/072|trailing|break-even|TP\d|take-profit|gatilho|offset/i.test(msg)) throw e
      semGestao = true
      criada = await ex.criarPendente(conta, ordem)
    }
    const ordemId = String((criada.ordem as { id?: string }).id ?? '')
    // `estrategia` não entra pela porta dos pedidos externos (origemValida) — marca-se aqui, e o motor
    // passa-a à posição quando a ordem enche (funded_executar_pendente copia `origem`).
    await db.from('funded_orders').update({ origem: 'estrategia' }).eq('id', ordemId).eq('estado', 'pendente')
    await db.from('funded_sinal_posicoes').update({
      estado: 'aberta', volume, symbol, sem_gestao: semGestao, sl: niveis.sl, tps: niveis.tps,
      // A ordem fica ligada por COLUNA (199); o texto em `erro` mantém-se para quem ainda o lê.
      funded_order_id: ordemId || null, erro: `pendente ${ordemId}`, updated_at: new Date().toISOString(),
    }).eq('id', ponteId)
    return { ...base, ok: true, estado: 'pendente', positionId: ordemId, volume, semGestao }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (ponteId) await db.from('funded_sinal_posicoes').update({ estado: 'recusada', erro: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', ponteId)
    return { ...base, ok: false, estado: 'recusada', motivo: msg }
  }
}

/**
 * Pontes de pendentes (estado `aberta`, sem posição, `erro` = «pendente <id>»): a ordem encheu →
 * liga-se à posição; expirou/cancelou → a ponte fecha como `cancelada`. Nunca lança.
 */
export async function arrumarPontesPendentes(accountIds: string[], estrategia: string): Promise<void> {
  try {
    const db = getSupabaseAdmin()
    const { data } = await db.from('funded_sinal_posicoes').select('id, erro, funded_order_id')
      .in('account_id', accountIds).eq('estrategia', estrategia).eq('estado', 'aberta').is('funded_position_id', null).limit(200)
    // Pela coluna (199); o texto em `erro` só para as pontes de antes dela.
    const pontes = (data ?? []).map((r) => ({
      id: String(r.id),
      ordem: (r.funded_order_id as string | null) ?? /^pendente ([0-9a-f-]{36})$/.exec(String(r.erro ?? ''))?.[1] ?? null,
    })).filter((r) => r.ordem)
    if (!pontes.length) return
    const { data: ordens } = await db.from('funded_orders').select('id, estado, position_id').in('id', pontes.map((p) => p.ordem!))
    const porId = new Map((ordens ?? []).map((o) => [String(o.id), o]))
    const agora = new Date().toISOString()
    for (const p of pontes) {
      const o = porId.get(p.ordem!)
      if (!o || o.estado === 'pendente') continue
      if (o.estado === 'executada' && o.position_id) {
        await db.from('funded_sinal_posicoes').update({ funded_position_id: o.position_id, erro: null, updated_at: agora }).eq('id', p.id)
      } else {
        await db.from('funded_sinal_posicoes').update({ estado: 'cancelada', erro: `pendente ${o.estado}`, updated_at: agora }).eq('id', p.id)
      }
    }
  } catch {
    // arrumação: nunca parte a abertura
  }
}
