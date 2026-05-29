"use client"

import { useEffect, useState } from "react"
import { isPictureInPictureSupported } from "@/lib/browser-compat"

/** Evita mostrar PiP onde a API não existe (Safari antigo / iOS sem suporte). */
export function usePictureInPictureSupported() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    setOk(isPictureInPictureSupported())
  }, [])
  return ok
}
