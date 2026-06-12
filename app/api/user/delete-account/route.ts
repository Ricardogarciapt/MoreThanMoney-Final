import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * DELETE /api/user/delete-account
 *
 * Elimina permanentemente a conta do utilizador autenticado:
 * 1. Verifica o token JWT do utilizador
 * 2. Remove dados pessoais das tabelas principais
 * 3. Elimina o utilizador do Supabase Auth
 *
 * Requerido pela Apple App Store Guideline 5.1.1(v).
 */
export async function DELETE(req: NextRequest) {
  try {
    // ── 1. Verificar autenticação ──────────────────────────────────────────
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Token de autenticação em falta.' }, { status: 401 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Verificar o JWT e obter o utilizador
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 })
    }

    const userId = user.id

    // ── 2. Eliminar dados do utilizador das tabelas ───────────────────────
    // A ordem importa: eliminar primeiro tabelas que referenciam profiles

    const tables = [
      'fcm_tokens',
      'user_xp',
      'xp_log',
      'notifications',
      'mentor_tasks',
      'mentor_profiles',
      'fast_start_progress',
      'trading_plan_trades',
      'trading_plans',
      'trading_contacts',
      'dca_plans',
      'price_alerts',
      'email_sends',
      'calendly_bookings',
    ]

    for (const table of tables) {
      try {
        await supabaseAdmin
          .from(table)
          .delete()
          .eq('user_id', userId)
      } catch {
        // Silencioso — tabela pode não ter a coluna user_id ou não existir
      }
    }

    // Tentativa adicional com coluna 'id' (alguns profiles usam id = userId)
    try {
      await supabaseAdmin.from('profiles').delete().eq('id', userId)
    } catch {}

    // Mensagens: anonimizar em vez de eliminar (preserva histórico de conversas)
    try {
      await supabaseAdmin
        .from('messages')
        .update({ content: '[Mensagem eliminada — conta removida]', sender_id: null })
        .eq('sender_id', userId)
    } catch {}

    // Posts sociais: anonimizar
    try {
      await supabaseAdmin
        .from('social_posts')
        .update({
          content: '[Post eliminado — conta removida]',
          user_id: null,
          username: 'Utilizador eliminado',
        })
        .eq('user_id', userId)
    } catch {}

    // ── 3. Eliminar utilizador do Supabase Auth ───────────────────────────
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      console.error('[delete-account] Erro ao eliminar auth user:', deleteAuthError)
      return NextResponse.json(
        { error: 'Não foi possível eliminar a conta. Tenta novamente ou contacta o suporte.' },
        { status: 500 }
      )
    }

    console.log(`[delete-account] Conta eliminada com sucesso: ${userId}`)

    return NextResponse.json({
      success: true,
      message: 'A tua conta foi eliminada permanentemente.',
    })

  } catch (err: any) {
    console.error('[delete-account] Erro inesperado:', err)
    return NextResponse.json(
      { error: 'Erro interno. Tenta novamente ou contacta o suporte em suporte@morethanmoney.pt' },
      { status: 500 }
    )
  }
}
