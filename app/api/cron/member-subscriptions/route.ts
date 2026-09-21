import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { addDays } from "@/lib/member-subscription"
import { isInternalApiRequest } from "@/lib/internal-api"
import { activationPatch } from "@/lib/member-activation"
import { classificarRenovacao, lerEstadoStripe, procurarSubscricaoPorEmail } from "@/lib/cobranca/renovacao"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return process.env.NODE_ENV === "development"
  const auth = request.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

/**
 * Fim de período das subscrições IQ/Skool/Premium/Membro (diário, 03:00 UTC).
 *
 * Regra em lib/cobranca/renovacao.ts:
 *  - isento (admin/VIP) → +30/365 dias, como sempre;
 *  - stripe             → a data passa a ser o fim do período pago na Stripe;
 *  - app_store          → não se mexe (a Apple actualiza a data);
 *  - cobrar             → acesso em pausa com ativação pendente: o login continua e o site
 *                         leva a pessoa a /upgrade para pagar pela Stripe. Antes de 17/09 estas
 *                         contas ganhavam +30 dias grátis.
 * `?dryRun=1` devolve o que faria sem gravar.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request) && !isInternalApiRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1"
  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: due, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, member_category, subscription_expires_at, subscription_auto_renew, subscription_billing_cycle, subscription_platform, subscription_status, stripe_subscription_id, user_type, profile_data")
    .in("member_category", ["iq", "skool", "premium", "vip", "standard"])
    .neq("user_type", "admin")
    .eq("is_active", true)
    .not("subscription_expires_at", "is", null)
    .lt("subscription_expires_at", nowIso)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const renovadas: string[] = []
  const pausadas: string[] = []
  const saltadas: string[] = []

  for (const row of due || []) {
    const quem = row.email || row.id
    const stripe = row.stripe_subscription_id ? await lerEstadoStripe(row.stripe_subscription_id) : null
    if (row.stripe_subscription_id && !stripe) {
      // Não conseguimos ler a Stripe: não se fecha o acesso a quem pode estar a pagar.
      saltadas.push(`${quem} (Stripe ilegível)`)
      continue
    }
    const classe = classificarRenovacao(row, stripe)

    if (classe === "app_store") {
      saltadas.push(`${quem} (App Store)`)
      continue
    }

    if (classe === "isento" || classe === "stripe") {
      let novaData: string
      if (classe === "stripe" && stripe?.fimPeriodo && new Date(stripe.fimPeriodo).getTime() > Date.now()) {
        novaData = stripe.fimPeriodo
      } else if (classe === "stripe") {
        // A Stripe ainda não renovou (pagamento a decorrer): 2 dias de margem e volta-se a ver.
        novaData = addDays(new Date(), 2).toISOString()
      } else {
        novaData = addDays(new Date(), row.subscription_billing_cycle === "annual" ? 365 : 30).toISOString()
      }
      if (!dryRun) {
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_expires_at: novaData,
            user_type: row.user_type === "inactive" ? "member" : row.user_type,
            updated_at: nowIso,
          })
          .eq("id", row.id)
        if (error) { saltadas.push(`${quem}: ${error.message}`); continue }
      }
      renovadas.push(`${quem} (${classe} → ${novaData.slice(0, 10)})`)
      continue
    }

    // cobrar — mas antes procura pelo email em todos os clientes Stripe: o perfil pode estar a
    // apontar para o cliente errado (caso Fábio Henriques, 21/09: anual pago noutro cliente).
    const achada = await procurarSubscricaoPorEmail(row.email)
    if (achada === "erro") {
      saltadas.push(`${quem} (Stripe ilegível na procura por email)`)
      continue
    }
    if (achada?.estado.fimPeriodo) {
      if (!dryRun) {
        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_expires_at: achada.estado.fimPeriodo,
            stripe_subscription_id: achada.subscriptionId,
            stripe_customer_id: achada.customerId,
            subscription_status: "active",
            user_type: row.user_type === "inactive" ? "member" : row.user_type,
            updated_at: nowIso,
          })
          .eq("id", row.id)
        if (error) { saltadas.push(`${quem}: ${error.message}`); continue }
      }
      renovadas.push(`${quem} (stripe por email ${achada.subscriptionId} → ${achada.estado.fimPeriodo.slice(0, 10)})`)
      continue
    }

    if (!dryRun) {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_active: false,
          subscription_status: "inactive",
          subscription_auto_renew: false,
          profile_data: activationPatch(row, { decision: "pay", newMember: false, campaign: "renovacao-stripe" }),
          updated_at: nowIso,
        })
        .eq("id", row.id)
      if (error) { saltadas.push(`${quem}: ${error.message}`); continue }
    }
    pausadas.push(quem)
  }

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    checked_at: nowIso,
    expired_found: due?.length || 0,
    renewed_count: renovadas.length,
    paused_count: pausadas.length,
    renovadas,
    pausadas,
    saltadas,
  })
}
