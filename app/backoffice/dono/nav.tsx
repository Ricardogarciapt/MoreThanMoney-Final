'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MODULOS_DONO } from '@/lib/backoffice-dono'

/** A barra dos módulos. Um clique muda de módulo sem recarregar a casca. */
export default function NavDono() {
  const caminho = usePathname() ?? ''
  const activo = MODULOS_DONO.find((m) => caminho.endsWith(`/dono/${m.slug}`) || caminho.includes(`/dono/${m.slug}/`))
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-[#D2A63C]/15 bg-black/40 p-1 text-sm">
      <Link href="/backoffice/dono" className={`shrink-0 rounded-lg px-3 py-1.5 ${!activo ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'text-gray-400 hover:text-[#E9C46A]'}`}>
        Visão geral
      </Link>
      {MODULOS_DONO.map((m) => (
        <Link
          key={m.slug}
          href={`/backoffice/dono/${m.slug}`}
          prefetch
          className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 ${activo?.slug === m.slug ? 'bg-[#D2A63C]/15 text-[#E9C46A]' : 'text-gray-400 hover:text-[#E9C46A]'}`}
        >
          {m.nome}
        </Link>
      ))}
    </nav>
  )
}
