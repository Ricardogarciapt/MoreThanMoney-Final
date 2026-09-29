"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Store } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Contexto, type CentroCtx } from "@/components/admin/centro/contexto"
import SeccaoMarketplace from "@/components/admin/centro/seccoes/marketplace"

/**
 * O MARKETPLACE TEM CASA PRÓPRIA — /admin/marketplace.
 *
 * Vivia como nona aba do «Centro de Controlo · MTM Auto», ao lado do Cockpit, dos Sinais e da
 * Cópia. Aquele ecrã é a sala de máquinas da EXECUÇÃO: contas, rotas, motor, MetaApi. Vender
 * mentorias e cursos de educadores não é execução, e tê-lo ali dizia ao gestor que uma fila de
 * revisão de produtos era um assunto da mesma família que o kill-switch das mestres.
 *
 * O componente é o MESMO e a API é a mesma (`/api/admin/centro/marketplace`): o que muda é a porta.
 * A barra lateral do admin aponta para aqui, na categoria «Marketing e vendas», que é onde quem
 * trata de vendas o vai procurar.
 *
 * A secção foi escrita para viver dentro do Centro e usa o seu contexto (`versao`/`depoisDeAcao`,
 * para reler depois de uma acção). Aqui esse contexto é servido em pequeno — sem secções para onde
 * ir nem gavetas para abrir — em vez de se tirar a dependência ao componente, que o faria divergir
 * do resto das secções.
 */
export default function PaginaMarketplace() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || "/admin/marketplace"
  const [montado, setMontado] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => { setMontado(true) }, [])
  useEffect(() => {
    if (!montado || isLoading) return
    if (!user) { router.replace(`/login?redirect=${pathname}`); return }
    if (!isAdmin) router.replace("/member-area")
  }, [montado, isLoading, user, isAdmin, router, pathname])

  const naoSeAplica = useCallback(() => { /* fora do Centro não há secções nem gavetas */ }, [])
  const ctx: CentroCtx = useMemo(() => ({
    seccao: "marketplace",
    filtro: {},
    versao,
    irPara: () => router.push("/admin/centro"),
    abrir: naoSeAplica,
    fechar: naoSeAplica,
    depoisDeAcao: () => setVersao((v) => v + 1),
  }), [versao, router, naoSeAplica])

  if (!montado || isLoading) return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" /></div>
  if (!user || !isAdmin) return null

  return (
    <Contexto.Provider value={ctx}>
      <div className="min-h-screen bg-black text-white [background-image:radial-gradient(ellipse_at_top_right,rgba(210,166,60,0.07),transparent_45%)]">
        <header className="sticky top-0 z-30 border-b border-[#D2A63C]/15 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6">
          <Link href="/admin" className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-[#D2A63C]"><ArrowLeft className="h-3 w-3" /> Admin</Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Store className="h-5 w-5 text-[#D2A63C]" /> Marketplace</h1>
          <p className="mt-1 text-[11px] text-zinc-500">Produtos dos educadores: interruptores, fila de revisão, vendas e quanto cabe a cada autor.</p>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6"><SeccaoMarketplace /></div>
      </div>
    </Contexto.Provider>
  )
}
