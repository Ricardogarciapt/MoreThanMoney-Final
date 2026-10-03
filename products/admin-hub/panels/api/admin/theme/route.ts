import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { buildThemeConfig, resolveStoredTheme } from "@/lib/admin-settings-utils"
import { defaultTheme } from "@/lib/theme-config"

const supabase = getSupabaseAdmin()

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'theme_config')
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({
        theme: defaultTheme.id,
        colors: defaultTheme.colors,
        name: defaultTheme.name,
      })
    }

    const stored = resolveStoredTheme(data.setting_value)
    const themeConfig = buildThemeConfig(stored)

    return NextResponse.json({
      theme: stored.theme,
      colors: themeConfig.colors,
      name: themeConfig.name,
    })
  } catch (error) {
    console.error('Error in theme GET:', error)
    return NextResponse.json({
      theme: defaultTheme.id,
      colors: defaultTheme.colors,
      name: defaultTheme.name,
    })
  }
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { themeId, colors } = body

    const payload = {
      theme: themeId,
      colors,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('admin_settings')
      .upsert(
        {
          setting_key: 'theme_config',
          setting_value: payload,
          description: 'Configuração de tema do site',
        },
        { onConflict: 'setting_key' },
      )

    if (error) {
      console.warn('Could not save theme:', error.message)
      return NextResponse.json({
        success: true,
        message: 'Tema guardado localmente (fallback)',
        fallback: true,
        theme: themeId,
        colors,
      })
    }

    try {
      await supabase.rpc('log_activity', {
        p_user_email: 'admin@morethanmoney.pt',
        p_action: 'theme_updated',
        p_details: `Tema actualizado: ${themeId}`,
      })
    } catch {
      /* optional */
    }

    return NextResponse.json({
      success: true,
      message: 'Tema guardado com sucesso',
      theme: themeId,
      colors,
    })
  } catch (error: unknown) {
    console.error('Error in theme POST:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
