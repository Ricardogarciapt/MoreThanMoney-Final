/**
 * Texto mostrado junto ao botão de pagar do Stripe Checkout em todas as compras de conteúdo
 * digital (subscrições, scanners, marketplace, licenças).
 *
 * O DL 24/2014, art. 17.º, n.º 1, al. m), tira o direito de livre resolução de 14 dias ao
 * conteúdo digital quando o fornecimento começa com o consentimento prévio e expresso do
 * consumidor e o reconhecimento de que perde esse direito. Os termos (/terms, secção 6)
 * dizem o mesmo; este texto leva-o ao momento da compra.
 *
 * Duas camadas: o texto em `custom_text.submit` vai sempre; a caixa obrigatória
 * (`consent_collection.terms_of_service`) entra por {@link criarSessaoCheckout} quando a conta
 * Stripe tem o URL dos termos em Settings → Public details. Sem esse URL o Stripe recusa a
 * sessão, por isso aí cai para só o texto e o checkout nunca pára.
 */
import type Stripe from 'stripe'

export const TEXTO_ACESSO_IMEDIATO =
  'Ao concluir, pedes acesso imediato ao conteúdo digital e reconheces que, começado o acesso, ' +
  'perdes o direito de livre resolução de 14 dias (DL 24/2014, art. 17.º, n.º 1, al. m). ' +
  'Subscrições renovam-se até cancelares. Termos: morethanmoney.pt/terms'

export const CUSTOM_TEXT_ACESSO_IMEDIATO: Stripe.Checkout.SessionCreateParams.CustomText = {
  submit: { message: TEXTO_ACESSO_IMEDIATO },
}

/** Erro do Stripe quando falta o URL dos termos nos dados públicos da conta. */
function faltaUrlDosTermos(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /terms of service/i.test(msg) && /URL/i.test(msg)
}

/** Lembra, por instância, que a conta ainda não tem o URL dos termos (evita uma chamada falhada por checkout). */
let semUrlDosTermos = false

/**
 * Cria a sessão de checkout com a caixa obrigatória de aceitação dos termos (que no Stripe
 * fica junto ao botão) e o texto de acesso imediato nela. Se a conta ainda não tiver o URL
 * dos termos em Settings → Public details, o Stripe recusa: aí cria a sessão sem a caixa,
 * só com o texto, para o checkout nunca parar. Quando o URL for posto, a caixa liga sozinha
 * (no máximo após o próximo arranque da função).
 */
export async function criarSessaoCheckout(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  if (!semUrlDosTermos) {
    try {
      return await stripe.checkout.sessions.create({
        ...params,
        consent_collection: { ...params.consent_collection, terms_of_service: 'required' },
        custom_text: {
          ...params.custom_text,
          terms_of_service_acceptance: { message: TEXTO_ACEITACAO_TERMOS },
        },
      })
    } catch (err) {
      if (!faltaUrlDosTermos(err)) throw err
      semUrlDosTermos = true
      console.warn('[checkout] Stripe sem URL dos termos; sessão criada sem a caixa de aceitação.')
    }
  }
  return stripe.checkout.sessions.create(params)
}

export const TEXTO_ACEITACAO_TERMOS =
  'Aceito os [Termos](https://www.morethanmoney.pt/terms) e peço acesso imediato ao conteúdo digital, ' +
  'reconhecendo que, começado o acesso, perco o direito de livre resolução de 14 dias.'
