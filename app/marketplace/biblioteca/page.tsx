/**
 * /marketplace/biblioteca — o que esta pessoa comprou, e o link para abrir.
 *
 * O `success_url` do checkout aponta para aqui, e esta página NÃO EXISTIA: quem PAGAVA aterrava num
 * 404, com a compra registada e sem ver o que tinha acabado de comprar. Era o defeito mais caro do
 * marketplace — um sítio onde se paga e não se recebe nada visível.
 *
 * A lista vem de `/api/marketplace/biblioteca`, que é quem decide, no SERVIDOR, se a porta está
 * aberta; o `conteudo_url` só é escrito na resposta depois dessa decisão.
 */
"use client"

import ProtectedPage from "@/components/protected-page"
import Biblioteca from "@/components/marketplace/biblioteca"

export default function BibliotecaPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/marketplace/biblioteca">
      <main className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-100">A minha biblioteca</h1>
          <p className="mt-1 text-sm text-zinc-400">Tudo o que compraste no marketplace.</p>
        </header>
        <Biblioteca />
      </main>
    </ProtectedPage>
  )
}
