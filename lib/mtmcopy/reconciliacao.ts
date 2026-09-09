/**
 * RECONCILIAÇÃO — pôr o nosso lado a dizer o que a corretora diz.
 *
 * Uma posição fecha na corretora e o nosso lado nunca sabe. Não havia nada a verificar isso, e o
 * resultado apanhou-se a 09/09: 83 posições marcadas como abertas que não existiam — 14 delas
 * numa conta que já tinha sido APAGADA da MetaApi, penduradas há duas semanas. Enquanto lá
 * estiveram, o motor tentava geri-las e as estatísticas contavam-nas.
 *
 * ── A regra que faz isto ser seguro ───────────────────────────────────────────────────────────
 * NÃO CONSEGUIR LER NÃO É PROVA DE QUE FECHOU.
 *
 * As contas ociosas são desligadas pela MetaApi sozinhas, e uma conta desligada responde
 * "nenhuma posição" com a mesma cara com que responderia se estivesse mesmo vazia. Fechar por
 * causa disso era apagar do nosso lado posições que estão abertas com dinheiro lá dentro — e
 * depois ninguém as gere, porque para nós já não existem.
 *
 * Por isso só se fecha um registo em dois casos, e em mais nenhum:
 *   1. a conta já não existe na MetaApi (404) — não há posição possível;
 *   2. a conta está LIGADA, respondeu, e a posição não está na lista dela.
 *
 * Em tudo o resto — conta desligada, leitura falhada, erro de rede — não se toca em nada.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { readOpenPositions } from './metaapi'

export type EstadoConta = 'apagada' | 'ligada' | 'indisponivel'

export interface DecisaoCtx {
  estado: EstadoConta
  /** Posições abertas na corretora para o símbolo+direção do registo. `null` = não se conseguiu ler. */
  posicoesIguais: number | null
}

/**
 * Fecha-se este registo? A parte que decide, isolada do que fala com a rede — para poder ser
 * testada sem MetaApi nenhuma, que é onde estes erros se escondem.
 */
export function deveFechar(ctx: DecisaoCtx): boolean {
  if (ctx.estado === 'apagada') return true
  if (ctx.estado !== 'ligada') return false
  if (ctx.posicoesIguais == null) return false
  return ctx.posicoesIguais === 0
}

async function estadoDaConta(accountId: string): Promise<EstadoConta> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return 'indisponivel'
  try {
    const r = await fetch(
      `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${accountId}`,
      { headers: { 'auth-token': token }, signal: AbortSignal.timeout(15_000) },
    )
    if (r.status === 404) return 'apagada'
    if (!r.ok) return 'indisponivel'
    const a = (await r.json()) as { state?: string; connectionStatus?: string }
    return a.state === 'DEPLOYED' && a.connectionStatus === 'CONNECTED' ? 'ligada' : 'indisponivel'
  } catch {
    return 'indisponivel'
  }
}

export interface ResultadoReconciliacao {
  contas: number
  fechados_motor: number
  fechados_t2t: number
  saltados: number
  detalhe: Array<{ conta: string; estado: EstadoConta; fechados: number; saltados: number }>
}

/**
 * `idadeMinutos` existe porque uma posição acabada de abrir pode ainda não aparecer na lista da
 * corretora. Fechá-la por isso era o oposto do que se quer: o registo certo, apagado por ser
 * demasiado recente.
 */
