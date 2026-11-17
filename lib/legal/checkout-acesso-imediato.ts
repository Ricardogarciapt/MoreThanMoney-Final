/**
 * Texto mostrado junto ao botão de pagar do Stripe Checkout em todas as compras de conteúdo
 * digital (subscrições, scanners, marketplace, licenças).
 *
 * O DL 24/2014, art. 17.º, n.º 1, al. m), tira o direito de livre resolução de 14 dias ao
 * conteúdo digital quando o fornecimento começa com o consentimento prévio e expresso do
 * consumidor e o reconhecimento de que perde esse direito. Os termos (/terms, secção 6)
 * dizem o mesmo; este texto leva-o ao momento da compra.
 *
 * Usa `custom_text.submit` (só texto) e não `consent_collection.terms_of_service`: esse exige
 * o URL dos termos configurado no painel do Stripe e, se faltar, o Stripe recusa criar a
 * sessão e o checkout pára. Para passar a caixa obrigatória, configurar primeiro o URL
 * https://www.morethanmoney.pt/terms em Settings → Public details e só depois ligar.
 */
import type Stripe from 'stripe'

export const TEXTO_ACESSO_IMEDIATO =
  'Ao concluir, pedes acesso imediato ao conteúdo digital e reconheces que, começado o acesso, ' +
  'perdes o direito de livre resolução de 14 dias (DL 24/2014, art. 17.º, n.º 1, al. m). ' +
  'Subscrições renovam-se até cancelares. Termos: morethanmoney.pt/terms'

export const CUSTOM_TEXT_ACESSO_IMEDIATO: Stripe.Checkout.SessionCreateParams.CustomText = {
  submit: { message: TEXTO_ACESSO_IMEDIATO },
}
