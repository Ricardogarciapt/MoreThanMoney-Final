import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getStripeClient } from "@/lib/stripe-client"
import { requireStripePriceId } from "@/lib/stripe-prices"
import { buildStripeReturnUrl, getSiteOrigin } from "@/lib/site-url"
import { isRegisteredMember } from "@/lib/member-access"
import { buildUsername } from "@/lib/member-profile"

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()

/**
 * POST /api/stripe/oauth-register-checkout
 * Checkout Stripe para registo via Google OAuth (utilizador já autenticado, perfil criado após pagamento).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { planId, regToken, sponsorUsername, couponCode } = body

    if (!planId || !regToken) {
      return NextResponse.json({ error: "planId e regToken são obrigatórios" }, { status: 400 })
    }

    let response = NextResponse.next()
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.email) {
      return NextResponse.json({ error: "Sessão OAuth inválida. Tenta registar novamente." }, { status: 401 })
    }

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select(
        "id, user_type, member_category, is_active, subscription_plan, stripe_subscription_id, subscription_expires_at, trial_expires_at, trial_expired"
      )
      .eq("id", user.id)
      .maybeSingle()

    if (isRegisteredMember(existingProfile)) {
      return NextResponse.json(
        { error: "Já tens uma conta MTM. Inicia sessão em /login." },
        { status: 409 }
      )
    }

    const meta = (user.user_metadata || {}) as Record<string, unknown>
    const fullName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      user.email.split("@")[0]
    const username = buildUsername({ user: { id: user.id, email: user.email, user_metadata: meta } })

    const priceId = requireStripePriceId(planId)
    const stripe = getStripeClient()

    const customer = await stripe.customers.create({
      email: user.email,
      name: fullName,
      metadata: {
        pending_registration: "true",
        registration_method: "oauth",
        oauth_user_id: user.id,
        reg_token: regToken,
      },
    })

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildStripeReturnUrl("/success", {
        plan: planId,
        reg_token: regToken,
        new_user: "1",
        oauth: "1",
      }),
      cancel_url: buildStripeReturnUrl("/register", {}, { includeSessionPlaceholder: false }),
      metadata: {
        pending_registration: "true",
        registration_method: "oauth",
        oauth_user_id: user.id,
        reg_token: regToken,
        plan: planId,
        email: user.email,
        full_name: fullName,
        username,
        phone: "",
        sponsor_username: sponsorUsername || "",
        coupon_code: couponCode || "",
      },
    })

    const json = NextResponse.json({ url: session.url, sessionId: session.id })
    response.cookies.getAll().forEach((cookie) => {
      json.cookies.set(cookie.name, cookie.value)
    })
    return json
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar sessão de pagamento"
    console.error("❌ [OAUTH-REGISTER-CHECKOUT] Erro:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
