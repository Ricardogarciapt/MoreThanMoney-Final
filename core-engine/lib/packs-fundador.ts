/**
 * PACKS DE FUNDADOR — Premium e o pack de scanners num só pagamento recorrente.
 *
 * Nasceu a 25/09/2026 para o Tomi Ilievski, membro de fundação a quem o dono ofereceu o Premium a
 * 35 €/mês em vez de 65. A ideia é repetível: um preço próprio no Stripe, criado por pessoa, que dá
 * tudo o que lhe foi prometido sem ninguém ter de ir ao admin a seguir pôr as peças à mão.
 *
 * COMO SE CRIA UM, SEM DEPLOY
 *   1. No Stripe: produto + preço recorrente, com `metadata.plan = founder_premium_scanners`.
 *   2. Nada mais. O webhook lê o plano dos METADADOS quando não reconhece o preço
 *      (ver `getPlanIdFromPriceId` e a linha do `handleSubscription*` que faz o fallback), por isso
 *      não é preciso variável de ambiente nova nem redeploy. É o que torna isto praticável quando
 *      se faz um pack por pessoa.
 *
 * PORQUE É QUE O ADDON É SEPARADO DO PLANO
 * O acesso aos scanners não vive no `subscription_plan` — vive em `profile_data.addons.scanner`,
 * porque se compra e cancela sozinho (ver lib/user-addons.ts). Um plano que promete os dois tem,
 * portanto, de escrever nos dois sítios. Enquanto isto não existia, um checkout destes dava o
 * Premium e o scanner ficava por conceder, em silêncio — a pessoa pagava e não recebia metade.
 */

/** Planos que, além do acesso Premium, incluem o pack de scanners. */
const PLANOS_COM_SCANNERS = new Set(['founder_premium_scanners'])

/** O plano inclui o pack de scanners? */
export function planoIncluiScanners(planId?: string | null): boolean {
  return !!planId && PLANOS_COM_SCANNERS.has(planId)
}

/**
 * Que `plan_id` de scanner conceder. Devolve o pack mensal recorrente: o pack de fundador é uma
 * subscrição, e dar um vitalício a quem paga ao mês era oferecer o que não foi vendido — e não
 * havia forma de o retirar quando a subscrição acabasse.
 */
export function scannerDoPackFundador(): string {
  return 'scanners_monthly'
}
