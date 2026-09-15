import type { ReactNode } from "react"
import { TransicaoCentro } from "@/components/admin/centro/transicao"

export const dynamic = "force-dynamic"

/** Faixa «Novo Centro de Controlo» + redirecção para /admin/centro quando admin_centro_padrao=true. */
export default function LayoutMtmcopy({ children }: { children: ReactNode }) {
  return <TransicaoCentro>{children}</TransicaoCentro>
}
