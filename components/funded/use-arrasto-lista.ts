"use client"

/**
 * ARRASTAR PARA ARRUMAR — a lista de contas do seletor do WebTrader.
 *
 * Porque não `draggable` do HTML: no telemóvel não existe. O seletor é uma folha de baixo no
 * telemóvel e um popover no computador, e a pessoa tem de poder arrumar as contas nos dois.
 * Por isso isto é feito com Pointer Events, que são os mesmos para rato, dedo e caneta.
 *
 * Como funciona: a pega (`aoPegar`) captura o ponteiro; a cada movimento pergunta-se ao documento
 * que linha está debaixo do dedo (`elementFromPoint` + `data-conta-id`) e, se for outra, troca-se
 * JÁ — a lista mexe-se debaixo do dedo em vez de esperar pelo fim. Ao largar, grava-se uma vez.
 *
 * Dois cuidados que a folha do telemóvel obriga:
 *  · `touch-action: none` na pega (o CSS está em quem a desenha), senão o browser trata o gesto
 *    como scroll e o arrasto nunca começa;
 *  · `stopPropagation` no início, senão o arrasto de FECHAR a folha (use-arrasto.ts) apanha o
 *    mesmo gesto e a folha foge para baixo com a conta a meio do caminho.
 */
import { useCallback, useRef, useState } from "react"

export interface ArrastoLista {
  /** id da linha que está a ser arrastada (para a desenhar levantada), ou null. */
  aArrastar: string | null
  /** pôr na PEGA de cada linha: `onPointerDown={(e) => aoPegar(e, id)}`. */
  aoPegar: (e: React.PointerEvent, id: string) => void
}

/**
 * @param idsVisiveis  os ids pela ordem em que estão no ecrã (o `sort` já aplicado)
 * @param trocar       (id, alvoId) → a nova ordem; é chamado a cada troca, ao vivo
 * @param gravar       chamado UMA vez ao largar, com a ordem final
 */
export function useArrastoLista(
  idsVisiveis: string[],
  trocar: (id: string, alvoId: string) => string[],
  gravar: (ordem: string[]) => void,
): ArrastoLista {
  const [aArrastar, setAArrastar] = useState<string | null>(null)
  // A ordem mais recente vive numa ref: o `pointerup` chega depois do último `pointermove` e tem de
  // gravar o que a lista ficou, não o que ela era quando o gesto começou.
  const ultima = useRef<string[]>(idsVisiveis)

  const aoPegar = useCallback((e: React.PointerEvent, id: string) => {
    // Botão do meio/direito não arrastam.
    if (e.button !== 0 && e.pointerType === "mouse") return
    e.preventDefault()
    e.stopPropagation()
    const alvo = e.currentTarget as HTMLElement
    try { alvo.setPointerCapture(e.pointerId) } catch { /* sem captura, o mover ainda funciona */ }
    setAArrastar(id)
    ultima.current = idsVisiveis
    let mexeu = false

    const mover = (ev: PointerEvent) => {
      const sob = document.elementFromPoint(ev.clientX, ev.clientY)
      const linha = sob?.closest?.("[data-conta-id]") as HTMLElement | null
      const outro = linha?.dataset?.contaId
      if (!outro || outro === id) return
      mexeu = true
      ultima.current = trocar(id, outro)
    }
    const largar = () => {
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", largar)
      window.removeEventListener("pointercancel", largar)
      setAArrastar(null)
      if (mexeu) gravar(ultima.current)
    }
    window.addEventListener("pointermove", mover)
    window.addEventListener("pointerup", largar)
    window.addEventListener("pointercancel", largar)
  }, [idsVisiveis, trocar, gravar])

  return { aArrastar, aoPegar }
}
