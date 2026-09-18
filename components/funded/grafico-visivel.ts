"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * «Mostrar gráfico» — um só estado para a página: o botão está na barra do gráfico e quem arruma o
 * espaço (o modo SIMPLE dá o ecrã ao painel das posições) é o layout. Guardado no dispositivo.
 */

const CHAVE = "mtmfunded_grafico_visivel"
const EVENTO = "mtmfunded-grafico-visivel"

// Sem localStorage (modo privado, webview sem armazenamento): vale a memória desta página.
let memoria: boolean | null = null

function ler(): boolean {
  try { const v = localStorage.getItem(CHAVE); return v == null ? memoria ?? true : v !== "0" } catch { return memoria ?? true }
}

function subscrever(cb: () => void) {
  window.addEventListener(EVENTO, cb)
  window.addEventListener("storage", cb)
  return () => { window.removeEventListener(EVENTO, cb); window.removeEventListener("storage", cb) }
}

export function useGraficoVisivel(): [boolean, (v: boolean) => void] {
  // No servidor (e no primeiro render) o gráfico está visível — é o que a página sempre mostrou.
  const visivel = useSyncExternalStore(subscrever, ler, () => true)
  const definir = useCallback((v: boolean) => {
    memoria = v
    try { localStorage.setItem(CHAVE, v ? "1" : "0") } catch { /* modo privado: vale só até recarregar */ }
    window.dispatchEvent(new Event(EVENTO))
  }, [])
  return [visivel, definir]
}
