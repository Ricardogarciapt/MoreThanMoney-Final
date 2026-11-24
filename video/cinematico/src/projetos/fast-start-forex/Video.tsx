import React from 'react'
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'
import { clamp, Pelicula, Etiqueta, fontTitulo, fontTexto } from '../../motor/util'
import { OURO, OURO_CLARO, FUNDO } from '../../motor/marca'
import { CENAS, BLOCO, DISCLAIMER, Cena } from './cenas'

const TitleWords: React.FC<{ texto: string }> = ({ texto }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ fontFamily: fontTitulo, fontSize: 118, lineHeight: 1, textTransform: 'uppercase', color: '#fff', letterSpacing: 1, textShadow: '0 8px 40px rgba(0,0,0,.6)' }}>
      {texto.split(' ').map((p, i) => {
        const s = spring({ frame: f - i * 4, fps, config: { damping: 14, stiffness: 160 } })
        return (
          <span key={i} style={{ display: 'inline-block', marginRight: '0.22em', opacity: s, transform: `translateY(${(1 - s) * 50}px)`, filter: `blur(${(1 - s) * 12}px)`, backgroundImage: i === texto.split(' ').length - 1 ? `linear-gradient(180deg, ${OURO_CLARO}, ${OURO})` : undefined, WebkitBackgroundClip: i === texto.split(' ').length - 1 ? 'text' : undefined, WebkitTextFillColor: i === texto.split(' ').length - 1 ? 'transparent' : undefined }}>
            {p}
          </span>
        )
      })}
    </div>
  )
}

const CenaVideo: React.FC<{ c: Cena; idx: number; total: number; bloco: string }> = ({ c, idx, total, bloco }) => {
  const f = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const zoom = interpolate(f, [0, durationInFrames], [1.0, 1.03], clamp)
  const saida = interpolate(f, [c.dur - 12, c.dur], [1, 0], clamp)
  const barra = interpolate(f, [0, c.dur], [0, 100], clamp)
  return (
    <AbsoluteFill style={{ background: FUNDO, opacity: saida, color: '#fff', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 74% 45%, rgba(210,166,60,.22), rgba(7,7,10,0) 55%), linear-gradient(180deg, ${FUNDO}, #0B0D12)` }} />
      <Pelicula />
      {/* marca */}
      <Img src={staticFile('fast-start/logo.png')} style={{ position: 'absolute', top: 60, right: 90, height: 64, opacity: 0.9 }} />
      <div style={{ position: 'absolute', left: 90, top: 70 }}>
        <Etiqueta>{`Fast Start Forex · ${bloco} · ${idx + 1}/${total}`}</Etiqueta>
      </div>
      {/* texto */}
      <div style={{ position: 'absolute', left: 90, top: 230, width: 880 }}>
        <TitleWords texto={c.titulo} />
        <div style={{ height: 6, width: 160, background: OURO, marginTop: 36, transform: `scaleX(${interpolate(f, [10, 40], [0, 1], clamp)})`, transformOrigin: 'left' }} />
        <div style={{ marginTop: 50 }}>
          {c.dicas.map((d, i) => {
            const o = interpolate(f, [40 + i * 45, 62 + i * 45], [0, 1], clamp)
            return (
              <div key={i} style={{ fontFamily: fontTexto, fontWeight: 600, fontSize: 40, color: '#fff', opacity: o, transform: `translateX(${(1 - o) * -30}px)`, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 22 }}>
                <span style={{ width: 16, height: 16, borderRadius: 8, background: OURO, display: 'inline-block' }} />
                {d}
              </div>
            )
          })}
        </div>
      </div>
      {/* gráfico de apoio (pips, lotes, checklist) */}
      {c.grafico && (() => {
        const g = interpolate(f, [90, 120], [0, 1], clamp)
        return (
          <div style={{ position: 'absolute', left: 90, bottom: 110, width: 880, opacity: g, transform: `translateY(${(1 - g) * 30}px)`, border: `2px solid ${OURO}`, borderRadius: 24, background: 'rgba(10,12,18,.88)', padding: '22px 34px', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ fontFamily: fontTitulo, fontSize: 28, color: OURO_CLARO, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{c.grafico.titulo}</div>
            {c.grafico.linhas.map(([a, b], i) => (
              <div key={i} style={{ fontFamily: fontTexto, fontSize: 26, color: '#fff', display: 'flex', justifyContent: 'space-between', gap: 24, padding: '7px 0', borderTop: i ? '1px solid rgba(210,166,60,.25)' : 'none' }}>
                <span style={{ fontWeight: 700 }}>{a}</span>
                <span style={{ color: 'rgba(255,255,255,.8)', textAlign: 'right' }}>{b}</span>
              </div>
            ))}
          </div>
        )
      })()}
      {/* ecrã do telemóvel */}
      <div style={{ position: 'absolute', right: 150, top: 150, width: 520, height: 880, borderRadius: 64, border: `3px solid ${OURO}`, background: '#000', boxShadow: '0 30px 90px rgba(0,0,0,.75), 0 0 60px rgba(210,166,60,.25)', overflow: 'hidden', transform: `scale(${zoom})` }}>
        <Img src={staticFile(`fast-start/${c.img}`)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      {/* rodapé: barra de progresso e aviso educativo */}
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 8, width: `${barra}%`, background: OURO }} />
      <div style={{ position: 'absolute', left: 90, right: 90, bottom: 34, fontFamily: fontTexto, fontSize: 22, color: 'rgba(255,255,255,.55)' }}>{DISCLAIMER}</div>
    </AbsoluteFill>
  )
}

export const VideoCenas: React.FC<{ cenas: Cena[]; bloco: string }> = ({ cenas, bloco }) => {
  let inicio = 0
  return (
    <AbsoluteFill style={{ background: FUNDO }}>
      {cenas.map((c, i) => {
        const de = inicio
        inicio += c.dur
        return (
          <Sequence key={i} from={de} durationInFrames={c.dur} layout="none">
            <CenaVideo c={c} idx={i} total={cenas.length} bloco={bloco} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

export const Video: React.FC = () => <VideoCenas cenas={CENAS} bloco={BLOCO} />
