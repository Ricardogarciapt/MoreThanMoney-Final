import { NextRequest, NextResponse } from 'next/server'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { ErroCorretora } from '@/lib/webtrader/corretoras/tipos'
import { CABECALHO_SESSAO_TL, emitirCredenciaisFeed } from '@/lib/webtrader/feed-directo/emitir'

export const dynamic = 'force-dynamic'

/**
 * CREDENCIAL CURTA PARA O FEED DIRECTO — `POST { ref }` com sessão MTM.
 *
 *   mt5:*          → { plataforma:'metaapi', token (restrito, só leitura, 2 h), accountId, regiao, versao, expiraEm }
 *   tradelocker:*  → { plataforma:'tradelocker', accessToken, accNum, accountId, baseUrl, routeIds, expiraEm }  (SEM refreshToken)
 *
 * A posse e a quota decidem-se nas mesmas funções das ordens (autorizarMt5 / sessaoDaLigacao):
 * uma conta que não é do utilizador dá 403/404. Nunca se devolve uma chave mestra.
 */
export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Entra com a tua conta MTM para ligar o feed da corretora.' }, { status: 401 })
  const corpo = (await request.json().catch(() => ({}))) as { ref?: unknown }
  try {
    const credenciais = await emitirCredenciaisFeed(userId, corpo.ref, {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
      userAgent: request.headers.get('user-agent'),
      sessaoTL: request.headers.get(CABECALHO_SESSAO_TL),
    })
    return NextResponse.json(credenciais, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ErroCorretora) {
      // «Não é tua» sai como 403 para o browser saber que não vale a pena insistir.
      const status = e.status === 404 && /não encontrada/i.test(e.message) ? 403 : e.status
      return NextResponse.json({ error: e.message, code: e.codigo ?? null, ...(e.extra ?? {}) }, { status })
    }
    console.error('[feed-directo/token]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
