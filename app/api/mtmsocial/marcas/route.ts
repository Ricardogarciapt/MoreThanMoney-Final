import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * AS MARCAS DE CADA MEMBRO.
 *
 * Mais do que uma por pessoa, de propósito: quem gere a marca própria e a de um cliente não quer
 * estar a trocar definições a cada peça. Uma delas é a activa, senão abrir a app pedia uma
 * escolha antes de deixar fazer seja o que for.
 *
 * A sessão resolve-se pelo token OU pelo cookie — esta app corre dentro da app-mobile e das
 * nativas, onde o cookie não chega. Ver `lib/sessao-do-pedido`.
 */

/** Os logótipos da casa que um membro pode usar. Vivem no site, não se carregam. */
const LOGOS_DA_CASA: Record<string, string> = {
  mtm: '/logo-mtm-transparent.png',
  mtm_auto: '/images/mtm/logo-mtm-auto.png',
  mtm_funded: '/mtmfunded/logo-mtm-funded-v2.png',
}

// Sem `export`: um ficheiro de rota do Next só pode exportar handlers e configuração — tudo o
// resto rebenta a geração de tipos com uma mensagem que não fala do problema.
function urlDoLogo(logo: string, logoUrl: string | null): string | null {
  if (logo === 'proprio') return logoUrl
  return LOGOS_DA_CASA[logo] ?? null
}
void urlDoLogo

export async function GET(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const { data } = await getSupabaseAdmin()
    .from('mtm_social_marcas')
    .select('id, nome, arroba, logo, logo_url, cor, ativa')
    .eq('user_id', userId)
    .order('ativa', { ascending: false })
    .order('created_at')

  return NextResponse.json({ marcas: data ?? [], logosDaCasa: LOGOS_DA_CASA })
}

export async function POST(request: NextRequest) {
  const userId = await userIdDoPedido(request)
  if (!userId) return NextResponse.json({ erro: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const corpo = await request.json().catch(() => ({}))
  const accao = String(corpo?.accao ?? 'guardar')

  if (accao === 'activar') {
    const id = String(corpo?.id ?? '')
    // Primeiro apaga-se a marca de todas, depois põe-se numa. Ao contrário, duas ficavam
    // activas se a segunda escrita falhasse.
    await db.from('mtm_social_marcas').update({ ativa: false }).eq('user_id', userId)
    await db.from('mtm_social_marcas').update({ ativa: true, updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  if (accao === 'apagar') {
    await db.from('mtm_social_marcas').delete()
      .eq('id', String(corpo?.id ?? '')).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  }

  // ── guardar (nova ou alterada) ──────────────────────────────────────────
  const nome = String(corpo?.nome ?? '').trim()
  if (nome.length < 2) return NextResponse.json({ erro: 'Dá um nome à marca' }, { status: 400 })

  const logo = String(corpo?.logo ?? 'nenhum')
  if (!['nenhum', 'mtm', 'mtm_auto', 'mtm_funded', 'proprio'].includes(logo)) {
    return NextResponse.json({ erro: 'logótipo desconhecido' }, { status: 400 })
  }

  const linha = {
    user_id: userId,
    nome,
    // Sem o @: guarda-se limpo e escreve-se com @ onde for preciso. Guardado com ele, metade
    // das peças saía com «@@».
    arroba: String(corpo?.arroba ?? '').trim().replace(/^@+/, '') || null,
    logo,
    logo_url: logo === 'proprio' ? (String(corpo?.logoUrl ?? '').trim() || null) : null,
    cor: /^#[0-9a-f]{6}$/i.test(String(corpo?.cor ?? '')) ? String(corpo.cor) : '#D2A63C',
    updated_at: new Date().toISOString(),
  }

  const id = String(corpo?.id ?? '').trim()
  if (id) {
    const { error } = await db.from('mtm_social_marcas').update(linha).eq('id', id).eq('user_id', userId)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id })
  }

  // A primeira marca fica logo activa: obrigar a um segundo clique para poder começar não
  // serve ninguém.
  const { count } = await db.from('mtm_social_marcas')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)

  const { data, error } = await db.from('mtm_social_marcas')
    .insert({ ...linha, ativa: (count ?? 0) === 0 }).select('id').single()
  if (error) {
    return NextResponse.json(
      { erro: error.message.includes('duplicate') ? 'Já tens uma marca com esse nome' : error.message },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true, id: data.id })
}
