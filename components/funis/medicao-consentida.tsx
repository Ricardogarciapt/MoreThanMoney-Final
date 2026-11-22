'use client'

/**
 * Aviso de cookies de medição + pixel da Meta, para as páginas dos funis (/f/<funil>).
 * Sem ID de pixel configurado não aparece nada. Ver `lib/funis-pixel-browser.ts`.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { carregarPixel, escolhaGuardada, guardarEscolha, pixelId, rastrear, type Escolha } from '@/lib/funis-pixel-browser'

export default function MedicaoConsentida({ funil, conteudo }: { funil: string; conteudo: string }) {
  const [escolha, setEscolha] = useState<Escolha | null | 'aguarda'>('aguarda')

  useEffect(() => {
    if (!pixelId()) return setEscolha('nao')
    const e = escolhaGuardada()
    setEscolha(e)
    if (e === 'sim' && carregarPixel()) rastrear('ViewContent', { content_name: conteudo, content_category: funil })
  }, [funil, conteudo])

  function decidir(e: Escolha) {
    guardarEscolha(e)
    setEscolha(e)
    if (e === 'sim' && carregarPixel()) rastrear('ViewContent', { content_name: conteudo, content_category: funil })
  }

  if (escolha !== null) return null

  return (
    <div
      role="dialog"
      aria-label="Cookies de medição"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#111113]/95 px-4 py-2.5 backdrop-blur sm:px-6 sm:py-4"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="text-[12px] leading-snug text-zinc-300 sm:text-[13px]">
          Cookies de medição da Meta, só para saber que anúncio te trouxe. Só com o teu OK. <Link href="/privacidade" className="underline underline-offset-2 hover:text-white">Privacidade</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decidir('nao')}
            className="rounded-lg border border-white/15 px-3 py-2 text-[13px] font-medium text-zinc-200 transition hover:bg-white/5 active:scale-[0.98]"
          >
            Recusar
          </button>
          <button
            type="button"
            onClick={() => decidir('sim')}
            className="rounded-lg bg-[#D2A63C] px-3 py-2 text-[13px] font-semibold text-[#0A0A0B] transition hover:bg-[#E9C46A] active:scale-[0.98]"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}
