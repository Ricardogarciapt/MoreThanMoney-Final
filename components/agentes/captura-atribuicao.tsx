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
import {
  CHAVE_GUARDADA,
  COOKIE_ATRIBUICAO,
  JANELA_DIAS,
  PARAMETRO,
  oQueGuardar,
} from "@/lib/agentes/atribuicao"

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

      /**
       * E TAMBÉM NUM COOKIE, porque o `localStorage` não chega ao servidor.
       *
       * As sessões de checkout dos planos do site são criadas em rotas de servidor, e é no
       * `metadata` delas que o código tem de ir para chegar ao webhook e ao livro de vendas. Sem
       * isto, a única venda mensurável era a do marketplace (que manda o código no corpo do
       * pedido) — e o resto ficava «sem código» sem nunca dar erro. Ver `COOKIE_ATRIBUICAO`.
       *
       * `SameSite=Lax` e não `Strict`: quem clica o link vem de outro sítio (Instagram, Telegram,
       * um email), e com `Strict` o cookie não era enviado no pedido que vem de fora — ou seja,
       * perdia-se exactamente no caso que isto existe para medir.
       */
      document.cookie =
        `${COOKIE_ATRIBUICAO}=${encodeURIComponent(novo.codigo)}` +
        `; path=/; max-age=${JANELA_DIAS * 24 * 60 * 60}; samesite=lax` +
        (window.location.protocol === "https:" ? "; secure" : "")
    } catch {
      // Navegação privada, armazenamento bloqueado, quota cheia. Uma atribuição perdida não pode
      // rebentar a página que a pessoa veio ver.
    }
  }, [caminho, params])

  return null
}
