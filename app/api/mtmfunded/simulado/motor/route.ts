import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O BALCÃO DO MOTOR DE SIMULAÇÃO (VPS).
 *
 * O motor decide o que acontece a uma conta simulada — quebrou, passou — e grava-o na base. O
 * que vem DEPOIS precisa do site: emails com a marca, certificado em PDF, conta da fase seguinte.
 * Isso já existe em `ciclo-de-vida.ts` e é o mesmo para as contas do MT5; o motor não o
 * reimplementa, pede-o aqui.
 *
 * POST {evento:'quebrou'|'objetivo', accountId, motivo?, resultadoPct?}
 * GET  → saúde: contas simuladas activas e o último preço escrito.
 *
 * Autentica pelo segredo dos workers do VPS (o mesmo das legendas e do videocliper): é a mesma
 * máquina, e um segundo segredo seria mais uma coisa para rodar e mais uma para esquecer.
 *
 * IDEMPOTENTE, e tem de ser: o motor volta a mandar o evento enquanto `metricas.eventoPendente`
 * existir (site em baixo, timeout, reinício). Um aviso repetido não pode mandar dois emails de
 * quebra nem emitir dois certificados — por isso a marca de «tratado» vive na conta e é esta
 * rota que a escreve.
 */

function autorizado(request: NextRequest): boolean {
  const esperado = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  if (!esperado) return false
  return request.headers.get('x-caption-secret')?.trim() === esperado
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const db = getSupabaseAdmin()
  const [{ count }, { data: preco }] = await Promise.all([
    db.from('mtm_trading_accounts').select('id', { count: 'exact', head: true }).eq('motor', 'sim').eq('estado', 'ativa'),
    db.from('funded_precos').select('symbol, bid, ask, em').order('em', { ascending: false }).limit(1).maybeSingle(),
  ])
  return NextResponse.json({ contasSimuladasAtivas: count ?? 0, ultimoPreco: preco ?? null })
}

export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const corpo = (await request.json().catch(() => null)) as {
    evento?: string
    accountId?: string
    motivo?: string
    resultadoPct?: number | null
  } | null
  const evento = corpo?.evento
  const accountId = corpo?.accountId
  if ((evento !== 'quebrou' && evento !== 'objetivo') || !accountId) {
    return NextResponse.json({ error: 'evento ou conta em falta' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, motor, estado, quebrou_regra, metricas')
    .eq('id', accountId)
    .maybeSingle()
  if (!conta) return NextResponse.json({ ok: true, ignorado: 'conta não existe' })
  // Só contas do motor: uma conta MT5 é da MetaApi e do cron, e um evento destes para ela seria
  // um motor a mandar numa conta que não mede.
  if (conta.motor !== 'sim') return NextResponse.json({ error: 'conta não é simulada' }, { status: 409 })

  const metricas = (conta.metricas ?? {}) as Record<string, unknown>
  const marcar = async (extra: Record<string, unknown>) => {
    const { eventoPendente: _pendente, ...resto } = metricas
    void _pendente
    await db.from('mtm_trading_accounts').update({ metricas: { ...resto, ...extra } }).eq('id', accountId)
  }

  const { quebrarConta, concluirDesafio } = await import('@/lib/mtmfunded/ciclo-de-vida')

  if (evento === 'quebrou') {
    if (metricas.quebraAvisadaEm) {
      await marcar({})
      return NextResponse.json({ ok: true, jaTratado: true })
    }
    if (conta.estado !== 'quebrada') {
      return NextResponse.json({ error: `a conta está «${conta.estado}», não quebrada` }, { status: 409 })
    }
    // Sem apagar: a conta simulada guarda as posições e os ticks que provam a quebra (ver
    // quebrarConta, que já não apaga contas `sim` por omissão).
    const r = await quebrarConta(accountId, corpo?.motivo || (conta.quebrou_regra as string) || 'regra')
    await marcar({ quebraAvisadaEm: new Date().toISOString() })
    return NextResponse.json({ ok: r.ok, emailEnviado: r.emailEnviado })
  }

  // objetivo
  if (conta.estado !== 'ativa' || metricas.faseConcluida) {
    await marcar({})
    return NextResponse.json({ ok: true, jaTratado: true })
  }
  const r = await concluirDesafio(accountId, { resultadoPct: corpo?.resultadoPct ?? null })
  if (r.ok) {
    // concluirDesafio reescreveu as métricas (fase, faseConcluida); tira-se o pendente dessa versão.
    const { data: depois } = await db.from('mtm_trading_accounts').select('metricas').eq('id', accountId).maybeSingle()
    const m = (depois?.metricas ?? {}) as Record<string, unknown>
    delete m.eventoPendente
    await db.from('mtm_trading_accounts').update({ metricas: m }).eq('id', accountId)
  }
  return NextResponse.json({ ok: r.ok, codigo: r.codigo, proximaFase: r.proximaFase ?? null, erro: r.erro })
}
