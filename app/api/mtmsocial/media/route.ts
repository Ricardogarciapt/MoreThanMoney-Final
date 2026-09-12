import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { uploadBufferToBucket } from '@/lib/instagram/publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * AS IMAGENS DOS MEMBROS — carregadas por eles, ou geradas de graça.
 *
 * ⚠️ NUNCA pelas chaves da MTM. Cada membro que carregasse em «gerar» estaria a gastar dinheiro
 * nosso, e bastava uma dúzia de pessoas entusiasmadas com o botão para a conta do mês deixar de
 * fazer sentido. A geração passa por `lib/mtmsocial/imagens-gratis`, que é outro módulo de
 * propósito: se fosse a mesma função com uma bandeira, mais cedo ou mais tarde alguém esquecia
 * a bandeira.
 */

/** 8 MB: uma fotografia de telemóvel cabe; um vídeo arrastado por engano não passa. */
const TAMANHO_MAXIMO = 8 * 1024 * 1024
const TIPOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const tipo = request.headers.get('content-type') ?? ''

  // ── ficheiro do próprio ───────────────────────────────────────────────────
  if (tipo.includes('multipart/form-data')) {
    const form = await request.formData()
    const ficheiro = form.get('ficheiro')
    if (!(ficheiro instanceof File)) {
      return NextResponse.json({ erro: 'sem ficheiro' }, { status: 400 })
    }
    if (ficheiro.size > TAMANHO_MAXIMO) {
      return NextResponse.json(
        { erro: `imagem demasiado grande (${Math.round(ficheiro.size / 1024 / 1024)} MB, máximo 8)` },
        { status: 400 },
      )
    }
    if (!TIPOS.has(ficheiro.type)) {
      return NextResponse.json({ erro: `tipo não aceite: ${ficheiro.type || 'desconhecido'}` }, { status: 400 })
    }

    const bytes = Buffer.from(new Uint8Array(await ficheiro.arrayBuffer()))
    // A pasta leva o id de quem carregou: as gavetas dos membros ficam separadas, e um dia em
    // que seja preciso apagar o que é de alguém sabe-se onde está.
    const url = await uploadBufferToBucket(bytes, ficheiro.type, `social/${userId.slice(0, 8)}`)
    return NextResponse.json({ ok: true, url })
  }

  // ── geração gratuita ──────────────────────────────────────────────────────
  const corpo = await request.json().catch(() => ({}))
  const descricao = String(corpo?.descricao ?? '').trim()
  const camada = corpo?.camada === 'destaque' ? 'destaque' : 'fundo'
  const formato = corpo?.formato === 'reel' ? 'reel' : 'post'

  if (descricao.length < 6) {
    return NextResponse.json({ erro: 'descreve a imagem em duas palavras que sejam' }, { status: 400 })
  }

  /**
   * Um tecto por pessoa e por dia.
   *
   * O serviço é gratuito para nós mas não é infinito para ninguém: uma pessoa a carregar no
   * botão em série esgota a fila para toda a gente, e o gerador começa a recusar a todos. Vinte
   * por dia chega para montar várias peças e não chega para fazer disto um brinquedo.
   */
  const db = getSupabaseAdmin()
  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)
  const { count } = await db
    .from('mtm_social_pecas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', inicioDoDia.toISOString())

  if ((count ?? 0) > 60) {
    return NextResponse.json(
      { erro: 'já geraste muita coisa hoje — volta amanhã, ou carrega uma imagem tua' },
      { status: 429 },
    )
  }

  try {
    const { gerarImagemGratis } = await import('@/lib/mtmsocial/imagens-gratis')
    const { bytes, contentType } = await gerarImagemGratis({ descricao, camada, formato })
    const url = await uploadBufferToBucket(bytes, contentType, `social/${userId.slice(0, 8)}`)
    return NextResponse.json({ ok: true, url, camada })
  } catch (e) {
    // A mensagem do módulo já está escrita para ser lida por quem carregou no botão.
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'a geração falhou' },
      { status: 502 },
    )
  }
}
