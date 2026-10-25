import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { MARCA_BASE, gravarMarca, lerMarca, limparMarca } from '@/lib/marketing/marca'

export const dynamic = 'force-dynamic'

/** GET → a marca que os geradores e os especialistas leem. PUT { marca } → grava (só o dono). */
export async function GET(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  return NextResponse.json({ marca: await lerMarca(), base: MARCA_BASE })
}

export async function PUT(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.gestao_comercial')
  if (g.negado) return g.negado
  if (!g.admin) return NextResponse.json({ error: 'Só o dono muda a marca.' }, { status: 403 })
  const b = (await request.json().catch(() => ({}))) as { marca?: unknown }
  const r = await gravarMarca(limparMarca(b.marca))
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: 500 })
}
