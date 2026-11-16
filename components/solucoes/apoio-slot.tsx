"use client"

import BalaoApoio from "@/components/suporte/balao-apoio"

/**
 * Ponto de montagem do balão de apoio no site de apresentação.
 * O balão é o mesmo do site principal (components/suporte/balao-apoio), com a mesma API e CRM;
 * `origem="solucoes"` diz à triagem de onde veio o pedido. O site principal não monta o seu aqui.
 */
export default function ApoioSlot() {
  return <BalaoApoio origem="solucoes" />
}
