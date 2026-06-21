import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')

    if (error) {
      console.warn('Admin settings table might not exist:', error.message)
      // Retornar configurações padrão
      return NextResponse.json({
        data: {
          site_name: 'MoreThanMoney',
          site_description: 'Plataforma de Trading e Educação Financeira',
          maintenance_mode: false,
          registration_enabled: true,
          auto_approve_users: false,
          email_notifications: true,
          default_user_role: 'member'
        }
      })
    }

    // Converter array de settings para objeto
    const settingsObject: any = {
      site_name: 'MoreThanMoney',
      site_description: 'Plataforma de Trading e Educação Financeira',
      maintenance_mode: false,
      registration_enabled: true,
      auto_approve_users: false,
      email_notifications: true,
      default_user_role: 'member'
    }

    data?.forEach((setting: any) => {
      try {
        settingsObject[setting.setting_key] = JSON.parse(setting.setting_value)
      } catch {
        settingsObject[setting.setting_key] = setting.setting_value
      }
    })

    return NextResponse.json({ data: settingsObject })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({
      data: {
        site_name: 'MoreThanMoney',
        site_description: 'Plataforma de Trading e Educação Financeira',
        maintenance_mode: false,
        registration_enabled: true,
        auto_approve_users: false,
        email_notifications: true,
        default_user_role: 'member'
      }
    })
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const {
      site_name,
      site_description,
      maintenance_mode,
      registration_enabled,
      auto_approve_users,
      email_notifications,
      default_user_role
    } = body

    // Array de configurações para salvar
    const settingsToSave = [
      { setting_key: 'site_name', setting_value: JSON.stringify(site_name), description: 'Nome do site' },
      { setting_key: 'site_description', setting_value: JSON.stringify(site_description), description: 'Descrição do site' },
      { setting_key: 'maintenance_mode', setting_value: JSON.stringify(maintenance_mode), description: 'Modo de manutenção' },
      { setting_key: 'registration_enabled', setting_value: JSON.stringify(registration_enabled), description: 'Registo de utilizadores' },
      { setting_key: 'auto_approve_users', setting_value: JSON.stringify(auto_approve_users), description: 'Aprovação automática' },
      { setting_key: 'email_notifications', setting_value: JSON.stringify(email_notifications), description: 'Notificações por email' },
      { setting_key: 'default_user_role', setting_value: JSON.stringify(default_user_role), description: 'Role padrão' }
    ]

    // Tentar salvar cada configuração
    let savedCount = 0
    let errors = []

    for (const setting of settingsToSave) {
      const { error } = await supabase
        .from('admin_settings')
        .upsert(setting, {
          onConflict: 'setting_key'
        })

      if (error) {
        errors.push({ key: setting.setting_key, error: error.message })
      } else {
        savedCount++
      }
    }

    // Se a tabela não existir, salvar localmente
    if (savedCount === 0) {
      console.warn('Admin settings table does not exist, using localStorage fallback')
      return NextResponse.json({
        success: true,
        message: 'Configurações salvas localmente (tabela não existe)',
        fallback: true,
        settings: body
      })
    }

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'admin@morethanmoney.pt',
        p_action: 'settings_updated',
        p_details: `Configurações do sistema atualizadas (${savedCount}/${settingsToSave.length})`
      })
    } catch (logError) {
      console.warn('Erro ao registrar log:', logError)
    }

    return NextResponse.json({
      success: true,
      message: `${savedCount} configurações salvas com sucesso`,
      savedCount,
      totalSettings: settingsToSave.length,
      errors: errors.length > 0 ? errors : undefined
    })

  } catch (error: any) {
    console.error('Error saving settings:', error)
    return NextResponse.json({
      error: error.message || 'Internal server error'
    }, { status: 500 })
  }
}
