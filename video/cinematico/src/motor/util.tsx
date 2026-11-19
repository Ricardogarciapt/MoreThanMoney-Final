import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion'
import { OURO, OURO_CLARO } from './marca'

export const rng = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
export const ease = Easing.bezier(0.16, 1, 0.3, 1)

export const fontTitulo = "'Anton', 'Inter Display', sans-serif"
export const fontTexto = "'Inter Display', 'Inter', sans-serif"

/** Linha de título com entrada palavra-a-palavra (desfoque + subida) e saída. */
export const Titulo: React.FC<{
  texto: string; de: number; ate: number; size?: number; y?: number; cor?: string; destaque?: string[]; align?: 'center' | 'left'; x?: number; peso?: 'titulo' | 'texto'
}> = ({ texto, de, ate, size = 120, y = 0, cor = '#fff', destaque = [], align = 'center', x = 0, peso = 'titulo' }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (f < de - 1 || f > ate + 12) return null
  const palavras = texto.split(' ')
  const saida = interpolate(f, [ate, ate + 10], [1, 0], clamp)
  return (
    <div style={{ position: 'absolute', left: align === 'center' ? 0 : x, right: align === 'center' ? 0 : undefined, width: align === 'left' ? 1100 : undefined, top: '50%', transform: `translateY(calc(-50% + ${y}px))`, textAlign: align, opacity: saida, filter: `blur(${(1 - saida) * 12}px)` }}>
      <div style={{ fontFamily: peso === 'titulo' ? fontTitulo : fontTexto, fontWeight: peso === 'titulo' ? 400 : 600, fontSize: size, lineHeight: 1.02, letterSpacing: peso === 'titulo' ? 1 : -1, textTransform: peso === 'titulo' ? 'uppercase' : 'none', color: cor, textShadow: '0 8px 40px rgba(0,0,0,.6)' }}>
        {palavras.map((p, i) => {
          const s = spring({ frame: f - de - i * 3, fps, config: { damping: 14, stiffness: 160 } })
          const limpa = p.replace(/[.,?!]/g, '')
          const ouro = destaque.includes(limpa)
          return (
            <span key={i} style={{ display: 'inline-block', marginRight: '0.22em', opacity: s, transform: `translateY(${(1 - s) * 50}px) scale(${0.9 + 0.1 * s})`, filter: `blur(${(1 - s) * 14}px)`, color: ouro ? OURO_CLARO : undefined, backgroundImage: ouro ? `linear-gradient(180deg, ${OURO_CLARO}, ${OURO})` : undefined, WebkitBackgroundClip: ouro ? 'text' : undefined, WebkitTextFillColor: ouro ? 'transparent' : undefined }}>
              {p}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Grão de película + vinheta + leve tremor de luz. */
export const Pelicula: React.FC = () => {
  const f = useCurrentFrame()
  const flick = 0.03 * Math.sin(f * 1.7) + 0.02 * Math.sin(f * 0.37)
  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.09, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
        <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 97} stitchTiles="stitch" /></filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.75) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: Math.max(0, flick), pointerEvents: 'none' }} />
    </>
  )
}

/** Clarão de passagem centrado no frame `em`. */
export const Clarao: React.FC<{ em: number; cor?: string; dur?: number }> = ({ em, cor = '#fff', dur = 8 }) => {
  const f = useCurrentFrame()
  const o = interpolate(f, [em - dur / 2, em, em + dur], [0, 1, 0], clamp)
  if (o <= 0) return null
  return <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 50%, ${cor}, ${OURO} 40%, rgba(0,0,0,0) 85%)`, opacity: o, mixBlendMode: 'screen' }} />
}

export const Etiqueta: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: fontTexto, fontWeight: 600, fontSize: 22, letterSpacing: 6, textTransform: 'uppercase', color: OURO_CLARO, ...style }}>{children}</div>
)

import { OffthreadVideo, staticFile, Sequence } from 'remotion'
import { ouro } from './marca'
/** Plano real (stock) com grade cinematográfica, zoom lento e entrada/saída suaves. */
export const Plano: React.FC<{ src: string; de: number; dur: number; grade?: 'noite' | 'frio' | 'ouro' | 'neutro'; zoom?: [number, number]; escuro?: number; desde?: number; fade?: number }> = ({ src, de, dur, grade = 'neutro', zoom = [1.04, 1.14], escuro = 0, desde = 0, fade = 8 }) => (
  <Sequence from={de} durationInFrames={dur} layout="none">
    <PlanoInner src={src} dur={dur} grade={grade} zoom={zoom} escuro={escuro} desde={desde} fade={fade} />
  </Sequence>
)
const GRADES = {
  noite: 'saturate(.55) contrast(1.15) brightness(.62) hue-rotate(-12deg)',
  frio: 'saturate(.35) contrast(1.2) brightness(.7)',
  ouro: 'saturate(1.15) contrast(1.1) brightness(.92) sepia(.25)',
  neutro: 'saturate(.95) contrast(1.08) brightness(.9)',
}
const PlanoInner: React.FC<{ src: string; dur: number; grade: keyof typeof GRADES; zoom: [number, number]; escuro: number; desde: number; fade: number }> = ({ src, dur, grade, zoom, escuro, desde, fade }) => {
  const f = useCurrentFrame()
  const z = interpolate(f, [0, dur], zoom)
  const o = interpolate(f, [0, fade, dur - fade, dur], [0, 1, 1, 0], clamp)
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: o }}>
      <OffthreadVideo src={staticFile(`stock/${src}.mp4`)} startFrom={desde} muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, filter: GRADES[grade] }} />
      {grade === 'ouro' && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${ouro(0.18)}, rgba(0,0,0,.25))`, mixBlendMode: 'overlay' }} />}
      {grade === 'noite' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,20,60,.35)', mixBlendMode: 'multiply' }} />}
      <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${escuro})` }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.7) 100%)' }} />
    </div>
  )
}
