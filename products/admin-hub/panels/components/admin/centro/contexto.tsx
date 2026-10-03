"use client"

import { createContext, useContext } from "react"
import type { SeccaoCentro } from "@/lib/admin-centro/regras"

export type TipoAlvo = "conta" | "estrategia" | "utilizador" | "sinal"
export interface Alvo { tipo: TipoAlvo; id: string }

export interface CentroCtx {
  /**
   * A secção activa. Aceita `'marketplace'`, que já NÃO é uma secção do Centro: o Marketplace mudou
   * para /admin/marketplace e serve este contexto em pequeno, porque as secções foram escritas para
   * o usarem (`versao`/`depoisDeAcao`). Mentir aqui — dizer «cockpit» numa página que não é o
   * cockpit — era pior do que a união.
   */
  seccao: SeccaoCentro | 'marketplace' 
  filtro: Record<string, string>
  irPara: (s: SeccaoCentro, filtro?: Record<string, string>) => void
  abrir: (a: Alvo) => void
  fechar: () => void
  /** incrementa depois de uma acção — as secções releem */
  versao: number
  depoisDeAcao: () => void
}

export const Contexto = createContext<CentroCtx | null>(null)

export function useCentroCtx(): CentroCtx {
  const c = useContext(Contexto)
  if (!c) throw new Error("fora do Centro de Controlo")
  return c
}

/** Lê/escreve o alvo da gaveta no URL: ?g=conta:site:<uuid> */
export function lerAlvo(g: string | null): Alvo | null {
  if (!g) return null
  const i = g.indexOf(":")
  if (i < 0) return null
  const tipo = g.slice(0, i) as TipoAlvo
  if (!["conta", "estrategia", "utilizador", "sinal"].includes(tipo)) return null
  return { tipo, id: g.slice(i + 1) }
}
