"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import PainelMtmAuto from "@/components/mtmcopy/painel-mtm-auto"

/**
 * As métricas da MTM Auto dentro da app-mobile.
 *
 * Vai buscar a sessão sozinha para poder ser largado em qualquer separador. Não mostra nada a
 * quem não usa a MTM Auto — quem não a tem não precisa de um quadro vazio a ocupar o ecrã.
 */
export default function MtmAutoMetricas() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelado) setToken(data.session?.access_token ?? null)
    })
    return () => { cancelado = true }
  }, [])

  if (!token) return null
  return <PainelMtmAuto accessToken={token} />
}
