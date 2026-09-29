/**
 * /marketplace/<slug> — a ficha de um produto.
 *
 * O `cancel_url` do checkout aponta para aqui, e esta página NÃO EXISTIA: quem desistisse do
 * pagamento aterrava num 404. Ver o cabeçalho de `components/marketplace/ficha-produto.tsx`.
 */
"use client"

import { use } from "react"
import ProtectedPage from "@/components/protected-page"
import FichaProduto from "@/components/marketplace/ficha-produto"

export default function ProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <ProtectedPage redirectPath={`/login?redirect=/marketplace/${slug}`}>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <FichaProduto slug={slug} />
      </main>
    </ProtectedPage>
  )
}
