'use client'

/** Dispara evento global para sidebars / UI actualizarem XP. */
export function dispatchXpUpdated(detail: {
  xp_gained?: number
  total_xp: number
  level: number
  action_type?: string
}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('xpUpdated', { detail }))
}

export async function notifyXpFromResponse(xp?: {
  awarded?: boolean
  xp_gained?: number
  total_xp?: number
  level?: number
  action_type?: string
}) {
  if (!xp?.awarded || !xp.xp_gained) return
  dispatchXpUpdated({
    xp_gained: xp.xp_gained,
    total_xp: xp.total_xp ?? 0,
    level: xp.level ?? 1,
    action_type: xp.action_type,
  })
}
