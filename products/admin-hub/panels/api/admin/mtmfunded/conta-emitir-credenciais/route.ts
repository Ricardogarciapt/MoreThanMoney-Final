import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Emite credenciais para uma conta simulada criada FORA do fluxo de compra (ex.: conta Real
 * aberta pelo admin diretamente na BD) e envia o email oficial de credenciais ao dono —
 * login + link seguro, nunca a password no corpo, como em todo o resto do sistema.
 *
 * Autorização: admin de sessão, ou token de uso único em
 * `site_settings.mtmfunded_cred_emit_token` (consumido à primeira utilização).
 */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('account')?.trim() ?? ''
  const key = req.nextUrl.searchParams.get('key')?.trim() ?? ''
  if (!/^[0-9a-f-]{36}$/.test(accountId)) {
    return NextResponse.json({ ok: false, error: 'account inválido' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  let autorizado = false
  if (key) {
    const { data } = await db.from('site_settings').select('value').eq('key', 'mtmfunded_cred_emit_token').maybeSingle()
    const esperado = typeof data?.value === 'string' ? data.value : (data?.value as { token?: string } | null)?.token
    if (esperado && key === esperado) {
      autorizado = true
      await db.from('site_settings').delete().eq('key', 'mtmfunded_cred_emit_token')
    }
  }
  if (!autorizado) {
    const negado = await requireAdmin(req)
    if (negado) return negado
  }

  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .select('id, motor, mt5_login, mt5_password_cifrada, servidor')
    .eq('id', accountId)
    .maybeSingle()
  if (erroConta || !conta) return NextResponse.json({ ok: false, error: 'conta não encontrada' }, { status: 404 })
  if (conta.motor !== 'sim') return NextResponse.json({ ok: false, error: 'só contas simuladas' }, { status: 409 })

  const cred = await import('@/lib/mtmfunded/simulado/credenciais')
  const { cifrar } = await import('@/lib/mtmfunded/credenciais')
  const master = cred.gerarPassword()
  const investor = cred.gerarPassword()
  const login = conta.mt5_login || (await cred.gerarLoginUnico())

  const { error } = await db
    .from('mtm_trading_accounts')
    .update({ mt5_login: login, mt5_password_cifrada: cifrar(master), mt5_investor_cifrada: cifrar(investor), updated_at: new Date().toISOString() })
    .eq('id', conta.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { enviarCredenciaisDaConta } = await import('@/lib/mtmfunded/credenciais-servico')
  const email = await enviarCredenciaisDaConta(conta.id, 'criacao', { db, incluirCasa: true })

  return NextResponse.json({ ok: true, login, servidor: conta.servidor ?? 'MTM Funded', emailAoDono: email.enviado })
}
