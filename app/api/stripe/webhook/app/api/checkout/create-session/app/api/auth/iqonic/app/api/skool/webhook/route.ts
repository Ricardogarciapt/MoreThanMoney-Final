// /api/skool/webhook/route.ts
// Webhook Skool — quando membro ativa pack $65 com referral, atualiza Supabase

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-skool-secret') || req.headers.get('authorization')
    if (process.env.SKOOL_WEBHOOK_SECRET && secret !== process.env.SKOOL_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
    }

    const payload = await req.json()
    console.log('Skool webhook:', JSON.stringify(payload))

    const event = payload.event || payload.type
    const memberEmail = payload.member?.email || payload.email
    const skoolMemberId = payload.member?.id || payload.member_id
    const referredBy = payload.referral?.referrer_username || payload.referred_by

    if (!memberEmail) {
      return NextResponse.json({ error: 'No email in payload' }, { status: 400 })
    }

    if (event === 'member_joined' || event === 'member_approved' || event === 'payment_completed') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, referral_username')
        .eq('email', memberEmail.toLowerCase())
        .single()

      if (!profile) {
        await supabase.from('skool_members').insert({
          skool_member_id: skoolMemberId,
          skool_email: memberEmail,
          referral_username: referredBy || null,
          invited_by_username: referredBy || null,
          status: 'pending_association',
          webhook_payload: payload,
        })

        return NextResponse.json({
          received: true,
          action: 'queued_for_manual_association',
          email: memberEmail,
        })
      }

      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

      await supabase.from('profiles').update({
        subscription_status: 'active',
        subscription_plan: 'pack_65',
        subscription_platform: 'skool',
        subscription_expires_at: expiresAt,
        checkout_source: 'skool',
        skool_member_id: skoolMemberId || null,
        referral_username: referredBy || profile.referral_username,
        is_active: true,
        last_payment_at: new Date().toISOString(),
        payment_failed_count: 0,
      }).eq('id', profile.id)

      await supabase.from('skool_members').upsert({
        user_id: profile.id,
        skool_member_id: skoolMemberId,
        skool_email: memberEmail,
        referral_username: referredBy || null,
        invited_by_username: referredBy || null,
        status: 'active',
        activated_at: new Date().toISOString(),
        webhook_payload: payload,
      }, { onConflict: 'skool_member_id' })

      await supabase.from('payment_history').insert({
        user_id: profile.id,
        amount: 6500,
        currency: 'usd',
        status: 'succeeded',
        plan: 'pack_65',
        billing_cycle: 'one_time',
        source: 'skool',
      })

      return NextResponse.json({
        received: true,
        action: 'user_activated',
        user_id: profile.id,
        expires_at: expiresAt,
      })
    }

    if (event === 'member_left' || event === 'member_removed') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', memberEmail.toLowerCase())
        .single()

      if (profile) {
        await supabase.from('profiles').update({
          subscription_status: 'canceled',
          is_active: false,
          access_revoked_at: new Date().toISOString(),
          inactive_reason: 'skool_membership_ended',
          inactive_since: new Date().toISOString(),
        }).eq('id', profile.id)

        await supabase.from('skool_members').update({
          status: 'inactive',
        }).eq('user_id', profile.id)
      }

      return NextResponse.json({ received: true, action: 'user_deactivated' })
    }

    return NextResponse.json({ received: true, action: 'ignored', event })

  } catch (err: any) {
    console.error('Skool webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export const runtime = 'nodejs'
