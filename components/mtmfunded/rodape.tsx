'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n-provider'

/**
 * O RODAPÉ DO MTM FUNDED.
 *
 * Separado do rodapé do morethanmoney.pt, e não por gosto: as duas coisas vendem produtos
 * diferentes, com riscos diferentes e obrigações diferentes. Um rodapé partilhado deixava as
 * políticas de educação a cobrir um produto de avaliação de traders, e ninguém saberia qual
 * das duas se aplicava quando fizesse falta.
 *
 * O aviso de risco fica AQUI, à vista, em todas as páginas — não escondido atrás de um link.
 * Num produto onde as pessoas põem dinheiro para provar que sabem negociar, a frase mais
 * importante é a que diz que as contas são simuladas.
 */

const LEGAL = [
  { href: '/mtmfunded/legal/termos', chave: 'mtmfunded.rodape.termos' },
  { href: '/mtmfunded/legal/risco', chave: 'mtmfunded.rodape.avisoTitulo' },
  { href: '/mtmfunded/legal/privacidade', chave: 'mtmfunded.rodape.privacidade' },
  { href: '/mtmfunded/legal/reembolsos', chave: 'mtmfunded.rodape.reembolsos' },
] as const

const PRODUTO = [
  { href: '/mtmfunded', chave: 'mtmfunded.nav.programas' },
  { href: '/mtmfunded/tradingtournament', chave: 'mtmfunded.rodape.tt' },
  { href: '/mtmfunded/faq', chave: 'mtmfunded.rodape.faq' },
] as const

export default function RodapeFunded() {
  const t = useT()
  return (
    <footer className="border-t border-zinc-900 bg-[#050608]">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mtmfunded/logo-mtm-funded-v2.webp"
            srcSet="/mtmfunded/logo-mtm-funded-v2.webp 1x, /mtmfunded/logo-mtm-funded-v2@2x.webp 2x"
            loading="eager"
            decoding="async" alt="MTM Funded" className="h-12 w-auto" />
            <p className="mt-3 max-w-xs text-sm text-zinc-500">
              {t('mtmfunded.rodape.tagline')}
            </p>
            <a href="mailto:funded@morethanmoney.pt" className="mt-4 inline-block text-sm text-zinc-400 hover:text-white">
              funded@morethanmoney.pt
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">{t('mtmfunded.rodape.produto')}</h3>
            <ul className="mt-3 space-y-2">
              {PRODUTO.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-white">{t(l.chave)}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">{t('mtmfunded.rodape.legal')}</h3>
            <ul className="mt-3 space-y-2">
              {LEGAL.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-zinc-500 hover:text-white">{t(l.chave)}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/*
          O aviso, por extenso e em todas as páginas. É a informação que muda a decisão de
          quem está a ler — e por isso não vai em letra miudinha nem atrás de um clique.
        */}
        <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#D2A63C]">{t('mtmfunded.rodape.avisoTitulo')}</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {t('mtmfunded.rodape.aviso')}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-zinc-900 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} MTM Funded · MoreThanMoney · Portugal
          </p>
          <p className="text-xs text-zinc-600">Trade · Evolve · Earn</p>
        </div>
      </div>
    </footer>
  )
}
