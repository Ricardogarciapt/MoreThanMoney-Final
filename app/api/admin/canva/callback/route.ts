import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exchangeCanvaCode, saveCanvaTokens } from '@/lib/canva-connect'

/**
 * Callback do OAuth Canva Connect — troca o code por tokens e guarda o refresh_token.
 * Valida o state guardado em site_settings.canva_oauth_tmp (CSRF). Redireciona para o painel.
 */
export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const dest = `${SITE}/admin/sales-machine`

  const supabase = getSupabaseAdmin()
  const { data: tmpRow } = await supabase.from('site_settings').select('value').eq('key', 'canva_oauth_tmp').maybeSingle()
  const tmp = (tmpRow?.value as { verifier?: string; state?: string; redirect_uri?: string }) || {}

  if (!code || !state || !tmp.state || state !== tmp.state || !tmp.verifier) {
    return NextResponse.redirect(`${dest}?canva=erro_state`)
  }

  try {
    const tokens = await exchangeCanvaCode(code, tmp.verifier, tmp.redirect_uri || `${SITE}/api/admin/canva/callback`)
    await saveCanvaTokens(tokens)
    await supabase.from('site_settings').delete().eq('key', 'canva_oauth_tmp')
    return NextResponse.redirect(`${dest}?canva=ligado`)
  } catch (e) {
    return NextResponse.redirect(`${dest}?canva=erro&msg=${encodeURIComponent(e instanceof Error ? e.message : 'falhou')}`)
  }
}
