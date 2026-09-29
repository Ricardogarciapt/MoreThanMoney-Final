"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Contexto, type CentroCtx } from "@/components/admin/centro/contexto"
import SeccaoMarketplace from "@/components/admin/centro/seccoes/marketplace"
import GestorProdutos from "@/components/marketplace/gestor-produtos"

/**
 * O MARKETPLACE DO ADMIN, INTEIRO, NUM ECRÃ — /admin?tab=marketplace.
 *
 * Estava partido em dois sítios e nenhum dos dois estava completo: a aba do /admin tinha o EDITOR
 * de produtos (criar, editar, preço) e mandava o gestor «ao Centro» para os interruptores, a fila
 * de revisão, as vendas e a partilha de cada educador; e o Centro de Controlo — que é a sala de
 * máquinas da EXECUÇÃO, ao lado do kill-switch das mestres — tinha a governação mas não tinha o
 * editor. Quem punha um produto à venda passava a vida entre os dois.
 *
 * Aqui estão os dois, por esta ordem: primeiro o que governa a loja, depois o catálogo. O
 * componente da governação foi escrito para viver dentro do Centro e usa o contexto dele
 * (`versao`/`depoisDeAcao`, para reler depois de cada acção); esse contexto é servido aqui em
 * pequeno — sem secções para onde ir nem gavetas para abrir — em vez de se tirar a dependência ao
 * componente, o que o faria divergir das outras secções.
 */
export default function MarketplaceAdmin() {
  const router = useRouter()
  const [versao, setVersao] = useState(0)
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

  return (
    <Contexto.Provider value={ctx}>
      <div className="space-y-6">
        <SeccaoMarketplace />
        <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
          <div className="border-b border-[#D2A63C]/15 px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-[#D2A63C]">Catálogo</h2>
            <p className="mt-1 text-sm text-gray-400">
              Os produtos, todos: criar, editar, publicar, destacar e ligar o preço ao Stripe. É o mesmo editor que cada
              educador usa para os dele.
            </p>
          </div>
          <div className="p-6"><GestorProdutos /></div>
        </div>
      </div>
    </Contexto.Provider>
  )
}
