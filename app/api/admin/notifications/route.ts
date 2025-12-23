import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // Buscar notificações configuradas
    const { data: notifications, error } = await supabase
      .from('notification_configs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
      console.error('[NOTIFICATIONS_GET] Error:', error)
    }

    // Se a tabela não existe, retornar array vazio
    const notificationList = notifications || []

    return NextResponse.json({
      success: true,
      notifications: notificationList.map(n => ({
        id: n.id || `temp-${Date.now()}`,
        name: n.name || 'Notificação',
        type: n.type || 'email',
        title: n.title || '',
        message: n.message || '',
        enabled: n.enabled !== false,
        targetUsers: n.target_users || 'all',
        scheduledAt: n.scheduled_at,
        sentAt: n.sent_at,
        recipientsCount: n.recipients_count || 0,
        status: n.status || 'draft'
      }))
    })
  } catch (error) {
    console.error('[NOTIFICATIONS_GET] Error:', error)
    return NextResponse.json({
      success: true,
      notifications: []
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      type,
      title,
      message,
      targetUsers,
      enabled = true,
      scheduledAt
    } = body

    // Validações
    if (!name || !title || !message) {
      return NextResponse.json({
        success: false,
        error: 'Nome, título e mensagem são obrigatórios'
      }, { status: 400 })
    }

    if (!['email', 'push', 'both'].includes(type)) {
      return NextResponse.json({
        success: false,
        error: 'Tipo deve ser: email, push ou both'
      }, { status: 400 })
    }

    // Criar notificação no Supabase
    const { data: notification, error: insertError } = await supabase
      .from('notification_configs')
      .insert({
        name,
        type: type || 'email',
        title,
        message,
        enabled,
        target_users: targetUsers || 'all',
        scheduled_at: scheduledAt || null,
        status: scheduledAt ? 'scheduled' : 'draft'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[NOTIFICATIONS_POST] Erro ao inserir:', insertError)
      return NextResponse.json({
        success: false,
        error: `Erro ao criar notificação: ${insertError.message}`,
        details: insertError
      }, { status: 500 })
    }

    console.log(`[NOTIFICATIONS_POST] ✅ Notificação criada: ${notification.id}`)

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
    console.error('[NOTIFICATIONS_POST] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao criar notificação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// PUT: Atualizar notificação
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      id,
      name,
      type,
      title,
      message,
      targetUsers,
      enabled,
      scheduledAt
    } = body

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'ID da notificação é obrigatório'
      }, { status: 400 })
    }

    // Preparar dados para atualização
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updateData.name = name
    if (type !== undefined) updateData.type = type
    if (title !== undefined) updateData.title = title
    if (message !== undefined) updateData.message = message
    if (targetUsers !== undefined) updateData.target_users = targetUsers
    if (enabled !== undefined) updateData.enabled = enabled
    if (scheduledAt !== undefined) {
      updateData.scheduled_at = scheduledAt
      updateData.status = scheduledAt ? 'scheduled' : 'draft'
    }

    // Atualizar notificação no Supabase
    const { data: notification, error: updateError } = await supabase
      .from('notification_configs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('[NOTIFICATIONS_PUT] Erro ao atualizar:', updateError)
      return NextResponse.json({
        success: false,
        error: `Erro ao atualizar notificação: ${updateError.message}`
      }, { status: 500 })
    }

    if (!notification) {
      return NextResponse.json({
        success: false,
        error: 'Notificação não encontrada'
      }, { status: 404 })
    }

    console.log(`[NOTIFICATIONS_PUT] ✅ Notificação atualizada: ${id}`)

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
    console.error('[NOTIFICATIONS_PUT] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao atualizar notificação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
