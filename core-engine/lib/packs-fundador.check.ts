/**
 * GUARDA dos packs de fundador. Estes packs prometem DUAS coisas por um pagamento só: o acesso
 * Premium e o pack de scanners. Entregar uma e esquecer a outra é a falha que ninguém detecta —
 * a pessoa paga, recebe metade, e só se sabe quando ela reclamar.
 *
 *   npx tsx lib/packs-fundador.check.ts
 */
import { readFileSync } from 'node:fs'
import { planoIncluiScanners, scannerDoPackFundador } from './packs-fundador'
import { normalizeSubscriptionPlan, memberCategoryForPlan, getPlanIdFromPriceId } from './stripe-prices'
import { isPremiumStripePlan } from './stripe-skool-admin'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const PACK = 'founder_premium_scanners'

// As duas metades da promessa.
teste('o pack dá acesso Premium', normalizeSubscriptionPlan(PACK) === 'premium')
teste('o pack conta como Premium nas portas do site', isPremiumStripePlan(PACK))
teste('o pack inclui o pack de scanners', planoIncluiScanners(PACK))
teste('o scanner concedido é o mensal', scannerDoPackFundador() === 'scanners_monthly')

// Premium, não VIP: o VIP é o degrau do Elite anual, e inflacioná-lo dava perks que ninguém prometeu.
teste('o pack é premium e não vip', memberCategoryForPlan(PACK) === 'premium')
teste('o Elite continua a ser vip', memberCategoryForPlan('elite_annual') === 'vip')

// E não contamina os outros: um plano normal NÃO passa a incluir scanners.
teste('o Premium normal não ganha scanners de borla', !planoIncluiScanners('premium_monthly'))
teste('o Membro não ganha scanners de borla', !planoIncluiScanners('app_member_monthly'))
teste('um plano desconhecido não inclui nada', !planoIncluiScanners('qualquer_coisa'))
teste('sem plano não inclui nada', !planoIncluiScanners(null))

// O webhook tem mesmo de escrever o addon — o módulo puro sozinho não entrega nada.
const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
teste('o webhook concede o scanner do pack', /planoIncluiScanners\(/.test(webhook) && /concederScannerDoPack\(/.test(webhook))
// A validade do scanner segue a da subscrição: dar mais era oferecer o que não foi vendido, e sem
// forma de o retirar quando ela acabasse.
teste('o scanner segue a validade da subscrição', /concederScannerDoPack\(supabase, profile\.id, periodEnd\)/.test(webhook))

// E o preço tem de poder ser reconhecido sem variável de ambiente, senão cada pack novo exigia
// um deploy — o que torna impraticável fazer um por pessoa.
teste('o webhook aceita o plano vindo dos metadados do preço', /price\?\.metadata\?\.plan/.test(webhook))
teste('sem variável definida, o preço não se resolve por aí', getPlanIdFromPriceId('price_inexistente') === null)

if (falhas.length) {
  console.error(`packs-fundador: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('packs-fundador: dá Premium E scanners, não contamina os outros planos, e o webhook entrega mesmo ✓')
