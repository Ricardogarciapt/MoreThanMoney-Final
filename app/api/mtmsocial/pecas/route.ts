import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * A GALERIA — o que cada um já fez.
 *
 * As peças já eram guardadas, mas não havia forma de as reabrir: o trabalho existia e estava
 * invisível. Uma peça que só vive enquanto o separador está aberto perde-se com um refrescar, e
 * quem a fez não volta.
 *
 * Devolve o `conteudo` inteiro — textos, camadas e posições — para o editor poder continuar de
 * onde ficou, e não só mostrar a imagem já feita.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('mtm_social_pecas')
    .select('id, tipo, titulo, urls, caption, conteudo, marca_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)

  return NextResponse.json({ pecas: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ erro: 'sem id' }, { status: 400 })

  /**
   * Apaga-se a LINHA, não os ficheiros.
   *
   * As imagens ficam na gaveta. É de propósito: quem já partilhou uma peça tem o endereço dela a
   * circular — num story, numa mensagem — e apagar o ficheiro partia essas ligações em sítios
   * onde nunca saberíamos. A limpeza da gaveta é outra tarefa, com outro critério.
   */
  await getSupabaseAdmin().from('mtm_social_pecas').delete().eq('id', id).eq('user_id', userId)
  return NextResponse.json({ ok: true })
}
