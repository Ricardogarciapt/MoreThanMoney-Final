import { NextRequest, NextResponse } from 'next/server'
import { linkDoDia, listarLinks } from '@/lib/broker-links'

export const dynamic = 'force-dynamic'

/**
 * O link de hoje, para quem precisa dele em vez de um redireccionamento.
 *
 * O VPS de vendas é o caso: as mensagens que ele envia levam o link escrito no texto, e um
 * `t.me` não segue redireccionamentos por si. Com `?pool=1` e o segredo do cron devolve a lista
 * toda, para o VPS poder distribuir por conversa em vez de por dia, se um dia isso fizer sentido.
 */
export async function GET(req: NextRequest) {
  const hoje = await linkDoDia()

  if (req.nextUrl.searchParams.get('pool') === '1') {
    const segredo = (process.env.CRON_SECRET ?? '').trim()
    const dado = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!segredo || dado !== segredo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const todos = await listarLinks()
    return NextResponse.json({ hoje, links: todos.filter((l) => l.ativo) })
  }

  return NextResponse.json(hoje, { headers: { 'Cache-Control': 'no-store' } })
}
