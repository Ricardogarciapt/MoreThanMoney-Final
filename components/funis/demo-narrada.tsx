'use client'

/**
 * Demo narrada das páginas /f/* quando o link veio de um agente (`?ag=`) ou de um canal da máquina
 * (`utm_source`). O ecrã da app passa cena a cena mesmo sem som; com «Ouvir», a voz do Ricardo
 * conduz as cenas e as legendas. Guiões em `lib/funis-narracao.ts`, áudio em /api/narracao.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Pause, Play } from 'lucide-react'
import type { FunilPublicidade } from '@/lib/funis-publicidade'
import { CANAIS_COM_NARRACAO, SEGMENTOS, guiao, segmentoDe } from '@/lib/funis-narracao'
import { rastrear } from '@/lib/funis-pixel-browser'

export default function DemoNarrada({ funil }: { funil: FunilPublicidade }) {
  const sp = useSearchParams()
  const ag = sp.get('ag')
  const fonte = (sp.get('utm_source') ?? '').toLowerCase()
  const ativa = Boolean(ag) || CANAIS_COM_NARRACAO.has(fonte)
  const seg = segmentoDe(funil, sp.get('utm_campaign'))
  const s = SEGMENTOS[seg]
  const frases = useMemo(() => guiao(seg, ag), [seg, ag])
  // Onde começa cada frase, em fração do áudio (proporcional ao texto): chega para sincronizar.
  const marcas = useMemo(() => {
    const total = frases.reduce((n, f) => n + f.length, 0)
    let acc = 0
    return frases.map((f) => { const ini = acc / total; acc += f.length; return ini })
  }, [frases])

  const audio = useRef<HTMLAudioElement>(null)
  const [frase, setFrase] = useState(0)
  const [aTocar, setATocar] = useState(false)
  const [semVoz, setSemVoz] = useState(false)
  const [progresso, setProgresso] = useState(0)

  // Sem som, as cenas passam sozinhas (a página nunca fica parada), salvo movimento reduzido.
  useEffect(() => {
    if (!ativa || aTocar) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setFrase((i) => (i + 1) % frases.length), 4200)
    return () => clearInterval(t)
  }, [ativa, aTocar, frases.length])

  if (!ativa) return null

  // frase 0 = abertura (mostra a 1.ª cena), 1..n = cenas, última = fecho (mostra a última cena).
  const cena = s.cenas[Math.min(Math.max(frase - 1, 0), s.cenas.length - 1)]

  function alternar() {
    const a = audio.current
    if (!a) return
    if (aTocar) { a.pause(); setATocar(false); return }
    if (a.ended || a.currentTime === 0) { a.currentTime = 0; setFrase(0) }
    a.play().then(() => { setATocar(true); rastrear('ViewContent', { content_name: `narracao-${seg}`, content_category: funil }) })
      .catch(() => setSemVoz(true))
  }

  function aoAvancar() {
    const a = audio.current
    if (!a || !a.duration) return
    const p = a.currentTime / a.duration
    setProgresso(p)
    let i = 0
    while (i + 1 < marcas.length && marcas[i + 1] <= p) i++
    setFrase(i)
  }

  return (
    <section aria-label="Demo narrada" className="border-b border-white/10 bg-gradient-to-b from-[#14110a] to-[#0A0A0B]">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] md:py-12">
        <div className="order-2 md:order-1">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#E9C46A]">Em 40 segundos</p>
          <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">{s.titulo}</h2>
          <p className="mt-4 min-h-[4.5rem] max-w-[52ch] text-[17px] leading-relaxed text-zinc-200" aria-live="polite">«{frases[frase]}»</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!semVoz && (
              <button onClick={alternar} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-5 py-3 font-bold text-black">
                {aTocar ? <Pause size={18} /> : <Play size={18} />}
                {aTocar ? 'Pausa' : 'Ouvir o Ricardo'}
              </button>
            )}
            <a href="#contacto-topo" className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white">Quero avançar</a>
          </div>
          <div className="mt-5 flex max-w-xs gap-1.5" aria-hidden>
            {frases.map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= frase ? 'bg-[#D2A63C]' : 'bg-white/15'}`} />
            ))}
          </div>
          {aTocar && <p className="mt-2 text-xs text-zinc-500">{Math.round(progresso * 100)} %</p>}
          <p className="mt-4 text-[11.5px] text-zinc-500">Voz do Ricardo gerada por IA a partir da voz dele. Conteúdo educativo, sem promessas de resultados.</p>
          <audio ref={audio} src={`/api/narracao?s=${seg}${ag ? `&ag=${encodeURIComponent(ag)}` : ''}`} preload="none"
            onTimeUpdate={aoAvancar} onEnded={() => { setATocar(false); setFrase(frases.length - 1) }} onError={() => setSemVoz(true)} />
        </div>
        {/* O ecrã: moldura de telemóvel com a cena atual, em fundido. */}
        <div className="order-1 mx-auto md:order-2">
          <div className="relative h-[420px] w-[214px] overflow-hidden rounded-[2.2rem] border-[6px] border-zinc-800 bg-black shadow-[0_0_60px_rgba(210,166,60,0.18)] sm:h-[460px] sm:w-[234px]">
            {s.cenas.map((c) => (
              <Image key={c.imagem} src={c.imagem} alt={c.legenda} fill sizes="240px"
                className={`object-cover transition-all duration-700 ${c === cena ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`} />
            ))}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
              <p className="text-sm font-semibold text-white">{cena.legenda}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
