import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { criarLimitadorEmissoes, payloadJwt, tokenRecente } from '@/lib/webtrader/sessao-app'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webtrader/sessao-app — sessão PRÓPRIA do WebTrader para quem já entrou na app MTM Auto.
 *
 * Entrada: `Authorization: Bearer <access token da app MTM Auto>` (nunca no URL).
 * Saída:   { access_token, refresh_token, expires_at, user_id } no corpo, sem cache.
 * As regras e o porquê de ser uma sessão nova (e não a mesma) estão em lib/webtrader/sessao-app.ts.
 *
 * Erros com `code` para a página decidir: sem_token · token_invalido · token_velho · nao_cliente ·
 * sem_email · limite · falhou. Em qualquer deles a página cai no ecrã de entrada normal do WebTrader.
 */
const limitador = criarLimitadorEmissoes()
const SEM_CACHE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

const erro = (status: number, code: string, error: string) =>
  NextResponse.json({ error, code }, { status, headers: SEM_CACHE })

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return erro(401, 'sem_token', 'Sem sessão da app.')

  const admin = getSupabaseAdmin()
  // Primeiro a assinatura e o utilizador (o Supabase valida); só depois se lê o `iat` do payload.
  const { data: u, error: uErr } = await admin.auth.getUser(token)
  const user = u?.user
  if (uErr || !user) return erro(401, 'token_invalido', 'Sessão da app inválida ou expirada.')
  if (!tokenRecente(payloadJwt(token))) return erro(401, 'token_velho', 'Sessão da app antiga — renova e tenta outra vez.')

  const { data: ficha } = await admin.from('mtmauto_users').select('user_id, suspenso').eq('user_id', user.id).maybeSingle()
  if (!ficha) return erro(403, 'nao_cliente', 'Esta passagem é só para clientes da app MTM Auto.')
  if (ficha.suspenso === true) return erro(403, 'nao_cliente', 'Conta MTM Auto suspensa.')
  if (!user.email) return erro(409, 'sem_email', 'Conta sem email — entra no WebTrader com a conta MTM.')
  if (!limitador.permitir(user.id)) return erro(429, 'limite', 'Demasiados pedidos — espera uns minutos.')

  try {
    // Magic link gerado no servidor: NÃO envia email; o hash usa-se aqui mesmo e fica gasto.
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
    const tokenHash = (link as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token
    if (lErr || !tokenHash) return erro(500, 'falhou', 'Não foi possível abrir a sessão do WebTrader.')

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    const s = v?.session
    if (vErr || !s || s.user?.id !== user.id) return erro(500, 'falhou', 'Não foi possível abrir a sessão do WebTrader.')

    // Registo sem tokens nem email: quem e quando, para se poder auditar a passagem.
    console.info('[webtrader/sessao-app] sessão emitida', user.id.slice(0, 8))
    return NextResponse.json(
      { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at ?? null, user_id: user.id },
      { headers: SEM_CACHE },
    )
  } catch (e) {
    console.error('[webtrader/sessao-app]', e instanceof Error ? e.message : 'erro')
    return erro(500, 'falhou', 'Não foi possível abrir a sessão do WebTrader.')
  }
}
