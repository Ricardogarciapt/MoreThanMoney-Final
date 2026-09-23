import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { normalizarOrdem } from '@/lib/webtrader/ordem-contas'
import { tabelaDaEtiqueta } from '@/lib/contas/etiqueta'

export const dynamic = 'force-dynamic'

/**
 * A ORDEM DAS CONTAS NO SELETOR, e qual delas é a FAVORITA (pedido do dono, 23/09).
 *
 *   GET                              →  { ordem: string[], favorita: string | null }
 *   PATCH { ordem: string[] }        →  grava a ordem que a pessoa arrastou
 *   PATCH { favorita: ref | null }   →  marca (ou desmarca) a conta que abre primeiro
 *
 * A ORDEM é uma lista de referências do seletor, guardada em `profiles.profile_data.webtrader`.
 * Fica na CONTA da pessoa e não no dispositivo: quem arruma as contas no computador encontra-as
 * arrumadas no telemóvel. Não se valida contra a base a que conta cada id pertence — é uma
 * preferência de apresentação, e um id que não exista é ignorado ao mostrar (ordem-contas.ts).
 *
 * A FAVORITA é a coluna `favorita` (122) e só existe para as contas MTM Funded, que são as que
 * `mtm_trading_accounts` guarda; marcar uma desmarca as outras, porque «favorita» é uma só. Como em
 * toda a família destas rotas, o UPDATE leva sempre `user_id = quem pede`: ninguém marca a conta de
 * outra pessoa, e uma conta ligada com a password investor (que é de outro dono) fica de fora.
 */
export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ ordem: [], favorita: null }, { headers: { 'Cache-Control': 'no-store' } })
  const db = getSupabaseAdmin()
  const [{ data: perfil }, { data: fav }] = await Promise.all([
    db.from('profiles').select('profile_data').eq('id', userId).maybeSingle(),
    db.from('mtm_trading_accounts').select('id').eq('user_id', userId).eq('favorita', true).maybeSingle(),
  ])
  const dados = (perfil?.profile_data ?? {}) as Record<string, unknown>
  const wt = (dados.webtrader ?? {}) as Record<string, unknown>
  return NextResponse.json(
    { ordem: normalizarOrdem(wt.ordem_contas), favorita: fav?.id ?? null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function PATCH(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ error: 'Entra com a tua conta MTM para arrumar as contas.' }, { status: 401 })
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()

  // ── a conta que abre primeiro ────────────────────────────────────────────
  if ('favorita' in corpo) {
    const alvo = corpo.favorita == null ? null : tabelaDaEtiqueta(corpo.favorita)
    if (corpo.favorita != null && (!alvo || alvo.tabela !== 'mtm_trading_accounts')) {
      return NextResponse.json({ error: 'Por agora só as contas MTM Funded podem ser a favorita.' }, { status: 400 })
    }
    // Uma de cada vez: limpa-se a anterior antes de marcar a nova.
    const limpar = await db.from('mtm_trading_accounts').update({ favorita: false }).eq('user_id', userId).eq('favorita', true)
    if (limpar.error) {
      if (limpar.error.code === '42703') return NextResponse.json({ error: 'As contas favoritas ainda não estão activas nesta base de dados.', code: 'sem_coluna' }, { status: 503 })
      return NextResponse.json({ error: 'Não foi possível gravar a favorita.' }, { status: 500 })
    }
    if (alvo) {
      const { data, error } = await db.from('mtm_trading_accounts').update({ favorita: true })
        .eq('id', alvo.id).eq('user_id', userId).select('id').maybeSingle()
      if (error) return NextResponse.json({ error: 'Não foi possível gravar a favorita.' }, { status: 500 })
      if (!data) return NextResponse.json({ error: 'Conta não encontrada.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, favorita: alvo?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // ── a ordem arrastada ────────────────────────────────────────────────────
  if (!Array.isArray(corpo.ordem)) {
    return NextResponse.json({ error: 'Falta a ordem das contas.' }, { status: 400 })
  }
  const ordem = normalizarOrdem(corpo.ordem)
  const { data: perfil, error: eLer } = await db.from('profiles').select('profile_data').eq('id', userId).maybeSingle()
  if (eLer) return NextResponse.json({ error: 'Não foi possível gravar a ordem.' }, { status: 500 })
  const dados = (perfil?.profile_data ?? {}) as Record<string, unknown>
  const wt = { ...((dados.webtrader ?? {}) as Record<string, unknown>), ordem_contas: ordem }
  const { error } = await db.from('profiles').update({ profile_data: { ...dados, webtrader: wt } }).eq('id', userId)
  if (error) return NextResponse.json({ error: 'Não foi possível gravar a ordem.' }, { status: 500 })
  return NextResponse.json({ ok: true, ordem }, { headers: { 'Cache-Control': 'no-store' } })
}
