import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { checkMtmcopyAccess } from '@/lib/mtmcopy-access'

const supabaseAdmin = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ hasAccess: false, error: 'Autenticação necessária' }, { status: 401 })
  }

  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) {
    return NextResponse.json({ hasAccess: false, error: 'Sessão inválida' }, { status: 401 })
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .maybeSingle()

  const access = await checkMtmcopyAccess(user.id, profile?.user_type)

  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '@MoreThanMoney_aibot').replace(/^@/, '')

  return NextResponse.json({
    hasAccess: access.hasAccess,
    subscribed: access.subscribed,
    canActivate: access.canActivate,
    reason: access.reason,
    bot_username: botUsername,
  })
}
