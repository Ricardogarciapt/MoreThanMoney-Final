import React from 'react'
import { AbsoluteFill, Audio, Freeze, Img, OffthreadVideo, Sequence, getInputProps, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { LightLeak } from '@remotion/light-leaks'
import { ANUNCIOS, LEGENDAS, fimVoz, type Anuncio, type Imagem } from './anuncios'
import { FPS, OURO, OURO_CLARO, FUNDO, MARCA } from '../../motor/marca'
import { Pelicula, Clarao, Plano, clamp, ease } from '../../motor/util'

const ANTON = "'Anton', sans-serif"
const OSW = "'Oswald', sans-serif"
const FONTES = `@font-face{font-family:'Anton';src:url('${staticFile('fontes/Anton.ttf')}') format('truetype');}@font-face{font-family:'Oswald';src:url('${staticFile('fontes/Oswald.ttf')}') format('truetype');}`
const f = (s: number) => Math.round(s * FPS)
const W = 1080, H = 1920
const LOGO = MARCA.id === 'ricardo-garcia' ? 'ricardogarcia/logo-rg-monograma-transparente.png' : 'logo-mtm-transparent.png'
const PIP = { w: 360, h: 640, x: W - 360 - 48, y: 250 }

export const chave = () => String((getInputProps() as { anuncio?: string }).anuncio || 'cor')

/* ── 0..1: quanto o gémeo está em janela pequena (durante as imagens de apoio) ── */
function modoPip(fr: number, imgs: Imagem[]) {
  let m = 0
  for (const i of imgs) {
    const A = f(i.de), B = f(i.ate)
    m = Math.max(m, interpolate(fr, [A - 5, A + 7, B - 7, B + 5], [0, 1, 1, 0], { ...clamp, easing: ease }))
  }
  return m
}

/* ── Cortes secos com zoom (jump cut) a cada frase ── */
function zoomFrase(t: number, k: string) {
  const segs = LEGENDAS[k]
  const niveis = [1.0, 1.16, 1.06, 1.2]
  let n = 0
  for (let i = 1; i < segs.length; i++) {
    if (segs[i][0] > t) break
    if (/[.?:!]$/.test(segs[i - 1][2].trim())) n++
  }
  return niveis[n % niveis.length]
}

/* ── O gémeo (HeyGen) — camada base, sempre a falar ── */
const Gemeo: React.FC<{ k: string; a: Anuncio }> = ({ k, a }) => {
  const fr = useCurrentFrame()
  const t = fr / FPS
  const fim = fimVoz(k)
  const m = modoPip(fr, a.imagens)
  const fimCena = interpolate(fr, [f(fim), f(fim) + 12], [0, 1], { ...clamp, easing: ease })
  const w = interpolate(m, [0, 1], [W, PIP.w]), h = interpolate(m, [0, 1], [H, PIP.h])
  const x = interpolate(m, [0, 1], [0, PIP.x]), y = interpolate(m, [0, 1], [0, PIP.y])
  const zf = zoomFrase(t, k)
  // pequeno tremor no corte
  const ultimoCorte = LEGENDAS[k].filter((s, i, arr) => i > 0 && s[0] <= t && /[.?:!]$/.test(arr[i - 1][2].trim())).pop()
  const desdeCorte = ultimoCorte ? fr - f(ultimoCorte[0]) : 99
  const shake = desdeCorte < 6 ? (6 - desdeCorte) * 1.6 * Math.sin(desdeCorte * 2.3) : 0
  const push = interpolate(fr, [0, f(fim)], [1.0, 1.05])
  const z = (m > 0.5 ? 1.12 : zf) * push
  const filtro = `contrast(1.08) saturate(1.06) brightness(${1 - fimCena * 0.55}) blur(${fimCena * 14}px)`
  const estilo: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${shake}px, ${shake * 0.6}px) scale(${z})`, transformOrigin: '50% 30%', filter: filtro }
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: m * 30, overflow: 'hidden', zIndex: 5, boxShadow: m > 0.05 ? `0 30px 90px rgba(0,0,0,.65), 0 0 0 ${3 * m}px ${OURO_CLARO}, 0 0 ${50 * m}px ${OURO}` : undefined }}>
      {fr < f(fim) + 2 ? (
        <OffthreadVideo src={staticFile(`stock/anuncios/${k}.mp4`)} style={estilo} />
      ) : (
        <Freeze frame={f(fim)}><OffthreadVideo src={staticFile(`stock/anuncios/${k}.mp4`)} muted style={estilo} /></Freeze>
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)' }} />
    </div>
  )
}

/* ── Fundo de marca (grelha + brilho) por trás dos ecrãs da app ── */
const FundoMarca: React.FC = () => {
  const fr = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 40%, color-mix(in srgb, ${OURO} 28%, ${FUNDO}) 0%, ${FUNDO} 60%)` }}>
      <div style={{ position: 'absolute', inset: -200, backgroundImage: `linear-gradient(color-mix(in srgb, ${OURO} 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, ${OURO} 14%, transparent) 1px, transparent 1px)`, backgroundSize: '90px 90px', transform: `perspective(900px) rotateX(58deg) translateY(${(fr * 2) % 90}px)`, transformOrigin: '50% 100%', opacity: 0.55 }} />
    </AbsoluteFill>
  )
}

