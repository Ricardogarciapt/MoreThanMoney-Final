import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Titulo, clamp, ease, rng, fontTexto, Etiqueta, Plano } from '../../../motor/util'
import { OURO, OURO_CLARO } from '../tempo'
import { ouro } from '../../../motor/marca'

const N = 5000
const Particulas: React.FC<{ f: number }> = ({ f }) => {
  const { ini, fim } = useMemo(() => {
    const r = rng(7); const ini = new Float32Array(N * 3); const fim = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), rad = 6 + r() * 8
      ini[i * 3] = rad * Math.sin(ph) * Math.cos(th); ini[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th); ini[i * 3 + 2] = rad * Math.cos(ph) - 4
      // alvo: contorno de um telemóvel (1.6 x 3.2) + grelha interior
      let x, y
      if (i < N * 0.55) {
        const per = r() * 9.6
        if (per < 1.6) { x = -0.8 + per; y = 1.6 } else if (per < 4.8) { x = 0.8; y = 1.6 - (per - 1.6) } else if (per < 6.4) { x = 0.8 - (per - 4.8); y = -1.6 } else { x = -0.8; y = -1.6 + (per - 6.4) }
      } else { const linha = Math.floor(r() * 8); x = -0.6 + r() * 1.2 * (0.5 + 0.5 * ((linha * 37) % 7) / 7); y = 1.2 - linha * 0.36 }
      fim[i * 3] = x + (r() - 0.5) * 0.03; fim[i * 3 + 1] = y + (r() - 0.5) * 0.03; fim[i * 3 + 2] = (r() - 0.5) * 0.05
    }
    return { ini, fim }
  }, [])
  const pos = useMemo(() => new Float32Array(N * 3), [])
  const r2 = rng(99)
  for (let i = 0; i < N; i++) {
    const atraso = r2() * 25
    const k = ease(Math.max(0, Math.min(1, (f - 5 - atraso) / 60)))
    for (let j = 0; j < 3; j++) pos[i * 3 + j] = ini[i * 3 + j] + (fim[i * 3 + j] - ini[i * 3 + j]) * k
    // espiral durante a viagem
    const sp = (1 - k) * 2.5; const x = pos[i * 3], y = pos[i * 3 + 1]
    pos[i * 3] = x * Math.cos(sp) - y * Math.sin(sp); pos[i * 3 + 1] = x * Math.sin(sp) + y * Math.cos(sp)
  }
  return (
    <points key={f}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos.slice(), 3]} /></bufferGeometry>
      <pointsMaterial size={0.035} color={OURO_CLARO} transparent opacity={0.95} />
    </points>
  )
}

const Slot: React.FC<{ hora: string; nome: string; servico: string; de: number }> = ({ hora, nome, servico, de }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig()
  const s = spring({ frame: f - de, fps, config: { damping: 13 } })
  const ok = spring({ frame: f - de - 10, fps, config: { damping: 10 } })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: s > 0.01 ? `${ouro(0.10)}` : 'rgba(255,255,255,.04)', border: `1px solid ${s > 0.01 ? `${ouro(0.35)}` : 'rgba(255,255,255,.06)'}`, marginBottom: 10 }}>
      <div style={{ color: OURO_CLARO, fontWeight: 700, fontSize: 18, width: 56 }}>{hora}</div>
      <div style={{ flex: 1, opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{nome}</div>
        <div style={{ color: '#9a9a9a', fontSize: 14 }}>{servico}</div>
      </div>
      <div style={{ width: 28, height: 28, borderRadius: 14, background: OURO, color: '#111', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 16, transform: `scale(${ok})` }}>✓</div>
    </div>
  )
}

