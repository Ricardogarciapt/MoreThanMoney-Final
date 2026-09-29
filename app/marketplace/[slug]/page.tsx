/**
 * /marketplace/<slug> — a ficha de um produto.
 *
 * O `cancel_url` do checkout aponta para aqui, e esta página NÃO EXISTIA: quem desistisse do
 * pagamento aterrava num 404. Ver o cabeçalho de `components/marketplace/ficha-produto.tsx`.
 *
 * PÚBLICA, como a montra. Um link de produto que só abre a quem já tem conta não serve para ser
 * partilhado — e ser partilhado é metade do que uma ficha faz. O que protege o conteúdo não é
 * esta página: é o `conteudo_url` nunca sair na resposta pública. A razão longa está no cabeçalho
 * de `app/marketplace/page.tsx`.
 */
"use client"

import { use } from "react"
import FichaProduto from "@/components/marketplace/ficha-produto"

export default function ProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <FichaProduto slug={slug} />
    </main>
  )
}
