import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A GALERIA DO ESTÚDIO — o que já se fez no estúdio de cartões.
 *
 * As peças só viviam enquanto o separador estava aberto: um refrescar e o trabalho ia com ele.
 * O estúdio guarda cada geração aqui (do lado do cliente, depois de o resultado chegar) e a
 * galeria reabre-a — imagens, textos, camadas e posições — para continuar de onde ficou.
 *
 * GET            → as últimas 60.
 * POST {id?...}  → guarda. Com `id`, ACTUALIZA essa peça: arrastar o texto três vezes não pode
 *                  deixar três peças quase iguais na galeria.
 * DELETE ?id=    → apaga a linha (não os ficheiros — ver abaixo).
 */

const COLUNAS = 'id, handle, formato, tipo, urls, textos, params, created_at, updated_at'

export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const { data, error } = await getSupabaseAdmin()
    .from('estudio_pecas')
    .select(COLUNAS)
    .order('created_at', { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ ok: false, erro: error.message, pecas: [] }, { status: 500 })
  return NextResponse.json({ ok: true, pecas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const corpo = (await req.json().catch(() => ({}))) as {
    id?: string
    handle?: string
    formato?: string
    tipo?: string
    urls?: unknown
    textos?: unknown
    params?: unknown
  }

  const urls = Array.isArray(corpo.urls) ? corpo.urls.map(String).filter((u) => /^https?:\/\//.test(u)) : []
  if (!urls.length) return NextResponse.json({ ok: false, erro: 'sem imagens para guardar' }, { status: 400 })

  const linha = {
    handle: String(corpo.handle || 'ricardogarciapt').replace(/^@/, '').slice(0, 60),
    formato: corpo.formato === 'reel' ? 'reel' : 'post',
    tipo: corpo.tipo === 'carrossel' ? 'carrossel' : 'cartao',
    urls,
    textos: Array.isArray(corpo.textos) ? corpo.textos.map(String) : [],
    params: corpo.params && typeof corpo.params === 'object' ? corpo.params : {},
  }

  const db = getSupabaseAdmin()
  const id = String(corpo.id ?? '').trim()

  if (id) {
    const { data } = await db
      .from('estudio_pecas')
      .update({ ...linha, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(COLUNAS)
      .maybeSingle()
    if (data) return NextResponse.json({ ok: true, peca: data })
    // A peça foi apagada entretanto: cria-se outra, em vez de perder o trabalho.
  }

  const { userId } = await verifyAdminAccess()
  const { data, error } = await db
    .from('estudio_pecas')
    .insert({ ...linha, criado_por: userId ?? null })
    .select(COLUNAS)
    .single()

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, peca: data })
}

export async function DELETE(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, erro: 'sem id' }, { status: 400 })

  /**
   * Apaga-se a LINHA, não os ficheiros.
   *
   * Uma peça já publicada ou partilhada tem o endereço a circular; apagar o ficheiro partia essas
   * ligações em sítios onde nunca saberíamos.
   */
  const { error } = await getSupabaseAdmin().from('estudio_pecas').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
