/**
 * Ativação pendente — o membro mantém a conta e o login, mas perde o acesso às
 * áreas de membro (site + apps) até escolher pack e pagar.
 *
 * Estado em `profiles.profile_data.activation` (o middleware já traz `profile_data`,
 * por isso não precisa de coluna nova) + `is_active = false`, que é a alavanca que
 * TODAS as portas do site já respeitam (chat, Premium, MTM Copy, T2T, apps).
 *
 * A diferença face a uma conta simplesmente inativa é o encaminhamento: quem tem
 * ativação pendente é enviado para /upgrade (escolha de pack) em vez de /register,
 * para o caminho terminar num checkout e não num beco.
 *
 * Limpeza: trigger `profiles_clear_activation_on_activate` — assim que qualquer
 * canal de pagamento (Stripe, Apple IAP, admin) repõe `is_active = true`, o estado cai.
 */

import { readProfileData } from '@/lib/access-migration'

export type ActivationDecision = 'pay' | 'free' | 'partner' | 'off'

export interface ActivationState {
  required: boolean
  since: string | null
  decision: ActivationDecision | null
  /** Membro que nunca pagou → tratado como nova inscrição (escolhe pack de raiz). */
  newMember: boolean
  campaign: string | null
}

export function readActivation(profile: { profile_data?: unknown } | null | undefined): ActivationState {
  const a = readProfileData(profile).activation
  if (!a || typeof a !== 'object') {
    return { required: false, since: null, decision: null, newMember: false, campaign: null }
  }
  const o = a as Record<string, unknown>
  const d = o.decision
  return {
    required: o.required === true,
    since: typeof o.since === 'string' ? o.since : null,
    decision: d === 'pay' || d === 'free' || d === 'partner' || d === 'off' ? d : null,
    newMember: o.new_member === true,
    campaign: typeof o.campaign === 'string' ? o.campaign : null,
  }
}

export function requiresActivation(profile: { profile_data?: unknown } | null | undefined): boolean {
  return readActivation(profile).required
}

/** Patch para `profile_data` (preserva o resto do objeto). */
export function activationPatch(
  profile: { profile_data?: unknown } | null | undefined,
  opts: { decision: ActivationDecision; newMember: boolean; campaign: string },
): Record<string, unknown> {
  return {
    ...readProfileData(profile),
    activation: {
      required: true,
      since: new Date().toISOString(),
      decision: opts.decision,
      new_member: opts.newMember,
      campaign: opts.campaign,
    },
  }
}

/** Destino de quem tem ativação pendente: escolha de pack, não /register. */
export function activationRedirectPath(from = 'ativacao'): string {
  return `/upgrade?from=${encodeURIComponent(from)}`
}
