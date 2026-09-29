/**
 * /marketplace/loja/<id> — a loja de um vendedor.
 *
 * `id` é 'casa' para a MTM ou o uuid de um educador. Pública, como a montra e a ficha: uma loja de
 * educador que só abre a quem já tem conta não pode ser partilhada por ele, e partilhá-la é a
 * primeira coisa que um vendedor faz. A razão longa está em `app/marketplace/page.tsx`.
 */
"use client"

import { use } from "react"
import LojaVendedor from "@/components/marketplace/loja-vendedor"

export default function LojaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <LojaVendedor id={id} />
    </main>
  )
}
