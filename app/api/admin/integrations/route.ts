/**
 * Fechado a 2026-08-28: esta rota corria com a service-role e SEM verificar quem chamava.
 *
 * Uma rota assim nao e "menos protegida" — nao tem protecao nenhuma. Bastava saber o endereco.
 * O `delete-user` apagava contas, o `approve-user` dava acesso, o chat do dashboard corria o
 * modelo com as ferramentas todas na nossa conta. Testado contra producao antes de fechar.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase"
import { requireAdmin } from "@/lib/admin-api-helpers"

export async function GET(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    
    const { data, error } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'integrations_config')
      .single()
    
    if (error || !data) {
      // Retornar configuração padrão
      return NextResponse.json({
        integrations: getDefaultIntegrations()
      })
    }
    
    return NextResponse.json(JSON.parse(data.setting_value))
  } catch (error) {
    console.error('[INTEGRATIONS_GET]', error)
    return NextResponse.json({
      integrations: getDefaultIntegrations()
    })
  }
}

export async function POST(request: NextRequest) {
  const guarda = await requireAdmin(request)
  if (guarda) return guarda

  try {
    const supabase = getSupabaseAdmin()
    const body = await request.json()
    
    console.log('[INTEGRATIONS_POST] Salvando configuração')
    
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_key: 'integrations_config',
        setting_value: JSON.stringify(body),
        description: 'Configuração de integrações do site',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      })
    
    if (error) {
      console.error('[INTEGRATIONS_POST] Erro:', error)
      throw error
    }
    
    console.log('[INTEGRATIONS_POST] ✅ Salvo com sucesso')
    
    return NextResponse.json({ 
      success: true,
      message: 'Configurações de integrações salvas com sucesso!'
    })
  } catch (error: any) {
    console.error('[INTEGRATIONS_POST]', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar configurações' },
      { status: 500 }
    )
  }
}

function getDefaultIntegrations() {
  return [
    {
      id: 'tradingview',
      name: 'TradingView',
      enabled: true,
      config: {
        widgetType: 'advanced',
        defaultSymbol: 'OANDA:XAUUSD',
        theme: 'dark',
        maxSavedCharts: 20
      }
    },
    {
      id: 'google-translate',
      name: 'Google Translate',
      enabled: true,
      config: {
        totalLanguages: 21,
        autoTranslate: true,
        defaultLanguage: 'pt'
      }
    },
    {
      id: 'youtube',
      name: 'YouTube Embed',
      enabled: true,
      config: {
        autoSubtitles: true,
        hideBranding: true,
        qualityPreference: '1080p'
      }
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp CTA',
      enabled: true,
      config: {
        phoneNumber: '+351912666699',
        floatingButton: true,
        position: 'bottom-right'
      }
    },
    {
      id: 'supabase',
      name: 'Supabase',
      enabled: true,
      config: {
        authEnabled: true,
        dbConnected: true,
        realtimeEnabled: false
      }
    },
    {
      id: 'gmail',
      name: 'Gmail SMTP',
      enabled: true,
      config: {
        emailFrom: 'morethanmoneypt@gmail.com',
        emailNotifications: true
      }
    },
    {
      id: 'themes',
      name: 'Sistema de Temas',
      enabled: true,
      config: {
        totalThemes: 4,
        customThemeEnabled: true,
        currentTheme: 'default'
      }
    },
    {
      id: 'vercel',
      name: 'Vercel Deploy',
      enabled: true,
      config: {
        autoDeploy: true,
        productionUrl: 'site-morethanmoney-final.vercel.app'
      }
    }
  ]
}

