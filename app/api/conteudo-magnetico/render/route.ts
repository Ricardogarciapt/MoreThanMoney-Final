import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RENDERS_POR_DIA_MEMBRO, quemPede } from '@/lib/conteudo-magnetico/acesso'
import { marcasPermitidas, resolverMarca } from '@/lib/conteudo-magnetico/marcas'
import { normalizarGuiao, OBJECTIVOS, TONS } from '@/lib/conteudo-magnetico/guiao'
import { verificarObjecto } from '@/lib/conteudo-magnetico/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A FILA dos reels. O vídeo NÃO se faz aqui: a Vercel não tem ffmpeg nem tempo para isso.
 * Aqui só se põe o trabalho na fila; o motor (services/conteudo-magnetico-render, na VPS ou
 * no Mac) reclama-o, desenha e devolve o MP4.
 */
export async function POST(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  const b = await request.json().catch(() => ({}))
  const g = b.guiao || {}
  if (!marcasPermitidas(quem.admin).includes(g.marca)) {
    return NextResponse.json({ erro: 'Essa marca é só da casa.' }, { status: 403 })
  }
  const guiao = normalizarGuiao(g, {
    formato: 'reel',
    marca: g.marca,
    nicho: String(g.nicho || ''),
    objectivo: g.objectivo in OBJECTIVOS ? g.objectivo : 'atracao',
    tom: g.tom in TONS ? g.tom : 'educativo',
  })
  if (!guiao.reel?.segmentos.length) {
    return NextResponse.json({ erro: 'O guião não tem segmentos de reel.' }, { status: 400 })
  }
  const avisos = verificarObjecto(guiao)
  if (avisos.length) {
    return NextResponse.json({ erro: 'O guião ainda falha as regras de conteúdo.', avisos }, { status: 422 })
  }

  const db = getSupabaseAdmin()
  if (!quem.admin) {
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count } = await db
      .from('conteudo_magnetico_renders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', quem.userId)
      .gte('criado_em', desde)
    if ((count ?? 0) >= RENDERS_POR_DIA_MEMBRO) {
      return NextResponse.json({ erro: `Máximo de ${RENDERS_POR_DIA_MEMBRO} vídeos por dia.` }, { status: 429 })
    }
  }

  const marca = resolverMarca(guiao.marca, b.propria)
  const { data, error } = await db
    .from('conteudo_magnetico_renders')
    .insert({
      user_id: quem.userId,
      peca_id: b.peca_id || null,
      guiao,
      marca,
      fundo_url: typeof b.fundo_url === 'string' ? b.fundo_url.slice(0, 1000) : null,
    })
    .select('id, estado, criado_em')
    .maybeSingle()
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, render: data })
}

export async function GET(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  const { data } = await getSupabaseAdmin()
    .from('conteudo_magnetico_renders')
    .select('id, estado, video_url, erro, criado_em, terminado_em, guiao->laminas')
    .eq('user_id', quem.userId)
    .order('criado_em', { ascending: false })
    .limit(10)
  return NextResponse.json({ ok: true, renders: data ?? [] })
}

/** DELETE ?id= — tira da fila (ou apaga um que falhou). Só os do próprio; um vídeo a montar ou pronto fica. */
export async function DELETE(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ erro: 'id inválido' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('conteudo_magnetico_renders')
    .delete()
    .eq('id', id)
    .eq('user_id', quem.userId)
    .in('estado', ['na_fila', 'erro'])
    .select('id')
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ erro: 'Não está na fila (ou não é teu).' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