/* ── Ecrã real da app num telemóvel a flutuar ── */
const Telemovel: React.FC<{ src: string; de: number; ate: number }> = ({ src, de, ate }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(de), B = f(ate)
  if (fr < A - 8 || fr > B + 8) return null
  const e = spring({ frame: fr - A, fps, config: { damping: 14, stiffness: 110 } })
  const o = interpolate(fr, [A - 8, A + 4, B - 4, B + 8], [0, 1, 1, 0], clamp)
  const ry = interpolate(e, [0, 1], [-35, 12]) + Math.sin((fr - A) / 22) * 2
  const scroll = interpolate(fr, [A, B], [0, -180], clamp)
  return (
    <AbsoluteFill style={{ opacity: o, zIndex: 3 }}>
      <FundoMarca />
      <div style={{ position: 'absolute', left: 70, top: 300, width: 540, height: 1110, perspective: 1400 }}>
        <div style={{ width: '100%', height: '100%', transform: `rotateY(${ry}deg) rotateX(4deg) translateY(${(1 - e) * 200}px) scale(${0.85 + 0.15 * e})`, borderRadius: 64, background: '#000', padding: 16, boxShadow: `0 60px 120px rgba(0,0,0,.7), 0 0 0 3px #2a2a2a, 0 0 80px color-mix(in srgb, ${OURO} 45%, transparent)` }}>
          <div style={{ width: '100%', height: '100%', borderRadius: 50, overflow: 'hidden', position: 'relative' }}>
            <Img src={staticFile(src)} style={{ width: '100%', transform: `translateY(${scroll}px)` }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${-30 + 160 * (((fr - A) % 70) / 70)}%`, height: '25%', background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.14) 50%, transparent 70%)' }} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

/* ── Gancho: texto cinético grande nos primeiros segundos ── */
const Gancho: React.FC<{ a: Anuncio }> = ({ a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const B = f(a.gancho.ate)
  if (fr > B + 12) return null
  const saida = interpolate(fr, [B, B + 10], [1, 0], clamp)
  let k = 0
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1060, textAlign: 'center', opacity: saida, filter: `blur(${(1 - saida) * 12}px)`, zIndex: 9 }}>
      {a.gancho.linhas.map((l, li) => {
        const sP = spring({ frame: fr - 4 - li * 7, fps, config: { damping: 16, stiffness: 130 } })
        return (
          <div key={li} style={{ position: 'relative', display: 'table', margin: '0 auto 10px' }}>
            {li === a.gancho.linhas.length - 1 && <div style={{ position: 'absolute', left: -26, right: -26, top: '6%', bottom: '2%', background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})`, transform: `skew(-8deg) scaleX(${sP})`, transformOrigin: 'left', zIndex: -1, boxShadow: `0 0 60px ${OURO}` }} />}
            <span style={{ fontFamily: ANTON, fontStyle: 'italic', fontSize: li === 0 ? 112 : 104, lineHeight: 1.04, color: li === a.gancho.linhas.length - 1 ? '#0A0A0A' : '#fff', textShadow: li === 0 ? '0 10px 40px rgba(0,0,0,.8)' : undefined }}>
              {l.split(' ').map((p, i) => {
                const s = spring({ frame: fr - 2 - (k++) * 3, fps, config: { damping: 12, stiffness: 190 } })
                return <span key={i} style={{ display: 'inline-block', marginRight: '0.22em', opacity: s, transform: `translateY(${(1 - s) * 70}px) scale(${0.8 + 0.2 * s})`, filter: `blur(${(1 - s) * 16}px)` }}>{p}</span>
              })}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Legendas palavra a palavra (a palavra dita acende na cor da marca) ── */
