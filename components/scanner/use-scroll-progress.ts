"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Progresso (0–1) de um elemento ao longo do scroll, escrito em `--p` no próprio elemento e
 * devolvido num ref. Só corre um requestAnimationFrame enquanto o elemento está perto do ecrã;
 * sem listeners de scroll. `mode`:
 *  - "pin": de quando o topo chega ao topo do ecrã até ao fim da secção (secções fixas/sticky).
 *  - "enter": de quando o topo entra pelo fundo do ecrã até chegar a meio.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, mode: "pin" | "enter" = "pin") {
  const progress = useRef(mode === "pin" ? 0 : 1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress.current = 1
      el.style.setProperty("--p", "1")
      return
    }
    let raf = 0
    let last = -1
    const tick = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const p =
        mode === "pin"
          ? Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)))
          : Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.6)))
      progress.current = p
      if (Math.abs(p - last) > 0.0005) {
        el.style.setProperty("--p", p.toFixed(4))
        last = p
      }
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf)
      if (e.isIntersecting) raf = requestAnimationFrame(tick)
    }, { rootMargin: "100px 0px" })
    io.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [ref, mode])
  return progress
}
