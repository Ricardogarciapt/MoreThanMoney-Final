import type { MtmcopyAccountRole } from './types'

export const MTM_MASTER_LABEL = 'Conta MTM'

export function isMasterConnection(role?: MtmcopyAccountRole | string | null): boolean {
  return role === 'master'
}

/** Nome apresentado ao cliente — a conta mestre nunca expõe servidor ou login. */
export function getClientConnectionTitle(
  conn: {
    account_role?: MtmcopyAccountRole | string | null
    account_label?: string | null
    mt5_login?: string | null
    mt5_login_last4?: string | null
    mt5_server?: string | null
    is_audited?: boolean | null
    audit_label?: string | null
  },
  index = 0,
): string {
  if (isMasterConnection(conn.account_role)) {
    const masterLabel = conn.account_label?.trim()
    if (masterLabel && masterLabel.toLowerCase() !== 'null') return masterLabel
    return MTM_MASTER_LABEL
  }

  if (conn.is_audited && conn.audit_label?.trim()) {
    return conn.audit_label.trim()
  }

  const label = conn.account_label?.trim()
  if (label && label.toLowerCase() !== 'null') return label

  const login = conn.mt5_login?.trim()
  if (login) return login

  const last4 = conn.mt5_login_last4 ? `****${conn.mt5_login_last4}` : `Conta ${index + 1}`
  const broker = conn.mt5_server?.split('-')[0]?.trim()
  return broker ? `${broker} · ${last4}` : last4
}

/** Oculta indicadores demo/real no nome do servidor (apenas apresentação). */
export function formatClientServerLabel(server: string | null | undefined): string | null {
  if (!server?.trim()) return null
  return server.trim()
}
