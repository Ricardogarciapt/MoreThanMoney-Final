"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Entrada cinemática ao fazer scroll: sobe, ganha nitidez e acende. `atraso` em ms para escalonar
 * cartões. Sem JS ou com movimento reduzido, o conteúdo aparece logo (nada fica escondido).
 */
export function Revelar({ children, atraso = 0, className = "", as: Tag = "div" }: { children: React.ReactNode; atraso?: number; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement>(null)
  const [estado, setEstado] = useState<"inicial" | "escondido" | "visivel">("inicial")

  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight * 0.9) return // já à vista: não esconder o que a pessoa está a ver
    setEstado("escondido")
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setEstado("visivel")
        obs.disconnect()
      }
    }, { threshold: 0.12 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const estilo: React.CSSProperties =
    estado === "escondido"
      ? { opacity: 0, transform: "translateY(36px) scale(0.98)", filter: "blur(8px)" }
      : estado === "visivel"
        ? { opacity: 1, transform: "none", filter: "none", transition: `opacity .8s cubic-bezier(.2,.7,.2,1) ${atraso}ms, transform .9s cubic-bezier(.2,.7,.2,1) ${atraso}ms, filter .8s ease ${atraso}ms` }
        : {}

  return (
    <Tag ref={ref as React.Ref<never>} className={className} style={estilo}>
      {children}
    </Tag>
  )
}