const Legendas: React.FC<{ k: string; a: Anuncio }> = ({ k, a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = fr / FPS
  if (t < a.gancho.ate || t >= a.cta.de - 0.05) return null
  if (a.destaque && t >= a.destaque.em && t <= a.destaque.ate) return null
  const seg = LEGENDAS[k].find((s) => t >= s[0] - 0.05 && t <= s[1] + 0.25)
  if (!seg) return null
  const palavras = seg[2].split(' ')
  const pos = (t - seg[0]) / Math.max(0.2, seg[1] - seg[0])
  const ativa = Math.min(palavras.length - 1, Math.floor(pos * palavras.length))
  const top = 1440
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, top, textAlign: 'center', zIndex: 9 }}>
      {palavras.map((p, i) => {
        const s = spring({ frame: fr - f(seg[0]) - i * 2, fps, config: { damping: 13, stiffness: 220 } })
        const on = i === ativa
        return (
          <span key={i} style={{ display: 'inline-block', margin: '0 17px', fontFamily: ANTON, textTransform: 'uppercase', fontSize: 86, lineHeight: 1.1, color: on ? OURO_CLARO : '#fff', transform: `scale(${(0.7 + 0.3 * s) * (on ? 1.06 : 1)}) translateY(${(1 - s) * 30}px)`, opacity: s, WebkitTextStroke: '3px rgba(0,0,0,.85)', paintOrder: 'stroke fill', textShadow: on ? `0 0 30px ${OURO}, 0 8px 24px rgba(0,0,0,.8)` : '0 8px 24px rgba(0,0,0,.8)' }}>{p}</span>
        )
      })}
    </div>
  )
}

