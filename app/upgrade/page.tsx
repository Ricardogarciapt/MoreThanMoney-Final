/**
 * /upgrade — a página dos packs.
 *
 * O corpo é interactivo e vive em `upgrade-client.tsx`. Isto aqui é a casca de servidor, e
 * existe por uma razão só: decidir se o degrau de cima (Elite, 597€/ano) tem coluna.
 *
 * Porque é que essa decisão não pode ficar do lado do cliente:
 *  • o preço vem de `lib/escada-precos.ts`, a fonte única dos números do funil — e essa fonte
 *    reexporta o `MIN_DEPOSIT` do gate da corretora, que arrasta o Supabase de service role.
 *    Importada num componente `'use client'`, punha a chave de admin no bundle do browser.
 *  • saber se o pack é comprável é ler `STRIPE_PRICE_ELITE_ANNUAL`, uma variável de servidor
 *    que o browser nunca vê.
 */
import { NOME_DEGRAU_TOPO, PRECO_TOPO, TOPO_ANUAL_EUR, TOPO_PLAN_ID } from '@/lib/escada-precos'
import { getStripePriceId } from '@/lib/stripe-prices'
import UpgradeClient, { type OfertaTopo } from './upgrade-client'

// A variável do preço vive na Vercel (Production e Preview), não no `.env.local`. Lida no
// build, o ambiente local dizia que faltava e a coluna nascia escondida em produção. Lida a
// pedido, é sempre o ambiente a correr que responde.
export const dynamic = 'force-dynamic'

export default function UpgradePage() {
  /**
   * A coluna do Elite só aparece se o preço Stripe resolver.
   *
   * A alternativa — mostrar a coluna sem botão — foi posta de lado: uma coluna com preço e sem
   * forma de pagar aparece exactamente no ecrã onde a pessoa já decidiu comprar, e o que ela
   * lê é «existe, mas não me deixam». Sem preço configurado, o `/upgrade` volta às duas
   * colunas que já tinha desde f36aeeb8 — uma página coerente, não uma página partida.
   *
   * Continua a haver um caminho para vender: o fecho à mão, que é o que os guiões do funil
   * dizem enquanto `TOPO_LINK_PAGAMENTO` for `null`.
   */
  const priceId = getStripePriceId(TOPO_PLAN_ID)

  const topo: OfertaTopo | null = priceId
    ? {
        nome: NOME_DEGRAU_TOPO,
        precoAno: TOPO_ANUAL_EUR,
        precoLabel: PRECO_TOPO,
        planId: TOPO_PLAN_ID,
      }
    : null

  if (!topo) {
    // Silêncio aqui era o defeito a repetir-se: a coluna desaparecia sem ninguém saber porquê.
    console.warn(
      `⚠️ [UPGRADE] ${NOME_DEGRAU_TOPO} fora da grelha: STRIPE_PRICE_ELITE_ANNUAL não está definida ` +
        `neste ambiente (plano "${TOPO_PLAN_ID}").`,
    )
  }

  return <UpgradeClient topo={topo} />
}
