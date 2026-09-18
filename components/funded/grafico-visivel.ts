"use client"

import { useCallback, useSyncExternalStore } from "react"
import { useModoWebtrader, type ModoWebtrader } from "./modo-webtrader"
import { graficoVisivelGuardado } from "@/lib/webtrader/layout"

/**
 * «Mostrar gráfico» — um só estado POR MODO (Simple e PRO guardam o seu): o botão está na barra do
 * gráfico e quem arruma o espaço é o layout. Escondido, o gráfico fica montado (velas e estudos não
 * se perdem) e a célula encolhe até à barra de ferramentas — o painel de baixo sobe e fica com o
 * espaço (layout-simples, layout-pro, multi-grafico). Guardado no dispositivo.
 */

const CHAVE = "mtmfunded_grafico_visivel"
const EVENTO = "mtmfunded-grafico-visivel"

/** A chave de cada modo. A antiga (sem modo) vale para os dois até se mexer no botão. */
export const chaveGraficoVisivel = (modo: ModoWebtrader) => `${CHAVE}:${modo}`

// Sem localStorage (modo privado, webview sem armazenamento): vale a memória desta página.
const memoria: Partial<Record<ModoWebtrader, boolean>> = {}

function ler(modo: ModoWebtrader): boolean {
  try {
    return graficoVisivelGuardado(localStorage.getItem(chaveGraficoVisivel(modo)), localStorage.getItem(CHAVE))
  } catch {
    return memoria[modo] ?? true
  }
}

function subscrever(cb: () => void) {
  window.addEventListener(EVENTO, cb)
  window.addEventListener("storage", cb)
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb) }
}

export function useGraficoVisivel(): [boolean, (v: boolean) => void] {
  const { modo } = useModoWebtrader()
  // No servidor (e no primeiro render) o gráfico está visível — é o que a página sempre mostrou.
  const visivel = useSyncExternalStore(subscrever, () => ler(modo), () => true)
  const definir = useCallback((v: boolean) => {
    memoria[modo] = v
    try { localStorage.setItem(chaveGraficoVisivel(modo), v ? "1" : "0") } catch { /* modo privado: vale só até recarregar */ }
    window.dispatchEvent(new Event(EVENTO))
  }, [modo])
  return [visivel, definir]
}
