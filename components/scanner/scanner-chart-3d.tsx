"use client"

// Gráfico 3D que simula o scanner a desenhar no mercado. O Three.js só é carregado quando a
// secção se aproxima do ecrã, e a animação pára fora do ecrã e com prefers-reduced-motion.

import { useEffect, useRef, useState, type MutableRefObject } from "react"
import s from "./scanner-landing.module.css"

type Legend = { color: string; label: string }
type Info = { caption: string | null; panel: { title: string; rows: { label: string; value: string }[] } | null }

const CYCLE = 18 // segundos de animação
const HOLD = 3 // segundos parados no fim antes de recomeçar

/** Sem `progress` anima em ciclo; com `progress` (0–1, ex.: posição do scroll) segue esse valor. */
export function ScannerChart3D({ slug, progress, tall }: { slug: string; progress?: MutableRefObject<number>; tall?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [info, setInfo] = useState<Info>({ caption: null, panel: null })
  const [legend, setLegend] = useState<Legend[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = wrap.current
    const cv = canvas.current
    if (!el || !cv) return
    let raf = 0
    let visible = false
    let scene: { render: (p: number, t: number) => void; resize: (w: number, h: number) => void; frameInfo: (p: number) => Info; dispose: () => void } | null = null
    let disposed = false
    let last = ""
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const t0 = performance.now()

    const push = (p: number) => {
      if (!scene) return
      const fi = scene.frameInfo(p)
      const key = JSON.stringify(fi.caption) + JSON.stringify(fi.panel)
      if (key !== last) {
        last = key
        setInfo({ caption: fi.caption, panel: fi.panel })
      }
    }
    const loop = () => {
      raf = 0
      if (!scene || !visible) return
      const t = (performance.now() - t0) / 1000
      const p = progress ? Math.max(0, Math.min(1, progress.current)) : Math.min(1, (t % (CYCLE + HOLD)) / CYCLE)
      scene.render(p, t)
      push(p)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!raf && !reduce) raf = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => {
      if (!scene) return
      scene.resize(el.clientWidth, el.clientHeight)
      if (reduce) scene.render(1, 0)
    })

    const io = new IntersectionObserver(
      async ([entry]) => {
        visible = entry.isIntersecting
        if (visible && !scene) {
          try {
            const [{ createScannerScene }, { simulate }] = await Promise.all([import("./sim/scanner-3d"), import("./sim/scanner-sim")])
            if (disposed) return
            const sim = simulate(slug)
            setLegend(sim.legend ?? [])
            scene = createScannerScene({ canvas: cv, sim })
            scene.resize(el.clientWidth, el.clientHeight)
            ro.observe(el)
            if (reduce) {
              scene.render(1, 0)
              push(1)
            }
          } catch {
            setFailed(true)
            return
          }
        }
        if (visible) start()
      },
      { rootMargin: "200px 0px" },
    )
    io.observe(el)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      scene?.dispose()
    }
  }, [slug, progress])

  if (failed) return null

  return (
    <div className={s.sim}>
      <div ref={wrap} className={`${s.simStage} ${tall ? s.simStageTall : ""}`}>
        <canvas ref={canvas} className={s.simCanvas} aria-label="Animação 3D do scanner a desenhar no gráfico" role="img" />
        {info.caption && (
          <p key={info.caption} className={s.simCaption}>
            {info.caption}
          </p>
        )}
        {info.panel && (
          <div className={s.simPanel}>
            <span className={s.simPanelTitle}>{info.panel.title}</span>
            {info.panel.rows.map((r) => (
              <div key={r.label} className={s.simRow}>
                <span>{r.label}</span>
                <b data-v={r.value === "ok" || r.value === "Alta" || r.value === "Acima" ? "on" : "off"}>{r.value === "ok" ? "✓" : r.value}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={s.simFoot}>
        <ul className={s.simLegend}>
          {legend.map((l) => (
            <li key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
        <p className={s.simNote}>Simulação com preços gerados para mostrar o comportamento do scanner. Não é histórico real.</p>
      </div>
    </div>
  )
}
