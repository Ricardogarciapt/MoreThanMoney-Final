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
  /**
   * Quando é que esta pessoa foi AVISADA de que ficou bloqueada. `null` = nunca.
   *
   * 25/09: fomos ver quem estava bloqueado e encontrámos 48 pessoas, todas desde 19/08 — e ZERO
   * com registo de aviso. Dessas, 17 não tinham recebido comunicação nenhuma, nem de bloqueio nem
   * de fim de subscrição. Só 5 voltaram a tentar entrar em 30 dias; as outras 43 desapareceram sem
   * saber porquê, e nós não tínhamos como saber que não lhes tínhamos dito.
   *
   * Bloquear é uma decisão legítima. Bloquear em silêncio não é, e era indistinguível de um bug.
   * Por isso o aviso passa a deixar rasto — e a falta dele é detectável (ver `avisoEmFalta`).
   */
  notifiedAt: string | null
}

export function readActivation(profile: { profile_data?: unknown } | null | undefined): ActivationState {
  const a = readProfileData(profile).activation
  if (!a || typeof a !== 'object') {
    return { required: false, since: null, decision: null, newMember: false, campaign: null, notifiedAt: null }
  }
  const o = a as Record<string, unknown>
  const d = o.decision
  return {
    required: o.required === true,
    since: typeof o.since === 'string' ? o.since : null,
    decision: d === 'pay' || d === 'free' || d === 'partner' || d === 'off' ? d : null,
    newMember: o.new_member === true,
    campaign: typeof o.campaign === 'string' ? o.campaign : null,
    notifiedAt: typeof o.notified_at === 'string' ? o.notified_at : null,
  }
}

/**
 * Esta pessoa está bloqueada há quanto tempo SEM ter sido avisada?
 *
 * Devolve as horas, ou `null` se não está bloqueada ou já foi avisada. É isto que permite a um
 * vigia gritar em vez de deixar alguém de fora em silêncio — que foi o que aconteceu a 43 pessoas
 * entre agosto e setembro de 2026.
 */
export function avisoEmFalta(
  profile: { profile_data?: unknown } | null | undefined,
  agora = Date.now(),
): number | null {
  const a = readActivation(profile)
  if (!a.required || a.notifiedAt) return null
  const desde = a.since ? Date.parse(a.since) : NaN
  if (!Number.isFinite(desde)) return 0 // bloqueado sem sequer saber desde quando: é o pior caso
  return Math.max(0, Math.round((agora - desde) / 3_600_000))
}

/** Marca que o aviso saiu. Chamar SEMPRE a seguir a enviar, nunca antes. */
export function activationNotifiedPatch(
  profile: { profile_data?: unknown } | null | undefined,
  quando = new Date().toISOString(),
): Record<string, unknown> {
  const dados = readProfileData(profile)
  const a = (dados.activation && typeof dados.activation === 'object' ? dados.activation : {}) as Record<string, unknown>
  return { ...dados, activation: { ...a, notified_at: quando } }
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
      // Explícito, e não ausente: «ainda não foi avisado» tem de ser um facto gravado, senão um
      // campo em falta confunde-se com um registo antigo e ninguém sabe o que aconteceu.
      notified_at: null,
    },
  }
}

/** Destino de quem tem ativação pendente: escolha de pack, não /register. */
export function activationRedirectPath(from = 'ativacao'): string {
  return `/upgrade?from=${encodeURIComponent(from)}`
}
