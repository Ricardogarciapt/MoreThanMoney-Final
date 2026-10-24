"use client"

// Cartões de pontos-chave: cada um desenha, num canvas 2D, o recorte da simulação que mostra
// aquele ponto do script. Um só requestAnimationFrame para todos, e só enquanto se vêem.

import { useEffect, useRef } from "react"
import { CARD_TEXT } from "./sim/scanner-sim"
import { CARD_TEXT_EN } from "./sim/i18n"
import { UI, type Lang } from "./landing-i18n"
import s from "./scanner-landing.module.css"

const REVEAL = 3.2 // segundos a desenhar o recorte
const HOLD = 2.4 // segundos parado antes de recomeçar

export function ScannerKeyCards({ slug, numClass, lang = "pt" }: { slug: string; numClass: string; lang?: Lang }) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([])
  const wrap = useRef<HTMLDivElement>(null)
  const texts = ((lang === "en" ? CARD_TEXT_EN : CARD_TEXT) as Record<string, { title: string; text: string }[]>)[slug] ?? []

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    let raf = 0
    let cards: { win: [number, number] }[] | null = null
    let sim: unknown = null
    let draw: ((c: HTMLCanvasElement, sim: unknown, card: unknown, p: number, lang: string) => void) | null = null
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const t0 = performance.now()
    const visible = new Set<number>()

    const frame = () => {
      raf = 0
      if (!cards || !draw) return
      const t = (performance.now() - t0) / 1000
      refs.current.forEach((cv, k) => {
        if (!cv || !visible.has(k)) return
        // Desfasa cada cartão para não andarem todos ao mesmo tempo.
        const local = (t + k * 0.7) % (REVEAL + HOLD)
        draw!(cv, sim, cards![k], reduce ? 1 : Math.min(1, local / REVEAL), lang)
      })
      if (!reduce && visible.size) raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      async (entries) => {
        for (const e of entries) {
          const k = Number((e.target as HTMLElement).dataset.k)
          if (e.isIntersecting) visible.add(k)
          else visible.delete(k)
        }
        if (!cards) {
          const [{ scannerCards, simulate }, two] = await Promise.all([import("./sim/scanner-sim"), import("./sim/scanner-2d")])
          cards = scannerCards(slug)
          sim = simulate(slug)
          draw = two.drawCard
        }
        if (!raf) raf = requestAnimationFrame(frame)
      },
      { rootMargin: "100px" },
    )
    refs.current.forEach((cv) => cv && io.observe(cv))
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [slug, lang])

  return (
    <div ref={wrap} className={s.keyCards}>
      {texts.map((c, k) => (
        <article key={c.title} className={`${s.keyCard} ${k % 2 ? s.panCardAlt : ""}`}>
          <div className={s.keyCanvasWrap}>
            <canvas
              ref={(el) => {
                refs.current[k] = el
              }}
              data-k={k}
              className={s.keyCanvas}
              role="img"
              aria-label={UI[lang].cardAria(c.title)}
            />
          </div>
          <div className={s.keyText}>
            <span className={numClass}>{String(k + 1).padStart(2, "0")}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </div>
        </article>
      ))}
    </div>
  )
}
