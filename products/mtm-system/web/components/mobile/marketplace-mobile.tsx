"use client"

/**
 * O marketplace dentro da app.
 *
 * É a MESMA `Vitrine` do site, em coluna única. Não há aqui nenhuma regra própria de propósito:
 * o que decide o que se vê e se há botão de compra é a rota, igual para os dois. Foi por cada
 * ecrã ter a sua cópia da regra que o gating do /live passou a dizer coisas diferentes na web e
 * na app.
 *
 * A REGRA DA APPLE está do lado do servidor: dentro da app iOS a rota devolve `podeComprar:false`
 * com o motivo `ios_iap_required`, e a vitrine mostra o preço sem qualquer caminho de compra —
 * nem botão, nem link para fora. É o que o ecrã das aulas pagas já faz.
 */

import Vitrine from "@/components/marketplace/vitrine"

export default function MarketplaceMobile() {
  return (
    <div className="px-3 py-4">
      <h1 className="mb-1 text-lg font-semibold text-zinc-100">Marketplace</h1>
      <p className="mb-5 text-xs text-zinc-500">Produtos dos educadores MTM.</p>
      <Vitrine compacto />
    </div>
  )
}
