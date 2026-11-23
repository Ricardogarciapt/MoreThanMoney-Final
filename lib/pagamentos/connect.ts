/**
 * STRIPE CONNECT — a conta para onde a casa transfere as comissões de afiliados, IBs, setters,
 * closers e prospectores.
 *
 * ═══ O ERRO QUE ISTO CORRIGE (23/11/2026) ═══════════════════════════════════════════════════
 *
 * A conta era criada só com a capacidade `transfers` (receber dinheiro da casa, não cobrar
 * clientes), mas o estado «completo» exigia `charges_enabled && payouts_enabled`. Uma conta que só
 * recebe transferências NUNCA tem `charges_enabled`: ficava para sempre «pendente», e o pagamento
 * caía sempre para o caminho manual sem ninguém perceber porquê. O critério certo é a capacidade
 * `transfers` activa e os levantamentos para o banco ligados.
 *
 * A conta usa o acordo de serviço `recipient` (é a forma que o Stripe exige para contas que só
 * recebem transferências, e é a que permite parceiros fora de Portugal, como o Rúben em França).
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export type EstadoConnect = 'complete' | 'pending' | 'incomplete'

/** Países onde um parceiro pode abrir a conta de recebimento (EEE + Reino Unido + Suíça). */
export const PAISES_CONNECT = [
  'PT', 'ES', 'FR', 'DE', 'IT', 'NL', 'BE', 'LU', 'IE', 'AT', 'PL', 'CH', 'GB', 'SE', 'DK', 'NO',
  'FI', 'CZ', 'SK', 'SI', 'HR', 'HU', 'RO', 'BG', 'GR', 'CY', 'MT', 'EE', 'LV', 'LT', 'LI', 'IS',
] as const

export function paisConnect(valor: unknown): string {
  const p = String(valor ?? '').trim().toUpperCase()
  return (PAISES_CONNECT as readonly string[]).includes(p) ? p : 'PT'
}

type ContaMinima = {
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  capabilities?: { transfers?: string | null } | null
}

/** O estado da conta como a casa o lê: pode receber transferências e levantar para o banco? */
export function estadoDaConta(conta: ContaMinima): EstadoConnect {
  const transferenciasActivas = conta.capabilities?.transfers === 'active'
  if (transferenciasActivas && conta.payouts_enabled) return 'complete'
  if (conta.details_submitted) return 'pending'
  return 'incomplete'
}

/** Cria a conta Express de recebimento. */
export async function criarContaRecebimento(
  stripe: Stripe,
  dados: { userId: string; email: string | null; pais: string },
): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: 'express',
    country: dados.pais,
    email: dados.email ?? undefined,
    capabilities: { transfers: { requested: true } },
    tos_acceptance: { service_agreement: 'recipient' },
    metadata: { user_id: dados.userId, fim: 'comissoes_mtm' },
  })
}

/**
 * Lê a conta no Stripe e acerta o perfil. Devolve o estado e a conta (ou null se a conta deixou de
 * existir do lado do Stripe).
 */
export async function sincronizarConta(
  db: SupabaseClient,
  stripe: Stripe,
  userId: string,
  accountId: string,
  estadoAnterior?: string | null,
  onboardedAnterior?: string | null,
): Promise<{ estado: EstadoConnect | 'error'; conta: Stripe.Account | null }> {
  let conta: Stripe.Account
  try {
    conta = await stripe.accounts.retrieve(accountId)
  } catch {
    if (estadoAnterior !== 'error') {
      await db.from('profiles').update({ stripe_connect_status: 'error' }).eq('id', userId)
    }
    return { estado: 'error', conta: null }
  }
  const estado = estadoDaConta(conta as unknown as ContaMinima)
  if (estado !== estadoAnterior || (estado === 'complete' && !onboardedAnterior)) {
    await db
      .from('profiles')
      .update({
        stripe_connect_status: estado,
        ...(estado === 'complete' && !onboardedAnterior ? { stripe_connect_onboarded_at: new Date().toISOString() } : {}),
      })
      .eq('id', userId)
  }
  return { estado, conta }
}

/**
 * Passa por todas as contas ainda não completas e acerta o estado. Corre no cron diário: assim um
 * parceiro que acabou o registo e não voltou ao site fica pronto a receber na mesma, sem depender
 * de um webhook de Connect configurado no painel.
 */
export async function sincronizarContasPorAcabar(
  db: SupabaseClient,
  stripe: Stripe,
): Promise<{ vistas: number; completas: number }> {
  const { data } = await db
    .from('profiles')
    .select('id, stripe_connect_account_id, stripe_connect_status, stripe_connect_onboarded_at')
    .not('stripe_connect_account_id', 'is', null)
    .neq('stripe_connect_status', 'complete')
    .limit(200)
  let completas = 0
  for (const p of data ?? []) {
    const r = await sincronizarConta(
      db,
      stripe,
      String(p.id),
      String(p.stripe_connect_account_id),
      p.stripe_connect_status as string | null,
      p.stripe_connect_onboarded_at as string | null,
    )
    if (r.estado === 'complete') completas++
  }
  return { vistas: (data ?? []).length, completas }
}