const Dispositivos: React.FC<{ f: number }> = ({ f }) => {
  const { fps } = useVideoConfig()
  const e = spring({ frame: f - 70, fps, config: { damping: 18, stiffness: 70 } })
  const rotY = interpolate(e, [0, 1], [-35, -12]); const rotX = interpolate(e, [0, 1], [18, 6])
  const linha = interpolate(f, [120, 170], [0, 1], { ...clamp, easing: ease })
  const deriva = interpolate(f, [70, 330], [0, -40], clamp)
  return (
    <AbsoluteFill style={{ perspective: 1800, opacity: interpolate(f, [62, 80], [0, 1], clamp) }}>
      {/* portátil com o site do cliente */}
      <div style={{ position: 'absolute', left: 170 + deriva, top: 230, width: 980, transform: `rotateY(${rotY + 20}deg) rotateX(${rotX}deg) scale(${0.85 + 0.15 * e})`, transformStyle: 'preserve-3d', fontFamily: fontTexto }}>
        <div style={{ borderRadius: 20, padding: 14, background: 'linear-gradient(160deg,#2a2a2e,#121214)', boxShadow: '0 60px 120px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.06)' }}>
          <div style={{ borderRadius: 10, overflow: 'hidden', background: '#0d0d10', height: 540 }}>
            <div style={{ height: 36, background: '#1b1b1f', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
              <div style={{ marginLeft: 20, flex: 1, height: 22, borderRadius: 11, background: '#2a2a30', color: '#bbb', fontSize: 14, display: 'flex', alignItems: 'center', padding: '0 14px' }}>🔒 oteunegocio.pt</div>
            </div>
            <div style={{ padding: '56px 60px', background: `radial-gradient(ellipse at 80% 0%, ${ouro(0.25)}, transparent 60%)` }}>
              <Etiqueta style={{ fontSize: 16 }}>Estúdio Ana · Lisboa</Etiqueta>
              <div style={{ color: '#fff', fontSize: 58, fontWeight: 800, lineHeight: 1.05, marginTop: 14, letterSpacing: -1.5 }}>Marca a tua sessão<br />em 30 segundos.</div>
              <div style={{ color: '#aaa', fontSize: 22, marginTop: 16 }}>Escolhe o dia. Recebe a confirmação no telemóvel.</div>
              <div style={{ display: 'inline-block', marginTop: 34, padding: '18px 34px', borderRadius: 14, background: `linear-gradient(180deg, ${OURO_CLARO}, ${OURO})`, color: '#111', fontWeight: 800, fontSize: 22, boxShadow: `0 0 ${30 + 30 * Math.sin(f * 0.2)}px ${ouro(0.6)}` }}>Marcar agora →</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 40 }}>
                {['SEG 18', 'TER 19', 'QUA 20', 'QUI 21', 'SEX 22'].map((d, i) => (
                  <div key={d} style={{ padding: '12px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', color: i === 1 ? '#111' : '#ddd', background: i === 1 ? OURO_CLARO : 'transparent', fontWeight: 700, fontSize: 18 }}>{d}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: 22, margin: '0 -40px', borderRadius: '0 0 30px 30px', background: 'linear-gradient(180deg,#3a3a40,#1a1a1e)' }} />
      </div>
      {/* linha de luz site → app */}
      <svg style={{ position: 'absolute', inset: 0 }} width={1920} height={1080}>
        <defs><linearGradient id="l" x1="0" x2="1"><stop offset="0" stopColor={OURO} stopOpacity="0" /><stop offset="1" stopColor={OURO_CLARO} /></linearGradient></defs>
        <path d="M 560 640 C 900 860, 1150 420, 1380 520" stroke="url(#l)" strokeWidth={5} fill="none" strokeDasharray="1200" strokeDashoffset={1200 * (1 - linha)} style={{ filter: 'drop-shadow(0 0 12px #E9C46A)' }} />
        {linha > 0.98 && <circle cx={1380} cy={520} r={10 + 30 * ((f % 30) / 30)} fill="none" stroke={OURO_CLARO} strokeOpacity={1 - (f % 30) / 30} strokeWidth={3} />}
      </svg>
      {/* telemóvel com a app */}
      <div style={{ position: 'absolute', left: 1330 - deriva * 0.5, top: 150, width: 380, transform: `rotateY(${-rotY - 26}deg) rotateX(${rotX}deg) translateY(${(1 - e) * 120}px)`, fontFamily: fontTexto }}>
        <div style={{ borderRadius: 54, padding: 12, background: 'linear-gradient(160deg,#3a3a3e,#111)', boxShadow: `0 60px 120px rgba(0,0,0,.75), 0 0 60px ${ouro(0.25)}` }}>
          <div style={{ borderRadius: 44, overflow: 'hidden', background: '#0b0b0d', height: 760, padding: '54px 20px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ color: '#888', fontSize: 15 }}>Terça, 19</div><div style={{ color: '#fff', fontSize: 30, fontWeight: 800 }}>Marcações</div></div>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: `linear-gradient(180deg,${OURO_CLARO},${OURO})` }} />
            </div>
            <div style={{ marginTop: 22 }}>
              <Slot hora="09:00" nome="Rita M." servico="Sessão 60 min" de={150} />
              <Slot hora="10:30" nome="João P." servico="Primeira consulta" de={178} />
              <Slot hora="12:00" nome="Ana S." servico="Sessão 30 min" de={206} />
              <Slot hora="15:00" nome="Pedro L." servico="Sessão 60 min" de={234} />
              <Slot hora="17:30" nome="Marta C." servico="Avaliação" de={262} />
            </div>
            <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'rgba(37,211,102,.12)', color: '#7ee2a6', fontSize: 15, opacity: interpolate(f, [280, 295], [0, 1], clamp) }}>💬 Lembretes enviados automaticamente</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const Transforma: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const opP = interpolate(f, [70, 92], [1, 0], clamp)
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 60%, #15120a, #050506 70%)' }}>
      {opP > 0 && (
        <AbsoluteFill style={{ opacity: opP }}>
          <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 5.2], fov: 50 }}>
            <Particulas f={f} />
            <EffectComposer><Bloom intensity={1.6} luminanceThreshold={0.1} mipmapBlur /></EffectComposer>
          </ThreeCanvas>
        </AbsoluteFill>
      )}
      <Titulo texto="E se o teu negócio trabalhasse por ti?" de={4} ate={64} size={92} y={0} destaque={['trabalhasse', 'por', 'ti']} />
      <Dispositivos f={f} />
      <Plano src="cliente_marca_1" de={232} dur={100} grade="ouro" escuro={0.3} zoom={[1.0, 1.1]} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70 }}>
        <div style={{ position: 'relative', height: 140 }}>
          <Titulo texto="A tua página. A tua app. A tua agenda." de={100} ate={210} size={70} destaque={['página', 'app', 'agenda']} />
          <Titulo texto="Tudo ligado. Tudo controlado." de={220} ate={325} size={70} destaque={['ligado', 'controlado']} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
