import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { adminBroadcastEmailTemplate } from "@/lib/email-templates"
import { internalApiHeaders } from "@/lib/internal-api"

const supabase = getSupabaseAdmin()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const notificationId = id

    if (!notificationId) {
      return NextResponse.json({
        success: false,
        error: 'ID da notificação é obrigatório'
      }, { status: 400 })
    }

    console.log(`[NOTIFICATION_SEND] Enviando notificação ${notificationId}`)

    // 1. Buscar configuração da notificação
    const { data: notification, error: notifError } = await supabase
      .from('notification_configs')
      .select('*')
      .eq('id', notificationId)
      .single()

    if (notifError || !notification) {
      return NextResponse.json({
        success: false,
        error: 'Notificação não encontrada'
      }, { status: 404 })
    }

    /**
     * 2. Os destinatários.
     *
     * O filtro de VIP procurava `user_type = 'vip'` — e o VIP não vive nessa coluna, vive em
     * `member_category`. Resultado: a audiência "Apenas VIP" ia buscar quase ninguém, e uma
     * campanha que não chega a lado nenhum parece uma campanha que ninguém abriu.
     *
     * Aproveitou-se para acrescentar as audiências que hoje fazem falta: Premium (que é onde
     * está o produto), e quem usa mesmo o MTM Auto e o Tap to Trade — falar com quem já tem
     * conta ligada é outra conversa, e mandá-la a toda a gente estraga as duas.
     */
    let usersQuery = supabase
      .from('profiles')
      .select('id, email, full_name, user_type, member_category, subscription_plan, is_active')
      .eq('is_active', true)

    const alvo = notification.target_users
    if (alvo === 'members') {
      usersQuery = usersQuery.in('user_type', ['member', 'vip', 'guest'])
    } else if (alvo === 'vip') {
      usersQuery = usersQuery.eq('member_category', 'vip')
    } else if (alvo === 'premium') {
      usersQuery = usersQuery.or(
        'subscription_plan.eq.premium,member_category.eq.premium,member_category.eq.vip',
      )
    } else if (alvo === 'admin') {
      usersQuery = usersQuery.eq('user_type', 'admin')
    }

    // Audiências definidas por USO, não por categoria: quem tem conta ligada no MTM Auto e quem
    // tem uma conta de Tap to Trade. Estas resolvem-se noutras tabelas, por isso filtram-se
    // depois, sobre a lista já lida.
    let apenasEstes: Set<string> | null = null
    if (alvo === 'mtmauto' || alvo === 't2t') {
      if (alvo === 'mtmauto') {
        const { data } = await supabase.from('mtmauto_accounts').select('user_id')
        apenasEstes = new Set((data ?? []).map((r) => r.user_id as string))
      } else {
        const { data } = await supabase
          .from('mtmcopy_connections')
          .select('user_id, purpose, t2t_enabled')
          .eq('is_active', true)
        apenasEstes = new Set(
          (data ?? [])
            .filter((r) => r.purpose === 'tap_to_trade' || r.t2t_enabled === true)
            .map((r) => r.user_id as string),
        )
      }
    }

    const { data: usersBruto, error: usersError } = await usersQuery
    const users = apenasEstes ? (usersBruto ?? []).filter((u) => apenasEstes!.has(u.id as string)) : usersBruto

    if (usersError) {
      console.error('[NOTIFICATION_SEND] Erro ao buscar utilizadores:', usersError)
      return NextResponse.json({
        success: false,
        error: `Erro ao buscar utilizadores: ${usersError.message}`
      }, { status: 500 })
    }

    if (!users || users.length === 0) {
      console.warn('[NOTIFICATION_SEND] Nenhum utilizador encontrado com os critérios:', {
        target_users: notification.target_users,
        is_active: true
      })
      return NextResponse.json({
        success: false,
        error: `Nenhum destinatário encontrado. Critérios: ${notification.target_users === 'all' ? 'Todos os utilizadores ativos' : notification.target_users}`
      }, { status: 400 })
    }

    console.log(`[NOTIFICATION_SEND] ✅ ${users.length} utilizadores encontrados para notificação ${notificationId}`)

    let sentCount = 0
    let failedCount = 0

    // 3. Enviar notificações
    for (const user of users) {
      try {
        if (notification.type === 'email' || notification.type === 'both') {
          // Verificar se utilizador tem email
          if (!user.email) {
            console.warn(`[NOTIFICATION_SEND] Utilizador ${user.id} sem email, ignorando email`)
            if (notification.type === 'email') {
              failedCount++
              continue
            }
          } else {
            // Enviar email via sistema de email marketing
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
            const emailHtml = adminBroadcastEmailTemplate(
              notification.title,
              notification.message || '',
              siteUrl,
            )
            const emailResponse = await fetch(`${siteUrl}/api/email-marketing/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...internalApiHeaders() },
              body: JSON.stringify({
                to: user.email,
                subject: notification.title,
                html: emailHtml,
                template: 'notification',
              })
            })
            if (emailResponse.ok) {
              sentCount++
              console.log(`[NOTIFICATION_SEND] ✅ Email enviado para ${user.email}`)
            } else {
              failedCount++
              const errorText = await emailResponse.text()
              console.error(`[NOTIFICATION_SEND] ❌ Erro ao enviar email para ${user.email}:`, errorText)
            }
          }
        }

        if (notification.type === 'push' || notification.type === 'both') {
          // Enviar push notification
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
          const pushResponse = await fetch(`${siteUrl}/api/notifications/send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              title: notification.title,
              body: notification.message,
              data: { type: 'admin_notification', notificationId }
            })
          })
          if (pushResponse.ok) {
            if (notification.type === 'push') sentCount++
            console.log(`[NOTIFICATION_SEND] ✅ Push enviado para ${user.id}`)
            // Criar entrada na tabela notifications para o utilizador poder ver/marcar como lida
            await supabase
              .from('notifications')
              .insert({
                user_id: user.id,
                type: 'admin_notification',
                title: notification.title,
                message: notification.message,
                data: { notificationId, notificationConfigId: notification.id },
                read: false
              })
              .then(() => {})
              .catch((err: any) => {
                console.warn(`[NOTIFICATION_SEND] ⚠️ Falha ao criar entrada em notifications para ${user.id}:`, err?.message || err)
              })
          } else {
            if (notification.type === 'push') {
              failedCount++
              const errorText = await pushResponse.text()
              console.error(`[NOTIFICATION_SEND] ❌ Erro ao enviar push para ${user.id}:`, errorText)
            }
          }
        }
      } catch (error) {
        console.error(`[NOTIFICATION_SEND] ❌ Erro ao enviar para ${user.email || user.id}:`, error)
        failedCount++
      }
    }

    // 4. Atualizar status na base de dados
    const { error: updateError } = await supabase
      .from('notification_configs')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        recipients_count: sentCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)

    if (updateError) {
      console.error('Erro ao atualizar status:', updateError)
    }

    console.log(`[NOTIFICATION_SEND] ✅ Notificação ${notificationId} enviada: ${sentCount} sucesso, ${failedCount} falhas`)

    return NextResponse.json({
      success: true,
      message: 'Notificação enviada com sucesso',
      sentAt: new Date().toISOString(),
      recipientsCount: sentCount,
      failedCount: failedCount
    })

  } catch (error) {
    console.error('[NOTIFICATION_SEND] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Erro ao enviar notificação',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
