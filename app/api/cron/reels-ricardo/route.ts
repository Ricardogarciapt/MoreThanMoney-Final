import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { urlDeUpload } from '@/lib/reels-educadores/dia'
import { entregar, planear } from '@/lib/reels-ricardo/dia'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O BALCÃO DO ROBÔ DOS REELS DO @ricardogarciapt (`.github/workflows/reels-ricardo.yml`).
 *
 * GET  [?n=N]  → próximo guião + voz clonada (URLs públicos, uma por fala) + fotos do Ricardo.
 *               Com `n` desenha esse guião mesmo com o interruptor desligado (pré-visualização).
 * POST { acao: 'upload-url', ext }                       → endereço assinado do storage.
 * POST { acao: 'entregar', n, videoUrl, capaUrl, rascunho } → o reel entra na fila da conta pessoal.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const n = Number(request.nextUrl.searchParams.get('n')) || undefined
  try {
    return NextResponse.json(await planear(n))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const corpo = await request.json().catch(() => ({}))
  try {
    if (corpo?.acao === 'upload-url') return NextResponse.json(await urlDeUpload(corpo.ext === 'jpg' ? 'jpg' : 'mp4'))
    if (corpo?.acao === 'entregar') {
      const n = Number(corpo.n)
      if (!n || !String(corpo.videoUrl ?? '').startsWith('https://')) return NextResponse.json({ error: 'faltam dados' }, { status: 400 })
      const capa = String(corpo.capaUrl ?? '').startsWith('https://') ? String(corpo.capaUrl) : null
      return NextResponse.json(await entregar(n, String(corpo.videoUrl), capa, corpo.rascunho === true))
    }
    return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
