/**
 * UMA SUBSCRIÇÃO DO MARKETPLACE NÃO É UM PACK DA CASA — reconhecê-la antes de dar direitos.
 *
 * ── O DEFEITO QUE ISTO FECHA ──────────────────────────────────────────────────────────────
 *
 * `handleCheckoutCompleted` já sabia sair cedo no ramo `source === 'marketplace_product'`. Mas o
 * `checkout.session.completed` é só UM dos eventos que uma subscrição gera. Os
 * `customer.subscription.created/updated/deleted` e os `invoice.payment_succeeded/failed` chegam
 * por outro caminho, encontram o perfil pelo `stripe_customer_id` e NÃO sabiam nada de marketplace.
 *
 * O caminho completo, no dia em que um educador publicar uma mentoria de 20 €/mês:
 *
 *   1. o preço da mentoria não está no catálogo da casa → `getPlanIdFromPriceId` devolve null;
 *   2. o preço não tem `metadata.plan` → o recurso era `'app_member_monthly'`;
 *   3. o webhook escrevia `member_category: 'standard'`, `subscription_plan: 'app_member'` e
 *      `subscription_status: 'active'` no perfil.
 *
 * Ou seja: quem comprasse a mentoria de um educador ficava Membro pago da casa, de graça. E o
 * espelho disso era igualmente mau — cancelar a mentoria punha o perfil inteiro `is_active = false`,
 * e três faturas falhadas da mentoria revogavam o acesso de um Premium.
 *
 * A REGRA, daqui para a frente: um evento de uma subscrição/fatura de marketplace não escreve NADA
 * em `profiles`. Nem `member_category`, nem `subscription_plan`, nem `subscription_status`, nem
 * `subscription_expires_at`, nem `is_active`, nem `payment_failed_count`. O acesso ao que a pessoa
 * comprou vem da linha em `marketplace_compras` — e só de lá.
 *
 * É a mesma doutrina (e o mesmo desenho) do `subscricaoEhAddon` do MTM Copy: reconhecer e sair
 * ANTES do bloco que dá direitos.
 *
 * ── COMO SE RECONHECE ─────────────────────────────────────────────────────────────────────
 *
 * Por dois caminhos, porque nenhum dos dois chega sozinho:
 *
 *   · A METADATA (`source: 'marketplace_product'`), que o checkout do marketplace passa a escrever
 *     também em `subscription_data.metadata` — sem isso ela vive só na sessão e não na subscrição.
 *     É o caminho rápido e é o único que funciona para um preço que ainda não foi criado.
 *   · O PREÇO: existe em `marketplace_produtos.stripe_price_id`? Este caminho é o que apanha as
 *     subscrições criadas antes desta alteração, e as que alguém crie à mão no Stripe.
 *
 * ── O CATÁLOGO DA CASA GANHA SEMPRE AO TESTE DO PREÇO ─────────────────────────────────────
 *
 * Um preço que o catálogo da casa reconhece (`getPlanIdFromPriceId`) NUNCA é tratado como
 * marketplace, mesmo que alguém o tenha colado na coluna `stripe_price_id` de um produto do
 * marketplace. Sem esta precedência, um admin a escrever o preço do Premium num produto da montra
 * desligava os direitos de TODOS os Premium da casa — um erro de um campo de texto a apagar
 * subscrições reais. O erro ao contrário (um produto da casa vendido na montra não dar Premium) já
 * é o comportamento de hoje e é o pretendido: quem compra na montra recebe a linha de compra.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getPlanIdFromPriceId } from '@/lib/stripe-prices'

/** O discriminador que o checkout do marketplace escreve. O mesmo valor em sessão e subscrição. */
export const FONTE_MARKETPLACE = 'marketplace_product'

type ItemLike = { price?: { id?: string | null; metadata?: unknown } | null }
type SubLike = { id?: string; metadata?: unknown; items?: { data?: ItemLike[] } }
type LinhaLike = {
  price?: { id?: string | null; metadata?: unknown } | null
  pricing?: { price_details?: { price?: string | null } | null } | null
  metadata?: unknown
}
type FaturaLike = {
  id?: string | null
  subscription_details?: { metadata?: unknown } | null
  lines?: { data?: LinhaLike[] }
}

/** `source: 'marketplace_product'` em qualquer saco de metadata (sessão, subscrição, preço, linha). */
export function metadataDizMarketplace(meta: unknown): boolean {
  const m = (meta ?? {}) as Record<string, unknown>
  return m.source === FONTE_MARKETPLACE
}

/** O preço nas duas formas em que a API do Stripe o devolve (a nova mudou-o de sítio). */
function precoDaLinha(l: LinhaLike): string | null {
  return l.price?.id ?? l.pricing?.price_details?.price ?? null
}

function precosDaSubscricao(sub: SubLike | null | undefined): string[] {
  return (sub?.items?.data ?? []).map((i) => i.price?.id ?? null).filter((p): p is string => Boolean(p))
}

function precosDaFatura(inv: FaturaLike | null | undefined): string[] {
  return (inv?.lines?.data ?? []).map(precoDaLinha).filter((p): p is string => Boolean(p))
}

/**
 * A subscrição é de um produto do marketplace?
 *
 * `ehPrecoDoMarketplace` é injectado para isto se poder testar sem base de dados — o mesmo idioma
 * das outras funções puras desta pasta.
 *
 * «TODOS os itens» e não «algum», como no addon do MTM Copy e pela mesma razão: uma subscrição
 * mista (que o nosso checkout não consegue criar — manda um `line_item` só) continua a ser do plano
 * principal, e aí o pior erro seria negar o Premium a quem o paga. O caso do preço desconhecido está
 * fechado à parte, em `planoDaSubscricao`, que recusa em vez de adivinhar.
 */
