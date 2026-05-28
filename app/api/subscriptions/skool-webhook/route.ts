import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabase = getSupabaseAdmin()

/**
 * POST /api/subscriptions/skool-webhook
 *
 * Receives membership events from Skool (via webhook or manual trigger).
 * Maps Skool membership levels to MTM subscription plans.
 *
 * Skool webhook payload (example):
 * {
 *   "event": "member.joined" | "member.left" | "member.upgraded",
 *   "member": {
 *     "email": "user@example.com",
 *     "name": "João Silva",
 *     "skool_id": "abc123",
 *     "group_name": "MTM Premium"  // or "MTM Membro"
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret = request.headers.get("x-skool-secret") || request.headers.get("x-webhook-secret")
    const expectedSecret = process.env.SKOOL_WEBHOOK_SECRET
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { event, member } = body

    if (!member?.email) {
      return NextResponse.json({ error: "member.email é obrigatório" }, { status: 400 })
    }

    const email = String(member.email).toLowerCase().trim()
    const skoolId = String(member.skool_id || "").trim() || null
    const groupName = String(member.group_name || "").toLowerCase()

    // Map Skool group name to MTM plan
    const isPremium = groupName.includes("premium") || groupName.includes("65")
    const isMember  = groupName.includes("membro") || groupName.includes("member") || groupName.includes("35")
    const plan: "premium" | "app_member" | null = isPremium ? "premium" : isMember ? "app_member" : null

    // Find user by email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_type, subscription_plan")
      .eq("email", email)
      .single()

    if (event === "member.joined" || event === "member.upgraded") {
      if (!plan) {
        return NextResponse.json({ warning: `Grupo Skool '${member.group_name}' não mapeado a nenhum plano MTM.` }, { status: 200 })
      }

      if (profile) {
        // Update existing user
        await supabase.from("profiles").update({
          subscription_plan: plan,
          subscription_billing_cycle: "monthly",
          subscription_platform: "skool",
          skool_member_id: skoolId,
          member_category: plan === "premium" ? "iq" : "standard",
          user_type: profile.user_type === "admin" ? "admin" : "member",
          is_active: true,
          updated_at: new Date().toISOString(),
        }).eq("id", profile.id)

        await supabase.from("subscription_events").insert({
          user_id: profile.id,
          event_type: event === "member.upgraded" ? "upgraded" : "purchased",
          plan,
          billing_cycle: "monthly",
          platform: "skool",
          metadata: { skool_id: skoolId, group_name: member.group_name, event },
        })

        return NextResponse.json({ success: true, action: "updated", user_id: profile.id, plan })
      } else {
        // User doesn't exist yet — create a pending profile
        // They'll complete registration via the site
        return NextResponse.json({
          success: false,
          message: "Utilizador não encontrado no MTM. Pede-lhe para registar em morethanmoney.pt/register.",
          email,
          plan,
        }, { status: 200 })
      }
    }

    if (event === "member.left" || event === "member.cancelled") {
      if (profile) {
        await supabase.from("profiles").update({
          subscription_plan: null,
          subscription_platform: null,
          is_active: false,
          user_type: "pending",
          updated_at: new Date().toISOString(),
        }).eq("id", profile.id)

        await supabase.from("subscription_events").insert({
          user_id: profile.id,
          event_type: "cancelled",
          plan: profile.subscription_plan as string,
          platform: "skool",
          metadata: { skool_id: skoolId, group_name: member.group_name, event },
        })

        return NextResponse.json({ success: true, action: "deactivated", user_id: profile.id })
      }
    }

    return NextResponse.json({ success: true, message: `Evento '${event}' processado.` })
  } catch (err: any) {
    console.error("[skool-webhook] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}

// Allow Skool to verify the webhook endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const challenge = searchParams.get("challenge")
  if (challenge) return new Response(challenge, { status: 200 })
  return NextResponse.json({ status: "MTM Skool webhook activo" })
}
