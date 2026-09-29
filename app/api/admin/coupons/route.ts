import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import {
  activateStripePromotionCode,
  createStripeCouponSync,
  deactivateStripePromotionCode,
} from "@/lib/stripe-coupons"
// O nome do âmbito vive num sítio só, ao lado da regra que o lê no checkout. Escrevê-lo à mão aqui
// era a maneira de um 'marketplace' com maiúscula passar a criar cupões que nunca se aplicam.
import { AMBITO_MARKETPLACE } from "@/lib/marketplace/cupoes"

const supabase = getSupabaseAdmin()

// ── GET — list all coupons ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("❌ [ADMIN COUPONS GET] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao buscar cupões", details: error.message },
        { status: 500 }
      )
    }

    /**
     * O painel mostra os usos REAIS, contados em `coupon_usages`.
     *
     * A coluna `used_count` nunca subiu (ver lib/cupoes-usos.ts), por isso o painel dizia «0 usos»
     * em cupões já resgatados — e era com esse zero que se decidia se um cupão ainda tinha vida.
     * Devolve-se o valor contado no MESMO campo que o ecrã já lê: não há ecrã novo a fazer, e o
     * que lá está passa a ser verdade.
     */
    const cupoes = data || []
    const { data: usos } = await supabase.from('coupon_usages').select('coupon_id')
    const contagem = new Map<string, number>()
    for (const u of usos ?? []) {
      const k = String((u as { coupon_id?: unknown }).coupon_id ?? '')
      if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
    }
    return NextResponse.json({
      data: cupoes.map((c) => ({ ...c, used_count: contagem.get(String(c.id)) ?? 0 })),
    })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS GET] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── POST — create coupon ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const {
      code,
      type,
      discount_value,
      plan_override,
      max_uses,
      valid_from,
      valid_until,
      description,
      stripe_duration,
      stripe_duration_months,
      apple_offer_id,
      grant_days,
      grants_vip,
    } = body

    if (!code || typeof code !== "string" || !code.trim()) {
      return NextResponse.json(
        { error: "O código é obrigatório" },
        { status: 400 }
      )
    }

    const allowedTypes = ["discount_pct", "free_months", "free_subscription", "partnership"]
    if (!type || !allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido. Valores permitidos: ${allowedTypes.join(", ")}` },
        { status: 400 }
      )
    }

    // ── Código de parceria (influencer/UGC): concede acesso direto, sem Stripe/Apple ──
    if (type === "partnership") {
      const normalizedCode = code.trim().toUpperCase()
      const { data: dup } = await supabase.from("coupons").select("id").eq("code", normalizedCode).maybeSingle()
      if (dup) {
        return NextResponse.json({ error: `Já existe um código "${normalizedCode}"` }, { status: 409 })
      }
      const days = Number(grant_days) > 0 ? Math.floor(Number(grant_days)) : 60
      const { data, error } = await supabase
        .from("coupons")
        .insert({
          code: normalizedCode,
          type: "partnership",
          discount_value: 0,
          plan_override: "premium",
          grant_days: days,
          grants_vip: grants_vip !== false, // default true
          max_uses: max_uses ?? null,
          used_count: 0,
          valid_from: valid_from || new Date().toISOString(),
          valid_until: valid_until || null,
          description: description || `Parceria — ${days} dias de Premium${grants_vip !== false ? " + VIP" : ""}`,
          is_active: true,
        })
        .select()
        .single()
      if (error) {
        console.error("❌ [ADMIN COUPONS POST partnership] Erro:", error)
        return NextResponse.json({ error: "Erro ao criar código de parceria", details: error.message }, { status: 500 })
      }
      return NextResponse.json({ data, stripe_synced: false }, { status: 201 })
    }

    /**
     * `plan_override` faz de ÂMBITO, e a lista estava desalinhada do ecrã.
     *
     * O formulário já oferecia «MTM Funded (desafios)» e esta lista não o aceitava: escolher essa
     * opção devolvia «plan_override inválido» e o cupão nunca chegava a existir. O painel oferecia
     * uma coisa que o servidor recusava.
     *
     * `marketplace` entra agora pela mesma porta que o `mtmfunded` abriu, e é o que faltava para o
     * âmbito de marketplace existir na prática — as regras, as guardas e a validação no checkout já
     * cá estavam; o que não havia era maneira de criar um.
     */
    const allowedPlans = ["app_member", "premium", "both", "mtmfunded", AMBITO_MARKETPLACE, null, undefined]
    if (plan_override !== undefined && !allowedPlans.includes(plan_override)) {
      return NextResponse.json(
        { error: "plan_override inválido" },
        { status: 400 }
      )
    }

    // ── O âmbito dentro do marketplace ────────────────────────────────────────────────────
    //
    // Dois níveis, porque são duas perguntas reais: «só neste produto» e «em tudo o que é deste
    // educador». Fora do marketplace são ignorados — um cupão de packs do site com um produto
    // agarrado era um âmbito que ninguém leria e que confundiria quem fosse lá ver porquê.
    const doMarketplace = plan_override === AMBITO_MARKETPLACE
    const produtoDoAmbito = doMarketplace ? (body.marketplace_produto_id || null) : null
    const educadorDoAmbito = doMarketplace ? (body.marketplace_educator_id || null) : null
    if (produtoDoAmbito && educadorDoAmbito) {
      // Os dois ao mesmo tempo não é mais restrito: é ambíguo. O checkout teria de decidir qual
      // manda, e a decisão certa é não deixar a pergunta nascer.
      return NextResponse.json(
        { error: "Escolhe um âmbito: um produto OU um educador, não os dois." },
        { status: 400 }
      )
    }
    if (doMarketplace && type !== "discount_pct") {
      // Um cupão de marketplace é uma PERCENTAGEM. «Meses grátis» não significa nada num curso
      // avulso, e `validarCupao` recusa-o na cara do comprador — mais vale recusá-lo aqui, a quem
      // o está a criar e ainda o pode mudar.
      return NextResponse.json(
        { error: "Um cupão de marketplace tem de ser de percentagem de desconto." },
        { status: 400 }
      )
    }

    const normalizedCode = code.trim().toUpperCase()

    // Check for duplicate
    const { data: existing } = await supabase
      .from("coupons")
      .select("id")
      .eq("code", normalizedCode)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `Já existe um cupão com o código "${normalizedCode}"` },
        { status: 409 }
      )
    }

    const allowedDurations = ['once', 'repeating', 'forever', null, undefined]
    if (stripe_duration !== undefined && !allowedDurations.includes(stripe_duration)) {
      return NextResponse.json({ error: "stripe_duration inválido. Valores: once, repeating, forever" }, { status: 400 })
    }

    // Oferta promocional Apple (IAP) — null/'' = derivar automaticamente pelo tipo do cupão.
    const allowedAppleOffers = ['founder_50pct', 'mtm_founder', '', null, undefined]
    if (apple_offer_id !== undefined && !allowedAppleOffers.includes(apple_offer_id)) {
      return NextResponse.json({ error: "apple_offer_id inválido. Valores: founder_50pct, mtm_founder" }, { status: 400 })
    }

    /**
     * UM CUPÃO DE MARKETPLACE NÃO VAI AO STRIPE COMO CÓDIGO PROMOCIONAL. É a decisão, não um atalho.
     *
     * `createStripeCouponSync` cria um *promotion code* na conta Stripe da casa — e um promotion
     * code é resgatável em QUALQUER sessão de checkout dela. Um código de 50% feito para um curso
     * de um educador passaria a ser escrevível na caixa de desconto do checkout dos packs do site,
     * e cinquenta por cento de uma subscrição anual é muito dinheiro por um cupão que ninguém quis
     * dar ali.
     *
     * O marketplace não precisa dele: o checkout valida o código contra a nossa tabela e constrói o
     * desconto com `cupaoStripeDePercentagem`, um cupão anónimo pela percentagem, aplicado àquela
     * sessão e a mais nenhuma.
     */
    let stripeSync: { stripe_coupon_id: string; stripe_promotion_code_id: string } | null = null
    if (doMarketplace) {
      const { data, error } = await supabase
        .from("coupons")
        .insert({
          code: normalizedCode,
          type,
          discount_value: discount_value ?? 0,
          plan_override: AMBITO_MARKETPLACE,
          marketplace_produto_id: produtoDoAmbito,
          marketplace_educator_id: educadorDoAmbito,
          max_uses: max_uses ?? null,
          used_count: 0,
          valid_from: valid_from || new Date().toISOString(),
          valid_until: valid_until || null,
          description: description || null,
          is_active: true,
        })
        .select()
        .single()
      if (error) {
        console.error("❌ [ADMIN COUPONS POST marketplace] Erro:", error)
        return NextResponse.json({ error: "Erro ao criar cupão de marketplace", details: error.message }, { status: 500 })
      }
      return NextResponse.json({ data, stripe_synced: false }, { status: 201 })
    }

    try {
      stripeSync = await createStripeCouponSync({
        code: normalizedCode,
        type,
        discount_value: discount_value ?? 0,
        max_uses: max_uses ?? null,
        valid_until: valid_until || null,
        description: description || null,
        stripe_duration: stripe_duration || null,
        stripe_duration_months: stripe_duration_months ? Number(stripe_duration_months) : null,
      })
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : "Erro ao criar cupão no Stripe"
      console.error("❌ [ADMIN COUPONS POST] Stripe:", msg)
      return NextResponse.json(
        { error: "Erro ao sincronizar cupão com Stripe", details: msg },
        { status: 502 }
      )
    }

    const { data, error } = await supabase
      .from("coupons")
      .insert({
        code: normalizedCode,
        type,
        discount_value: discount_value ?? 0,
        plan_override: plan_override || null,
        max_uses: max_uses ?? null,
        used_count: 0,
        valid_from: valid_from || new Date().toISOString(),
        valid_until: valid_until || null,
        description: description || null,
        is_active: true,
        stripe_duration: stripe_duration || null,
        stripe_coupon_id: stripeSync.stripe_coupon_id,
        stripe_promotion_code_id: stripeSync.stripe_promotion_code_id,
        apple_offer_id: apple_offer_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error("❌ [ADMIN COUPONS POST] Erro:", error)
      if (stripeSync) {
        await deactivateStripePromotionCode(stripeSync.stripe_promotion_code_id).catch(() => {})
      }
      return NextResponse.json(
        { error: "Erro ao criar cupão", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, stripe_synced: true }, { status: 201 })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS POST] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── PATCH — toggle is_active or update fields ─────────────────────────────────

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { id, is_active, ...rest } = body

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (is_active !== undefined) updates.is_active = Boolean(is_active)

    // Allow updating other safe fields
    const allowedUpdates = [
      "description",
      "max_uses",
      "valid_until",
      "valid_from",
      "discount_value",
      "plan_override",
      "apple_offer_id",
      "apple_offer_products",
    ]
    for (const key of allowedUpdates) {
      if (key in rest) {
        // '' (auto) → null: deriva a oferta Apple pelo tipo do cupão
        updates[key] = key === "apple_offer_id" && !rest[key] ? null : rest[key]
      }
    }

    const { data: existing } = await supabase
      .from("coupons")
      .select("stripe_promotion_code_id")
      .eq("id", id)
      .maybeSingle()

    if (is_active !== undefined && existing?.stripe_promotion_code_id) {
      try {
        if (Boolean(is_active)) {
          await activateStripePromotionCode(existing.stripe_promotion_code_id)
        } else {
          await deactivateStripePromotionCode(existing.stripe_promotion_code_id)
        }
      } catch (stripeErr: unknown) {
        const msg = stripeErr instanceof Error ? stripeErr.message : "Erro Stripe"
        console.error("❌ [ADMIN COUPONS PATCH] Stripe:", msg)
        return NextResponse.json(
          { error: "Erro ao sincronizar estado no Stripe", details: msg },
          { status: 502 }
        )
      }
    }

    const { data, error } = await supabase
      .from("coupons")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("❌ [ADMIN COUPONS PATCH] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao actualizar cupão", details: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: "Cupão não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS PATCH] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}

// ── DELETE — remove coupon ────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from("coupons")
      .select("stripe_promotion_code_id")
      .eq("id", id)
      .maybeSingle()

    if (existing?.stripe_promotion_code_id) {
      await deactivateStripePromotionCode(existing.stripe_promotion_code_id).catch((err) => {
        console.warn("⚠️ [ADMIN COUPONS DELETE] Stripe deactivate:", err)
      })
    }

    const { error } = await supabase.from("coupons").delete().eq("id", id)

    if (error) {
      console.error("❌ [ADMIN COUPONS DELETE] Erro:", error)
      return NextResponse.json(
        { error: "Erro ao eliminar cupão", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("❌ [ADMIN COUPONS DELETE] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor", message: error.message },
      { status: 500 }
    )
  }
}
