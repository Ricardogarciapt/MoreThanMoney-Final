import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { cifrar } from '@/lib/mtmfunded/credenciais'
import { partirToken } from '@/lib/telegram/grupos-novos'

export const dynamic = 'force-dynamic'

/**
 * GESTÃO → TELEGRAM → BOTS: registar os bots criados à mão no @BotFather (a Telegram não deixa
 * criar bots por API). O token confirma-se com getMe, guarda-se cifrado e nunca volta a sair daqui.
 */
const TABELA = 'telegram_bots'
const CAMPOS = 'id, bot_id, username, nome, notas, criado_em'

export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const { data, error } = await getSupabaseAdmin().from(TABELA).select(CAMPOS).order('criado_em')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bots: data })
}

export async function POST(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const body = (await request.json().catch(() => ({}))) as { token?: string; notas?: string }
  const token = String(body.token ?? '').trim()
  const partes = partirToken(token)
  if (!partes) return NextResponse.json({ error: 'Isso não parece um token do @BotFather (123456:ABC…).' }, { status: 400 })
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' }).catch(() => null)
  const d = (await r?.json().catch(() => null)) as { ok?: boolean; result?: { id: number; username: string; first_name: string; is_bot: boolean } } | null
  if (!d?.ok || !d.result?.is_bot || d.result.id !== partes.botId) {
    return NextResponse.json({ error: 'A Telegram não aceitou este token. Confirma no @BotFather.' }, { status: 400 })
  }
  let token_cifrado: string
  try {
    token_cifrado = cifrar(token)
  } catch {
    return NextResponse.json({ error: 'Falta a chave de cifra no servidor (MTMFUNDED_CRED_KEY).' }, { status: 500 })
  }
  const { data, error } = await getSupabaseAdmin()
    .from(TABELA)
    .upsert(
      { bot_id: d.result.id, username: d.result.username, nome: d.result.first_name, token_cifrado, notas: String(body.notas ?? '').trim().slice(0, 200) || null, criado_por: g.userId },
      { onConflict: 'bot_id' },
    )
    .select(CAMPOS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ bot: data })
}

export async function DELETE(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const { error } = await getSupabaseAdmin().from(TABELA).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