/* ── Etiquetas que entram com a voz ── */
const Chips: React.FC<{ a: Anuncio }> = ({ a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = fr / FPS
  const vis = a.chips.map((c, i) => ({ ...c, i })).filter((c) => t >= c.em - 0.1 && t < c.em + 3.0 && t < a.cta.de)
  return (
    <>
      {vis.map((c, j) => {
        const s = spring({ frame: fr - f(c.em), fps, config: { damping: 14, stiffness: 160 } })
        const out = interpolate(fr, [f(c.em + 2.7), f(c.em + 3.0)], [1, 0], clamp)
        return (
          <div key={c.i} style={{ position: 'absolute', right: 48, top: 930 + j * 98, zIndex: 8, opacity: s * out, transform: `translateX(${(1 - s) * 220}px) scale(${0.9 + 0.1 * s})` }}>
            <div style={{ fontFamily: OSW, fontWeight: 700, fontSize: 40, letterSpacing: 1, textTransform: 'uppercase', color: '#fff', padding: '14px 28px', borderRadius: 999, background: 'rgba(8,8,10,.72)', border: `2px solid ${OURO_CLARO}`, boxShadow: `0 10px 40px rgba(0,0,0,.5), 0 0 24px color-mix(in srgb, ${OURO} 45%, transparent)`, backdropFilter: 'blur(10px)', whiteSpace: 'nowrap' }}>{c.t}</div>
          </div>
        )
      })}
    </>
  )
}

/* ── Palavra-chave gigante (ex.: CORRETORA) com balão de mensagem ── */
const Destaque: React.FC<{ a: Anuncio }> = ({ a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!a.destaque) return null
  const A = f(a.destaque.em), B = f(a.destaque.ate)
  if (fr < A - 2 || fr > B + 10) return null
  const s = spring({ frame: fr - A, fps, config: { damping: 9, stiffness: 140 } })
  const o = interpolate(fr, [B, B + 10], [1, 0], clamp)
  const glitch = (fr - A) % 17 < 2 ? 8 : 0
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1180, textAlign: 'center', zIndex: 9, opacity: o }}>
      <div style={{ display: 'inline-block', fontFamily: OSW, fontSize: 34, letterSpacing: 6, color: OURO_CLARO, background: 'rgba(0,0,0,.6)', padding: '8px 22px', borderRadius: 12, marginBottom: 14, transform: `translateY(${(1 - s) * 40}px)`, opacity: s }}>💬 ESCREVE-ME</div>
      <div style={{ position: 'relative', fontFamily: ANTON, fontSize: 190, lineHeight: 1, transform: `scale(${0.5 + 0.5 * s})`, color: 'transparent', backgroundImage: `linear-gradient(180deg, #fff 10%, ${OURO_CLARO} 55%, ${OURO})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', filter: `drop-shadow(0 0 40px ${OURO}) drop-shadow(0 12px 30px rgba(0,0,0,.8))` }}>
        <span style={{ position: 'absolute', left: glitch, right: 0, color: 'rgba(0,200,255,.35)', mixBlendMode: 'screen' }}>{glitch ? a.destaque.t : ''}</span>
        {a.destaque.t}
      </div>
    </div>
  )
}

/* ── Cartões dos caminhos (landing RG) ── */
const Cartoes: React.FC<{ a: Anuncio }> = ({ a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!a.cartoes) return null
  const fim = f(a.imagens[a.imagens.length - 1].ate)
  if (fr > fim + 10) return null
  const o = interpolate(fr, [fim - 4, fim + 10], [1, 0], clamp)
  return (
    <>
      {a.cartoes.map((c, i) => {
        const A = f(c.em)
        if (fr < A) return null
        const s = spring({ frame: fr - A, fps, config: { damping: 13, stiffness: 120 } })
        const scan = ((fr - A) % 60) / 60
        return (
          <div key={i} style={{ position: 'absolute', left: 56, top: 330 + i * 250, width: 560, height: 210, zIndex: 8, opacity: s * o, transform: `perspective(1000px) rotateY(${(1 - s) * -50}deg) translateX(${(1 - s) * -120}px)`, borderRadius: 26, overflow: 'hidden', background: `linear-gradient(135deg, rgba(4,10,26,.82), color-mix(in srgb, ${OURO} 35%, rgba(4,10,26,.82)))`, border: `2px solid ${OURO_CLARO}`, boxShadow: `0 20px 60px rgba(0,0,0,.6), 0 0 40px color-mix(in srgb, ${OURO} 40%, transparent)` }}>
            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 4px)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: `${scan * 140 - 30}%`, height: '30%', background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,.14) 50%, transparent 70%)' }} />
            <div style={{ position: 'absolute', left: 30, top: 26, fontFamily: ANTON, fontSize: 90, lineHeight: 1, color: 'transparent', WebkitTextStroke: `2px ${OURO_CLARO}` }}>{c.n}</div>
            <div style={{ position: 'absolute', left: 30, right: 24, bottom: 26, fontFamily: ANTON, fontStyle: 'italic', fontSize: 54, lineHeight: 1.02, textTransform: 'uppercase', color: '#fff' }}>{c.t}</div>
          </div>
        )
      })}
    </>
  )
}

/* ── CTA: painel com botão a pulsar e, depois da voz, cartão final inteiro ── */
const Cta: React.FC<{ k: string; a: Anuncio }> = ({ k, a }) => {
  const fr = useCurrentFrame()
  const { fps } = useVideoConfig()
  const A = f(a.cta.de), F = f(fimVoz(k))
  if (fr < A - 4) return null
  const s = spring({ frame: fr - A, fps, config: { damping: 14, stiffness: 120 } })
  const fim = spring({ frame: fr - F, fps, config: { damping: 16, stiffness: 90 } })
  const pulso = 1 + 0.045 * Math.sin((fr - A) / 4.2)
  const toque = (fr - A) % 45
  const dedo = interpolate(toque, [0, 10, 16, 26], [40, 0, 0, 40], clamp)
  const top = interpolate(fim, [0, 1], [1150, 980])
  return (
    <>
      {fr >= F && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', zIndex: 10, opacity: fim, transform: `scale(${0.8 + 0.2 * fim})` }}>
          <Img src={staticFile(LOGO)} style={{ height: 300, objectFit: 'contain', filter: `brightness(1.35) drop-shadow(0 0 40px ${OURO})` }} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 60, right: 60, top, zIndex: 10, opacity: s, transform: `translateY(${(1 - s) * 260}px)`, textAlign: 'center' }}>
        <div style={{ fontFamily: OSW, fontSize: 40, letterSpacing: 5, textTransform: 'uppercase', color: OURO_CLARO, textShadow: '0 4px 20px rgba(0,0,0,.9)' }}>{a.cta.topo}</div>
        <div style={{ fontFamily: ANTON, fontSize: a.cta.grande.length > 12 ? 112 : 140, lineHeight: 1.02, color: '#fff', textShadow: `0 0 40px color-mix(in srgb, ${OURO} 60%, transparent), 0 10px 30px rgba(0,0,0,.9)`, margin: '6px 0 26px' }}>{a.cta.grande}</div>
        <div style={{ position: 'relative', display: 'inline-block', transform: `scale(${pulso})` }}>
          <div style={{ position: 'absolute', inset: -14, borderRadius: 999, border: `3px solid ${OURO_CLARO}`, opacity: 1 - toque / 45, transform: `scale(${1 + toque / 90})` }} />
          <div style={{ fontFamily: OSW, fontWeight: 700, fontSize: 52, textTransform: 'uppercase', letterSpacing: 2, color: '#0A0A0A', padding: '26px 64px', borderRadius: 999, background: `linear-gradient(180deg, ${OURO_CLARO}, ${OURO})`, boxShadow: `0 20px 60px color-mix(in srgb, ${OURO} 55%, transparent), inset 0 2px 0 rgba(255,255,255,.5)` }}>{a.cta.botao} →</div>
          <div style={{ position: 'absolute', right: -30, bottom: -70, fontSize: 90, transform: `translate(${dedo}px, ${dedo}px)` }}>👆</div>
        </div>
        <div style={{ fontFamily: OSW, fontSize: 38, letterSpacing: 2, color: '#fff', marginTop: 34, opacity: 0.9 }}>{a.cta.url}</div>
      </div>
    </>
  )
}

/* ── Barra de progresso, marca d'água e aviso ── */
const Moldura: React.FC<{ k: string; a: Anuncio; total: number }> = ({ k, a, total }) => {
  const fr = useCurrentFrame()
  const fimO = interpolate(fr, [f(fimVoz(k)), f(fimVoz(k)) + 10], [1, 0], clamp)
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, height: 10, width: `${(fr / total) * 100}%`, background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})`, boxShadow: `0 0 20px ${OURO}`, zIndex: 20 }} />
      <Img src={staticFile(LOGO)} style={{ position: 'absolute', left: 40, top: 44, height: 150, objectFit: 'contain', opacity: 0.92 * fimO, zIndex: 20, filter: 'brightness(1.3) drop-shadow(0 4px 14px rgba(0,0,0,.9))' }} />
      {a.aviso && <div style={{ position: 'absolute', left: 80, right: 80, top: 1700, textAlign: 'center', fontFamily: OSW, fontSize: 25, lineHeight: 1.3, color: 'rgba(255,255,255,.8)', textShadow: '0 2px 8px rgba(0,0,0,.95)', zIndex: 20 }}>{a.aviso}</div>}
    </>
  )
}

