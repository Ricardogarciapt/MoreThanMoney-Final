import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const notificationId = params.id

    if (!notificationId) {
      return NextResponse.json({
        success: false,
        error: 'ID da notificação é obrigatório'
      }, { status: 400 })
    }

    const { data: notification, error } = await supabase
      .from('notification_configs')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (error || !notification) {
      return NextResponse.json({
        success: false,
        error: 'Notificação não encontrada'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      notification: {
        id: notification.id,
        name: notification.name,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        enabled: notification.enabled,
        targetUsers: notification.target_users,
        scheduledAt: notification.scheduled_at,
        sentAt: notification.sent_at,
        recipientsCount: notification.recipients_count || 0,
        status: notification.status || 'draft'
      }
    })
  } catch (error) {
    console.error('[NOTIFICATION_GET] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao buscar notificação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const notificationId = params.id

    if (!notificationId) {
      return NextResponse.json({
        success: false,
        error: 'ID da notificação é obrigatório'
      }, { status: 400 })
    }

    // Verificar se a notificação existe
    const { data: existing, error: checkError } = await supabase
      .from('notification_configs')
      .select('id, status')
      .eq('id', notificationId)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({
        success: false,
        error: 'Notificação não encontrada'
      }, { status: 404 })
    }

    // Não permitir excluir notificações já enviadas (apenas cancelar)
    if (existing.status === 'sent') {
      return NextResponse.json({
        success: false,
        error: 'Não é possível excluir notificações já enviadas. Use "Cancelar" se ainda não foi enviada.'
      }, { status: 400 })
    }

    // Excluir do Supabase
    const { error: deleteError } = await supabase
      .from('notification_configs')
      .delete()
      .eq('id', notificationId)

    if (deleteError) {
      console.error('[NOTIFICATION_DELETE] Erro ao excluir:', deleteError)
      return NextResponse.json({
        success: false,
        error: `Erro ao excluir notificação: ${deleteError.message}`
      }, { status: 500 })
    }

    console.log(`[NOTIFICATION_DELETE] ✅ Notificação excluída: ${notificationId}`)

    return NextResponse.json({
      success: true,
      message: 'Notificação excluída com sucesso'
    })

  } catch (error) {
    console.error('[NOTIFICATION_DELETE] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao excluir notificação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
