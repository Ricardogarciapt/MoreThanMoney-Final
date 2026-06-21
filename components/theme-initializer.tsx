'use client'

import { useEffect } from 'react'
import { applyTheme, saveThemeToLocalStorage } from '@/lib/theme-config'

/**
 * Carrega o tema guardado no admin (Supabase) e aplica CSS vars globalmente.
 */
export default function ThemeInitializer() {
  useEffect(() => {
    let cancelled = false

    fetch('/api/public/theme', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.colors) return
        applyTheme({
          id: data.theme || 'default',
          name: data.name || 'MTM',
          colors: data.colors,
        })
        if (data.theme) saveThemeToLocalStorage(data.theme)
      })
      .catch(() => {
        /* fallback: globals.css defaults */
      })

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
