"use client"

import { usePathname } from "next/navigation"

export function liveEducatorRoomHref(
  educatorId: string,
  options?: { streamId?: string | null; preferMobilePlayer?: boolean }
): string {
  const mobile = options?.preferMobilePlayer
  if (mobile) {
    if (options?.streamId) {
      return `/app-mobile?tab=live&stream=${encodeURIComponent(options.streamId)}`
    }
    return `/app-mobile?tab=live&educator=${encodeURIComponent(educatorId)}`
  }
  return `/live/${educatorId}`
}

export function liveStreamEnterHref(
  stream: { id: string; educator?: { id: string } | null },
  preferMobilePlayer?: boolean
): string {
  const educatorId = stream.educator?.id
  if (preferMobilePlayer) {
    return `/app-mobile?tab=live&stream=${encodeURIComponent(stream.id)}`
  }
  if (educatorId) return `/live/${educatorId}`
  return `/live-sessions/${stream.id}`
}

/** Só na app-mobile o player inline usa rotas ?tab=live. Lobby/desktop usam sempre /live/{id}. */
export function usePreferLiveMobilePlayer(): boolean {
  const pathname = usePathname()
  return pathname?.startsWith("/app-mobile") ?? false
}
