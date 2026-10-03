import { getStripeClient } from "@/lib/stripe-client"

/**
 * Receita real do Stripe para o agente AIOS: MRR das subscrições ativas,
 * evolução mensal (últimos 6 meses) e total. Valores devolvidos em EUROS.
 */

function toMonthlyCents(amount: number, interval: string, intervalCount: number, qty: number) {
  const c = intervalCount || 1
  const q = qty || 1
  let monthly = amount
  if (interval === "year") monthly = amount / (12 * c)
  else if (interval === "week") monthly = amount * (52 / 12) / c
  else if (interval === "day") monthly = amount * (365 / 12) / c
  else monthly = amount / c // month
  return monthly * q
}

function monthKey(tsSeconds: number) {
  const d = new Date(tsSeconds * 1000)
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
}

export async function getStripeRevenue() {
  const stripe = getStripeClient()

  // ---- MRR real: subscrições ativas + em trial ----
  let mrrCents = 0
  let ativos = 0
  try {
    const subs = await stripe.subscriptions
      .list({ status: "active", limit: 100 })
      .autoPagingToArray({ limit: 1000 })
    ativos = subs.length
    for (const s of subs) {
      for (const item of s.items?.data || []) {
        const price = item.price
        if (!price?.recurring || price.unit_amount == null) continue
        mrrCents += toMonthlyCents(
          price.unit_amount,
          price.recurring.interval,
          price.recurring.interval_count || 1,
          item.quantity || 1
        )
      }
    }
  } catch (e) {
    // segue sem MRR se falhar
  }

  // ---- Evolução mensal (últimos 6 meses) a partir de charges pagos ----
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const buckets: Record<string, number> = {}
  const order: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
    buckets[k] = 0
    order.push(k)
  }

  let total6mCents = 0
  try {
    const charges = await stripe.charges
      .list({ limit: 100, created: { gte: Math.floor(start.getTime() / 1000) } })
      .autoPagingToArray({ limit: 2000 })
    for (const c of charges) {
      if (!c.paid || c.status !== "succeeded") continue
      const net = (c.amount || 0) - (c.amount_refunded || 0)
      const k = monthKey(c.created)
      if (k in buckets) buckets[k] += net
      total6mCents += net
    }
  } catch (e) {
    // segue sem série se falhar
  }

  const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  const meses = order.map((k) => {
    const [y, m] = k.split("-")
    return { mes: MESES_PT[parseInt(m, 10) - 1] + "/" + y.slice(2), receita: Math.round(buckets[k]) / 100 }
  })

  return {
    moeda: "EUR",
    mrr_real_eur: Math.round(mrrCents) / 100,
    subscricoes_ativas_stripe: ativos,
    total_6meses_eur: Math.round(total6mCents) / 100,
    meses,
  }
}
