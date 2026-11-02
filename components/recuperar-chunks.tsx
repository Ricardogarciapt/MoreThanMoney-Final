"use client"

import { useEffect } from "react"
import { ehErroDeChunk, recarregarUmaVez } from "@/lib/chunks/recuperar"

/**
 * Apanha os «Loading chunk N failed» que escapam aos error boundaries (promessas do router,
 * `import()` dinâmicos) e recarrega a página uma vez. Ver lib/chunks/recuperar.ts.
 */
export default function RecuperarChunks() {
  useEffect(() => {
    const aoErro = (ev: ErrorEvent) => { if (ehErroDeChunk(ev.error ?? ev.message)) recarregarUmaVez() }
    const aoRejeicao = (ev: PromiseRejectionEvent) => { if (ehErroDeChunk(ev.reason)) recarregarUmaVez() }
    window.addEventListener("error", aoErro)
    window.addEventListener("unhandledrejection", aoRejeicao)
    return () => {
      window.removeEventListener("error", aoErro)
      window.removeEventListener("unhandledrejection", aoRejeicao)
    }
  }, [])
  return null
}
