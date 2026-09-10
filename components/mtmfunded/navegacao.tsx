'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'

/**
 * A NAVEGAÇÃO DO MTM FUNDED — e o que ela deliberadamente NÃO tem.
 *
 * Não há aqui nenhuma ligação para morethanmoney.pt. É de propósito: o MTM Funded é um
 * negócio à parte, com contas, regras e responsabilidades próprias, e quem entra por aqui
 * tem de perceber a quem está a comprar. Um logótipo que leva ao site de educação faria o
 * visitante presumir que é tudo a mesma coisa — e, num produto financiado, essa presunção
 * acaba em reclamações sobre quem responde pelo quê.
 *
 * O caminho existe no outro sentido (o site tem "MTM Funded" no menu Trading), porque aí é
 * uma recomendação de quem já é cliente. Voltar não precisa de botão: o browser tem um.
 */

const LIGACOES = [
  { href: '/mtmfunded', nome: 'Programas' },
  { href: '/mtmfunded/tradingtournament', nome: 'Torneio' },
  { href: '/mtmfunded/faq', nome: 'FAQ' },
] as const

export default function NavegacaoFunded() {
  const caminho = usePathname() ?? ''
  const [aberto, setAberto] = useState(false)

  const ativa = (href: string) =>
    href === '/mtmfunded' ? caminho === '/mtmfunded' : caminho.startsWith(href)

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-900 bg-[#050608]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        {/* A marca é o MTM Funded, e leva à raiz do MTM Funded. */}
        <Link href="/mtmfunded" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight text-white">MTM</span>
          <span className="text-lg font-bold tracking-tight text-[#D2A63C]">Funded</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {LIGACOES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3.5 py-2 text-sm transition-colors ${
                ativa(l.href) ? 'text-[#D2A63C]' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {l.nome}
            </Link>
          ))}
          <Link
            href="/mtmfunded/tradingtournament/dashboard"
            className="ml-2 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black"
          >
            A minha área
          </Link>
        </nav>

        <button
          onClick={() => setAberto((v) => !v)}
          className="text-zinc-400 sm:hidden"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        >
          {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {aberto && (
        <nav className="border-t border-zinc-900 px-5 py-3 sm:hidden">
          {LIGACOES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setAberto(false)}
              className={`block rounded-lg px-3 py-2.5 text-sm ${
                ativa(l.href) ? 'text-[#D2A63C]' : 'text-zinc-300'
              }`}
            >
              {l.nome}
            </Link>
          ))}
          <Link
            href="/mtmfunded/tradingtournament/dashboard"
            onClick={() => setAberto(false)}
            className="mt-2 block rounded-lg bg-[#D2A63C] px-3 py-2.5 text-center text-sm font-semibold text-black"
          >
            A minha área
          </Link>
        </nav>
      )}
    </header>
  )
}
