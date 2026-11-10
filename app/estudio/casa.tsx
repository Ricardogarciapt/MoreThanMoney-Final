'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, PenLine, Video } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import Estudio from './estudio'
import PainelConteudoMagnetico from './conteudo'

type Separador = 'gravar' | 'criar'

/**
 * O Estúdio tem dois separadores: «Gravar» (teleprompter, só a casa) e «Criar» (o antigo
 * Conteúdo Magnético: guiões, carrosséis, posts, stories e reels). Um reel criado em «Criar»
 * passa para «Gravar» com um toque. Quem não é da casa só vê «Criar», com a marca própria.
 */
export default function EstudioCasa() {
  const router = useRouter()
  const params = useSearchParams()
  const [daCasa, setDaCasa] = useState<boolean | null>(null)
  const pedido = params.get('tab') === 'criar' ? 'criar' : 'gravar'
  const peca = params.get('peca')

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/conteudo-magnetico/guiao', { cache: 'no-store', headers: await authHeaders() })
        if (r.status === 401) {
          window.location.href = `/login?redirect=${encodeURIComponent('/estudio')}`
          return
        }
        const j = await r.json()
        setDaCasa(Array.isArray(j.marcas) && j.marcas.includes('ricardo-garcia'))
      } catch {
        setDaCasa(false)
      }
    })()
  }, [])

  const ir = (tab: Separador, extra = '') => router.replace(`/estudio?tab=${tab}${extra}`, { scroll: false })

  if (daCasa === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0b0b0c] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="A carregar" />
      </main>
    )
  }

  const tab: Separador = daCasa ? pedido : 'criar'

  return (
    <div className="bg-[#0b0b0c]">
      {daCasa && (
        <nav
          aria-label="Estúdio"
          className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0b0b0c]/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur"
        >
          <div className="mx-auto flex max-w-xl gap-2" role="tablist">
            {([
              ['gravar', 'Gravar', Video],
              ['criar', 'Criar', PenLine],
            ] as const).map(([id, nome, Icone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => ir(id)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors ${
                  tab === id ? 'border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icone className="h-4 w-4" aria-hidden /> {nome}
              </button>
            ))}
          </div>
        </nav>
      )}
      {tab === 'gravar' ? (
        <Estudio pecaInicial={peca} />
      ) : (
        <PainelConteudoMagnetico onGravar={daCasa ? (id) => ir('gravar', `&peca=${encodeURIComponent(id)}`) : undefined} />
      )}
    </div>
  )
}
