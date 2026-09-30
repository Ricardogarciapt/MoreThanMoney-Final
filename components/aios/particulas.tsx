"use client"

import { useEffect, useRef } from "react"

/**
 * O FUNDO DE PARTÍCULAS do AIOS — o mesmo do original, com três diferenças que só existem porque
 * agora vive dentro do site em vez de num iframe descartável:
 *
 *  · o laço pára quando o componente sai. No iframe, fechar a página matava o `requestAnimationFrame`
 *    com ela; aqui, sem o `cancelAnimationFrame`, o laço continuava a desenhar num canvas que já não
 *    existe — a gastar bateria numa página que a pessoa já deixou;
 *  · respeita `prefers-reduced-motion`. Sessenta pontos a mexer sem parar é exactamente o género de
 *    movimento que quem o desliga no sistema operativo desligou por uma razão;
 *  · desenha à densidade do ecrã (`devicePixelRatio`), senão num portátil retina as linhas saem
 *    esborratadas — coisa que o original tinha e ninguém reparou por ser tudo muito ténue.
 *
 * As ligações entre pontos são O(n²) a cada frame. Com 60 pontos são 1770 comparações, que é
 * barato; mexer nesse número mexe no custo ao quadrado, e é por isso que ele está numa constante
 * com nome em vez de escrito no meio do laço.
 */

const QUANTOS = 60
const DISTANCIA_DE_LIGACAO = 100

export default function Particulas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const paradoPorEscolha = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    let W = 0
    let H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pontos = Array.from({ length: QUANTOS }, () => ({
      x: 0, y: 0,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.3,
      o: Math.random() * 0.4 + 0.1,
    }))

    const medir = () => {
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    medir()
    for (const p of pontos) { p.x = Math.random() * W; p.y = Math.random() * H }
    window.addEventListener("resize", medir)

    let pedido = 0
    const desenhar = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of pontos) {
        if (!paradoPorEscolha) {
          p.x += p.vx; p.y += p.vy
          if (p.x < 0) p.x = W
          if (p.x > W) p.x = 0
          if (p.y < 0) p.y = H
          if (p.y > H) p.y = 0
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(210,166,60,${p.o})`
        ctx.fill()
      }
      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const dx = pontos[i].x - pontos[j].x
          const dy = pontos[i].y - pontos[j].y
          const d = Math.hypot(dx, dy)
          if (d >= DISTANCIA_DE_LIGACAO) continue
          ctx.beginPath()
          ctx.moveTo(pontos[i].x, pontos[i].y)
          ctx.lineTo(pontos[j].x, pontos[j].y)
          ctx.strokeStyle = `rgba(210,166,60,${0.06 * (1 - d / DISTANCIA_DE_LIGACAO)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
      // Sem movimento, desenha-se UMA vez e fica: o campo de pontos continua lá, parado.
      if (!paradoPorEscolha) pedido = requestAnimationFrame(desenhar)
    }
    desenhar()

    return () => {
      cancelAnimationFrame(pedido)
      window.removeEventListener("resize", medir)
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden />
}
