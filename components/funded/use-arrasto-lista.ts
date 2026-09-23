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
 * NO DEDO, O ARRASTO PEDE UM SEGUNDO PARADO (pedido do dono, 23/09). A lista tem scroll; quem
 * tocava na pega a passar o dedo para baixo arrastava a conta sem querer, e ficava com as contas
 * trocadas por ter tentado ver a de baixo. Agora: toca-se, espera-se **1 s** com o dedo quieto, e
 * só aí a linha «levanta». Se o dedo se mexer mais de 10 px antes disso, não há arrasto nenhum —
 * o gesto é o scroll de sempre. Com RATO não há espera: um rato não faz scroll por engano.
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
  /** id da linha com o dedo em cima à espera do segundo (para a desenhar a «carregar»), ou null. */
  aEsperar: string | null
  /** pôr na PEGA de cada linha: `onPointerDown={(e) => aoPegar(e, id)}`. */
  aoPegar: (e: React.PointerEvent, id: string) => void
}

/** Quanto tempo o dedo fica parado antes de a linha levantar. */
export const ESPERA_DEDO_MS = 1000
/** Mexer mais do que isto antes do tempo = é scroll, não é arrasto. */
const TOLERANCIA_PX = 10

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
  const [aEsperar, setAEsperar] = useState<string | null>(null)
  // A ordem mais recente vive numa ref: o `pointerup` chega depois do último `pointermove` e tem de
  // gravar o que a lista ficou, não o que ela era quando o gesto começou.
  const ultima = useRef<string[]>(idsVisiveis)

  const aoPegar = useCallback((e: React.PointerEvent, id: string) => {
    // Botão do meio/direito não arrastam.
    if (e.button !== 0 && e.pointerType === "mouse") return
    const comDedo = e.pointerType !== "mouse"
    const alvo = e.currentTarget as HTMLElement
    const ponteiro = e.pointerId
    const partida = { x: e.clientX, y: e.clientY }
    let aArrastarMesmo = false
    let mexeu = false
    let espera: ReturnType<typeof setTimeout> | null = null
    ultima.current = idsVisiveis

    const comecar = () => {
      aArrastarMesmo = true
      espera = null
      setAEsperar(null)
      setAArrastar(id)
      try { alvo.setPointerCapture(ponteiro) } catch { /* sem captura, o mover ainda funciona */ }
      // Vibração curta: o dedo fica a saber que a linha levantou, sem ter de olhar.
      try { navigator.vibrate?.(15) } catch { /* nem todos os aparelhos têm */ }
    }

    const mover = (ev: PointerEvent) => {
      if (!aArrastarMesmo) {
        // Ainda no segundo de espera: se o dedo anda, era scroll — desiste-se sem fazer nada.
        if (Math.hypot(ev.clientX - partida.x, ev.clientY - partida.y) > TOLERANCIA_PX) largar()
        return
      }
      ev.preventDefault()
      const sob = document.elementFromPoint(ev.clientX, ev.clientY)
      const linha = sob?.closest?.("[data-conta-id]") as HTMLElement | null
      const outro = linha?.dataset?.contaId
      if (!outro || outro === id) return
      mexeu = true
      ultima.current = trocar(id, outro)
    }
    const largar = () => {
      if (espera) { clearTimeout(espera); espera = null }
      window.removeEventListener("pointermove", mover)
      window.removeEventListener("pointerup", largar)
      window.removeEventListener("pointercancel", largar)
      setAEsperar(null)
      setAArrastar(null)
      if (mexeu) gravar(ultima.current)
    }
    window.addEventListener("pointermove", mover, { passive: false })
    window.addEventListener("pointerup", largar)
    window.addEventListener("pointercancel", largar)

    if (comDedo) {
      // O gesto ainda pode ser scroll: não se rouba nada ao browser até o segundo passar.
      setAEsperar(id)
      espera = setTimeout(comecar, ESPERA_DEDO_MS)
    } else {
      e.preventDefault()
      e.stopPropagation()
      comecar()
    }
  }, [idsVisiveis, trocar, gravar])

  return { aArrastar, aEsperar, aoPegar }
}
