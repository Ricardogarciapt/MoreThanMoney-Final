import assert from 'node:assert/strict'

/**
 * O addon do MTM Copy no webhook do Stripe: um evento do addon só pode mexer no addon.
 * Objectos Stripe falsos + um "supabase" falso que regista cada escrita.
 */

process.env.STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY = 'price_addon_20'

async function main() {
  const m = await import('../addon-stripe')

  type Escrita = { tabela: string; op: 'update' | 'insert'; valores: Record<string, unknown>; eq?: [string, unknown] }
  function dbFalso() {
    const escritas: Escrita[] = []
    const db = {
      from(tabela: string) {
        return {
          update(valores: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                escritas.push({ tabela, op: 'update', valores, eq: [col, val] })
                return Promise.resolve({ error: null })
              },
            }
          },
          insert(valores: Record<string, unknown>) {
            escritas.push({ tabela, op: 'insert', valores })
            return Promise.resolve({ error: null })
          },
        }
      },
    }
    return { db, escritas }
  }

  const PROIBIDOS = ['subscription_plan', 'member_category', 'stripe_subscription_id', 'is_active', 'subscription_status', 'payment_failed_count']
  const semCamposDoPlanoPrincipal = (escritas: Escrita[]) =>
    escritas.every((e) => e.tabela !== 'profiles' || PROIBIDOS.every((k) => !(k in e.valores)))

  const fim = Math.floor(Date.parse('2026-10-05T10:00:00Z') / 1000)

  // ── Deteção ────────────────────────────────────────────────────────────────────────────────
  const subAddon = { id: 'sub_a', status: 'active', items: { data: [{ price: { id: 'price_addon_20' }, current_period_end: fim }] } }
  const subPremium = { id: 'sub_p', status: 'active', current_period_end: fim, items: { data: [{ price: { id: 'price_premium' } }] } }
  const subPorMetadata = { id: 'sub_m', status: 'active', metadata: { plan: 'mtmcopy_addon_monthly' }, items: { data: [{ price: { id: 'price_antigo' } }] } }
  const subMista = { id: 'sub_x', status: 'active', items: { data: [{ price: { id: 'price_addon_20' } }, { price: { id: 'price_premium' } }] } }

  assert.equal(m.subscricaoEhAddon(subAddon), true, 'pelo price id')
  assert.equal(m.subscricaoEhAddon(subPorMetadata), true, 'pela metadata')
  assert.equal(m.subscricaoEhAddon(subPremium), false, 'o Premium não é addon')
  assert.equal(m.subscricaoEhAddon(subMista), false, 'mista fica como plano principal — nunca apagar o Premium')
  assert.equal(m.subscricaoEhAddon(null), false)

  // O fim do período vem do item quando a subscrição não o tem (API nova do Stripe).
  assert.equal(m.fimDoPeriodo(subAddon), '2026-10-05T10:00:00.000Z')

  // ── subscription.updated do addon ─────────────────────────────────────────────────────────
  {
    const { db, escritas } = dbFalso()
    await m.addonSubscricaoAtualizada(db, 'u1', subAddon)
    assert.equal(escritas.length, 1)
    assert.equal(escritas[0].valores.mtmcopy_subscription_active, true)
    assert.equal(escritas[0].valores.mtmcopy_subscription_expires_at, '2026-10-05T10:00:00.000Z', 'expira = current_period_end')
    assert.ok(semCamposDoPlanoPrincipal(escritas), 'o addon não toca no plano principal')
  }
  {
    const { db, escritas } = dbFalso()
    await m.addonSubscricaoAtualizada(db, 'u1', { ...subAddon, status: 'canceled' })
    assert.equal(escritas[0].valores.mtmcopy_subscription_active, false)
  }

  // ── subscription.deleted do addon ─────────────────────────────────────────────────────────
  {
    const { db, escritas } = dbFalso()
    await m.addonSubscricaoCancelada(db, 'u1')
    assert.deepEqual(Object.keys(escritas[0].valores).sort(), ['mtmcopy_subscription_active', 'updated_at'])
    assert.equal(escritas[0].valores.mtmcopy_subscription_active, false)
    assert.ok(semCamposDoPlanoPrincipal(escritas), 'cancelar o addon NÃO desactiva o perfil')
  }

  // ── Faturas ───────────────────────────────────────────────────────────────────────────────
  const faturaAddon = {
    id: 'in_1',
    amount_paid: 2000,
    currency: 'eur',
    lines: { data: [{ price: { id: 'price_addon_20' }, period: { end: fim } }] },
  }
  const faturaAddonApiNova = {
    id: 'in_2',
    amount_paid: 2000,
    currency: 'eur',
    lines: { data: [{ pricing: { price_details: { price: 'price_addon_20' } }, period: { end: fim } }] },
  }
  const faturaPremium = { id: 'in_3', amount_paid: 6500, lines: { data: [{ price: { id: 'price_premium' }, period: { end: fim } }] } }
  assert.equal(m.faturaEhAddon(faturaAddon), true)
  assert.equal(m.faturaEhAddon(faturaAddonApiNova), true, 'linhas da API nova (pricing.price_details)')
  assert.equal(m.faturaEhAddon(faturaPremium), false)

  {
    const { db, escritas } = dbFalso()
    await m.addonPagamento(db, 'u1', faturaAddon, 'succeeded', 'renewal')
    const perfil = escritas.find((e) => e.tabela === 'profiles')!
    const hist = escritas.find((e) => e.tabela === 'payment_history')!
    assert.equal(perfil.valores.mtmcopy_subscription_expires_at, '2026-10-05T10:00:00.000Z')
    assert.equal(hist.valores.plan, 'mtmcopy_addon_monthly', 'a renovação regista-se com o plano do addon')
    assert.equal(hist.valores.amount, 2000)
    assert.ok(semCamposDoPlanoPrincipal(escritas))
  }
  {
    const { db, escritas } = dbFalso()
    await m.addonPagamento(db, 'u1', { ...faturaAddon, amount_due: 2000 }, 'failed', null)
    assert.equal(escritas.filter((e) => e.tabela === 'profiles').length, 0, 'uma falha do addon não mexe no perfil')
    assert.equal(escritas[0].valores.status, 'failed')
    assert.equal(escritas[0].valores.plan, 'mtmcopy_addon_monthly')
  }

  // Sem env configurado, só a metadata identifica o addon.
  process.env.STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY = ''
  assert.equal(m.subscricaoEhAddon(subAddon), false)
  assert.equal(m.subscricaoEhAddon(subPorMetadata), true)

  console.log('✓ addon-stripe: 24 verificações')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
