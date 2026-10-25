'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'

export type ItemMenu = { href: string; label: string }
export type SeccaoMenu = { titulo: string; itens: ItemMenu[] }

/**
 * O menu lateral do backoffice. Os itens chegam já filtrados do servidor (o layout só manda o que a
 * pessoa pode abrir); aqui só se decide qual está activo e se o menu está aberto no telemóvel.
 *
 * No subdomínio o caminho que o browser vê é `/pipeline`, no domínio principal é `/backoffice/pipeline`
 * — compara-se sem o prefixo para os dois darem o mesmo item activo.
 */
const semPrefixo = (c: string) => c.replace(/^\/backoffice(?=\/|$)/, '') || '/'

export function MenuBackoffice({ seccoes }: { seccoes: SeccaoMenu[] }) {
  const caminho = semPrefixo(usePathname() ?? '/')
  const [aberto, setAberto] = useState(false)
  useEffect(() => { setAberto(false) }, [caminho])

  const activo = (href: string) => {
    const h = semPrefixo(href)
    return h === '/' ? caminho === '/' : caminho === h || caminho.startsWith(`${h}/`)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/25 px-3 py-1.5 text-sm text-[#E9C46A] lg:hidden"
        aria-expanded={aberto}
      >
        {aberto ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Menu
      </button>
      <nav className={`${aberto ? 'block' : 'hidden'} space-y-5 lg:block`}>
        {seccoes.filter((s) => s.itens.length).map((s) => (
          <div key={s.titulo}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{s.titulo}</p>
            <ul className="space-y-0.5">
              {s.itens.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    prefetch
                    className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      activo(i.href)
                        ? 'bg-[#D2A63C]/15 font-medium text-[#E9C46A]'
                        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-100'
                    }`}
                  >
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )
}
