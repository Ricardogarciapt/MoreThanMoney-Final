import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { papelMtmFunded } from '@/lib/mtmfunded/acesso'

export const dynamic = 'force-dynamic'

/**
 * O CHAT DO TORNEIO — replicado, e fechado ao que não é dele.
 *
 * O participante de torneio não é membro. Mandá-lo para o /app-mobile dava-lhe a porta da
 * área de membros: o middleware trava-o e atira-o para o registo, o que além de o confundir
 * lhe diz que existe ali dentro qualquer coisa que ele não pode ver.
 *
 * Por isso o chat vive AQUI, num canal próprio (`torneio`), servido por esta rota. A lista de
 * canais é uma ALLOWLIST fixa — nunca vem do pedido. Sem isso, bastava mudar `?canal=` para
 * ler o chat Premium a partir de uma inscrição gratuita.
 */

const CANAIS_DO_TORNEIO = ['torneio'] as const

function canalValido(pedido: string | null): string {
  const c = (pedido ?? '').trim()
  return (CANAIS_DO_TORNEIO as readonly string[]).includes(c) ? c : CANAIS_DO_TORNEIO[0]
}

async function quemEs(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const db = getSupabaseAdmin()
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return null
  const { data: perfil } = await db
    .from('profiles')
    .select('id, full_name, user_type, member_category, subscription_plan, is_active')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (papelMtmFunded(perfil) === 'visitante') return null
  return { id: auth.user.id, nome: (perfil?.full_name as string) || 'Participante' }
}

export async function GET(request: NextRequest) {
  const eu = await quemEs(request)
  if (!eu) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })

  const canal = canalValido(request.nextUrl.searchParams.get('canal'))
  const { data } = await getSupabaseAdmin()
    .from('chat_messages')
    .select('id, content, created_at, user_id, telegram_sender')
    .eq('channel_slug', canal)
    .order('created_at', { ascending: false })
    .limit(60)

  const autores = new Map<string, string>()
  const ids = [...new Set((data ?? []).map((m) => m.user_id as string).filter(Boolean))]
  if (ids.length) {
    const { data: perfis } = await getSupabaseAdmin()
      .from('profiles').select('id, full_name').in('id', ids)
    for (const p of perfis ?? []) autores.set(p.id as string, (p.full_name as string) || 'Participante')
  }

  return NextResponse.json({
    canal,
    mensagens: (data ?? []).reverse().map((m) => ({
      id: m.id,
      texto: m.content,
      quando: m.created_at,
      autor: m.user_id ? (autores.get(m.user_id as string) ?? 'Participante') : (m.telegram_sender ?? 'MTM'),
      meu: m.user_id === eu.id,
    })),
  })
}

export async function POST(request: NextRequest) {
  const eu = await quemEs(request)
  if (!eu) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const texto = String(body?.texto ?? '').trim().slice(0, 1000)
  if (!texto) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  // O canal vem da allowlist, nunca do corpo do pedido: escrever no chat Premium a partir
  // daqui seria tão fácil como mudar uma palavra.
  const canal = canalValido(body?.canal ?? null)

  const { data, error } = await getSupabaseAdmin()
    .from('chat_messages')
    .insert({ channel_slug: canal, user_id: eu.id, content: texto, message_type: 'text', notified: true })
    .select('id, created_at')
    .single()
  if (error) return NextResponse.json({ error: 'Não foi possível enviar' }, { status: 500 })

  return NextResponse.json({ ok: true, id: data.id, quando: data.created_at })
}
