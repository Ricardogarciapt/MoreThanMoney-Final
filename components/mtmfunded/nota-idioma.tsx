'use client'

import { useI18n } from '@/components/i18n-provider'

/**
 * O aviso de que o documento legal está em português.
 *
 * Estes quatro documentos ficam em PORTUGUÊS, de propósito. Traduzir um contrato ou uns
 * termos é escrever outro documento: basta uma palavra a mais ou a menos para o texto passar
 * a dizer coisa diferente daquilo a que as duas partes se vincularam. É a mesma razão por que
 * o contrato de trader financiado também não se traduz.
 *
 * O que se faz, então, é dizê-lo — e só a quem está a ler noutra língua. Um leitor português
 * não precisa de um aviso a explicar-lhe que o texto está em português.
 */
export default function NotaIdioma() {
  const { lang } = useI18n()
  if (lang === 'pt') return null

  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs leading-relaxed text-zinc-500">
      This document is published in Portuguese only. A translation would be a different
      document: in a legal text, one word more or less changes what the parties agreed to. If
      anything here is unclear, write to{' '}
      <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
        funded@morethanmoney.pt
      </a>{' '}
      and we will explain it in English before you commit to anything.
    </div>
  )
}
