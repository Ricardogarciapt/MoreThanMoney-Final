"use client"

import { useSyncExternalStore } from "react"

/**
 * Uma media query ao vivo (rodar o tablet, redimensionar a janela). No servidor e no primeiro
 * render devolve `inicial` — o HTML é o mesmo para todos e acerta logo a seguir.
 * Um só hook para o WebTrader (antes havia um `useEstreito` à mão no layout PRO).
 */
export function useMediaQuery(q: string, inicial = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      try {
        const mq = window.matchMedia(q)
        mq.addEventListener("change", cb)
        return () => mq.removeEventListener("change", cb)
      } catch { return () => {} }
    },
    () => { try { return window.matchMedia(q).matches } catch { return inicial } },
    () => inicial,
  )
}
