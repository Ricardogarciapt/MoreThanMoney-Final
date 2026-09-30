"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import ConsolaAios from "@/components/aios/consola"

/**
 * /aios — o JARVIS.
 *
 * Deixou de ser um `<iframe>` para `public/aios/index.html` a 30/09/2026. O que isso resolve, por
 * ordem de importância:
 *
 *  · a chave da Fish Audio estava escrita em claro nesse HTML e ia para o browser de quem abrisse
 *    a página. Agora a fala passa por `/api/aios/voz`, e a chave não sai do servidor;
 *  · o ficheiro era servido de `public/`, ou seja fora do controlo do middleware enquanto ficheiro
 *    estático. O que se vê agora é um componente React, servido pelas mesmas regras do resto;
 *  · e o AIOS passa a poder usar o que a casa já tem — sessão, componentes, tipos — em vez de
 *    reescrever tudo dentro de uma moldura.
 */
export default function PaginaAios() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const [montado, setMontado] = useState(false)

  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    if (!montado || isLoading) return
    if (!user) router.replace("/login?redirect=/aios")
  }, [montado, isLoading, user, router])

  if (!montado || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050810]">
        <Loader2 className="h-10 w-10 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050810] text-white">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-gray-400">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050810]" style={{ zIndex: 9999 }}>
      <ConsolaAios />
    </div>
  )
}
