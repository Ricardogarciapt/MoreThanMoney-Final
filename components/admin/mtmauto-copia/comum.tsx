"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Azulejo, Aviso as AvisoCentro, BotaoLer, Pilula, Tabela as TabelaCentro, fmtMs, fmtQuando, pedirCentro, pedirPalavra, td as tdCentro, th as thCentro } from "@/components/admin/centro/ui"

/**
 * AS PEÇAS DE «MTM AUTO · CÓPIA» SÃO AS DO CENTRO — este ficheiro é só a tradução dos nomes.
 *
 * Havia duas caixas de peças a desenhar o mesmo: esta e components/admin/centro/ui.tsx. Mesma
 * tabela com larguras e bordas diferentes, mesma etiqueta de estado com outras cores, dois
 * `Aviso`, dois botões de reler, duas maneiras de pedir uma palavra antes de uma acção com
 * consequências. Quem abria as duas páginas via dois produtos.
 *
 * Aqui ficam só os nomes antigos apontados às peças do Centro, para as oito tabs continuarem a
 * compilar sem se lhes tocar. Ficheiro novo do admin usa directamente `centro/ui.tsx` — e quando a
 * última tab mudar de nomes, este ficheiro desaparece.
 *
 * Nota do que já aconteceu uma vez: `Recolhivel` vivia nesta pasta e era importado por cinco
 * secções do Centro; apagar a pasta «antiga» partia o Centro. A dependência agora anda no sentido
 * certo — esta pasta depende do Centro, nunca o contrário.
 */

export const pedirAdmin = pedirCentro
export const Tabela = TabelaCentro
export const Aviso = AvisoCentro
export const th = thCentro
export const td = tdCentro
export const quando = fmtQuando
export const ms = fmtMs
export const confirmarEscrita = pedirPalavra

/** Uma leitura só (sem relerem sozinhas): estas tabs leem endpoints caros da MetaApi. */
export function useDadosAdmin<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const recarregar = useCallback(async () => {
    if (!url) return
    setACarregar(true)
    const r = await pedirCentro<T>(url)
    if (r.success && r.data) { setDados(r.data); setErro(null) } else setErro(r.error ?? "falhou")
    setACarregar(false)
  }, [url])
  useEffect(() => { void recarregar() }, [recarregar])
  return { dados, erro, aCarregar, recarregar, setDados }
}

export function BotaoRecarregar({ onClick, aCarregar }: { onClick: () => void; aCarregar: boolean; texto?: string }) {
  return <BotaoLer onClick={onClick} aCarregar={aCarregar} />
}

export function Etiqueta({ children, tom = "neutro", title }: { children: ReactNode; tom?: "neutro" | "ok" | "aviso" | "grave" | "info" | "ouro"; title?: string }) {
  return <Pilula tom={tom} title={title}>{children}</Pilula>
}

export function Cartao({ titulo, valor, nota, tom }: { titulo: string; valor: ReactNode; nota?: ReactNode; tom?: "ok" | "aviso" | "grave" }) {
  return <Azulejo rotulo={titulo} valor={valor} sub={nota} tom={tom} />
}
