import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { registarEntrada, registarAccao, type TipoAccao } from '@/lib/giveaway/motor'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A PORTA PÚBLICA DO SORTEIO.
 *
 * GET  → o que está em jogo e quanto falta. Sem dados de ninguém.
 * POST → entra, ou acrescenta uma acção a quem já entrou.
 *
 * Não devolve a lista de participantes nem a classificação, e isso é deliberado: são emails de
 * pessoas que entraram num sorteio, não uma tabela pública. Cada um vê os SEUS bilhetes, pelo
 * seu código — que é o único segredo que precisa de existir aqui.
 */
export async function GET() {
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  const [{ data: campanhas }, { data: premios }] = await Promise.all([
    db.from('giveaways')
      .select('slug, nome, variante, descricao, mecanica, acaba_em')
      .eq('estado', 'a_decorrer').gt('acaba_em', agora).order('variante'),
    db.from('giveaway_prizes').select('slug, nome, descricao, quantidade').order('ordem'),
  ])

  // Quantas pessoas já entraram, no total. É prova social e é verdade — não se arredonda para
  // cima nem se inventa um número de arranque.
  const { count } = await db
    .from('giveaway_entries').select('id', { count: 'exact', head: true }).eq('validada', true)

  return NextResponse.json({
    aberto: Boolean(campanhas?.length),
    acabaEm: campanhas?.[0]?.acaba_em ?? null,
    participantes: count ?? 0,
    premios: (premios ?? []).map((p) => ({
      nome: p.nome, descricao: p.descricao, quantidade: p.quantidade,
    })),
    // As mecânicas, para a página explicar cada porta com o que ela vale mesmo.
    portas: (campanhas ?? []).map((c) => ({
      slug: c.slug, variante: c.variante, nome: c.nome, descricao: c.descricao,
      mecanica: c.mecanica,
    })),
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const accao = String(body?.accao ?? 'entrar')

  if (accao === 'entrar') {
    const r = await registarEntrada({
      giveawaySlug: String(body?.campanha ?? 'lancamento-porta-estreita'),
      email: body?.email ?? null,
      instagramHandle: body?.instagram ?? null,
      nome: body?.nome ?? null,
      referencia: body?.referencia ?? null,
    })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  if (accao === 'acao') {
    const r = await registarAccao({
      giveawaySlug: String(body?.campanha ?? ''),
      entryId: String(body?.entryId ?? ''),
      tipo: String(body?.tipo ?? '') as TipoAccao,
      referencia: body?.referencia ?? null,
    })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  if (accao === 'consultar') {
    // Pelo CÓDIGO, não pelo email: o código é de quem o tem, e um email é adivinhável.
    const codigo = String(body?.codigo ?? '').trim().toUpperCase()
    if (codigo.length < 4) return NextResponse.json({ error: 'código inválido' }, { status: 400 })

    const db = getSupabaseAdmin()
    const { data } = await db.from('giveaway_entries')
      .select('id, nome, bilhetes, codigo_referencia, giveaway_id')
      .eq('codigo_referencia', codigo).maybeSingle()
    if (!data) return NextResponse.json({ error: 'código não encontrado' }, { status: 404 })

    const { count: trouxe } = await db.from('giveaway_entries')
      .select('id', { count: 'exact', head: true }).eq('trazida_por', data.id)

    return NextResponse.json({
      ok: true, nome: data.nome, bilhetes: data.bilhetes,
      codigo: data.codigo_referencia, trouxe: trouxe ?? 0,
    })
  }

  return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
}
