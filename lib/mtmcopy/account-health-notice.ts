import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { apareceNoT2T } from '@/lib/mtmcopy/alvo-t2t'

/**
 * Avisa o CLIENTE quando a conta dele deixou de poder aceitar sinais.
 *
 * Até 2026-08-25 o estado existia na base de dados e mais ninguém sabia dele: das sete contas com
 * Tap to Trade ligado, cinco estavam bloqueadas — em pausa, com a ligação caída ou por concluir —
 * e a pessoa só descobria ao carregar em aceitar e nada acontecer. O Gonçalo chegou a seguir os
 * sinais à mão durante dias com o botão dele morto.
 *
 * Uma notificação por conta e por MOTIVO: enquanto o estado não mudar não se repete, e quando a
 * conta é reparada e volta a partir o aviso é novo (o motivo entra no `event_id`).
 */

export type MotivoBloqueio = 'pausada' | 'desligada' | 'por_ligar' | 'sem_saldo'

const TEXTOS: Record<MotivoBloqueio, { titulo: string; corpo: string }> = {
  pausada: {
    titulo: 'A tua conta está em pausa',
    corpo: 'Não vais receber nem conseguir aceitar sinais enquanto estiver assim. Ativa-a nas definições da conta.',
  },
  desligada: {
    titulo: 'A ligação ao MT5 caiu',
    corpo: 'A conta deixou de responder e não consegue abrir ordens. Confirma a palavra-passe e o servidor nas definições.',
  },
  por_ligar: {
    titulo: 'Falta terminar a ligação da conta',
    corpo: 'A conta ainda não está ligada ao MT5, por isso o Tap to Trade não abre nada. Conclui a ligação nas definições.',
  },
  sem_saldo: {
    titulo: 'A tua conta está sem saldo',
    corpo: 'A corretora recusa qualquer ordem sem saldo. Deposita antes de aceitar sinais.',
  },
}

export interface ContaBloqueada {
  connectionId: string
  userId: string
  label: string
  motivo: MotivoBloqueio
}

/** Diagnostica as contas com cópia/T2T ligados que não conseguem operar. */
export async function scanContasBloqueadas(): Promise<ContaBloqueada[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('mtmcopy_connections')
    .select('id, user_id, account_label, mt5_login_last4, metaapi_account_id, is_active, mt5_status, purpose, t2t_enabled')

  const out: ContaBloqueada[] = []
  for (const c of data ?? []) {
    // Só interessa quem CONTAVA operar: T2T ligado ou uma ligação de cópia.
    const usaT2T = apareceNoT2T(c)
    const usaCopia = c.purpose === 'mtmcopy' || c.purpose === 'copy'
    if (!usaT2T && !usaCopia) continue

    const label = c.account_label || (c.mt5_login_last4 ? `••${c.mt5_login_last4}` : String(c.id).slice(0, 6))
    let motivo: MotivoBloqueio | null = null
    if (!c.metaapi_account_id) motivo = 'por_ligar'
    else if (c.mt5_status === 'disconnected') motivo = 'desligada'
    else if (c.is_active === false) motivo = 'pausada'
    if (!motivo) continue
    out.push({ connectionId: String(c.id), userId: String(c.user_id), label, motivo })
  }
  return out
}

/** Envia (uma vez por conta+motivo) o aviso ao dono da conta. Devolve quantos avisos saíram. */
export async function avisarContasBloqueadas(contas: ContaBloqueada[]): Promise<number> {
  if (!contas.length) return 0
  const supabase = getSupabaseAdmin()
  const desde = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const { data: jaAvisados } = await supabase
    .from('notifications')
    .select('user_id, data')
    .eq('type', 'mtmcopy_account_blocked')
    .gte('created_at', desde)

  const vistos = new Set(
    (jaAvisados ?? [])
      .map((r) => (r.data as Record<string, unknown> | null)?.event_id)
      .filter((v): v is string => typeof v === 'string'),
  )

  const linhas = contas
    .map((c) => ({ c, eventId: `${c.connectionId}:${c.motivo}` }))
    .filter(({ eventId }) => !vistos.has(eventId))
    .map(({ c, eventId }) => ({
      user_id: c.userId,
      type: 'mtmcopy_account_blocked',
      title: TEXTOS[c.motivo].titulo,
      message: `${c.label} — ${TEXTOS[c.motivo].corpo}`,
      data: { url: '/app-mobile?tab=tap-to-trade', event_id: eventId, connection_id: c.connectionId },
      read: false,
    }))

  if (!linhas.length) return 0
  const { error } = await supabase.from('notifications').insert(linhas)
  if (error) {
    console.warn('[account-health] falha a avisar:', error.message)
    return 0
  }
  return linhas.length
}
