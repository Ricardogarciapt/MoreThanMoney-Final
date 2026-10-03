import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getStripeClient } from '@/lib/stripe-client'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { provisionStripeRegistrationFromSession } from '@/lib/stripe-complete-registration'

export const dynamic = 'force-dynamic'

function syncSecretAuthorized(request: NextRequest): boolean {
  const secret = process.env.SYNC_USERS_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('x-sync-users-secret') === secret
}

async function authorize(request: NextRequest): Promise<NextResponse | null> {
  if (syncSecretAuthorized(request)) return null
  return requireAdmin(request)
}

/**
 * POST /api/admin/reconcile-stripe-registrations
 * Processa checkout_sessions com status paid_pending_account e cria/activa perfis.
 * Body opcional: { sessionId?: string }
 */
export async function POST(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const sessionIdFilter = typeof body.sessionId === 'string' ? body.sessionId.trim() : null

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('checkout_sessions')
      .select('stripe_session_id, plan, status, completed_at')
      .eq('status', 'paid_pending_account')
      .order('completed_at', { ascending: false })
      .limit(50)

    if (sessionIdFilter) {
      query = supabase
        .from('checkout_sessions')
        .select('stripe_session_id, plan, status, completed_at')
        .eq('stripe_session_id', sessionIdFilter)
        .limit(1)
    }

    const { data: rows, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!rows?.length) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhuma sessão pendente encontrada.',
        processed: 0,
        results: [],
      })
    }

    const stripe = getStripeClient()
    const results: Array<{
      stripe_session_id: string
      ok: boolean
      userId?: string
      reason?: string
      error?: string
    }> = []

    for (const row of rows) {
      try {
        const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, {
          expand: ['subscription'],
        })

        if (session.metadata?.pending_registration !== 'true') {
          results.push({
            stripe_session_id: row.stripe_session_id,
            ok: false,
            reason: 'not_pending_registration',
          })
          continue
        }

        const provision = await provisionStripeRegistrationFromSession(session, {
          sendSetPasswordEmail: true,
        })

        if (provision.ok) {
          results.push({
            stripe_session_id: row.stripe_session_id,
            ok: true,
            userId: provision.userId,
          })
        } else {
          results.push({
            stripe_session_id: row.stripe_session_id,
            ok: false,
            reason: provision.reason,
            error: provision.error,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push({
          stripe_session_id: row.stripe_session_id,
          ok: false,
          reason: 'exception',
          error: message,
        })
      }
    }

    const succeeded = results.filter((r) => r.ok).length

    return NextResponse.json({
      ok: true,
      processed: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno'
    console.error('❌ [reconcile-stripe-registrations]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET — lista sessões pendentes (admin)
 */
export async function GET(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('checkout_sessions')
    .select('stripe_session_id, plan, status, completed_at, user_id')
    .eq('status', 'paid_pending_account')
    .order('completed_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pending: data ?? [] })
}
