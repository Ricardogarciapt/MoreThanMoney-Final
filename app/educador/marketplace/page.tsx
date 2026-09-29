"use client"

/**
 * A ÁREA DO EDUCADOR — os meus produtos, e o meu extracto.
 *
 * ── PORQUE É QUE ESTA PÁGINA JÁ NÃO TEM EDITOR PRÓPRIO ────────────────────────────────────
 *
 * Tinha um. O estúdio ganhou o separador «Produtos e Cursos» e, por um momento, existiram dois
 * editores do mesmo produto: este e o de lá. Dois editores da mesma coisa divergem — um ganha um
 * campo que o outro não tem, e o educador vê coisas diferentes conforme a porta por onde entrou.
 * É o defeito que o gating do /live tem, com quatro cópias da mesma regra a discordarem.
 *
 * Por isso ficou um só componente, montado nos dois sítios. Esta página continua a existir porque
 * é um endereço directo, partilhável, para quem não quer atravessar o estúdio.
 */

import GestorProdutos from "@/components/marketplace/gestor-produtos"

export default function EducadorMarketplacePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100">Os meus produtos</h1>
        <p className="mt-1 text-sm text-zinc-400">
          O que vendes no marketplace da MTM, os teus preços e o que já vendeste.
        </p>
      </header>
      <GestorProdutos />
    </main>
  )
}
