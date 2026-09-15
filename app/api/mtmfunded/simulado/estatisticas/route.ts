import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { estatisticasDaContaServidor, PONTOS_CURVA, reduzirCurva } from '@/lib/mtmfunded/numeros-conta'

export const dynamic = 'force-dynamic'

/**
 * ESTATÍSTICAS DA CONTA — o separador «Estatísticas» do WebTrader.
 *
 * GET ?accountId=&equity= → KPIs, curva de saldo/equity com drawdown, e os agrupamentos (símbolo,
 * origem, estratégia, hora e dia UTC). As contas são de lib/mtmfunded/simulado/estatisticas.ts
 * (pura, com teste). `equity` é a do ecrã (com os preços ao vivo); sem ela usa-se a última do motor.
 *
 * Leitura: dono (sessão MTM) ou sessão da conta — master OU investor (ver estatísticas é ler).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const { conta } = await autorizarConta(request, sp.get('accountId') ?? '')
    // As MESMAS leituras e contas do admin (lib/mtmfunded/numeros-conta.ts): o dono e o admin vêem o mesmo.
    const est = await estatisticasDaContaServidor(getSupabaseAdmin(), conta as never, { equity: Number(sp.get('equity')) })
    return NextResponse.json({ ...est, curva: reduzirCurva(est.curva, PONTOS_CURVA) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[funded/estatisticas]', e)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
