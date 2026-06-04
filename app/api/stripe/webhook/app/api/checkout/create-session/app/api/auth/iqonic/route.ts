// /api/auth/iqonic/route.ts
// Login IQONIC — valida via shield.iqonic.life, sincroniza com Supabase MTM

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SHIELD_URL = 'https://shield.iqonic.life/outerinfo.dhtml'
const SHIELD_WEBHOOK = 'ite5r9Qtin82q'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e password obrigatórios' }, { status: 400 })
    }

    // 1. Verificar credenciais no shield IQONIC
    const shieldUrl = new URL(SHIELD_URL)
    shieldUrl.searchParams.set('webhook', SHIELD_WEBHOOK)
    shieldUrl.searchParams.set('action', 'verifylogin')
    shieldUrl.searchParams.set('distid', email)
    shieldUrl.searchParams.set('password', password)

    const shieldRes = await fetch(shieldUrl.toString())
    const shieldText = await shieldRes.text()

    let iqonicUsers: any[]
    try {
      iqonicUsers = JSON.parse(shieldText)
    } catch {
      return NextResponse.json({ error: 'Credenciais IQONIC inválidas' }, { status: 401 })
    }

    if (!iqonicUsers || iqonicUsers.length === 0) {
      return NextResponse.json({ error: 'Utilizador IQONIC não encontrado' }, { status: 401 })
    }

    const iqUser = iqonicUsers[0]

    // 2. Verificar se está ativo e não expirou
    if (iqUser.active !== 'Active') {
      return NextResponse.json({
        error: 'Conta IQONIC inativa. Contacta o suporte.',
        iqonic_status: iqUser.active,
      }, { status: 403 })
    }

    if (iqUser.expiration && new Date(iqUser.expiration) < new Date()) {
      return NextResponse.json({
        error: `Subscrição IQONIC expirou em ${iqUser.expiration}. Renova em iqonic.vip`,
        iqonic_status: 'expired',
        expiration: iqUser.expiration,
      }, { status: 403 })
    }

    // 3. Verificar se existe utilizador no Supabase MTM
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, email, is_active, user_type, subscription_status')
      .eq('email', email.toLowerCase())
      .single()

    if (!profile) {
      return NextResponse.json({
        error: 'Conta MTM não encontrada. Aguarda validação do administrador.',
        iqonic_valid: true,
        iqonic_user: {
          username: iqUser.username,
          name: `${iqUser.first} ${iqUser.last}`,
          plan: iqUser.plan,
          expiration: iqUser.expiration,
          uuid: iqUser.uuid,
        },
        requires_admin_approval: true,
      }, { status: 404 })
    }

    // 4. Sync dados IQONIC → perfil Supabase MTM
    const expiresAt = new Date(iqUser.expiration).toISOString()
    await supabase.from('profiles').update({
      iqonic_id: iqUser.uuid,
      subscription_status: 'active',
      subscription_plan: iqUser.plan,
      subscription_platform: 'iqonic',
      subscription_expires_at: expiresAt,
      is_active: true,
      last_login: new Date().toISOString(),
      checkout_source: 'iqonic',
    }).eq('id', profile.id)

    // 5. Login no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })

    if (authError || !authData.session) {
      return NextResponse.json({
        error: 'Password incorreta para o site MTM. Usa a password do morethanmoney.pt',
        iqonic_valid: true,
        hint: 'As credenciais do site MTM são independentes das do IQONIC.',
      }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      session: authData.session,
      user: {
        id: profile.id,
        email,
        iqonic_username: iqUser.username,
        iqonic_plan: iqUser.plan,
        iqonic_expires: iqUser.expiration,
        name: `${iqUser.first} ${iqUser.last}`,
      },
    })

  } catch (err: any) {
    console.error('IQONIC login error:', err)
    return NextResponse.json({ error: 'Erro interno. Tenta novamente.' }, { status: 500 })
  }
}

// GET — verificar status IQONIC de um utilizador (para admins)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  const adminKey = req.headers.get('x-admin-key')

  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  try {
    const shieldUrl = new URL(SHIELD_URL)
    shieldUrl.searchParams.set('webhook', SHIELD_WEBHOOK)
    shieldUrl.searchParams.set('action', 'verifylogin')
    shieldUrl.searchParams.set('distid', email)
    shieldUrl.searchParams.set('password', '_check_only_')

    const res = await fetch(shieldUrl.toString())
    const data = await res.json()

    return NextResponse.json({ iqonic_data: data })
  } catch {
    return NextResponse.json({ error: 'IQONIC check failed' }, { status: 500 })
  }
}
