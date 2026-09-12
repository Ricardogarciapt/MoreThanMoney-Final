import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * PUBLICAR do estúdio, sem passar por fora.
 *
 * Quem acabou de desenhar o cartão é quem o aprovaria — obrigá-lo a ir ao separador do lado
 * procurar o rascunho que ele próprio acabou de criar é trabalho a mais para nada.
 *
 * Mas NÃO salta a fila: entra na mesma `social_scheduled_posts` que tudo o resto, já aprovada e
 * marcada para agora. O cron apanha-a na passagem seguinte. Publicar por fora da fila era
 * perder a repetição em caso de falha, a contagem de tentativas e o registo — que é
 * precisamente o que faz a fila valer a pena.
 */

const CONTAS: Record<string, { id: string; username: string }> = {
  'morethanmoney.pt': { id: '17841474872672009', username: 'morethanmoney.pt' },
  ricardogarciapt: { id: '17841405656956716', username: 'ricardogarciapt' },
}

export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const corpo = await req.json().catch(() => ({}))
  const handle = String(corpo?.handle ?? '')
  const urls = Array.isArray(corpo?.urls) ? corpo.urls.map(String).filter(Boolean) : []

  /**
   * PARA ONDE VAI.
   *
   * · `funil`  — entra na fila já aprovada e sai dentro de minutos.
   * · `manual` — fica em rascunho, para ser revista no separador do lado antes de sair.
   *
   * As outras duas opções do estúdio — descarregar e abrir a partilha do telemóvel — não passam
   * por aqui: acontecem inteiras no browser e não deixam nada na fila. É por isso que são as
   * únicas que servem a conta pessoal.
   */
  const destino = corpo?.destino === 'manual' ? 'manual' : 'funil'

  const conta = CONTAS[handle]
  if (!conta) return NextResponse.json({ ok: false, erro: 'conta desconhecida' }, { status: 400 })
  if (!urls.length) return NextResponse.json({ ok: false, erro: 'sem imagens' }, { status: 400 })

  /**
   * A conta PESSOAL não recebe automação — a mesma guarda que o cron já aplica.
   *
   * Está aqui também, e não só lá, porque uma guarda que vive num sítio só é uma guarda que a
   * próxima porta esquece. Esta é a porta nova.
   */
  if (handle === 'ricardogarciapt' && destino === 'funil') {
    return NextResponse.json(
      {
        ok: false,
        erro:
          'a conta pessoal não publica por automação — descarrega as imagens e publica-as tu, ' +
          'que é como ela tem de continuar a soar.',
      },
      { status: 409 },
    )
  }

  const legenda = String(corpo?.caption ?? '').trim()
  const hook = String(corpo?.hook ?? '').trim()
  const cta = String(corpo?.cta ?? '').trim().toUpperCase()

  // Sem legenda escrita, monta-se a partir do que já está no cartão. Uma publicação sem legenda
  // nenhuma perde o comentário — e é o comentário que alimenta o funil.
  const caption =
    legenda ||
    [hook, '', cta ? `Comenta ${cta} e eu respondo-te no Direct. 📥` : ''].filter(Boolean).join('\n')

  if (!caption.trim()) {
    return NextResponse.json({ ok: false, erro: 'sem legenda nem frase para a construir' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('social_scheduled_posts')
    .insert({
      channel: 'instagram',
      ig_account_id: conta.id,
      ig_username: conta.username,
      pillar: 'educacao',
      media_type: urls.length > 1 ? 'CAROUSEL' : 'IMAGE',
      media_urls: urls,
      caption,
      scheduled_at: new Date().toISOString(),
      // Em rascunho não se marca aprovação nenhuma: o cron só publica o que está `approved`, e
      // escrever `approved_by` numa peça por rever era mentir a quem a fosse ver a seguir.
      status: destino === 'manual' ? 'draft' : 'approved',
      ...(destino === 'funil'
        ? { approved_by: 'estudio', approved_at: new Date().toISOString() }
        : {}),
      created_by: 'estudio-cartoes',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    postId: data.id,
    destino,
    mensagem:
      destino === 'manual'
        ? 'guardado em rascunho — revê e aprova no separador Publicações'
        : urls.length > 1
          ? `carrossel de ${urls.length} na fila — sai dentro de minutos`
          : 'na fila — sai dentro de minutos',
  })
}
