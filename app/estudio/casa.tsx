'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Clapperboard, Images, Loader2, PenLine, Scissors, Video } from 'lucide-react'
import { authHeaders } from '@/lib/auth-token'
import Estudio from './estudio'
import PainelConteudoMagnetico from './conteudo'
import AtivosEstudio from './ativos'

const EditorVideo = dynamic(() => import('./editor'), { ssr: false })
const PainelVideocliper = dynamic(() => import('@/app/admin/videocliper/painel'), { ssr: false })

type Separador = 'gravar' | 'criar' | 'ativos' | 'editor' | 'cortes'
const SEPARADORES = [
  ['gravar', 'Gravar', Video],
  ['criar', 'Criar', PenLine],
  ['ativos', 'Ativos', Images],
  ['editor', 'Editor', Clapperboard],
  ['cortes', 'Cortes', Scissors],
] as const

/**
 * O Estúdio tem cinco separadores: «Gravar» (teleprompter), «Criar» (o antigo Conteúdo Magnético:
 * guiões, carrosséis, posts, stories e reels), «Ativos» (fotos/vídeos/áudios), «Editor» (timeline
 * de vídeo) e «Cortes» (o antigo /admin/videocliper). O admin vê todos; outras pessoas só os que o
 * dono lhes deu no backoffice (Gestão → Acessos → Estúdio). Sem nenhum: «área privada».
 */
export default function EstudioCasa() {
  const router = useRouter()
  const params = useSearchParams()
  const [areas, setAreas] = useState<Separador[] | null>(null)
  const t = params.get('tab') as Separador | null
  const peca = params.get('peca')

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/estudio/eu', { cache: 'no-store', headers: await authHeaders() })
        if (r.status === 401) {
          window.location.href = `/login?redirect=${encodeURIComponent('/estudio')}`
          return
        }
        const j = await r.json().catch(() => ({}))
        setAreas(Array.isArray(j.areas) ? j.areas : [])
      } catch {
        setAreas([])
      }
    })()
  }, [])

  const ir = (tab: Separador, extra = '') => router.replace(`/estudio?tab=${tab}${extra}`, { scroll: false })

  if (areas === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#0b0b0c] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-label="A carregar" />
      </main>
    )
  }

  if (!areas.length) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#0b0b0c] px-6 text-center text-zinc-300">
        <h1 className="text-xl font-semibold text-white">Estúdio</h1>
        <p className="max-w-xs text-sm text-zinc-400">Esta área é privada. Se fazes parte da equipa, pede acesso ao Ricardo.</p>
        <a href="/member-area" className="min-h-11 rounded-xl border border-[#D2A63C]/50 px-4 py-2.5 text-sm text-[#E9C46A]">Voltar à área de membro</a>
      </main>
    )
  }

  const tab: Separador = t && areas.includes(t) ? t : areas[0]

  return (
    <div className="bg-[#0b0b0c]">
      {(
        <nav
          aria-label="Estúdio"
          className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0b0b0c]/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur"
        >
          <div className="mx-auto flex max-w-2xl gap-1.5 overflow-x-auto" role="tablist">
            {SEPARADORES.filter(([id]) => areas.includes(id)).map(([id, nome, Icone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => ir(id)}
                className={`flex min-h-11 min-w-[64px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-medium transition-colors ${
                  tab === id ? 'border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icone className="h-4 w-4 shrink-0" aria-hidden /> <span className="hidden min-[420px]:inline">{nome}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      {tab === 'gravar' ? (
        <Estudio pecaInicial={peca} />
      ) : tab === 'ativos' ? (
        <AtivosEstudio pecaInicial={peca} />
      ) : tab === 'editor' ? (
        <EditorVideo />
      ) : tab === 'cortes' ? (
        <div className="min-h-dvh"><PainelVideocliper /></div>
      ) : (
        <PainelConteudoMagnetico onGravar={(id) => ir('gravar', `&peca=${encodeURIComponent(id)}`)} />
      )}
    </div>
  )
}
