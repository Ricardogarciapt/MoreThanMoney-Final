import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * OS MODELOS — monta-se uma vez, reutiliza-se mudando só o texto.
 *
 * É o que separa publicar uma vez por semana de publicar cinco. Montar o desenho leva minutos;
 * escrever a frase seguinte leva segundos. Sem modelos, paga-se o custo do desenho a cada peça —
 * e ao fim de três ninguém volta.
 *
 * O modelo guarda tudo MENOS o texto. O texto é a única coisa que muda de peça para peça, e é
 * por isso que não entra: guardá-lo fazia de cada modelo uma cópia da peça, e ninguém quer
 * publicar a mesma frase cinco vezes.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('mtm_social_modelos')
    .select('id, nome, tipo, desenho, capa_url, usos, marca_id')
    .eq('user_id', userId)
    // Os mais usados sobem sozinhos — pedir a alguém que ordene a própria lista é trabalho que
    // ninguém faz.
    .order('usos', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30)

  return NextResponse.json({ modelos: data ?? [] })
}

export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const corpo = await request.json().catch(() => ({}))
  const accao = String(corpo?.accao ?? 'guardar')

  // ── contar um uso ─────────────────────────────────────────────────────────
  if (accao === 'usar') {
    const id = String(corpo?.id ?? '')
    const { data } = await db.from('mtm_social_modelos')
      .select('usos').eq('id', id).eq('user_id', userId).maybeSingle()
    if (data) {
      await db.from('mtm_social_modelos')
        .update({ usos: Number(data.usos ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', id).eq('user_id', userId)
    }
    return NextResponse.json({ ok: true })
  }

  if (accao === 'apagar') {
    await db.from('mtm_social_modelos').delete()
      .eq('id', String(corpo?.id ?? '')).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  // ── guardar a partir de uma peça ──────────────────────────────────────────
  const nome = String(corpo?.nome ?? '').trim()
  if (nome.length < 2) return NextResponse.json({ erro: 'Dá um nome ao modelo' }, { status: 400 })

  const c = (corpo?.desenho ?? {}) as Record<string, unknown>
  /**
   * O texto é retirado à entrada, não à saída.
   *
   * Quem guarda um modelo manda a peça inteira, porque é o que tem à mão. Deixar o texto passar
   * e filtrá-lo só ao usar era guardá-lo na base de dados à mesma — e um dia alguém lê o modelo
   * por outro caminho e publica a frase de outra pessoa.
   */
  const desenho = {
    fundo: c.fundo ?? null,
    destaque: c.destaque ?? null,
    destaquePos: c.destaquePos ?? 'direita',
    destaqueEscala: c.destaqueEscala ?? 0.92,
    posicoes: c.posicoes ?? null,
    cta: c.cta ?? null,
  }

  const { data, error } = await db.from('mtm_social_modelos').insert({
    user_id: userId,
    marca_id: corpo?.marcaId ?? null,
    nome,
    tipo: ['cartao', 'carrossel', 'capa_reel'].includes(String(corpo?.tipo)) ? String(corpo.tipo) : 'carrossel',
    desenho,
    capa_url: String(corpo?.capaUrl ?? '').trim() || null,
  }).select('id').single()

  if (error) {
    return NextResponse.json(
      { erro: error.message.includes('duplicate') ? 'Já tens um modelo com esse nome' : error.message },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true, id: data.id })
}
