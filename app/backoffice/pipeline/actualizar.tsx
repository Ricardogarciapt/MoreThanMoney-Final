'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Reutiliza a leitura autenticada do servidor; não publica contactos em Realtime aberto. */
export function ActualizarPipeline() {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => {
      const activo = document.activeElement
      // Não interrompe quem está a escrever, seleccionar, ou a trabalhar num modal.
      if (document.visibilityState !== 'visible' ||
          activo?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
          document.querySelector('[role="dialog"]')) return
      router.refresh()
    }, 30000)
    return () => clearInterval(timer)
  }, [router])
  return null
}
