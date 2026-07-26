/**
 * GET /api/referral (Bearer token) — devolve o código/link de referral do utilizador + stats.
 * Gera o código na 1ª chamada.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getOrCreateReferralCode, getReferralStats, REFERRER_DAYS, REFERRED_TRIAL_DAYS } from "@/lib/referral"

export async function GET(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim()
  if (!token) return NextResponse.json({ error: "Sessão em falta." }, { status: 401 })

  const admin = getSupabaseAdmin()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 })

  const code = await getOrCreateReferralCode(admin, user.id)
  if (!code) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 })

  const stats = await getReferralStats(admin, user.id)
  return NextResponse.json({
    code,
    link: `https://www.morethanmoney.pt/register?ref=${code}`,
    referrals: stats.referrals,
    daysEarned: stats.daysEarned,
    referrerDays: REFERRER_DAYS,
    referredTrialDays: REFERRED_TRIAL_DAYS,
  })
}
