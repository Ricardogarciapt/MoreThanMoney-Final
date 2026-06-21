import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { buildThemeConfig, resolveStoredTheme } from '@/lib/admin-settings-utils'

/** Tema público — usado pelo site e app-mobile após guardar no admin. */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('admin_settings')
      .select('setting_value')
      .eq('setting_key', 'theme_config')
      .maybeSingle()

    const stored = resolveStoredTheme(data?.setting_value)
    const themeConfig = buildThemeConfig(stored)

    return NextResponse.json({
      theme: stored.theme,
      colors: themeConfig.colors,
      name: themeConfig.name,
    })
  } catch {
    const { defaultTheme } = await import('@/lib/theme-config')
    return NextResponse.json({
      theme: defaultTheme.id,
      colors: defaultTheme.colors,
      name: defaultTheme.name,
    })
  }
}
