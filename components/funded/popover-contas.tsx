"use client"

// `React` em âmbito: o teste desenha a caixa com `npx tsx` (JSX clássico), sem o compilador do Next.
import React, { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

/**
 * POPOVER ANCORADO — o seletor de contas do WebTrader.
 *
 * O problema (print do dono, 15/09): a lista abria `absolute` dentro da barra e ficava por cima da
 * linha das métricas (Nível margem, Perda diária restante…), cortada e misturada com ela — a barra e
 * o trader são irmãos com contextos de empilhamento próprios (gráfico, painéis redimensionáveis).
 *
 * Agora:
 *  · vai para o `document.body` por PORTAL, com `position: fixed` e z-index acima de tudo o que o
 *    WebTrader usa (folhas 900, avisos 1000–1002) — nunca é cortado por `overflow` de ninguém;
 *  · a posição calcula-se da âncora (`posicaoDoPopover`, pura e testada): por baixo do botão, dentro
 *    do ecrã, e para cima se não couber; altura limitada com scroll próprio;
 *  · fecha a tocar/clicar fora, com Esc, ao redimensionar e ao fazer scroll da página;
 *  · no telemóvel (< 640 px) é uma FOLHA de baixo com fundo escurecido — não flutua sobre as métricas.
 */

void React
export const Z_POPOVER = 1100
export const LARGURA_POPOVER = 380
const MARGEM = 8

export interface RetanguloAncora { top: number; bottom: number; left: number; right: number }

export type PosicaoPopover =
  | { modo: "folha" }
  | { modo: "ancorado"; top: number; left: number; largura: number; alturaMax: number; acima: boolean }

export function posicaoDoPopover(a: RetanguloAncora, ecra: { largura: number; altura: number }, desejada = LARGURA_POPOVER): PosicaoPopover {
  if (ecra.largura < 640) return { modo: "folha" }
  const largura = Math.min(desejada, ecra.largura - 2 * MARGEM)
  const left = Math.max(MARGEM, Math.min(a.left, ecra.largura - largura - MARGEM))
  const baixo = ecra.altura - a.bottom - MARGEM - 4
  const cima = a.top - MARGEM - 4
  // Por baixo sempre que caibam ~260 px ou haja mais espaço em baixo do que em cima.
  if (baixo >= 260 || baixo >= cima) {
    return { modo: "ancorado", top: a.bottom + 4, left, largura, alturaMax: Math.max(120, baixo), acima: false }
  }
  const alturaMax = Math.max(120, cima)
  return { modo: "ancorado", top: Math.max(MARGEM, a.top - 4 - alturaMax), left, largura, alturaMax, acima: true }
}

/** A caixa em si (sem portal nem efeitos) — é esta que o teste desenha no servidor. */
export function CaixaPopover({ pos, titulo, onFechar, children }: { pos: PosicaoPopover; titulo: string; onFechar: () => void; children: ReactNode }) {
  if (pos.modo === "folha") {
    return (
      <div data-popover-contas="folha" className="fixed inset-0 flex flex-col justify-end bg-black/60" style={{ zIndex: Z_POPOVER }} onPointerDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
        <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-zinc-950 shadow-2xl" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="flex justify-center pt-2"><span className="h-1 w-10 rounded-full bg-white/20" /></div>
          {children}
        </div>
      </div>
    )
  }
  return (
    <div
      data-popover-contas="ancorado" role="dialog" aria-label={titulo}
      className="fixed overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-zinc-950 shadow-2xl"
      style={{ zIndex: Z_POPOVER, top: pos.top, left: pos.left, width: pos.largura, maxHeight: pos.alturaMax }}
    >
      {children}
    </div>
  )
}

export default function PopoverAncorado({ aberto, ancora, onFechar, titulo, children }: {
  aberto: boolean
  ancora: RefObject<HTMLElement | null>
  onFechar: () => void
  titulo: string
  children: ReactNode
}) {
  const [pos, setPos] = useState<PosicaoPopover | null>(null)

  useLayoutEffect(() => {
    if (!aberto) { setPos(null); return }
    const medir = () => {
      const el = ancora.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos(posicaoDoPopover(r, { largura: window.innerWidth, altura: window.innerHeight }))
    }
    medir()
    window.addEventListener("resize", medir)
    return () => window.removeEventListener("resize", medir)
  }, [aberto, ancora])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node | null
      if (!alvo) return
      if (ancora.current?.contains(alvo)) return // o botão alterna sozinho
      if ((alvo as Element).closest?.("[data-popover-contas]")) return
      onFechar()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { onFechar(); ancora.current?.focus() } }
    // Scroll da PÁGINA (não o da própria lista) fecha: a âncora mexeu-se e a caixa ficava a flutuar.
    const rolar = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-popover-contas]")) onFechar() }
    document.addEventListener("pointerdown", fora, true)
    document.addEventListener("keydown", tecla)
    window.addEventListener("scroll", rolar, true)
    return () => {
      document.removeEventListener("pointerdown", fora, true)
      document.removeEventListener("keydown", tecla)
      window.removeEventListener("scroll", rolar, true)
    }
  }, [aberto, ancora, onFechar])

  if (!aberto || !pos || typeof document === "undefined") return null
  return createPortal(<CaixaPopover pos={pos} titulo={titulo} onFechar={onFechar}>{children}</CaixaPopover>, document.body)
}