export function subscricaoEhDoMarketplace(
  sub: SubLike | null | undefined,
  ehPrecoDoMarketplace: (priceId: string) => boolean,
): boolean {
  if (!sub) return false
  if (metadataDizMarketplace(sub.metadata)) return true
  const itens = sub.items?.data ?? []
  if (!itens.length) return false
  return itens.every((i) => {
    if (metadataDizMarketplace(i.price?.metadata)) return true
    const id = i.price?.id
    return Boolean(id) && ehPrecoDoMarketplace(id as string)
  })
}

/** A fatura é de um produto do marketplace? Mesma regra, lida nas linhas. */
export function faturaEhDoMarketplace(
  inv: FaturaLike | null | undefined,
  ehPrecoDoMarketplace: (priceId: string) => boolean,
): boolean {
  if (!inv) return false
  if (metadataDizMarketplace(inv.subscription_details?.metadata)) return true
  const linhas = inv.lines?.data ?? []
  if (!linhas.length) return false
  return linhas.every((l) => {
    if (metadataDizMarketplace(l.metadata) || metadataDizMarketplace(l.price?.metadata)) return true
    const id = precoDaLinha(l)
    return Boolean(id) && ehPrecoDoMarketplace(id as string)
  })
}

/**
 * Quais destes preços pertencem a produtos do marketplace.
 *
 * Uma consulta só, com `in`, porque isto corre em todos os eventos de subscrição do Stripe. Os
 * preços que o catálogo da casa reconhece saem da pergunta antes de ela ser feita (ver a nota da
 * precedência no topo do ficheiro).
 *
 * Se a leitura falhar devolve-se um conjunto VAZIO — ou seja, «não sei dizer que é marketplace». O
 * efeito é o comportamento antigo para este evento, e não um perfil alterado por uma base de dados
 * que não respondeu. É por isso que a recusa do plano desconhecido (`planoDaSubscricao`) é a segunda
 * fechadura: mesmo sem esta resposta, ninguém fica Membro por acidente.
 */
export async function precosDoMarketplace(
  priceIds: string[],
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<Set<string>> {
  const candidatos = Array.from(
    new Set(priceIds.map((p) => String(p ?? '').trim()).filter((p) => p && getPlanIdFromPriceId(p) === null)),
  )
  if (!candidatos.length) return new Set()
  try {
    const { data, error } = await db
      .from('marketplace_produtos')
      .select('stripe_price_id')
      .in('stripe_price_id', candidatos)
    if (error) {
      console.error('[marketplace] não foi possível verificar se o preço é de um produto:', error.message)
      return new Set()
    }
    return new Set((data ?? []).map((l) => String((l as { stripe_price_id?: string }).stripe_price_id ?? '')).filter(Boolean))
  } catch (e) {
    console.error('[marketplace] falhou a verificação do preço da subscrição:', e)
    return new Set()
  }
}

/** A subscrição é de marketplace? (versão que fala com a base de dados) */
export async function ehSubscricaoDeMarketplace(sub: SubLike | null | undefined): Promise<boolean> {
  if (!sub) return false
  if (metadataDizMarketplace(sub.metadata)) return true
  const conhecidos = await precosDoMarketplace(precosDaSubscricao(sub))
  return subscricaoEhDoMarketplace(sub, (p) => conhecidos.has(p))
}

/** A fatura é de marketplace? (versão que fala com a base de dados) */
export async function ehFaturaDeMarketplace(inv: FaturaLike | null | undefined): Promise<boolean> {
  if (!inv) return false
  if (metadataDizMarketplace(inv.subscription_details?.metadata)) return true
  const conhecidos = await precosDoMarketplace(precosDaFatura(inv))
  return faturaEhDoMarketplace(inv, (p) => conhecidos.has(p))
}

/**
 * O PLANO DA CASA DESTA SUBSCRIÇÃO — ou nada, quando não se sabe.
 *
 * Substitui `getPlanIdFromPriceId(priceId) || metadata.plan || 'app_member_monthly'`.
 *
 * O recurso `'app_member_monthly'` era um SIM silencioso: qualquer preço que o catálogo não
 * reconhecesse virava «Membro mensal» e escrevia direitos no perfil. Um preço desconhecido não é um
 * Membro — é um preço desconhecido, e a resposta certa a isso é recusar e registar.
 *
 * Um plano da casa identifica-se por UMA de duas coisas, e continuam a ser as duas que já existiam:
 *   · a variável de ambiente do catálogo (`lib/stripe-prices.ts`), ou
 *   · `metadata.plan` no preço do Stripe — o caminho que o pack de fundador usa de propósito, para
 *     se poder criar um preço novo sem deploy.
 *
 * Quem cria um preço da casa tem de garantir um dos dois. É o que já estava escrito na doutrina do
 * `founder_premium_scanners`; a diferença é que agora falhar isso deixa rasto em vez de escrever o
 * plano errado num perfil.
 */
export function planoDaSubscricao(entrada: {
  priceId?: string | null
  metadataDoPreco?: unknown
  metadataDaSubscricao?: unknown
}): string | null {
  const priceId = String(entrada.priceId ?? '').trim()
  if (priceId) {
    const doCatalogo = getPlanIdFromPriceId(priceId)
    if (doCatalogo) return doCatalogo
  }
  for (const saco of [entrada.metadataDoPreco, entrada.metadataDaSubscricao]) {
    const plano = (saco as Record<string, unknown> | null | undefined)?.plan
    if (typeof plano === 'string' && plano.trim()) return plano.trim()
  }
  return null
}
