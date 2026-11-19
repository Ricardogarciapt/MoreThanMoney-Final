import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { enviarHeygen, heygenConfig } from '@/lib/estudio/heygen'
import { cenasDoGuiao } from '@/lib/estudio/heygen-looks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GUIÃO → REEL FEITO PELO CLONE (HeyGen), sem take.
 * POST { peca_id } → uma cena por segmento do guião com fala, cada uma no look do seu plano
 * (lib/estudio/heygen-looks.ts), tudo num só vídeo 9:16 com a voz clonada do Ricardo.
 * Fica em estudio_geracoes (tipo 'falar', motor 'heygen'); o GET /api/estudio/geracao?id= vê o
 * estado e, quando acaba, o vídeo entra em Ativos e nasce o projecto do editor já em 'a_render'.
 * Nada é publicado. Entram: a equipa do estúdio («ativos») ou servidores com o segredo do motor.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null
  if (!ehMotor(request)) {
    const r = await exigirEstudio(request, 'ativos', 'editor')
    if ('erro' in r && r.erro) return r.erro
    userId = r.quem!.userId
  }
  if (!heygenConfig()) return NextResponse.json({ erro: 'Falta a HEYGEN_API_KEY na Vercel.' }, { status: 503 })

  const b = await request.json().catch(() => ({}))
  const pecaId = typeof b.peca_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.peca_id) ? b.peca_id : null
  if (!pecaId) return NextResponse.json({ erro: 'Falta o peca_id.' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: peca } = await db.from('conteudo_magnetico_pecas').select('id, user_id, marca, guiao').eq('id', pecaId).maybeSingle()
  if (!peca) return NextResponse.json({ erro: 'Guião não encontrado.' }, { status: 404 })
  if (peca.marca !== 'ricardo-garcia') return NextResponse.json({ erro: 'O clone é só para a marca Ricardo Garcia.' }, { status: 400 })
  const cenas = cenasDoGuiao(peca.guiao)
  if (!cenas.length) return NextResponse.json({ erro: 'O guião não tem falas nos segmentos.' }, { status: 400 })

  // Um pedido de cada vez por guião (evita gastar créditos duas vezes num duplo clique).
  const { data: ja } = await db.from('estudio_geracoes').select('id')
    .eq('origem', 'clone-reel').eq('estado', 'a_gerar').contains('params', { peca_id: pecaId }).limit(1)
  if (ja?.length) return NextResponse.json({ ok: true, id: ja[0].id, estado: 'a_gerar', cenas: cenas.length, repetido: true })

  const texto = cenas.map((c) => c.texto).join(' ').slice(0, 1500)
  const nicho = String((peca.guiao as any)?.nicho || '').slice(0, 80)
  const { data: g, error } = await db.from('estudio_geracoes').insert({
    tipo: 'falar',
    estado: 'fila',
    params: { aspecto: '9:16', texto, marca: 'ricardo-garcia', peca_id: pecaId, cenas },
    origem: 'clone-reel',
    pedido_por: userId || peca.user_id,
    motor: 'heygen',
  }).select('id').single()
  if (error || !g) return NextResponse.json({ erro: 'Não consegui registar o pedido.' }, { status: 500 })

  const h = await enviarHeygen(cenas, '9:16', nicho ? `MTM · ${nicho}` : undefined)
  const agora = new Date().toISOString()
  if ('erro' in h) {
    await db.from('estudio_geracoes').update({ estado: 'erro', erro: h.erro, terminado_em: agora }).eq('id', g.id)
    return NextResponse.json({ ok: false, id: g.id, erro: h.erro }, { status: 502 })
  }
  await db.from('estudio_geracoes').update({
    estado: 'a_gerar',
    reclamado_em: agora,
    params: { aspecto: '9:16', texto, marca: 'ricardo-garcia', peca_id: pecaId, cenas, heygen_id: h.id },
  }).eq('id', g.id)
  return NextResponse.json({ ok: true, id: g.id, estado: 'a_gerar', cenas: cenas.length })
}
