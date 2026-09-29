/**
 * /marketplace — a montra dos produtos dos educadores, no site.
 *
 * Protegida como o resto da área de membros: quem compra tem conta, porque a compra tem de ficar
 * agarrada a alguém para o acesso funcionar depois. A montra pública (sem login) fica para quando
 * o dono decidir que quer produtos indexáveis — ver a nota no relatório.
 */
"use client"

import ProtectedPage from "@/components/protected-page"
import Vitrine from "@/components/marketplace/vitrine"

export default function MarketplacePage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/marketplace">
      <main className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-zinc-100">Marketplace</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Cursos, mentorias e produtos criados pelos educadores da MTM. São produtos deles.
          </p>
        </header>
        <Vitrine />
      </main>
    </ProtectedPage>
  )
}
