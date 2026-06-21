'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

/** Toast leve quando o utilizador ganha XP (chat, live, fast start, etc.). */
export default function XpUpdateListener() {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        xp_gained?: number
        total_xp?: number
        level?: number
      }
      if (!detail?.xp_gained) return
      toast.success(`+${detail.xp_gained} XP`, {
        description: detail.level ? `Nível ${detail.level} · ${detail.total_xp?.toLocaleString('pt-PT')} XP total` : undefined,
        duration: 2800,
      })
    }
    window.addEventListener('xpUpdated', handler)
    return () => window.removeEventListener('xpUpdated', handler)
  }, [])

  return null
}
