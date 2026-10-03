import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { guardarMensagem, listarMensagens } from '@/lib/mensagens-funil'

export const dynamic = 'force-dynamic'

/**
 * As mensagens do funil, para ver e editar no /admin/social.
 *
 * Estavam dentro do código: mudar uma vírgula na mensagem de boas-vindas obrigava a um commit e
 * a um deploy, e por isso ninguém as mudava. Uma mensagem de vendas que não se pode afinar é uma
 * mensagem que envelhece.
 */

async function ehAdmin(request: NextRequest): Promise<boolean> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const db = getSupabaseAdmin()
  const { data } = await db.auth.getUser(token)
  if (!data.user) return false
  const { data: p } = await db.from('profiles').select('user_type').eq('id', data.user.id).maybeSingle()
  return p?.user_type === 'admin'
}

export async function GET(request: NextRequest) {
  if (!(await ehAdmin(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, mensagens: await listarMensagens() })
}

export async function PATCH(request: NextRequest) {
  if (!(await ehAdmin(request))) {
    return NextResponse.json({ error: 'Só para administradores' }, { status: 403 })
  }
  const corpo = (await request.json().catch(() => ({}))) as { chave?: string; texto?: string }
  if (!corpo.chave) return NextResponse.json({ error: 'chave obrigatória' }, { status: 400 })

  // Texto vazio devolve a mensagem ao defeito do código — não guarda vazio, que deixaria o bot
  // a enviar uma mensagem em branco.
  const r = await guardarMensagem(corpo.chave, String(corpo.texto ?? ''))
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 })
  return NextResponse.json({ ok: true, mensagens: await listarMensagens() })
}