export async function reconciliarPosicoes(opts?: {
  seco?: boolean
  idadeMinutos?: number
}): Promise<ResultadoReconciliacao> {
  const seco = opts?.seco === true
  const idade = Math.max(5, opts?.idadeMinutos ?? 15)
  const corte = new Date(Date.now() - idade * 60_000).toISOString()
  const db = getSupabaseAdmin()

  const [{ data: motor }, { data: t2t }] = await Promise.all([
    db
      .from('mtmcopy_premium_active')
      .select('id, account_id, symbol, direction')
      .eq('status', 'open')
      .lt('created_at', corte),
    db
      .from('mtmcopy_signal_log')
      .select('id, connection_id, symbol, direction, broker_position_id')
      .in('status', ['ok', 'filled', 'active', 'open', 'following'])
      .lt('created_at', corte),
  ])

  // O T2T guarda a ligação do cliente, não a conta MetaApi — é preciso traduzir.
  const connIds = [...new Set((t2t ?? []).map((r) => r.connection_id).filter(Boolean))] as string[]
  const contaDeConn = new Map<string, string>()
  if (connIds.length) {
    const { data: conns } = await db
      .from('mtmcopy_connections')
      .select('id, metaapi_account_id')
      .in('id', connIds)
    for (const c of conns ?? []) {
      if (c.metaapi_account_id) contaDeConn.set(c.id as string, c.metaapi_account_id as string)
    }
  }

  const porConta = new Map<string, { motor: typeof motor; t2t: typeof t2t }>()
  for (const r of motor ?? []) {
    const k = String(r.account_id)
    if (!porConta.has(k)) porConta.set(k, { motor: [], t2t: [] })
    porConta.get(k)!.motor!.push(r)
  }
  for (const r of t2t ?? []) {
    const k = contaDeConn.get(String(r.connection_id))
    if (!k) continue // sem conta associada não há nada contra que reconciliar
    if (!porConta.has(k)) porConta.set(k, { motor: [], t2t: [] })
    porConta.get(k)!.t2t!.push(r)
  }

  const out: ResultadoReconciliacao = {
    contas: porConta.size,
    fechados_motor: 0,
    fechados_t2t: 0,
    saltados: 0,
    detalhe: [],
  }

  for (const [conta, regs] of porConta) {
    const estado = await estadoDaConta(conta)
    const posicoes = estado === 'ligada' ? await readOpenPositions(conta) : null
    // `readOpenPositions` devolve null quando NÃO CONSEGUIU LER. Uma lista vazia é diferente:
    // é a corretora a dizer que não há nada aberto. Tratar as duas como iguais era o erro.
    const conseguiuLer = estado === 'apagada' || (estado === 'ligada' && posicoes != null)

    let fechados = 0
    let saltados = 0

    const iguais = (symbol: string, dir: string) =>
      posicoes == null
        ? null
        : posicoes.filter(
            (p) =>
              String(p.symbol ?? '').toUpperCase().startsWith(String(symbol ?? '').toUpperCase()) &&
              (String(p.type ?? '').includes('BUY') ? 'buy' : 'sell') === dir,
          ).length

    for (const r of regs.motor ?? []) {
      const decidir = deveFechar({ estado, posicoesIguais: iguais(String(r.symbol), String(r.direction)) })
      if (!decidir) { saltados++; continue }
      if (!seco) {
        await db.from('mtmcopy_premium_active').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', r.id)
      }
      fechados++
      out.fechados_motor++
    }

    for (const r of regs.t2t ?? []) {
      // Com id de posição a comparação é exata; sem ele cai-se no símbolo+direção.
      const pid = r.broker_position_id ? String(r.broker_position_id) : null
      const conta_ = pid && posicoes ? (posicoes.some((p) => String(p.id) === pid) ? 1 : 0) : iguais(String(r.symbol), String(r.direction))
      const decidir = deveFechar({ estado, posicoesIguais: conta_ })
      if (!decidir) { saltados++; continue }
      if (!seco) await db.from('mtmcopy_signal_log').update({ status: 'closed' }).eq('id', r.id)
      fechados++
      out.fechados_t2t++
    }

    out.saltados += saltados
    out.detalhe.push({ conta, estado, fechados, saltados })
    if (!conseguiuLer && saltados > 0) {
      console.warn(`[reconciliacao] ${conta}: ${estado} — ${saltados} registos deixados como estão (não se conseguiu confirmar).`)
    }
  }

  return out
}
