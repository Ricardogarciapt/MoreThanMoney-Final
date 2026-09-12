'use client'

import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, X, RotateCcw, Check } from 'lucide-react'

/**
 * O EDITOR ARRASTÁVEL.
 *
 * Mostra as camadas em HTML, à escala da pré-visualização, e deixa arrastá-las com o dedo ou
 * com o rato. Ao aplicar, manda as posições ao servidor e é ELE que desenha o ficheiro final.
 *
 * ── porque é que a pré-visualização não é o resultado ────────────────────────
 *
 * A imagem final é desenhada no servidor com a fonte da casa e o mesmo motor de sempre. Aqui é
 * HTML: aproxima-se bem — mesma tipografia, mesmas proporções — mas a quebra de linha e o
 * espaçamento podem cair um pixel ao lado. Fingir que são a mesma coisa era prometer uma
 * fidelidade que não existe; por isso o botão diz «Aplicar» e não «Guardar», e o resultado
 * aparece a seguir.
 *
 * ── as coordenadas ──────────────────────────────────────────────────────────
 *
 * Guardam-se em FRACÇÕES de 0 a 1, não em píxeis. Esta superfície tem uns 340px de largura e o
 * cartão sai a 1080: píxeis punham tudo a um terço do sítio certo.
 */

export interface Posicoes {
  texto?: { x: number; y: number } | null
  destaque?: { x: number; y: number } | null
  logo?: { x: number; y: number } | null
}

export interface DadosEditor {
  hook: string
  cta?: string
  cor: string
  assinatura: string
  fundo?: string | null
  destaque?: string | null
  destaqueEscala?: number
  logoUrl?: string | null
  formato: 'post' | 'reel'
  posicoes?: Posicoes | null
}

type Alvo = 'texto' | 'destaque' | 'logo'

/** Parte a frase em duas metades de peso parecido — o mesmo critério do desenho final. */
function duasFaixas(t: string): [string, string] {
  const p = t.trim().split(/\s+/)
  if (p.length < 2) return [t, '']
  let melhor = 1
  let menor = Infinity
  for (let i = 1; i < p.length; i++) {
    const d = Math.abs(p.slice(0, i).join(' ').length - t.length / 2)
    if (d < menor) { menor = d; melhor = i }
  }
  return [p.slice(0, melhor).join(' '), p.slice(melhor).join(' ')]
}

