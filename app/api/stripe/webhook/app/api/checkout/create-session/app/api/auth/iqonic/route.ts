// /api/auth/iqonic/route.ts
// Login IQONIC — valida via shield.iqonic.life, auto-cria user no Supabase MTM
// Utilizadores só precisam das credenciais IQONIC — sem conta MTM separada

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'

// Admin client com service role — pode criar/atualizar utilizadores
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SHIELD_URL = 'https://shield.iqonic.life/outerinfo.dhtml'
const SHIELD_WEBHOOK = 'iteSr9Qtin82q'

// Gera password MTM determinística a partir do UUID IQONIC
// Utilizador nunca precisa saber esta password — só usa credenciais IQONIC
function generateMtmPassword(iqonicUuid: string): string {
  const secret = process.env.IQONIC_HMAC_SECRET || 'mtm-iqonic-default-secret'
  return createHmac('sha256', secret).update(iqonicUuid).digest('hex')
}

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

    if (!Array.isArray(iqonicUsers) || iqonicUsers.length === 0) {
      return NextResponse.json({ error: 'Credenciais IQONIC inválidas' }, { status: 401 })
    }

    const iqonicUser = iqonicUsers[0]
    const iqonicUuid = iqonicUser.uuid || iqonicUser.id || email
    const mtmPassword = generateMtmPassword(iqonicUuid)

    // 2. Verificar se user já existe no Supabase
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    )

    let supabaseUserId: string

    if (!existingUser) {
      // 3a. Criar novo user no Supabase automaticamente
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        password: mtmPassword,
        email_confirm: true,
        user_metadata: {
          full_name: iqonicUser.name || iqonicUser.fullname || email.split('@')[0],
          iqonic_id: iqonicUuid,
          iqonic_username: iqonicUser.username || iqonicUser.uname || '',
          auth_provider: 'iqonic',
        },
      })

      if (createError || !newUser?.user) {
        console.error('Erro ao criar user Supabase:', createError)
        return NextResponse.json({ error: 'Erro ao criar conta MTM' }, { status: 500 })
      }

      supabaseUserId = newUser.user.id

      // Atualizar perfil com dados IQONIC
      await supabaseAdmin.from('profiles').update({
        iqonic_id: iqonicUuid,
        iqonic_username: iqonicUser.username || iqonicUser.uname || '',
        full_name: iqonicUser.name || iqonicUser.fullname || email.split('@')[0],
        auth_provider: 'iqonic',
      }).eq('id', supabaseUserId)

    } else {
      supabaseUserId = existingUser.id

      // 3b. Atualizar password HMAC se necessário (garantir sincronia)
      await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
        password: mtmPassword,
        user_metadata: {
          iqonic_id: iqonicUuid,
          auth_provider: 'iqonic',
        },
      })
    }

    // 4. Fazer sign-in com password HMAC gerada
    const regularClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: signInData, error: signInError } = await regularClient.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: mtmPassword,
    })

    if (signInError || !signInData?.session) {
      console.error('Erro ao fazer sign-in:', signInError)
      return NextResponse.json({ error: 'Erro ao iniciar sessão' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      session: signInData.session,
      user: {
        id: supabaseUserId,
        email: email.toLowerCase(),
        iqonic_id: iqonicUuid,
      },
    })

  } catch (err: any) {
    console.error('IQONIC auth error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET — verificar status IQONIC de um utilizador (para admins)
export async function GET(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams
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

export const runtime = 'nodejs'
