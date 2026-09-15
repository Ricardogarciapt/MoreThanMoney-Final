import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { deleteMetaApiAccount } from '@/lib/mtmcopy/metaapi-provision'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Apaga uma conta na MetaApi (undeploy + delete) e limpa a referência na ligação.
 *
 * Serve os enforcements de breach: pausar a ligação corta a cópia, mas a conta continua a
 * existir (e a contar) na MetaApi até alguém a apagar no painel. Isto fecha esse resto.
 *
 * Além do admin de sessão, aceita um token de uso único guardado em
 * `site_settings.metaapi_purge_token` — a ponte para operações lançadas de fora do browser.
 * O token é consumido (apagado) na primeira utilização, válida ou não a conta.
 */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('account')?.trim() ?? ''
  const key = req.nextUrl.searchParams.get('key')?.trim() ?? ''
  if (!/^[0-9a-f-]{36}$/.test(accountId)) {
    return NextResponse.json({ ok: false, error: 'account inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  let autorizado = false
  if (key) {
    const { data } = await supabase.from('site_settings').select('value').eq('key', 'metaapi_purge_token').maybeSingle()
    const esperado = typeof data?.value === 'string' ? data.value : (data?.value as { token?: string } | null)?.token
    if (esperado && key === esperado) {
      autorizado = true
      await supabase.from('site_settings').delete().eq('key', 'metaapi_purge_token')
    }
  }
  if (!autorizado) {
    const negado = await requireAdmin(req)
    if (negado) return negado
  }

  if (!process.env.METAAPI_TOKEN) {
    return NextResponse.json({ ok: false, error: 'METAAPI_TOKEN por configurar' }, { status: 503 })
  }

  let removida = false
  let erro: string | null = null
  try {
    removida = await deleteMetaApiAccount(accountId)
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
  }

  // A referência sai da ligação mesmo que a conta já não existisse na MetaApi — uma ligação
  // pausada a apontar para uma conta apagada é exatamente a confusão que o fontes-vivas caça.
  let ligacoesLimpas = 0
  if (removida) {
    const { data } = await supabase
      .from('mtmcopy_connections')
      .update({ metaapi_account_id: null, updated_at: new Date().toISOString() })
      .eq('metaapi_account_id', accountId)
      .select('id')
    ligacoesLimpas = data?.length ?? 0
  }

  return NextResponse.json({ ok: removida, accountId, removida, ligacoesLimpas, erro })
}
