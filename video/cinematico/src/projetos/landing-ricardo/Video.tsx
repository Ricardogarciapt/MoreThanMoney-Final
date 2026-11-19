import React from 'react'
import { AbsoluteFill, Sequence, staticFile, OffthreadVideo, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { LightLeak } from '@remotion/light-leaks'
import { T, f, INTRO, VOZ, TOTAL, FPS, CIANO, CIANO_CLARO, AZUL, MTM_OURO as OURO, MTM_OURO_CLARO as OURO_CLARO, FUNDO } from './tempo'
import { FONTES_CSS } from '../../motor/marca'
import { Pelicula, Clarao, clamp, ease, rng } from '../../motor/util'

const fontes = `
${FONTES_CSS}`

const ANTON = "'Anton', sans-serif"
const OSW = "'Oswald', sans-serif"

/* ── Intervalos em que o Ricardo passa a janela pequena (cortes para imagem) ── */
const PIP: [number, number][] = [
  [T.farda[0] + 0.1, T.farda[1]],
  [T.nov[0] + 0.1, T.barco[1]],
  [T.codigo[0] + 0.1, T.codigo[1]],
  [T.pilares[0] + 0.1, T.pilares[1]],
  [T.garantias[0] + 0.1, T.preco[1]],
]
function modoPip(fr: number) {
  let m = 0
  for (const [a, b] of PIP) {
    const A = f(a), B = f(b)
    m = Math.max(m, interpolate(fr, [A - 6, A + 10, B - 10, B + 6], [0, 1, 1, 0], { ...clamp, easing: ease }))
  }
  return m
}

/* ── O Ricardo (clone HeyGen), sempre a falar; encolhe para janela nos cortes ── */
const Ricardo: React.FC = () => {
  const fr = useCurrentFrame()
  const m = modoPip(fr)
  const w = interpolate(m, [0, 1], [1920, 520])
  const h = (w * 9) / 16
  const x = interpolate(m, [0, 1], [0, 1920 - 520 - 60])
  const y = interpolate(m, [0, 1], [0, 1080 - h - 70])
  const push = interpolate(fr, [f(0), f(VOZ)], [1.0, 1.08])
  const entra = interpolate(fr, [f(0) - 14, f(0) + 4], [0, 1], clamp)
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: m * 22, overflow: 'hidden', opacity: entra, boxShadow: m > 0.05 ? `0 30px 80px rgba(0,0,0,.6), 0 0 0 ${2 * m}px ${CIANO_CLARO}` : undefined, zIndex: 5 }}>
      <Sequence from={f(0)} layout="none">
        <OffthreadVideo src={staticFile('stock/landing-ricardo/raw.mp4')} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${push})`, filter: 'contrast(1.06) saturate(1.05)' }} />
      </Sequence>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,10,26,.0) 60%, rgba(4,10,26,.45))' }} />
    </div>
  )
}

/* ── Fotografia de capítulo a ecrã inteiro: Ken Burns, grade, entrada com deslize ── */
const Foto: React.FC<{ src: string; de: number; ate: number; grade: 'frio' | 'azul' | 'ouro'; dir?: 1 | -1 }> = ({ src, de, ate, grade, dir = 1 }) => {
  const fr = useCurrentFrame()
  const A = f(de), B = f(ate)
  if (fr < A - 12 || fr > B + 12) return null
  const o = interpolate(fr, [A - 12, A + 6, B - 6, B + 12], [0, 1, 1, 0], clamp)
  const desl = interpolate(fr, [A - 12, A + 10], [dir * 160, 0], { ...clamp, easing: ease })
  const z = interpolate(fr, [A, B], [1.12, 1.0])
  const filtro = grade === 'frio' ? 'grayscale(1) contrast(1.2) brightness(.72)' : grade === 'ouro' ? 'saturate(1.1) contrast(1.08) brightness(.8) sepia(.18)' : 'saturate(.9) contrast(1.1) brightness(.75)'
  return (
    <AbsoluteFill style={{ opacity: o, overflow: 'hidden', zIndex: 2 }}>
      <Img src={staticFile(`marca/ricardogarciapt/${src}`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 25%', transform: `translateX(${desl}px) scale(${z})`, filter: filtro }} />
      {grade === 'azul' && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(120deg, rgba(18,86,190,.45), rgba(4,10,26,.2) 60%)`, mixBlendMode: 'multiply' }} />}
      {grade === 'ouro' && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(120deg, rgba(210,166,60,.25), rgba(0,0,0,.25))`, mixBlendMode: 'overlay' }} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,7,10,.85) 0%, rgba(7,7,10,.35) 55%, rgba(7,7,10,.1) 100%)' }} />
    </AbsoluteFill>
  )
}

/* ── Texto cinético (palavra a palavra, mola + desfoque) ── */
const Kinetico: React.FC<{ linhas: { t: string; cor?: string }[]; de: number; ate: number; x?: number; y?: number; size?: number; pincel?: number; align?: 'left' | 'center' }> = ({ linhas, de, ate, x = 120, y = 380, size = 120, pincel = -1, align = 'left' }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(de), B = f(ate)
  if (fr < A - 2 || fr > B + 14) return null
  const saida = interpolate(fr, [B, B + 12], [1, 0], clamp)
  let k = 0
  return (
    <div style={{ position: 'absolute', left: align === 'center' ? 0 : x, right: align === 'center' ? 0 : undefined, top: y, textAlign: align, opacity: saida, filter: `blur(${(1 - saida) * 10}px)`, zIndex: 8 }}>
      {linhas.map((l, li) => {
        const sP = spring({ frame: fr - A - li * 6, fps, config: { damping: 18, stiffness: 120 } })
        return (
          <div key={li} style={{ position: 'relative', display: align === 'center' ? 'block' : 'table', margin: align === 'center' ? '0 auto' : undefined, marginBottom: 4 }}>
            {li === pincel && <div style={{ position: 'absolute', left: -24, right: -24, top: '10%', bottom: '4%', background: `linear-gradient(90deg, ${CIANO_CLARO}, ${AZUL})`, transform: `skew(-8deg) scaleX(${sP})`, transformOrigin: 'left', zIndex: -1 }} />}
            <span style={{ fontFamily: ANTON, fontStyle: 'italic', textTransform: 'uppercase', fontSize: size, lineHeight: 1.02, color: l.cor || '#fff', textShadow: '0 10px 40px rgba(0,0,0,.6)' }}>
              {l.t.split(' ').map((p, i) => {
                const s = spring({ frame: fr - A - (k++) * 3, fps, config: { damping: 14, stiffness: 170 } })
                return <span key={i} style={{ display: 'inline-block', marginRight: '0.22em', opacity: s, transform: `translateY(${(1 - s) * 60}px) scale(${0.88 + 0.12 * s})`, filter: `blur(${(1 - s) * 14}px)` }}>{p}</span>
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const Capitulo: React.FC<{ n: string; de: number; ate: number; cor?: string }> = ({ n, de, ate, cor = CIANO_CLARO }) => {
  const fr = useCurrentFrame()
  const A = f(de), B = f(ate)
  if (fr < A || fr > B + 10) return null
  const o = interpolate(fr, [A, A + 12, B, B + 10], [0, 1, 1, 0], clamp)
  const tr = interpolate(fr, [A, A + 20], [-40, 0], { ...clamp, easing: ease })
  return (
    <div style={{ position: 'absolute', left: 120, top: 200, opacity: o, transform: `translateX(${tr}px)`, zIndex: 8, display: 'flex', alignItems: 'center', gap: 18 }}>
      <span style={{ fontFamily: ANTON, fontSize: 130, lineHeight: 0.8, color: 'transparent', WebkitTextStroke: `2px ${cor}` }}>{n}</span>
      <span style={{ width: interpolate(fr, [A + 6, A + 30], [0, 220], clamp), height: 2, background: cor }} />
    </div>
  )
}

/* ── Rodapé com nome (lower third) ── */
const Nome: React.FC = () => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(T.ola[0]), B = f(T.farda[0])
  if (fr < A || fr > B + 12) return null
  const s = spring({ frame: fr - A, fps, config: { damping: 16 } })
  const o = interpolate(fr, [B, B + 12], [1, 0], clamp)
  return (
    <div style={{ position: 'absolute', left: 90, bottom: 110, opacity: o, zIndex: 9, display: 'flex', alignItems: 'center', gap: 20, transform: `translateX(${(1 - s) * -120}px)` }}>
      <Img src={staticFile('marca/ricardogarciapt/logo-rg-monograma-transparente.png')} style={{ width: 120, height: 120 }} />
      <div>
        <div style={{ position: 'relative', fontFamily: ANTON, fontStyle: 'italic', fontSize: 64, textTransform: 'uppercase', lineHeight: 1 }}>
          <span style={{ position: 'absolute', left: -12, right: -12, top: 8, bottom: 2, background: `linear-gradient(90deg, ${CIANO_CLARO}, ${AZUL})`, transform: `skew(-8deg) scaleX(${s})`, transformOrigin: 'left', zIndex: -1 }} />
          Ricardo <span style={{ color: '#fff' }}>Garcia</span>
        </div>
        <div style={{ fontFamily: OSW, fontSize: 30, color: '#cfd6e0', marginTop: 8 }}>@ricardogarciapt · fundador da MoreThanMoney</div>
      </div>
    </div>
  )
}

/* ── CGI 2D: partículas que se juntam e formam rede (abertura) ── */
const Particulas: React.FC<{ de: number; ate: number; alvo?: 'centro' | 'livre'; cor?: 'misto' | 'ouro' }> = ({ de, ate, alvo = 'centro', cor = 'misto' }) => {
  const fr = useCurrentFrame()
  if (fr < de || fr > ate) return null
  const r = rng(42)
  const N = 140
  const t = interpolate(fr, [de, ate], [0, 1])
  const junta = alvo === 'centro' ? interpolate(fr, [de, de + 55], [0, 1], { ...clamp, easing: ease }) : 0
  const pts = Array.from({ length: N }, (_, i) => {
    const x0 = r() * 1920, y0 = r() * 1080, ang = r() * Math.PI * 2, rad = 160 + r() * 260
    const tx = 960 + Math.cos(ang + t * 1.2) * rad, ty = 470 + Math.sin(ang + t * 1.2) * rad * 0.55
    const dx = Math.sin(fr / 40 + i) * 30, dy = Math.cos(fr / 50 + i) * 30
    return { x: x0 + (tx - x0) * junta + dx, y: y0 + (ty - y0) * junta + dy, z: r(), i }
  })
  const o = interpolate(fr, [de, de + 10, ate - 15, ate], [0, 1, 1, 0], clamp)
  const linhas: JSX.Element[] = []
  for (let i = 0; i < N; i += 2) for (let j = i + 1; j < Math.min(N, i + 9); j++) {
    const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y)
    if (d < 170) linhas.push(<line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={cor === 'ouro' || a.x > 960 ? OURO : CIANO_CLARO} strokeOpacity={(1 - d / 170) * 0.45} strokeWidth={1} />)
  }
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: o, zIndex: 3 }}>
      {linhas}
      {pts.map((p) => <circle key={p.i} cx={p.x} cy={p.y} r={1.5 + p.z * 2.5} fill={cor === 'ouro' || p.x > 960 ? OURO_CLARO : CIANO_CLARO} opacity={0.6 + p.z * 0.4} />)}
    </svg>
  )
}

/* ── Abertura: rede CGI + monograma + nome ── */
const Abertura: React.FC = () => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fim = f(0)
  if (fr > fim + 10) return null
  const s = spring({ frame: fr - 22, fps, config: { damping: 12, stiffness: 90 } })
  const s2 = spring({ frame: fr - 40, fps, config: { damping: 16 } })
  const o = interpolate(fr, [fim - 12, fim + 8], [1, 0], clamp)
  const brilho = interpolate(fr, [20, 34, 60], [0, 1, 0.35], clamp)
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 50% 40%, #0b1a3a, ${FUNDO} 70%)`, opacity: o, zIndex: 20 }}>
      <Particulas de={0} ate={fim + 10} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 380, height: 380, transform: `scale(${0.6 + 0.4 * s}) rotate(${(1 - s) * -8}deg)`, opacity: s, filter: `drop-shadow(0 0 ${60 * brilho}px ${CIANO_CLARO})` }}>
          <Img src={staticFile('marca/ricardogarciapt/logo-rg-monograma-transparente.png')} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 640, textAlign: 'center', opacity: s2, transform: `translateY(${(1 - s2) * 40}px)` }}>
        <div style={{ fontFamily: ANTON, fontStyle: 'italic', fontSize: 110, textTransform: 'uppercase', letterSpacing: 2 }}>Ricardo <span style={{ color: CIANO }}>Garcia</span></div>
        <div style={{ fontFamily: OSW, fontSize: 34, color: '#A6A6A6', letterSpacing: 8, textTransform: 'uppercase', marginTop: 6 }}>A minha história</div>
      </div>
    </AbsoluteFill>
  )
}

