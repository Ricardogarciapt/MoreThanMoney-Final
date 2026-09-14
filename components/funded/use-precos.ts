"use client"

import { useEffect, useRef, useState } from "react"
import type { PrecoVivo } from "./api"

/**
 * PREÇOS AO VIVO só dos símbolos que estão no ecrã.
 *
 * O catálogo vai ter centenas de símbolos; pedir todos a cada 1,5 s era descarregar o mercado
 * inteiro para mostrar seis linhas. Pede-se o que se vê (lista visível + gráfico + posições), e o
 * servidor aproveita o pedido para dizer ao motor que alguém está a olhar para eles.
 *
 * Pára quando o separador do browser/app fica escondido: o WebView nativo em segundo plano não tem
 * de gastar bateria nem pedidos.
 */
export function usePrecos(symbols: string[], intervaloMs = 1500) {
  const [precos, setPrecos] = useState<Record<string, PrecoVivo>>({})
  const [erro, setErro] = useState<string | null>(null)
  const chave = [...new Set(symbols.filter(Boolean))].sort().slice(0, 60).join(",")
  const emCurso = useRef(false)

  useEffect(() => {
    if (!chave) return
    let vivo = true
    let primeira = true
    const correr = async () => {
      // A primeira ida faz-se sempre: um ecrã aberto em segundo plano não deve voltar sem preços.
      if (emCurso.current || (!primeira && typeof document !== "undefined" && document.visibilityState === "hidden")) return
      primeira = false
      emCurso.current = true
      try {
        const r = await fetch(`/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(chave)}`, { cache: "no-store" })
        const d = await r.json()
        if (!vivo) return
        if (!r.ok) throw new Error(d?.error || "preços indisponíveis")
        setPrecos((antes) => {
          const novo = { ...antes }
          for (const p of d.precos as PrecoVivo[]) novo[p.symbol] = p
          return novo
        })
        setErro(null)
      } catch (e) {
        if (vivo) setErro((e as Error).message)
      } finally {
        emCurso.current = false
      }
    }
    correr()
    const iv = setInterval(correr, intervaloMs)
    return () => { vivo = false; clearInterval(iv) }
  }, [chave, intervaloMs])

  return { precos, erro }
}