export const Video: React.FC = () => {
  const k = chave()
  const a = ANUNCIOS[k]
  const { durationInFrames } = useVideoConfig()
  const fim = f(fimVoz(k))
  const fr = useCurrentFrame()
  const volMusica = interpolate(fr, [0, fim - 6, fim + 6], [0.16, 0.16, 0.5], clamp)
  return (
    <AbsoluteFill style={{ background: FUNDO, overflow: 'hidden' }}>
      <style>{FONTES}</style>
      {/* imagens de apoio por baixo do gémeo em janela */}
      {a.imagens.map((i, n) =>
        i.tipo === 'video' ? (
          <AbsoluteFill key={n} style={{ zIndex: 2 }}><Plano src={i.src} de={f(i.de) - 6} dur={f(i.ate) - f(i.de) + 12} grade={i.grade} zoom={[1.06, 1.18]} escuro={0.15} /></AbsoluteFill>
        ) : (
          <Telemovel key={n} src={i.src} de={i.de} ate={i.ate} />
        ),
      )}
      {/* cartão final: fundo da marca */}
      {fr >= fim - 6 && <AbsoluteFill style={{ zIndex: 4, opacity: interpolate(fr, [fim - 6, fim + 10], [0, 0.6], clamp) }}><FundoMarca /></AbsoluteFill>}
      <Gemeo k={k} a={a} />
      <Gancho a={a} />
      <Legendas k={k} a={a} />
      <Chips a={a} />
      <Destaque a={a} />
      <Cartoes a={a} />
      <Cta k={k} a={a} />
      {/* transições: clarão + fuga de luz a cada imagem e no CTA */}
      <AbsoluteFill style={{ zIndex: 15, pointerEvents: 'none' }}>
        <Clarao em={2} dur={10} />
        <Sequence from={0} durationInFrames={36}><LightLeak durationInFrames={36} seed={2} hueShift={k.startsWith('rg') ? 190 : 20} /></Sequence>
        {[...a.imagens.map((i) => i.de), a.cta.de].map((s, n) => (
          <Sequence key={n} from={Math.max(0, f(s) - 10)} durationInFrames={28}><LightLeak durationInFrames={28} seed={n * 3 + 5} hueShift={k.startsWith('rg') ? 190 : 20} /></Sequence>
        ))}
        <Clarao em={f(a.cta.de)} dur={8} />
      </AbsoluteFill>
      <AbsoluteFill style={{ zIndex: 16, pointerEvents: 'none' }}><Pelicula /></AbsoluteFill>
      <Moldura k={k} a={a} total={durationInFrames} />
      <Audio src={staticFile(`stock/anuncios/${k}-musica.wav`)} volume={volMusica} />
    </AbsoluteFill>
  )
}
