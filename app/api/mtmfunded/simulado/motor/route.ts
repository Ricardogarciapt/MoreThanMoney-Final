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
    alertaId?: string
    evento?: string
    accountId?: string
    motivo?: string
    resultadoPct?: number | null
  } | null
  const evento = corpo?.evento
  const accountId = corpo?.accountId
  // Alerta de preço disparado (072): o motor já o marcou como disparado; aqui só se avisa o dono.
  if (evento === 'alerta') return avisarAlerta(String((corpo as { alertaId?: string }).alertaId ?? ''))
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

/**
 * Push + notificação na app de um alerta de preço do WebTrader. Não precisa de marca própria de
 * idempotência: o motor só chama isto depois de GANHAR a escrita que desactiva o alerta
 * (update … where ativo = true), por isso cada alerta chega cá uma vez.
 */
async function avisarAlerta(alertaId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(alertaId)) return NextResponse.json({ error: 'alerta inválido' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: a } = await db.from('funded_alertas')
    .select('id, user_id, account_id, symbol, condicao, preco, nota, preco_disparo').eq('id', alertaId).maybeSingle()
  if (!a) return NextResponse.json({ ok: true, ignorado: 'alerta não existe' })
  const origem = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').trim().replace(/\/+$/, '')
  const url = `/webtrader?symbol=${encodeURIComponent(String(a.symbol))}`
  const titulo = `🔔 ${a.symbol} ${a.condicao === 'acima' ? 'subiu a' : 'desceu a'} ${Number(a.preco)}`
  try {
    await fetch(`${origem}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userIds: [a.user_id],
        title: titulo,
        body: a.nota ? String(a.nota) : 'Alerta de preço do WebTrader MTM Funded.',
        url,
        data: { type: 'funded_alerta', alerta_id: String(a.id), symbol: String(a.symbol), url },
        tag: `funded_alerta_${a.id}`,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    console.error('[funded/motor] push do alerta falhou', (e as Error).message)
  }
  return NextResponse.json({ ok: true })
}
