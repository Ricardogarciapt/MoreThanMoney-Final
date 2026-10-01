"use client"

/**
 * APANHA O CÓDIGO DO AGENTE QUE TROUXE ESTA PESSOA.
 *
 * Corre em todas as páginas (está no layout). Lê `?ag=` do endereço e guarda-o no browser por 30
 * dias, para a compra que acontecer depois — e quase nunca acontece no mesmo minuto — saber de
 * quem foi.
 *
 * As decisões (o que é um código válido, qual ganha, quanto tempo dura) estão em
 * `lib/agentes/atribuicao.ts`, com guarda ao lado. Aqui só se lê o endereço e se escreve no
 * armazenamento, porque é a parte que não decide nada.
 *
 * NÃO limpa o parâmetro do endereço de propósito: tirá-lo com `replaceState` fazia o link
 * partilhado deixar de funcionar quando a pessoa recarregasse a página a partir do histórico, e o
 * ganho era estético.
 */

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { CHAVE_GUARDADA, PARAMETRO, oQueGuardar } from "@/lib/agentes/atribuicao"

export default function CapturaAtribuicao() {
  const caminho = usePathname()
  const params = useSearchParams()

  useEffect(() => {
    try {
      const novo = oQueGuardar(params?.get(PARAMETRO), Date.now())
      // `null` = o link não trazia código. NÃO se apaga o que lá estava: bastava a pessoa abrir
      // outra página entre o clique e a compra para a atribuição desaparecer — ou seja, quase
      // sempre.
      if (!novo) return
      window.localStorage.setItem(CHAVE_GUARDADA, JSON.stringify(novo))
    } catch {
      // Navegação privada, armazenamento bloqueado, quota cheia. Uma atribuição perdida não pode
      // rebentar a página que a pessoa veio ver.
    }
  }, [caminho, params])

  return null
}
