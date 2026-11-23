import React, { useMemo } from 'react'
import * as THREE from 'three'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { Titulo, clamp, rng, fontTexto, Plano } from '../../../motor/util'
import { t, tt } from '../i18n'

function texturaAgenda(seed: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 340
  const g = c.getContext('2d')!; const r = rng(seed)
  g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, 256, 340)
  g.strokeStyle = 'rgba(80,110,160,.35)'; g.lineWidth = 1
  for (let y = 40; y < 340; y += 22) { g.beginPath(); g.moveTo(10, y); g.lineTo(246, y); g.stroke() }
  g.strokeStyle = 'rgba(200,60,60,.5)'; g.beginPath(); g.moveTo(42, 0); g.lineTo(42, 340); g.stroke()
  g.fillStyle = '#222'; g.font = 'bold 18px serif'
  const dias = t('SEG TER QUA QUI SEX SÁB').split(' '); g.fillText(dias[Math.floor(r() * 6)] + ' ' + (1 + Math.floor(r() * 28)), 50, 28)
  g.strokeStyle = 'rgba(20,30,90,.85)'; g.lineWidth = 2
  for (let y = 58; y < 330; y += 22) {
    if (r() < 0.3) continue
    g.beginPath(); let x = 50 + r() * 10; g.moveTo(x, y)
    const fim = 120 + r() * 120
    while (x < fim) { x += 4 + r() * 6; g.lineTo(x, y - 4 + r() * 6) }
    g.stroke()
    if (r() < 0.25) { g.strokeStyle = 'rgba(200,30,30,.8)'; g.beginPath(); g.moveTo(48, y - 3); g.lineTo(fim, y - 6); g.stroke(); g.strokeStyle = 'rgba(20,30,90,.85)' }
  }
  if (r() < 0.5) { g.fillStyle = 'rgba(255,230,90,.85)'; g.fillRect(150 + r() * 40, 200 + r() * 60, 80, 70) }
  const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return tx
}

const Folhas: React.FC<{ f: number }> = ({ f }) => {
  const folhas = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 22 }).map((_, i) => ({
      tex: texturaAgenda(100 + i), x: (r() - 0.5) * 16, y: (r() - 0.5) * 9, z: -r() * 14 - 1,
      rx: r() * 6, ry: r() * 6, rz: r() * 6, vx: (r() - 0.5) * 0.02, vy: -0.004 - r() * 0.01, vr: (r() - 0.5) * 0.04,
    }))
  }, [])
  return (
    <group>
      {folhas.map((p, i) => (
        <mesh key={i} position={[p.x + p.vx * f, p.y + p.vy * f + Math.sin(f * 0.03 + i) * 0.2, p.z + f * 0.03]} rotation={[p.rx + p.vr * f, p.ry + p.vr * f * 0.7, p.rz + p.vr * f * 0.5]}>
          <planeGeometry args={[1.5, 2]} />
          <meshBasicMaterial map={p.tex} side={THREE.DoubleSide} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  )
}

const MSGS = [
  ['Rita', t('Olá! Ainda há vaga amanhã?')], ['João', t('Qual é o preço?')], ['Ana', t('Consegue ligar-me?')],
  ['Pedro', t('Tenho de desmarcar a de quinta 😕')], ['Marta', t('Já enviei mensagem ontem…')], ['Rui', t('Estão abertos ao sábado?')],
  ['Sofia', '???'],
]

const Notificacoes: React.FC<{ f: number }> = ({ f }) => {
  const { fps } = useVideoConfig()
  return (
    <div style={{ position: 'absolute', right: 90, top: 120, width: 520 }}>
      {MSGS.map(([quem, txt], i) => {
        const de = 8 + i * 22
        const s = spring({ frame: f - de, fps, config: { damping: 15 } })
        if (f < de) return null
        const sobe = MSGS.slice(i + 1).filter((_, k) => f > 8 + (i + 1 + k) * 22).length
        return (
          <div key={i} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${sobe * 108 + (1 - s) * -60}px) scale(${1 - sobe * 0.03})`, opacity: s * (1 - sobe * 0.1), transformOrigin: 'top right' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '16px 20px', borderRadius: 22, background: 'rgba(28,28,32,.82)', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 20px 50px rgba(0,0,0,.5)', backdropFilter: 'blur(10px)', fontFamily: fontTexto }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: '#25D366', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 26 }}>{quem[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>{quem} <span style={{ color: '#888', fontWeight: 500, fontSize: 18 }}>· {t('agora')}</span></div>
                <div style={{ color: '#ddd', fontSize: 22 }}>{txt}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const Caos: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const n = Math.min(27, Math.floor(interpolate(f, [8, 200], [1, 27], clamp)))
  const glitch = [78, 150, 222].some((g) => Math.abs(f - g) < 4)
  const treme = f > 215 ? (Math.sin(f * 7) * (f - 215)) / 2 : 0
  return (
    <AbsoluteFill style={{ background: '#0b0b0e', transform: `translate(${treme}px, ${treme * 0.6}px)` }}>
      <Plano src="stress_papel_1" de={0} dur={126} grade="frio" escuro={0.15} />
      <Plano src="stress_papel_2" de={118} dur={122} grade="frio" escuro={0.15} />
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 5]} intensity={2.2} color="#fff4e0" />
        <pointLight position={[-4, -3, 2]} intensity={30} color="#ff4433" />
        <Folhas f={f} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.65), rgba(0,0,0,0) 60%)', filter: glitch ? 'hue-rotate(90deg)' : undefined }} />
      <Notificacoes f={f} />
      <div style={{ position: 'absolute', right: 70, top: 92, width: 64, height: 64, borderRadius: 32, background: '#ff3b30', color: '#fff', fontFamily: fontTexto, fontWeight: 800, fontSize: 30, display: 'grid', placeItems: 'center', boxShadow: '0 0 30px rgba(255,59,48,.7)', zIndex: 5 }}>{n}</div>
      <div style={{ position: 'absolute', inset: 0, transform: glitch ? `translateX(${(f % 2 ? 1 : -1) * 14}px)` : undefined }}>
        <Titulo {...tt('Agenda em papel.', [], 130)} de={6} ate={70} align="left" x={110} y={-20} />
        <Titulo {...tt('Mensagens perdidas.', [], 130)} de={80} ate={142} align="left" x={110} y={-20} />
        <Titulo {...tt('Clientes que não voltam.', [], 118)} de={152} ate={226} align="left" x={110} y={-20} cor="#ff6b5e" />
      </div>
      {glitch && <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 2px, transparent 2px 6px)', mixBlendMode: 'screen' }} />}
    </AbsoluteFill>
  )
}
