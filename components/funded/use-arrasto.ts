"use client"

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PointerEventReact } from "react"
import {
  type Amostra, LIMIAR_MOVIMENTO_PX, conteudoPodeArrastar, deveFecharArrasto, juntarAmostra, velocidadeFinal,
} from "@/lib/webtrader/arrasto"

/**
 * ARRASTAR NA VERTICAL — UM hook para todas as pegas do WebTrader (rato, dedo, caneta).
 *
 * Nasceu da pega da gaveta de posições do modo Simple (layout-simples, 9dc1d5c2) e passou a servir
 * também as folhas de baixo (ticket, mercado, conta, seletor de contas, instalar). O que aprendemos
 * com a gaveta fica aqui, num sítio:
 *  · Pointer Events + captura: o arrasto continua mesmo que o dedo/rato saia da pega;
 *  · `touch-action: none` (classe `touch-none` em quem usa) e um `touchmove` NÃO-passivo com
 *    preventDefault — senão, no Safari/iOS e nas webviews das apps, arrastar fazia scroll/«bounce» da
 *    página em vez de mexer na folha;
 *  · o valor ao vivo aplica-se uma vez por frame;
 *  · menos de 5 px é um TOQUE (`moveu: false`), não um arrasto;
 *  · botões, links e campos DENTRO da pega continuam a funcionar (o «×» do cabeçalho da folha): um
 *    toque neles nem começa o arrasto nem é travado.
 *
 * As contas (fecha? a que velocidade?) são puras: lib/webtrader/arrasto.ts.
 */

const INTERACTIVO = "button, a, input, select, textarea, label, [role='switch'], [data-sem-arrasto]"

function dentroDeInteractivo(alvo: EventTarget | null, pega: Element): boolean {
  const el = (alvo as Element | null)?.closest?.(INTERACTIVO)
  return Boolean(el && el !== pega && pega.contains(el))
}

/** Trava o scroll/bounce da página por baixo da pega — excepto em cima de um botão (o toque tem de chegar lá). */
function travarToque(e: TouchEvent) {
  const pega = e.currentTarget as Element | null
  if (pega && dentroDeInteractivo(e.target, pega)) return
  if (e.cancelable) e.preventDefault()
}

export interface FimArrasto {
  /** Deslocamento total (px); positivo = para baixo. 0 quando foi só um toque. */
  dy: number
  /** px/ms no fim do gesto; positiva = para baixo. */
  velocidade: number
  /** false = foi um toque (menos de 5 px). */
  moveu: boolean
}

export function useArrastoVertical(op: {
  aoComecar?: () => void
  /** Uma vez por frame durante o arrasto, com o deslocamento desde o início. */
  aoMover?: (dy: number) => void
  aoLargar?: (f: FimArrasto) => void
  aoCancelar?: () => void
}) {
  const cb = useRef(op)
  cb.current = op
  const gesto = useRef<{ id: number; y0: number; dy: number; moveu: boolean; amostras: Amostra[] } | null>(null)
  const frame = useRef<number | null>(null)
  const elemento = useRef<HTMLElement | null>(null)

  // Ref de função: a pega pode aparecer e desaparecer (gráfico escondido, folha fechada) e os
  // ouvintes não-passivos vão e vêm com ela — nunca ficam presos a um elemento que já não existe.
  const ref = useCallback((el: HTMLElement | null) => {
    const antigo = elemento.current
    if (antigo) {
      antigo.removeEventListener("touchstart", travarToque)
      antigo.removeEventListener("touchmove", travarToque)
    }
    elemento.current = el
    if (el) {
      el.addEventListener("touchstart", travarToque, { passive: false })
      el.addEventListener("touchmove", travarToque, { passive: false })
    }
  }, [])
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current) }, [])

  const terminar = (e: PointerEventReact<HTMLElement>, cancelado: boolean) => {
    const g = gesto.current
    if (!g || e.pointerId !== g.id) return
    gesto.current = null
    if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null }
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* já largada */ }
    if (cancelado) { cb.current.aoCancelar?.(); return }
    const amostras = juntarAmostra(g.amostras, { y: e.clientY, t: e.timeStamp })
    cb.current.aoLargar?.({ dy: g.moveu ? e.clientY - g.y0 : 0, velocidade: g.moveu ? velocidadeFinal(amostras) : 0, moveu: g.moveu })
  }

  const handlers = {
    onPointerDown: (e: PointerEventReact<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      if (dentroDeInteractivo(e.target, e.currentTarget)) return
      e.preventDefault()
      gesto.current = { id: e.pointerId, y0: e.clientY, dy: 0, moveu: false, amostras: [{ y: e.clientY, t: e.timeStamp }] }
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sem captura: segue sem ela */ }
      cb.current.aoComecar?.()
    },
    onPointerMove: (e: PointerEventReact<HTMLElement>) => {
      const g = gesto.current
      if (!g || e.pointerId !== g.id) return
      const dy = e.clientY - g.y0
      if (!g.moveu && Math.abs(dy) < LIMIAR_MOVIMENTO_PX) return
      g.moveu = true
      g.dy = dy
      g.amostras = juntarAmostra(g.amostras, { y: e.clientY, t: e.timeStamp })
      if (frame.current == null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null
          const a = gesto.current
          if (a) cb.current.aoMover?.(a.dy)
        })
      }
    },
    onPointerUp: (e: PointerEventReact<HTMLElement>) => terminar(e, false),
    onPointerCancel: (e: PointerEventReact<HTMLElement>) => terminar(e, true),
  }

  return { ref, handlers }
}