/* ── Gráfico de velas CGI (capítulo mercados e código) ── */
const Velas: React.FC<{ de: number; ate: number }> = ({ de, ate }) => {
  const fr = useCurrentFrame()
  const A = f(de), B = f(ate)
  if (fr < A || fr > B + 10) return null
  const r = rng(7)
  const n = 26
  const vis = interpolate(fr, [A, A + 70], [0, n], clamp)
  const o = interpolate(fr, [A, A + 8, B, B + 10], [0, 1, 1, 0], clamp)
  let p = 560
  const velas = Array.from({ length: n }, (_, i) => {
    const op = p, cl = p + (r() - 0.42) * 70; p = cl
    return { i, op, cl, hi: Math.min(op, cl) - r() * 30, lo: Math.max(op, cl) + r() * 30 }
  })
  const codigo = ['const sinal = scanner(XAUUSD)', 'if (risco <= 1%) entrar()', 'stop = estrutura.minimo', 'gerir(trailing, parciais)']
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, zIndex: 4 }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {velas.filter((v) => v.i < vis).map((v) => {
          const x = 980 + v.i * 30, sobe = v.cl < v.op, c = sobe ? CIANO_CLARO : OURO
          return <g key={v.i} opacity={Math.min(1, vis - v.i)}><line x1={x} x2={x} y1={v.hi - 60} y2={v.lo - 60} stroke={c} strokeWidth={2} /><rect x={x - 9} y={Math.min(v.op, v.cl) - 60} width={18} height={Math.max(4, Math.abs(v.cl - v.op))} fill={c} rx={2} /></g>
        })}
      </svg>
      <div style={{ position: 'absolute', left: 120, top: 640, fontFamily: 'monospace', fontSize: 30, color: CIANO_CLARO, lineHeight: 1.6 }}>
        {codigo.map((l, i) => {
          const c = Math.floor(interpolate(fr, [A + 10 + i * 18, A + 30 + i * 18], [0, l.length], clamp))
          return <div key={i} style={{ opacity: c > 0 ? 0.9 : 0 }}>{'> '}{l.slice(0, c)}{c < l.length && c > 0 ? '▌' : ''}</div>
        })}
      </div>
    </div>
  )
}

