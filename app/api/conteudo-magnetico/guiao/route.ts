import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { mensagemIndisponivel } from '@/lib/ia/chamar'
import { quemPede } from '@/lib/conteudo-magnetico/acesso'
import { gerarGuiao } from '@/lib/conteudo-magnetico/gerar'
import { FORMATOS, marcasPermitidas, resolverMarca, type Formato } from '@/lib/conteudo-magnetico/marcas'
import { OBJECTIVOS, TONS, normalizarGuiao, type Objectivo, type Tom } from '@/lib/conteudo-magnetico/guiao'
import { verificarObjecto } from '@/lib/conteudo-magnetico/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST — escreve o guião (Fase 1 da especificação) com IA grátis.
 * PUT  — guarda um guião editado à mão (volta a passar pelas regras).
 * GET  — os últimos guiões de quem pede.
 */
export async function POST(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  if (!quem.admin) return NextResponse.json({ erro: 'Só para a casa' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const formato = (b.formato in FORMATOS ? b.formato : 'carrossel') as Formato
  const marcaId = String(b.marca || 'propria')
  if (!marcasPermitidas(quem.admin).includes(marcaId as never)) {
    return NextResponse.json({ erro: 'Essa marca é só da casa.' }, { status: 403 })
  }
  const nicho = String(b.nicho || '').trim().slice(0, 200)
  if (!nicho) return NextResponse.json({ erro: 'Diz o nicho ou o tema.' }, { status: 400 })
  const objectivo = (b.objectivo in OBJECTIVOS ? b.objectivo : 'atracao') as Objectivo
  const tom = (b.tom in TONS ? b.tom : 'educativo') as Tom
  const marca = resolverMarca(marcaId, b.propria)

  try {
    const r = await gerarGuiao({
      formato,
      marca,
      nicho,
      objectivo,
      tom,
      notas: typeof b.notas === 'string' ? b.notas : undefined,
      quantas: Number(b.quantas) || undefined,
    })
    const { data } = await getSupabaseAdmin()
      .from('conteudo_magnetico_pecas')
      .insert({ user_id: quem.userId, formato, marca: marca.id, guiao: r.guiao })
      .select('id')
      .maybeSingle()
    return NextResponse.json({ ok: true, id: data?.id ?? null, ...r })
  } catch (e) {
    return NextResponse.json({ erro: mensagemIndisponivel(e) }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  if (!quem.admin) return NextResponse.json({ erro: 'Só para a casa' }, { status: 403 })
  const b = await request.json().catch(() => ({}))
  const g = b.guiao || {}
  if (!marcasPermitidas(quem.admin).includes(g.marca)) {
    return NextResponse.json({ erro: 'Essa marca é só da casa.' }, { status: 403 })
  }
  const guiao = normalizarGuiao(g, {
    formato: g.formato in FORMATOS ? g.formato : 'carrossel',
    marca: g.marca,
    nicho: String(g.nicho || ''),
    objectivo: g.objectivo in OBJECTIVOS ? g.objectivo : 'atracao',
    tom: g.tom in TONS ? g.tom : 'educativo',
  })
  const avisos = verificarObjecto(guiao)
  if (b.id) {
    await getSupabaseAdmin()
      .from('conteudo_magnetico_pecas')
      .update({ guiao, fundo_url: b.fundo_url ?? null })
      .eq('id', b.id)
      .eq('user_id', quem.userId)
  }
  return NextResponse.json({ ok: true, guiao, avisos })
}

export async function GET(request: NextRequest) {
  const quem = await quemPede(request)
  if (!quem) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })
  if (!quem.admin) return NextResponse.json({ erro: 'Só para a casa' }, { status: 403 })
  const { data } = await getSupabaseAdmin()
    .from('conteudo_magnetico_pecas')
    .select('id, formato, marca, guiao, fundo_url, criado_em')
    .eq('user_id', quem.userId)
    .order('criado_em', { ascending: false })
    .limit(20)
  return NextResponse.json({ ok: true, admin: quem.admin, marcas: marcasPermitidas(quem.admin), pecas: data ?? [] })
}
