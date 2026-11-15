import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getStripeClient } from '@/lib/stripe-client'
import { SCANNERS } from '@/lib/scanners-catalog'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * PREÇOS DOS SCANNERS NO STRIPE — ver o que falta e criar o que falta, do browser, como admin.
 *
 *   GET /api/admin/stripe/precos-scanners              → só lê: por plano, o preço ACTIVO com o
 *                                                        lookup_key igual ao planId, ou «falta»
 *   GET /api/admin/stripe/precos-scanners?aplicar=1    → cria os que faltam (produto + preço único
 *                                                        com lookup_key) e volta a listar
 *   … &plano=rocketnova_semestral                       → só esse plano
 *
 * Porque é que isto existe: o checkout (`resolverPrecoStripe`) resolve o preço pelo lookup_key, por
 * isso um scanner novo só vende depois de alguém criar o preço no Stripe à mão. Isto faz esse
 * passo sem painel do Stripe e sem redeploy, e é idempotente: um plano que já tem preço activo
 * com o lookup_key não é tocado. Nunca arquiva nem apaga nada.
 *
 * O montante sai do catálogo (`price: "50€"`), que é o que a página mostra ao cliente — assim o
 * que se cobra é o que se anuncia. Todos os planos de scanner individual são pagamento único
 * (mesmo o semestral: o fim do acesso é calculado pelo webhook, não pelo Stripe).
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado

  const aplicar = req.nextUrl.searchParams.get('aplicar') === '1'
  const soPlano = req.nextUrl.searchParams.get('plano')?.trim() || ''

  const alvos: { planId: string; scanner: string; label: string; cents: number }[] = []
  for (const s of SCANNERS) {
    for (const p of s.products) {
      if (soPlano && p.planId !== soPlano) continue
      const cents = Math.round(parseFloat(p.price.replace(/[^\d.,]/g, '').replace(',', '.')) * 100)
      if (!Number.isFinite(cents) || cents <= 0) continue
      alvos.push({ planId: p.planId, scanner: s.name, label: p.label, cents })
    }
  }
  if (!alvos.length) return NextResponse.json({ ok: false, error: 'plano desconhecido' }, { status: 404 })

  const stripe = getStripeClient()
  const resultado: Record<string, unknown>[] = []

  for (const a of alvos) {
    const linha: Record<string, unknown> = { plano: a.planId, scanner: a.scanner, montante: a.cents / 100 }
    try {
      const { data } = await stripe.prices.list({ lookup_keys: [a.planId], active: true, limit: 1 })
      const existente = data[0]
      if (existente) {
        linha.estado = 'ok'
        linha.priceId = existente.id
        linha.montanteStripe = (existente.unit_amount ?? 0) / 100
        if (existente.unit_amount !== a.cents) linha.aviso = 'o montante no Stripe difere do catálogo'
        resultado.push(linha)
        continue
      }
      if (!aplicar) {
        linha.estado = 'falta'
        resultado.push(linha)
        continue
      }

      // Um produto por scanner, reutilizado entre o semestral e o vitalício: procura-se pelo
      // metadata.scanner antes de criar, para não nascer um «RocketNova» por preço.
      const chaveScanner = a.planId.replace(/_(semestral|lifetime)$/, '')
      let productId = ''
      const procura = await stripe.products.search({ query: `active:'true' AND metadata['scanner']:'${chaveScanner}'`, limit: 1 })
      if (procura.data[0]) productId = procura.data[0].id
      if (!productId) {
        const prod = await stripe.products.create({
          name: a.scanner,
          description: 'Indicador TradingView da MTM · acesso ao scanner e ao canal de sinais',
          metadata: { origem: 'scanners', scanner: chaveScanner },
        })
        productId = prod.id
      }

      const preco = await stripe.prices.create({
        product: productId,
        currency: 'eur',
        unit_amount: a.cents,
        lookup_key: a.planId,
        transfer_lookup_key: true,
        nickname: `${a.scanner} · ${a.label}`,
        metadata: { origem: 'scanners', plan: a.planId },
      })
      linha.estado = 'criado'
      linha.priceId = preco.id
      linha.productId = productId
    } catch (e) {
      linha.estado = 'erro'
      linha.erro = e instanceof Error ? e.message : String(e)
    }
    resultado.push(linha)
  }

  return NextResponse.json({ ok: true, aplicado: aplicar, planos: resultado })
}