/* ── Ecossistema MTM: dois pilares, cada um acende quando ele o diz ── */
const Ecossistema: React.FC = () => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(T.pilares[0]), B = f(T.pilares[1])
  if (fr < A || fr > B + 12) return null
  const o = interpolate(fr, [A, A + 12, B, B + 12], [0, 1, 1, 0], clamp)
  const nucleo = spring({ frame: fr - A - 6, fps, config: { damping: 12, stiffness: 80 } })
  const pulso = 1 + 0.06 * Math.sin(fr / 6)
  const cx = 740, cy = 400
  const pilares = [
    { t: 'Educação financeira', t2: '& trading', em: T.pilar1, x: 360, y: 600, cor: CIANO_CLARO, filhos: [{ t: 'MTM Auto', em: T.auto }, { t: 'MTM Funded', em: T.funded }] },
    { t: 'Negócios digitais', t2: 'tecnologia & IA', em: T.pilar2, x: 1060, y: 600, cor: OURO, filhos: [{ t: 'Soluções com IA', em: T.pilar2 + 0.8 }] },
  ]
  return (
    <AbsoluteFill style={{ opacity: o, zIndex: 4, background: `radial-gradient(900px 600px at ${cx}px ${cy}px, rgba(210,166,60,.18), rgba(7,7,10,.94) 70%)` }}>
      <Particulas de={A} ate={B + 12} alvo="livre" cor="ouro" />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {pilares.map((p, i) => {
          const s = interpolate(fr, [f(p.em), f(p.em) + 18], [0, 1], { ...clamp, easing: ease })
          const len = Math.hypot(p.x - cx, p.y - cy)
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={p.cor} strokeWidth={3} strokeDasharray={len} strokeDashoffset={len * (1 - s)} />
        })}
        <circle cx={cx} cy={cy} r={150 * nucleo * pulso} fill="none" stroke={OURO} strokeOpacity={0.25} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={105 * nucleo} fill="#0f121a" stroke={OURO} strokeWidth={3} />
      </svg>
      <Img src={staticFile('logo-mtm-transparent.png')} style={{ position: 'absolute', left: cx - 85, top: cy - 85, width: 170, height: 170, objectFit: 'contain', opacity: nucleo, transform: `scale(${nucleo})` }} />
      {pilares.map((p, i) => {
        const s = spring({ frame: fr - f(p.em) - 8, fps, config: { damping: 12 } })
        return (
          <div key={i} style={{ position: 'absolute', left: p.x - 300, top: p.y - 40, width: 600, textAlign: 'center', opacity: s, transform: `scale(${0.7 + 0.3 * s})` }}>
            <div style={{ display: 'inline-block', padding: '18px 30px', borderRadius: 18, background: 'rgba(15,18,26,.94)', border: `2px solid ${p.cor}`, boxShadow: `0 0 ${40 * s}px ${p.cor}55` }}>
              <div style={{ fontFamily: ANTON, fontStyle: 'italic', fontSize: 50, textTransform: 'uppercase', color: p.cor, lineHeight: 1 }}>{p.t}</div>
              <div style={{ fontFamily: OSW, fontSize: 32, color: '#e6e6e6', marginTop: 6 }}>{p.t2}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 18 }}>
              {p.filhos.map((c, k) => {
                const sc = spring({ frame: fr - f(c.em) - 4, fps, config: { damping: 13 } })
                return <div key={k} style={{ opacity: sc, transform: `translateY(${(1 - sc) * 30}px)`, padding: '8px 18px', borderRadius: 999, border: `1px solid ${p.cor}`, fontFamily: OSW, fontSize: 28, color: '#fff', background: 'rgba(0,0,0,.4)' }}>{c.t}</div>
              })}
            </div>
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', fontFamily: ANTON, fontStyle: 'italic', fontSize: 72, color: '#fff', textTransform: 'uppercase', opacity: interpolate(fr, [A + 4, A + 22], [0, 1], clamp) }}>
        4 anos · <span style={{ color: OURO }}>MoreThanMoney</span>
      </div>
    </AbsoluteFill>
  )
}

/* ── CGI: brasas a subir (queimei o barco) ── */
const Brasas: React.FC<{ de: number; ate: number }> = ({ de, ate }) => {
  const fr = useCurrentFrame()
  const A = f(de), B = f(ate)
  if (fr < A - 10 || fr > B + 12) return null
  const o = interpolate(fr, [A - 10, A + 8, B, B + 12], [0, 1, 1, 0], clamp)
  const r = rng(11)
  const N = 220
  const t = fr - A
  const brasas = Array.from({ length: N }, (_, i) => {
    const x0 = r() * 1920, vel = 2 + r() * 6, fase = r() * 400, tam = 1 + r() * 4, osc = r() * 40
    const y = 1120 - ((t * vel + fase * 3) % 1250)
    const x = x0 + Math.sin((t + fase) / 25) * osc
    const vida = 1 - (1120 - y) / 1250
    return { x, y, tam, vida, i, quente: r() > 0.5 }
  })
  return (
    <AbsoluteFill style={{ opacity: o, zIndex: 3, background: 'radial-gradient(1400px 600px at 50% 120%, rgba(255,120,30,.55), rgba(120,30,0,.35) 40%, rgba(7,7,10,.96) 75%)' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs><filter id="brilho"><feGaussianBlur stdDeviation="3" /></filter></defs>
        {brasas.map((b) => <circle key={b.i} cx={b.x} cy={b.y} r={b.tam} fill={b.quente ? '#ffb347' : OURO_CLARO} opacity={Math.max(0, b.vida)} filter={b.tam > 3.5 ? 'url(#brilho)' : undefined} />)}
      </svg>
      <div style={{ position: 'absolute', inset: 0, background: `rgba(255,140,40,${0.05 + 0.04 * Math.sin(fr / 3)})`, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  )
}

/* ── Final: cartão de chamada ── */
const Final: React.FC = () => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(VOZ) - 10
  if (fr < A) return null
  const s = spring({ frame: fr - A, fps, config: { damping: 14 } })
  const s2 = spring({ frame: fr - A - 12, fps, config: { damping: 16 } })
  return (
    <AbsoluteFill style={{ zIndex: 30, background: `radial-gradient(1200px 700px at 50% 40%, #0b1a3a, ${FUNDO} 70%)`, opacity: interpolate(fr, [A, A + 10], [0, 1], clamp) }}>
      <Particulas de={A} ate={TOTAL} alvo="livre" />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40, transform: `scale(${0.8 + 0.2 * s})`, opacity: s }}>
        <Img src={staticFile('marca/ricardogarciapt/logo-rg-monograma-transparente.png')} style={{ width: 220, height: 220 }} />
        <div style={{ width: 2, height: 160, background: '#333' }} />
        <Img src={staticFile('logo-mtm-transparent.png')} style={{ width: 220, height: 220, objectFit: 'contain' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', opacity: s2, transform: `translateY(${(1 - s2) * 40}px)` }}>
        <div style={{ position: 'relative', display: 'inline-block', fontFamily: ANTON, fontStyle: 'italic', fontSize: 120, textTransform: 'uppercase' }}>
          <span style={{ position: 'absolute', left: -24, right: -24, top: 18, bottom: 6, background: `linear-gradient(90deg, ${CIANO_CLARO}, ${AZUL})`, transform: `skew(-8deg) scaleX(${s2})`, transformOrigin: 'left', zIndex: -1 }} />
          Marca uma conversa
        </div>
        <div style={{ fontFamily: OSW, fontSize: 52, marginTop: 26, color: '#fff', letterSpacing: 1 }}>morethanmoney.pt/agendar</div>
        <div style={{ fontFamily: "'Kalam', cursive", fontSize: 44, color: OURO, marginTop: 16 }}>vamos ver juntos por onde começar</div>
        <div style={{ fontFamily: OSW, fontSize: 22, color: '#8a8a8a', marginTop: 40 }}>Conteúdo educativo, não constitui aconselhamento financeiro. O trading envolve risco de perda de capital.</div>
      </div>
    </AbsoluteFill>
  )
}

/* ── Legenda discreta (sempre visível quando ele fala, nunca por cima dos títulos grandes) ── */
const NotaIA: React.FC = () => {
  const fr = useCurrentFrame()
  if (fr < f(0) || fr > f(VOZ)) return null
  return <div style={{ position: 'absolute', right: 40, top: 34, fontFamily: OSW, fontSize: 20, color: 'rgba(255,255,255,.55)', zIndex: 12, letterSpacing: 1 }}>Gémeo digital do Ricardo · criado com IA</div>
}

export const Video: React.FC = () => {
  const cortes = [T.farda[0], T.nov[0], T.barco[0], T.codigo[0], T.pilares[0], T.garantias[0], T.cta[0]]
  return (
    <AbsoluteFill style={{ background: FUNDO, color: '#fff' }}>
      <style>{fontes}</style>

      {/* 01 · Catorze anos de farda */}
      <Foto src="cap-1.jpg" de={T.farda[0]} ate={T.farda[1]} grade="frio" />
      <Capitulo n="01" de={T.farda[0]} ate={T.farda[1] - 0.2} cor="#A6A6A6" />
      <Kinetico de={T.farda[0] + 0.3} ate={T.farda[1] - 0.2} y={380} size={140} linhas={[{ t: '14 anos' }, { t: 'de farda', cor: CIANO_CLARO }]} />
      <Kinetico de={T.farda[0] + 1.8} ate={T.farda[1] - 0.2} y={720} size={64} linhas={[{ t: 'Fuzileiro · GNR', cor: '#A6A6A6' }]} />
      <Kinetico de={T.ocupado[0] + 0.6} ate={T.ocupado[1]} y={700} size={92} align="center" pincel={1} linhas={[{ t: 'Nada construído' }, { t: 'para o meu futuro' }]} />

      {/* 02 · Novembro de 2022 */}
      <Foto src="cap-6.jpg" de={T.nov[0]} ate={T.nov[1]} grade="frio" dir={-1} />
      <Capitulo n="02" de={T.nov[0]} ate={T.nov[1] - 0.2} cor="#A6A6A6" />
      <Kinetico de={T.nov[0] + 0.1} ate={T.nov[1] - 0.2} y={360} size={130} linhas={[{ t: 'Novembro' }, { t: '2022', cor: CIANO_CLARO }]} />
      <Kinetico de={T.nov[0] + 2.4} ate={T.nov[1] - 0.2} y={680} size={56} linhas={[{ t: 'Esgotado. Sem saúde.', cor: '#d6d6d6' }, { t: 'Casa vendida.', cor: '#d6d6d6' }]} />

      {/* 03 · Queimei o barco */}
      <Brasas de={T.barco[0]} ate={T.barco[1]} />
      <Capitulo n="03" de={T.barco[0]} ate={T.barco[1] - 0.2} cor={OURO} />
      <Kinetico de={T.digital[0] + 0.1} ate={T.barco[0] + 0.2} y={720} size={84} align="center" linhas={[{ t: 'O mundo digital', cor: CIANO_CLARO }]} />
      <Kinetico de={T.barco[0] + 0.5} ate={T.barco[1] - 0.2} y={330} size={170} linhas={[{ t: 'Queimei' }, { t: 'o barco', cor: OURO_CLARO }]} />
      <Kinetico de={T.barco[0] + 2.4} ate={T.barco[1] - 0.2} y={760} size={52} linhas={[{ t: 'Sem garantias. Decidido a fazer resultar.', cor: '#e6e6e6' }]} />

      {/* 04 · Mercados e código */}
      <Foto src="cap-2.jpg" de={T.codigo[0]} ate={T.codigo[1]} grade="azul" dir={-1} />
      <Velas de={T.codigo[0]} ate={T.codigo[1]} />
      <Capitulo n="04" de={T.codigo[0]} ate={T.codigo[1] - 0.2} />
      <Kinetico de={T.codigo[0] + 0.3} ate={T.codigo[1] - 0.2} y={360} size={110} linhas={[{ t: 'Mercados' }, { t: 'e código', cor: CIANO_CLARO }]} />
      <Kinetico de={T.deixei[0] + 0.2} ate={T.deixei[1]} y={720} size={84} align="center" pincel={0} linhas={[{ t: 'Deixei a carreira' }]} />

      {/* 05 · Dois pilares na MoreThanMoney */}
      <Ecossistema />

      {/* 06 · Sem garantias, sem pagar o preço que ele pagou */}
      <Foto src="cap-5.jpg" de={T.garantias[0]} ate={T.preco[1] + 0.2} grade="azul" />
      <Capitulo n="06" de={T.garantias[0]} ate={T.preco[1]} />
      <Kinetico de={T.garantias[0] + 0.1} ate={T.garantias[1]} y={330} size={84} linhas={[{ t: 'Sem resultados garantidos.' }, { t: 'Conhecimento.', cor: CIANO_CLARO }, { t: 'Compromisso.', cor: CIANO_CLARO }, { t: 'Execução.', cor: CIANO_CLARO }]} />
      <Kinetico de={T.preco[0] + 0.2} ate={T.preco[1]} y={420} size={86} linhas={[{ t: 'Não precisas' }, { t: 'de pagar o preço' }, { t: 'que eu paguei', cor: OURO_CLARO }]} />

      <Ricardo />
      <Nome />
      <Kinetico de={T.cta[0] + 0.2} ate={VOZ - 0.4} y={760} size={84} align="center" pincel={0} linhas={[{ t: 'Marca uma conversa' }]} />
      <NotaIA />

      {cortes.map((c, i) => <Clarao key={i} em={f(c)} cor={i % 2 ? '#bfe9ff' : '#fff3d6'} dur={10} />)}
      {[T.nov[0], T.barco[0], T.pilares[0], T.garantias[0]].map((c, i) => (
        <Sequence key={i} from={f(c) - 15} durationInFrames={45}><LightLeak durationInFrames={45} seed={i * 3 + 1} hueShift={i === 1 || i === 2 ? 20 : 190} /></Sequence>
      ))}

      <Abertura />
      <Final />
      <Pelicula />
    </AbsoluteFill>
  )
}

export { FPS }