/**
 * UMA FOLHA DE BAIXO QUE FECHA A ARRASTAR PARA BAIXO (limiar de 80 px ou um sacudir rápido).
 *
 *  · `pega` espalha-se na pega/cabeçalho (`<div {...f.pega} className="touch-none …">`);
 *  · `conteudo` é a ref da zona com scroll: aí o dedo só arrasta a folha quando o conteúdo já está
 *    no TOPO e o gesto é para baixo — de resto é scroll normal, sem conflito;
 *  · `estilo` vai no painel que se mexe (translateY a seguir o dedo, mola de volta ao largar).
 */
export function useFolhaArrastavel(onFechar: () => void) {
  const [dy, setDy] = useState(0)
  const [aArrastar, setAArrastar] = useState(false)
  const fechar = useRef(onFechar)
  fechar.current = onFechar

  const largar = useCallback((f: FimArrasto) => {
    setAArrastar(false)
    setDy(0)
    if (f.moveu && deveFecharArrasto(f.dy, f.velocidade)) fechar.current()
  }, [])
  const repor = useCallback(() => { setAArrastar(false); setDy(0) }, [])

  const pega = useArrastoVertical({
    aoMover: (d) => { setAArrastar(true); setDy(Math.max(0, d)) },
    aoLargar: largar,
    aoCancelar: repor,
  })

  // ── o conteúdo com scroll: arrasta só a partir do topo ──
  const toque = useRef<{ x0: number; y0: number; ativo: boolean; desistiu: boolean; amostras: Amostra[] } | null>(null)
  const conteudoEl = useRef<HTMLElement | null>(null)
  const ouvintes = useRef<{
    inicio: (e: TouchEvent) => void; mover: (e: TouchEvent) => void; fim: (e: TouchEvent) => void; cancelar: () => void
  } | null>(null)
  if (!ouvintes.current) {
    ouvintes.current = {
      inicio: (e) => {
        const el = conteudoEl.current
        if (!el || e.touches.length !== 1) { toque.current = null; return }
        const t = e.touches[0]
        toque.current = { x0: t.clientX, y0: t.clientY, ativo: false, desistiu: el.scrollTop > 0, amostras: [{ y: t.clientY, t: e.timeStamp }] }
      },
      mover: (e) => {
        const g = toque.current
        const el = conteudoEl.current
        if (!g || g.desistiu || !el || e.touches.length !== 1) return
        const t = e.touches[0]
        const dx = t.clientX - g.x0
        const d = t.clientY - g.y0
        if (!g.ativo) {
          if (Math.abs(d) < LIMIAR_MOVIMENTO_PX && Math.abs(dx) < LIMIAR_MOVIMENTO_PX) return
          if (!conteudoPodeArrastar(el.scrollTop, dx, d)) { g.desistiu = true; return }
          g.ativo = true
        }
        if (e.cancelable) e.preventDefault()
        g.amostras = juntarAmostra(g.amostras, { y: t.clientY, t: e.timeStamp })
        setAArrastar(true)
        setDy(Math.max(0, d))
      },
      fim: (e) => {
        const g = toque.current
        toque.current = null
        if (!g?.ativo) return
        const y = e.changedTouches[0]?.clientY ?? g.y0
        largar({ dy: y - g.y0, velocidade: velocidadeFinal(juntarAmostra(g.amostras, { y, t: e.timeStamp })), moveu: true })
      },
      cancelar: () => {
        if (toque.current?.ativo) repor()
        toque.current = null
      },
    }
  }
  const conteudo = useCallback((el: HTMLElement | null) => {
    const o = ouvintes.current!
    const antigo = conteudoEl.current
    if (antigo) {
      antigo.removeEventListener("touchstart", o.inicio)
      antigo.removeEventListener("touchmove", o.mover)
      antigo.removeEventListener("touchend", o.fim)
      antigo.removeEventListener("touchcancel", o.cancelar)
    }
    conteudoEl.current = el
    if (el) {
      el.addEventListener("touchstart", o.inicio, { passive: true })
      el.addEventListener("touchmove", o.mover, { passive: false })
      el.addEventListener("touchend", o.fim, { passive: true })
      el.addEventListener("touchcancel", o.cancelar, { passive: true })
    }
  }, [])

  const estilo: CSSProperties = {
    transform: dy > 0 ? `translateY(${dy}px)` : undefined,
    transition: aArrastar ? "none" : "transform .18s ease-out",
  }
  return { pega: { ref: pega.ref, ...pega.handlers }, conteudo, estilo, aArrastar }
}

/** Esc fecha — com o `onFechar` mais recente, sem voltar a ligar o ouvinte a cada render. */
export function useEscFecha(onFechar: () => void, ativo = true) {
  const f = useRef(onFechar)
  f.current = onFechar
  useEffect(() => {
    if (!ativo) return
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") f.current() }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [ativo])
}
