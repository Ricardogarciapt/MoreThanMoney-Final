"use client"

import MinhaConta from "./minha-conta"
import type { Trader } from "./trader-contexto"

/**
 * O SEPARADOR «CONTA» — agora «A minha conta» (components/funded/minha-conta.tsx): resumo com as
 * regras, métricas, diário, histórico, credenciais e levantamentos da conta seleccionada.
 * Os cartões «Copiar para a minha conta» e «TradingView → esta conta» saíram (dono, 2026-09-15).
 */
export default function PainelConta({ t }: { t: Trader }) {
  return <MinhaConta t={t} />
}
