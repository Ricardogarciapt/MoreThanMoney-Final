import { NextRequest, NextResponse } from 'next/server'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { isIosAppRequest } from '@/lib/is-native-request'
import { listarContasReais } from '@/lib/webtrader/contas'
import { removerContaWebtraderMt5 } from '@/lib/webtrader/entrar'
import { lerRefConta } from '@/lib/webtrader/corretoras/regras'
import { ErroCorretora } from '@/lib/webtrader/corretoras/tipos'

export const dynamic = 'force-dynamic'

/**
 * CONTAS REAIS DO WEBTRADER (TradeLocker + MT5) do utilizador com sessão MTM.
 *
 *   GET                      → { contas, compraPermitida }  (MTM Funded: /api/mtmfunded/simulado/contas)
 *   DELETE ?ref=mt5:wt:<id>  → remove uma conta MT5 aberta só no WebTrader (apaga a conta MetaApi se
 *                              nenhuma outra ligação a usa). As do ligador removem-se em /member-area/contas.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ contas: [], compraPermitida: !isIosAppRequest(request) }, { status: 401 })
  const contas = await listarContasReais(userId)
  return NextResponse.json({ contas, compraPermitida: !isIosAppRequest(request) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  const ref = lerRefConta('mt5', request.nextUrl.searchParams.get('ref'))
  if (!ref || ref.plataforma !== 'mt5' || ref.origem !== 'wt') {
    return NextResponse.json({ error: 'Só se removem aqui as contas abertas no WebTrader — as outras em «As minhas contas».' }, { status: 400 })
  }
  try {
    return NextResponse.json(await removerContaWebtraderMt5(userId, ref.id))
  } catch (e) {
    if (e instanceof ErroCorretora) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
