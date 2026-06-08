// /api/mtmcopy/connection — gestão da configuração do utilizador para o Copygram
// (addon Telegram → MT5 copy trading, +20€/mês)
//
// IMPORTANTE: este endpoint NUNCA recebe nem guarda a password/token completos da
// conta MT5. Apenas referência (últimos 4 dígitos) para o utilizador identificar a
// ligação no painel. As credenciais reais de execução vivem exclusivamente no
// microserviço externo do Copygram, num cofre dedicado (ver nota de arquitetura
// no README de /mtmcopy).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabaseAdmin = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[mtmcopy] erro ao obter ligação:', error)
    return NextResponse.json({ error: 'Erro ao obter configuração' }, { status: 500 })
  }

  return NextResponse.json({ connection: data })
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    telegram_channel,
    mt5_login_last4,
    mt5_server,
    lot_mode,
    lot_value,
    max_risk_percent,
    symbols_whitelist,
    copy_sl,
    copy_tp,
    reverse_signals,
  } = body

  // Validações simples
  if (mt5_login_last4 && !/^\d{1,4}$/.test(String(mt5_login_last4))) {
    return NextResponse.json({ error: 'mt5_login_last4 deve conter apenas os últimos dígitos da conta (máx. 4)' }, { status: 400 })
  }
  if (lot_mode && !['fixed', 'risk_percent', 'multiplier'].includes(lot_mode)) {
    return NextResponse.json({ error: 'lot_mode inválido' }, { status: 400 })
  }

  const payload: Record<string, any> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  }
  if (telegram_channel !== undefined) payload.telegram_channel = telegram_channel
  if (mt5_login_last4 !== undefined) payload.mt5_login_last4 = mt5_login_last4
  if (mt5_server !== undefined) payload.mt5_server = mt5_server
  if (lot_mode !== undefined) payload.lot_mode = lot_mode
  if (lot_value !== undefined) payload.lot_value = lot_value
  if (max_risk_percent !== undefined) payload.max_risk_percent = max_risk_percent
  if (symbols_whitelist !== undefined) payload.symbols_whitelist = symbols_whitelist
  if (copy_sl !== undefined) payload.copy_sl = copy_sl
  if (copy_tp !== undefined) payload.copy_tp = copy_tp
  if (reverse_signals !== undefined) payload.reverse_signals = reverse_signals

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) {
    console.error('[mtmcopy] erro ao guardar ligação:', error)
    return NextResponse.json({ error: 'Erro ao guardar configuração' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection: data })
}

// PATCH: ativa ou pausa a cópia (toggle is_active)
export async function PATCH(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { is_active } = body
  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'Campo is_active (boolean) obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    console.error('[mtmcopy] erro ao atualizar estado:', error)
    return NextResponse.json({ error: 'Erro ao atualizar estado' }, { status: 500 })
  }

  return NextResponse.json({ success: true, connection: data })
}

export async function DELETE(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const { error } = await supabaseAdmin
    .from('mtmcopy_connections')
    .update({ is_active: false, telegram_status: 'disconnected', mt5_status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)

  if (error) {
    console.error('[mtmcopy] erro ao desligar ligação:', error)
    return NextResponse.json({ error: 'Erro ao desligar' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
