import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirEstudio } from '@/lib/estudio/acesso'
import { ehMotor } from '@/lib/conteudo-magnetico/acesso'
import { heygenConfig } from '@/lib/estudio/heygen'
import { pedirReelDoClone } from '@/lib/estudio/clone-reel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GUIÃO → REEL FEITO PELO CLONE (HeyGen), sem take.
 * POST { peca_id } → uma cena por segmento do guião com fala, cada uma no look do seu plano
 * (lib/estudio/heygen-looks.ts), tudo num só vídeo 9:16 com a voz do Ricardo na Fish.
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

  const r = await pedirReelDoClone(getSupabaseAdmin(), pecaId, userId)
  return NextResponse.json(r.corpo, { status: r.status })
}
