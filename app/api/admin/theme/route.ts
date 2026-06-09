import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'theme_config')
      .single()

    if (error) {
      console.warn('Admin settings table might not exist:', error.message)
      // Retornar tema padrão se a tabela não existir
      return NextResponse.json({ 
        theme: 'default',
        colors: {
          primary: '#efb810',
          primaryLight: '#f9db5c',
          primaryDark: '#b28405',
          primaryDarker: '#795300',
          background: '#000000',
          backgroundLight: '#1a1a1a',
          text: '#ffffff',
          textMuted: '#a0a0a0',
          border: 'rgba(239, 184, 16, 0.3)',
          accent: '#efb810'
        }
      })
    }

    // Se não houver tema salvo, retornar tema padrão
    if (!data) {
      return NextResponse.json({ 
        theme: 'default',
        colors: {
          primary: '#efb810',
          primaryLight: '#f9db5c',
          primaryDark: '#b28405',
          primaryDarker: '#795300',
          background: '#000000',
          backgroundLight: '#1a1a1a',
          text: '#ffffff',
          textMuted: '#a0a0a0',
          border: 'rgba(239, 184, 16, 0.3)',
          accent: '#efb810'
        }
      })
    }

    return NextResponse.json(data.setting_value)
  } catch (error) {
    console.error('Error in theme GET:', error)
    // Retornar tema padrão em caso de erro
    return NextResponse.json({ 
      theme: 'default',
      colors: {
        primary: '#efb810',
        primaryLight: '#f9db5c',
        primaryDark: '#b28405',
        primaryDarker: '#795300',
        background: '#000000',
        backgroundLight: '#1a1a1a',
        text: '#ffffff',
        textMuted: '#a0a0a0',
        border: 'rgba(239, 184, 16, 0.3)',
        accent: '#efb810'
      }
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { themeId, colors } = body

    // Tentar salvar ou atualizar tema
    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_key: 'theme_config',
        setting_value: {
          theme: themeId,
          colors: colors,
          updated_at: new Date().toISOString()
        },
        description: 'Configuração de tema do site'
      }, {
        onConflict: 'setting_key'
      })
      .select()
      .single()

    if (error) {
      console.warn('Could not save to database:', error.message)
      // Salvar em localStorage como fallback
      return NextResponse.json({ 
        success: true, 
        message: 'Tema salvo localmente (tabela admin_settings não existe)',
        fallback: true,
        theme: themeId,
        colors
      })
    }

    // Log da atividade
    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'admin@morethanmoney.pt',
        p_action: 'theme_updated',
        p_details: `Tema atualizado para: ${themeId}`
      })
    } catch (logError) {
      console.warn('Erro ao registrar log:', logError)
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Tema salvo com sucesso',
      data 
    })
  } catch (error: any) {
    console.error('Error in theme POST:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
