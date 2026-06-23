import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabase = getSupabaseAdmin()

// POST: Salvar/Atualizar token FCM
export async function POST(request: NextRequest) {
  try {
    const { userId, token, deviceInfo } = await request.json()

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'userId e token são obrigatórios' },
        { status: 400 }
      )
    }

    console.log('💾 [FCM TOKEN API] Salvando token:', {
      userId: userId.substring(0, 8) + '...',
      token: token.substring(0, 20) + '...'
    })

    // Verificar se token já existe
    const { data: existingToken } = await supabase
      .from('fcm_tokens')
      .select('id, user_id')
      .eq('token', token)
      .single()

    if (existingToken) {
      // Atualizar token existente
      const { error: updateError } = await supabase
        .from('fcm_tokens')
        .update({
          user_id: userId,
          device_info: deviceInfo || {},
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('token', token)

      if (updateError) {
        console.error('❌ [FCM TOKEN API] Erro ao atualizar:', updateError)
        return NextResponse.json(
          { error: 'Erro ao atualizar token', details: updateError.message },
          { status: 500 }
        )
      }

      console.log('✅ [FCM TOKEN API] Token atualizado')
      return NextResponse.json({ success: true, action: 'updated' })
    } else {
      // Inserir novo token
      const { error: insertError } = await supabase
        .from('fcm_tokens')
        .insert({
          user_id: userId,
          token,
          device_info: deviceInfo || {},
          last_used_at: new Date().toISOString()
        })

      if (insertError) {
        console.error('❌ [FCM TOKEN API] Erro ao inserir:', insertError)
        return NextResponse.json(
          { error: 'Erro ao salvar token', details: insertError.message },
          { status: 500 }
        )
      }

      console.log('✅ [FCM TOKEN API] Novo token salvo')
      return NextResponse.json({ success: true, action: 'created' })
    }
  } catch (error) {
    console.error('❌ [FCM TOKEN API] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE: Remover token FCM
export async function DELETE(request: NextRequest) {
  try {
    const { token, userId } = await request.json()

    if (!token && !userId) {
      return NextResponse.json(
        { error: 'token ou userId é obrigatório' },
        { status: 400 }
      )
    }

    // Remover por token (1 dispositivo) ou por userId (desativar push do utilizador)
    const query = supabase.from('fcm_tokens').delete()
    if (token) {
      console.log('🗑️ [FCM TOKEN API] Removendo token:', token.substring(0, 20) + '...')
      query.eq('token', token)
    } else {
      console.log('🗑️ [FCM TOKEN API] Removendo tokens do user:', userId.substring(0, 8) + '...')
      query.eq('user_id', userId)
    }

    const { error } = await query

    if (error) {
      console.error('❌ [FCM TOKEN API] Erro ao deletar:', error)
      return NextResponse.json(
        { error: 'Erro ao remover token', details: error.message },
        { status: 500 }
      )
    }

    console.log('✅ [FCM TOKEN API] Token removido')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ [FCM TOKEN API] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET: Listar tokens de um usuário (Admin only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId é obrigatório' },
        { status: 400 }
      )
    }

    const { data: tokens, error } = await supabase
      .from('fcm_tokens')
      .select('*')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false })

    if (error) {
      console.error('❌ [FCM TOKEN API] Erro ao buscar:', error)
      return NextResponse.json(
        { error: 'Erro ao buscar tokens', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, tokens })
  } catch (error) {
    console.error('❌ [FCM TOKEN API] Erro:', error)
    return NextResponse.json(
      { error: 'Erro interno', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

