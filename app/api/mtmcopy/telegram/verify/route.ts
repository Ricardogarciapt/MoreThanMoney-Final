import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { verifyTelegramChannel, MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'

const supabaseAdmin = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  }

  const { data: conn } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('id, telegram_channel')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn?.telegram_channel?.trim()) {
    await supabaseAdmin
      .from('mtmcopy_connections')
      .update({
        telegram_status: 'connected',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    return NextResponse.json({
      ok: true,
      mode: 'default',
      title: 'Grupos MTM (predefinição)',
      bot_username: MTMCOPY_BOT_USERNAME(),
      message: 'Estás no modo predefinição: copias sinais dos grupos/canais MTM onde o bot está.',
    })
  }

  const result = await verifyTelegramChannel(conn.telegram_channel)
  const telegram_status = result.ok ? 'connected' : result.botIsAdmin === false ? 'pending' : 'error'

  await supabaseAdmin
    .from('mtmcopy_connections')
    .update({
      telegram_status,
      last_error: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)

  return NextResponse.json({
    ...result,
    bot_username: MTMCOPY_BOT_USERNAME(),
  })
}
