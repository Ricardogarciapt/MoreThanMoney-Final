/**
 * A ÁREA DO EDUCADOR — criar produtos, publicá-los, e ver o que vendeu.
 *
 * GET    → os meus produtos + o meu extracto
 * POST   → criar
 * PATCH  → editar / pedir publicação / retirar
 * DELETE → apagar (só rascunhos)
 *
 * ── DE ONDE VEM A IDENTIDADE ──────────────────────────────────────────────────────────────
 *
 * Do cookie `mtm_educator_token`, como em todas as rotas `educator-auth/*`. O `educatorId` vem
 * SEMPRE do token e NUNCA do corpo do pedido, e todos os updates filtram por ele — é o padrão que
 * as playlists já usam, e é o que impede um educador de editar o produto de outro escrevendo um
 * id à mão.
 *
 * Nota de arquitectura, para quem vier a seguir: um educador NÃO é um utilizador do site. Tem
 * email e password próprios, e uma sessão paralela à do Supabase. A coluna
 * `lms_educators.profile_id` existe e é escrita no admin por match de email, mas nunca é lida em
 * lado nenhum — hoje só um dos cinco educadores a tem preenchida. Enquanto isso não mudar, a área
 * do educador tem de viver neste cookie, e os payouts têm de ser feitos à conta Stripe Connect
 * que o dono registar em `marketplace_educadores`, não a um perfil do site.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getEducatorCookieName, verifyEducatorToken } from '@/lib/lms-educator-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { estadoAoPublicar, extractoDoEducador, podePublicar, slugDoTitulo } from '@/lib/marketplace/regras'
import { garantirVendedor, lerDefinicoes, vendasDoEducador } from '@/lib/marketplace/servidor'

export const dynamic = 'force-dynamic'

const COLUNAS =
  'id, slug, titulo, subtitulo, descricao, tipo, imagem_url, preco_cents, moeda, conteudo_url, conteudo_nota, estado, activo, partilha_pct, stripe_price_id, motivo_recusa, publicado_em, created_at, updated_at'

async function quemEsta(): Promise<string | null> {
  const token = (await cookies()).get(getEducatorCookieName())?.value
  return token ? verifyEducatorToken(token)?.educatorId ?? null : null
}

export async function GET() {
  const educatorId = await quemEsta()
  if (!educatorId) return NextResponse.json({ error: 'Sessão de educador necessária' }, { status: 401 })

  const [def, vendedor, { data: produtos }, vendas] = await Promise.all([
    lerDefinicoes(),
    garantirVendedor(educatorId),
    getSupabaseAdmin().from('marketplace_produtos').select(COLUNAS).eq('educator_id', educatorId).order('created_at', { ascending: false }),
    vendasDoEducador(educatorId),
  ])

  const porProduto = new Map<string, { vendas: number; aReceberCents: number }>()
  for (const v of vendas) {
    if (v.estado !== 'paga') continue
    const a = porProduto.get(v.produto_id) ?? { vendas: 0, aReceberCents: 0 }
    a.vendas += 1
    a.aReceberCents += v.parte_educador_cents || 0
    porProduto.set(v.produto_id, a)
  }

  return NextResponse.json(
    {
      marketplaceLigado: def.ligado,
      revisaoObrigatoria: def.revisaoObrigatoria,
      vendedor: vendedor
        ? { activo: vendedor.activo, partilha_pct: vendedor.partilha_pct, temConta: Boolean(vendedor.stripe_connect_account_id) }
        : null,
      produtos: (produtos ?? []).map((p) => ({ ...p, desempenho: porProduto.get(p.id as string) ?? { vendas: 0, aReceberCents: 0 } })),
      extracto: extractoDoEducador(vendas as unknown as Parameters<typeof extractoDoEducador>[0]),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const educatorId = await quemEsta()
  if (!educatorId) return NextResponse.json({ error: 'Sessão de educador necessária' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const titulo = String(b.titulo ?? '').trim()
  if (titulo.length < 3) return NextResponse.json({ error: 'Dá um título ao produto.' }, { status: 400 })

  await garantirVendedor(educatorId)

  // O slug é o endereço público e tem de ser único. Um sufixo curto resolve as colisões sem
  // obrigar o educador a inventar um título diferente só porque alguém já usou o dele.
  const base = slugDoTitulo(titulo) || 'produto'
  let slug = base
  for (let i = 0; i < 5; i++) {
    const { data: ocupado } = await getSupabaseAdmin().from('marketplace_produtos').select('id').eq('slug', slug).maybeSingle()
    if (!ocupado) break
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }

  const { data, error } = await getSupabaseAdmin()
    .from('marketplace_produtos')
    .insert({
      educator_id: educatorId,
      slug,
      titulo,
      subtitulo: b.subtitulo ?? null,
      descricao: b.descricao ?? null,
      tipo: ['curso', 'mentoria', 'ebook', 'comunidade', 'outro'].includes(b.tipo) ? b.tipo : 'curso',
      imagem_url: b.imagem_url ?? null,
      preco_cents: Math.max(0, Math.round(Number(b.preco_cents) || 0)),
      conteudo_url: b.conteudo_url ?? null,
      conteudo_nota: b.conteudo_nota ?? null,
      estado: 'rascunho', // nasce sempre em rascunho: publicar é um acto separado.
    })
    .select(COLUNAS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  return NextResponse.json({ produto: data })
}

export async function PATCH(request: NextRequest) {
  const educatorId = await quemEsta()
  if (!educatorId) return NextResponse.json({ error: 'Sessão de educador necessária' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const id = String(b.id ?? '')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: actual } = await db.from('marketplace_produtos').select(COLUNAS).eq('id', id).eq('educator_id', educatorId).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const campo of ['titulo', 'subtitulo', 'descricao', 'imagem_url', 'conteudo_url', 'conteudo_nota'] as const) {
    if (campo in b) patch[campo] = b[campo] ?? null
  }
  if ('tipo' in b && ['curso', 'mentoria', 'ebook', 'comunidade', 'outro'].includes(b.tipo)) patch.tipo = b.tipo
  if ('preco_cents' in b) patch.preco_cents = Math.max(0, Math.round(Number(b.preco_cents) || 0))

  // A percentagem NÃO se aceita do educador. É um acordo, não um campo de formulário — quem a
  // muda é o dono, no admin. Se viesse daqui, qualquer educador escrevia 95 no seu próprio
  // contrato, e o intervalo prometido deixava de ser um intervalo.

  if (b.accao === 'publicar') {
    const def = await lerDefinicoes()
    const vendedor = await garantirVendedor(educatorId)
    const r = podePublicar({ ...actual, ...patch }, vendedor, def)
    if (!r.pode) return NextResponse.json({ error: r.motivo, code: 'nao_publicavel' }, { status: 400 })
    patch.estado = estadoAoPublicar(def)
    patch.motivo_recusa = null
    if (patch.estado === 'publicado') patch.publicado_em = new Date().toISOString()
  } else if (b.accao === 'retirar') {
    // O educador pode sempre tirar o que é dele de circulação, sem pedir licença a ninguém.
    patch.estado = 'retirado'
  }

  const { data, error } = await db.from('marketplace_produtos').update(patch).eq('id', id).eq('educator_id', educatorId).select(COLUNAS).maybeSingle()
  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  return NextResponse.json({ produto: data })
}

export async function DELETE(request: NextRequest) {
  const educatorId = await quemEsta()
  if (!educatorId) return NextResponse.json({ error: 'Sessão de educador necessária' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  // Só rascunhos se apagam. Um produto que já esteve à venda pode ter compras agarradas a ele, e
  // apagá-lo deixava alguém com um recibo de uma coisa que não existe. Para esses há `retirar`.
  const { data, error } = await getSupabaseAdmin()
    .from('marketplace_produtos')
    .delete()
    .eq('id', id)
    .eq('educator_id', educatorId)
    .eq('estado', 'rascunho')
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Só se apagam rascunhos. Usa «retirar».' }, { status: 409 })
  return NextResponse.json({ apagado: true })
}
