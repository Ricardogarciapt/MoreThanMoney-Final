import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { clamp, fontTexto, fontTitulo, Etiqueta } from '../../../motor/util'
import { LOGO } from '../../../motor/marca'
import { OURO, OURO_CLARO } from '../tempo'
import { ouro } from '../../../motor/marca'

export const Cta: React.FC = () => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: f - 4, fps, config: { damping: 12, stiffness: 90 } })
  const t1 = spring({ frame: f - 30, fps, config: { damping: 16 } })
  const t2 = spring({ frame: f - 50, fps, config: { damping: 16 } })
  const t3 = spring({ frame: f - 70, fps, config: { damping: 16 } })
  const sai = interpolate(f, [190, 210], [1, 0], clamp)
  const brilho = interpolate(f, [60, 120], [-30, 130], clamp)
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, #1c160a, #050506 65%)', opacity: sai, alignItems: 'center', justifyContent: 'center', fontFamily: fontTexto }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: 450, background: `radial-gradient(circle, color-mix(in srgb, ${OURO} ${25 * logo}%, transparent), transparent 60%)`, top: -60 }} />
      {LOGO && <Img src={staticFile(LOGO)} style={{ position: 'absolute', top: 20, width: 560, transform: `scale(${0.7 + 0.3 * logo})`, opacity: logo, filter: `drop-shadow(0 0 ${40 * logo}px color-mix(in srgb, ${OURO_CLARO} 60%, transparent))` }} />}
      <div style={{ position: 'absolute', top: 540, textAlign: 'center' }}>
        <Etiqueta style={{ opacity: t1, transform: `translateY(${(1 - t1) * 20}px)` }}>IA · Automação · Formação</Etiqueta>
        <div style={{ fontFamily: fontTitulo, textTransform: 'uppercase', fontSize: 112, color: '#fff', marginTop: 16, opacity: t2, transform: `translateY(${(1 - t2) * 30}px)`, backgroundImage: `linear-gradient(100deg, #fff ${brilho - 20}%, ${OURO_CLARO} ${brilho}%, #fff ${brilho + 20}%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Marca o teu diagnóstico</div>
        <div style={{ display: 'inline-block', marginTop: 34, padding: '20px 44px', borderRadius: 18, background: `linear-gradient(180deg, ${OURO_CLARO}, ${OURO})`, color: '#111', fontWeight: 800, fontSize: 40, opacity: t3, transform: `scale(${0.9 + 0.1 * t3})`, boxShadow: `0 0 ${40 + 20 * Math.sin(f * 0.2)}px ${ouro(0.55)}` }}>morethanmoney.pt/solucoes</div>
      </div>
      <div style={{ position: 'absolute', bottom: 34, color: '#6d6759', fontSize: 18 }}>More Than Money · Soluções de IA para pequenos negócios</div>
    </AbsoluteFill>
  )
}
