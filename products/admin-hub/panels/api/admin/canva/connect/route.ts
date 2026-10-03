import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { CANVA_SCOPES } from '@/lib/canva-connect'
import crypto from 'node:crypto'

/**
 * "Ligar Canva" (1 clique) — inicia o OAuth do Canva Connect (PKCE).
 * Admin abre /api/admin/canva/connect → redireciona para o Canva autorizar → volta ao callback.
 * redirect_uri a registar na integração: {SITE}/api/admin/canva/callback
 */
export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const clientId = process.env.CANVA_CLIENT_ID?.trim()
  if (!clientId) return NextResponse.json({ ok: false, error: 'CANVA_CLIENT_ID em falta na Vercel' }, { status: 400 })

  const verifier = b64url(crypto.randomBytes(48))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const state = b64url(crypto.randomBytes(16))
  const redirectUri = `${SITE}/api/admin/canva/callback`

  // Guarda verifier+state (temporário) para o callback validar.
  await getSupabaseAdmin().from('site_settings').upsert(
    { key: 'canva_oauth_tmp', value: { verifier, state, redirect_uri: redirectUri, ts: Date.now() } },
    { onConflict: 'key' },
  )

  const authUrl =
    'https://www.canva.com/api/oauth/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: CANVA_SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    }).toString()

  return NextResponse.redirect(authUrl)
}
