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
 * SÓ SE ARRASTA NO MODO ORGANIZAR (pedido do dono, 24/09: «tens dois modos de arrastar, mantém
 * apenas o de organizar»). Fora dele a pega não faz nada.
 *
 * O caminho até aqui vale a pena ficar escrito, porque explica porque é que a solução é esta e
 * não outra. Primeiro arrastava-se sempre, e quem passava o dedo pela pega a fazer scroll trocava
 * contas sem querer. Depois exigiu-se **um segundo com o dedo parado** para a linha levantar — o
 * engano acabou, mas ficaram dois gestos para a mesma coisa e ninguém adivinha que tem de manter
 * premido. O modo organizar resolve os dois problemas de uma vez: é uma decisão explícita, e
 * dentro dele o dedo levanta a linha ao primeiro toque, como o rato sempre fez.
 *
 * Dois cuidados que a folha do telemóvel obriga:
 *  · `touch-action: none` na pega (o CSS está em quem a desenha) — sem isso o browser rouba o
 *    gesto a meio, já depois de a linha ter levantado;
 *  · `stopPropagation` quando o arrasto começa, senão o arrasto de FECHAR a folha (use-arrasto.ts)
 *    apanha o mesmo gesto e a folha foge para baixo com a conta a meio do caminho.
 */
import { useCallback, useRef, useState } from "react"

export interface ArrastoLista {
  /** id da linha que está a ser arrastada (para a desenhar levantada), ou null. */
  aArrastar: string | null
  /** pôr na PEGA de cada linha: `onPointerDown={(e) => aoPegar(e, id)}`. */
  aoPegar: (e: React.PointerEvent, id: string) => void
  /** true = modo organizar ligado; fora dele a pega está inerte e desenha-se apagada. */
  activo: boolean
}

/**
 * @param idsVisiveis  os ids pela ordem em que estão no ecrã (o `sort` já aplicado)
 * @param trocar       (id, alvoId) → a nova ordem; é chamado a cada troca, ao vivo
 * @param gravar       chamado UMA vez ao largar, com a ordem final
 * @param activo       modo organizar; a `false` não se arrasta nada
 */
export function useArrastoLista(
  idsVisiveis: string[],
  trocar: (id: string, alvoId: string) => string[],
  gravar: (ordem: string[]) => void,
  activo = false,
): ArrastoLista {
  const [aArrastar, setAArrastar] = useState<string | null>(null)
  // A ordem mais recente vive numa ref: o `pointerup` chega depois do último `pointermove` e tem de
  // gravar o que a lista ficou, não o que ela era quando o gesto começou.
  const ultima = useRef<string[]>(idsVisiveis)

  const aoPegar = useCallback((e: React.PointerEvent, id: string) => {
    // Fora do modo organizar a pega não arrasta — o gesto fica para o browser (scroll da lista).
    if (!activo) return
    // Botão do meio/direito não arrastam.
    if (e.button !== 0 && e.pointerType === "mouse") return
    const alvo = e.currentTarget as HTMLElement
    const ponteiro = e.pointerId
    let mexeu = false
    ultima.current = idsVisiveis

    const mover = (ev: PointerEvent) => {
      ev.preventDefault()
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
    window.addEventListener("pointermove", mover, { passive: false })
    window.addEventListener("pointerup", largar)
    window.addEventListener("pointercancel", largar)

    e.preventDefault()
    e.stopPropagation()
    setAArrastar(id)
    try { alvo.setPointerCapture(ponteiro) } catch { /* sem captura, o mover ainda funciona */ }
    // Vibração curta: o dedo fica a saber que a linha levantou, sem ter de olhar.
    try { navigator.vibrate?.(15) } catch { /* nem todos os aparelhos têm */ }
  }, [idsVisiveis, trocar, gravar, activo])

  return { aArrastar, aoPegar, activo }
}
