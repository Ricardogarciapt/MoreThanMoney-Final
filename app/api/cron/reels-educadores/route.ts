import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { amanha, atualizarMetricas, entregar, marcarErro, planearDia, urlDeUpload } from '@/lib/reels-educadores/dia'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O BALCÃO DO ROBÔ DOS REELS DIÁRIOS (`.github/workflows/reels-diarios.yml`).
 *
 * GET  ?dia=AAAA-MM-DD → lê as notas do Instagram, escreve os roteiros que faltam, trata dos
 *                        cortes, e devolve o que há para desenhar.
 * POST { acao: 'upload-url', ext }            → endereço assinado do storage.
 * POST { acao: 'entregar', id, videoUrl, capaUrl } → o reel entra na fila (ou fica rascunho).
 * POST { acao: 'erro', id, erro }             → o reel não se desenhou.
 */

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const pedido = request.nextUrl.searchParams.get('dia') ?? ''
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : amanha()
  const metricas = await atualizarMetricas().catch(() => 0)
  const plano = await planearDia(dia)
  return NextResponse.json({ ...plano, metricas })
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  const corpo = await request.json().catch(() => ({}))
  try {
    if (corpo?.acao === 'upload-url') return NextResponse.json(await urlDeUpload(corpo.ext === 'jpg' ? 'jpg' : 'mp4'))
    if (corpo?.acao === 'entregar') {
      if (!corpo.id || !String(corpo.videoUrl ?? '').startsWith('https://')) return NextResponse.json({ error: 'faltam dados' }, { status: 400 })
      return NextResponse.json(await entregar(String(corpo.id), String(corpo.videoUrl), corpo.capaUrl ? String(corpo.capaUrl) : null))
    }
    if (corpo?.acao === 'erro' && corpo.id) {
      await marcarErro(String(corpo.id), String(corpo.erro ?? 'erro no desenho'))
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