export default function EditorArrastavel({
  dados,
  aoAplicar,
  aoFechar,
}: {
  dados: DadosEditor
  aoAplicar: (p: Posicoes) => Promise<void>
  aoFechar: () => void
}) {
  const palco = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Posicoes>(dados.posicoes ?? {})
  const [aArrastar, setAArrastar] = useState<Alvo | null>(null)
  const [aAplicar, setAAplicar] = useState(false)
  /**
   * A largura REAL do palco, medida.
   *
   * O corpo da letra é uma fracção da largura, e aqui não há `cqw` sem declarar um
   * contentor de consulta — que o Satori do lado do servidor não conhece. Medir e
   * multiplicar dá o mesmo resultado e funciona nos dois lados.
   */
  const [larguraPalco, setLarguraPalco] = useState(340)

  const alto = dados.formato === 'reel'
  const [cima, baixo] = duasFaixas((dados.hook || '').toUpperCase())

  // O corpo segue a largura, como no desenho final: uma faixa TEM de caber numa linha.
  const maisLonga = Math.max(cima.length, baixo.length, 1)
  const corpoFrac = Math.max(0.06, Math.min(0.2, 0.93 / (maisLonga * 0.46)))

  /**
   * Onde o elemento está agora, em fracção.
   *
   * Sem posição arrastada, devolve-se a de omissão — a mesma que o desenho usa — para o
   * elemento não saltar para o canto no instante em que se lhe toca.
   */
  const onde = (a: Alvo): { x: number; y: number } => {
    const p = pos[a]
    if (p) return p
    if (a === 'texto') return { x: 0.037, y: dados.fundo ? 0.3 : 0.36 }
    if (a === 'destaque') return { x: 0.42, y: 0.08 }
    return { x: 0.78, y: alto ? 0.9 : 0.88 }
  }

  const mover = useCallback(
    (alvo: Alvo, clienteX: number, clienteY: number) => {
      const r = palco.current?.getBoundingClientRect()
      if (!r) return
      // Travado entre −0,1 e 1: deixa sangrar um pouco pela borda, que é parte do estilo, mas
      // não deixa perder o elemento fora do cartão sem forma de o trazer de volta.
      const x = Math.max(-0.1, Math.min(1, (clienteX - r.left) / r.width))
      const y = Math.max(-0.1, Math.min(1, (clienteY - r.top) / r.height))
      setPos((p) => ({ ...p, [alvo]: { x, y } }))
    },
    [],
  )

  // Os ouvintes vivem na JANELA e não no elemento: arrastar depressa tira o ponteiro de cima
  // dele, e com os ouvintes no elemento o arrasto largava a meio.
  useEffect(() => {
    if (!aArrastar) return
    const rato = (e: MouseEvent) => mover(aArrastar, e.clientX, e.clientY)
    const dedo = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) { e.preventDefault(); mover(aArrastar, t.clientX, t.clientY) }
    }
    const largar = () => setAArrastar(null)

    window.addEventListener('mousemove', rato)
    window.addEventListener('mouseup', largar)
    // `passive: false` para o `preventDefault` valer: sem ele o telemóvel desliza a página
    // inteira enquanto se tenta arrastar o texto.
    window.addEventListener('touchmove', dedo, { passive: false })
    window.addEventListener('touchend', largar)
    return () => {
      window.removeEventListener('mousemove', rato)
      window.removeEventListener('mouseup', largar)
      window.removeEventListener('touchmove', dedo)
      window.removeEventListener('touchend', largar)
    }
  }, [aArrastar, mover])

  useEffect(() => {
    const medir = () => setLarguraPalco(palco.current?.getBoundingClientRect().width || 340)
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  const pegar = (a: Alvo) => ({
    onMouseDown: (e: ReactMouseEvent) => { e.preventDefault(); setAArrastar(a) },
    onTouchStart: () => setAArrastar(a),
    style: { cursor: aArrastar === a ? 'grabbing' : 'grab', touchAction: 'none' as const },
  })

  const aplicar = async () => {
    setAAplicar(true)
    try {
      await aoAplicar(pos)
    } finally {
      setAAplicar(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={aoFechar} className="rounded-lg p-2 text-white/70 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <p className="text-[13px] font-semibold text-white">Arrasta para mover</p>
        <button
          onClick={() => setPos({})}
          title="Voltar às posições de origem"
          className="rounded-lg p-2 text-white/70 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
        <div
          ref={palco}
          className="relative w-full max-w-[340px] select-none overflow-hidden rounded-xl border border-white/15 bg-[#141414]"
          style={{ aspectRatio: alto ? '1080 / 1920' : '1080 / 1350' }}
        >
          {dados.fundo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dados.fundo} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {dados.fundo && (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.2) 62%, rgba(0,0,0,0.72) 100%)',
              }}
            />
          )}

          {/* A pessoa: entre o fundo e o texto, como no desenho final. */}
          {dados.destaque && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...pegar('destaque')}
              src={dados.destaque}
              alt=""
              className={`absolute object-contain ${aArrastar === 'destaque' ? 'ring-2 ring-[#D2A63C]' : ''}`}
              style={{
                left: `${onde('destaque').x * 100}%`,
                top: `${onde('destaque').y * 100}%`,
                height: `${(dados.destaqueEscala ?? 0.92) * 100}%`,
                ...pegar('destaque').style,
              }}
              draggable={false}
            />
          )}

          {/* O texto: as duas faixas movem-se juntas, porque são uma frase partida. */}
          <div
            {...pegar('texto')}
            className={`absolute leading-none ${aArrastar === 'texto' ? 'ring-2 ring-[#D2A63C]' : ''}`}
            style={{
              left: `${onde('texto').x * 100}%`,
              top: `${onde('texto').y * 100}%`,
              width: '93%',
              ...pegar('texto').style,
            }}
          >
            <div
              style={{
                color: dados.cor,
                fontFamily: 'Anton, Impact, sans-serif',
                fontSize: `${Math.round(corpoFrac * larguraPalco)}px`,
                fontStyle: 'italic',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {cima}
            </div>
            <div
              style={{
                color: '#fff',
                fontFamily: 'Anton, Impact, sans-serif',
                fontSize: `${Math.round(corpoFrac * larguraPalco)}px`,
                fontStyle: 'italic',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                marginTop: '0.22em',
              }}
            >
              {baixo}
            </div>
          </div>

          {dados.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...pegar('logo')}
              src={dados.logoUrl}
              alt=""
              className={`absolute h-[7%] object-contain opacity-85 ${aArrastar === 'logo' ? 'ring-2 ring-[#D2A63C]' : ''}`}
              style={{ left: `${onde('logo').x * 100}%`, top: `${onde('logo').y * 100}%`, ...pegar('logo').style }}
              draggable={false}
            />
          )}
        </div>
      </div>

      <div className="px-4 pb-6 pt-3">
        {/* Dito à cabeça, porque a diferença entre isto e o ficheiro final é real e pequena — e
            uma surpresa pequena numa peça que já foi publicada custa mais do que um aviso. */}
        <p className="mb-2 text-center text-[11.5px] leading-snug text-white/40">
          Isto é uma aproximação. A imagem final é desenhada a seguir, com a tipografia certa.
        </p>
        <button
          onClick={() => void aplicar()}
          disabled={aAplicar}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D2A63C] py-3 text-[15px] font-bold text-black disabled:opacity-40"
        >
          {aAplicar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {aAplicar ? 'A desenhar…' : 'Aplicar'}
        </button>
      </div>
    </div>
  )
}
