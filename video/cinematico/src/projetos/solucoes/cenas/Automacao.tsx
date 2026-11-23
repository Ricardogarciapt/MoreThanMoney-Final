import React from 'react'
import * as THREE from 'three'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Titulo, clamp, ease, fontTexto, Plano } from '../../../motor/util'
import { OURO, OURO_CLARO } from '../tempo'
import { Poeira } from './Relogio'
import { ouro } from '../../../motor/marca'
import { t, tt } from '../i18n'

const NOS = ['WhatsApp', 'Instagram', t('Agenda'), 'Email', t('Faturação'), 'CRM', 'Site', t('Relatórios')]
const RAIO = 3.1, CAM = 9, FOV = 45

const pos = (i: number, f: number) => {
  const a = (i / NOS.length) * Math.PI * 2 + f * 0.004
  return [Math.cos(a) * RAIO * 1.35, Math.sin(a) * RAIO * 0.82, Math.sin(a * 2 + f * 0.01) * 0.6] as const
}

const Rede: React.FC<{ f: number }> = ({ f }) => {
  const nasce = (i: number) => spring({ frame: f - 20 - i * 6, fps: 30, config: { damping: 14 } })
  return (
    <group>
      <group rotation={[f * 0.006, f * 0.009, 0]}>
        <mesh><icosahedronGeometry args={[1.05, 1]} /><meshStandardMaterial color={OURO} wireframe emissive={OURO} emissiveIntensity={1.6} /></mesh>
      </group>
      <mesh><sphereGeometry args={[0.55, 48, 48]} /><meshStandardMaterial color={OURO_CLARO} emissive={OURO_CLARO} emissiveIntensity={2.2 + Math.sin(f * 0.15) * 0.6} /></mesh>
      {NOS.map((_, i) => {
        const [x, y, z] = pos(i, f); const s = nasce(i)
        const v = new THREE.Vector3(x, y, z)
        const meio = v.clone().multiplyScalar(0.5); const len = v.length()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize())
        const t = ((f * 0.025 + i * 0.37) % 1)
        const t2 = ((f * 0.025 + i * 0.37 + 0.5) % 1)
        return (
          <group key={i}>
            <mesh position={[x, y, z]} scale={s}><sphereGeometry args={[0.2, 32, 32]} /><meshStandardMaterial color="#fff" emissive={OURO_CLARO} emissiveIntensity={1.5} /></mesh>
            <mesh position={[x, y, z]} scale={s * (1.4 + 0.3 * Math.sin(f * 0.2 + i))}><torusGeometry args={[0.32, 0.012, 8, 48]} /><meshStandardMaterial color={OURO} emissive={OURO} emissiveIntensity={1} /></mesh>
            <mesh position={meio.toArray()} quaternion={q} scale={[1, s, 1]}><cylinderGeometry args={[0.012, 0.012, len, 6]} /><meshStandardMaterial color={OURO} emissive={OURO} emissiveIntensity={0.9} transparent opacity={0.7} /></mesh>
            {s > 0.9 && <mesh position={v.clone().multiplyScalar(t).toArray()}><sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={4} /></mesh>}
            {s > 0.9 && <mesh position={v.clone().multiplyScalar(1 - t2).toArray()}><sphereGeometry args={[0.045, 12, 12]} /><meshStandardMaterial color={OURO_CLARO} emissive={OURO_CLARO} emissiveIntensity={4} /></mesh>}
          </group>
        )
      })}
    </group>
  )
}

const Etiquetas: React.FC<{ f: number }> = ({ f }) => {
  const k = (1080 / 2) / Math.tan((FOV / 2) * Math.PI / 180)
  return (
    <>
      {NOS.map((n, i) => {
        const [x, y, z] = pos(i, f)
        const esc = k / (CAM - z)
        const sx = 960 + x * esc, sy = 540 - y * esc
        const s = spring({ frame: f - 26 - i * 6, fps: 30, config: { damping: 14 } })
        return (
          <div key={n} style={{ position: 'absolute', left: sx, top: sy + 34, transform: `translateX(-50%) scale(${s})`, padding: '8px 16px', borderRadius: 999, background: 'rgba(10,10,12,.75)', border: `1px solid ${ouro(0.45)}`, color: '#fff', fontFamily: fontTexto, fontWeight: 700, fontSize: 22, whiteSpace: 'nowrap' }}>{n}</div>
        )
      })}
      <div style={{ position: 'absolute', left: 960, top: 540, transform: 'translate(-50%,-50%)', fontFamily: fontTexto, fontWeight: 900, fontSize: 40, color: '#1a1306', letterSpacing: 1 }}>{t('IA')}</div>
    </>
  )
}

const CARTOES = [
  ['💬', t('Responde a mensagens'), t('Dia e noite, no tom do teu negócio.')],
  ['📅', t('Marca e lembra'), t('Agenda própria com lembretes automáticos.')],
  ['🎯', t('Qualifica contactos'), t('Sabes quem está pronto para comprar.')],
  ['📊', t('Relatórios sozinhos'), t('Vês onde perdes tempo e dinheiro.')],
]

export const Automacao: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const recua = interpolate(f, [190, 240], [0, 1], { ...clamp, easing: ease })
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, #120f08, #050506 70%)' }}>
      <AbsoluteFill style={{ opacity: 1 - recua * 0.65, transform: `scale(${1 - recua * 0.15})`, filter: `blur(${recua * 6}px)` }}>
        <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, CAM], fov: FOV }}>
          <ambientLight intensity={0.3} />
          <pointLight position={[0, 0, 4]} intensity={60} color={OURO_CLARO} />
          <Rede f={f} />
          <Poeira t={f} n={500} seed={9} />
          <EffectComposer><Bloom intensity={1.5} luminanceThreshold={0.2} mipmapBlur /></EffectComposer>
        </ThreeCanvas>
        <Etiquetas f={f} />
      </AbsoluteFill>
      <Plano src="negocio_tecnologia_2" de={185} dur={235} grade="neutro" escuro={0.62} fade={16} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, height: 140 }}>
        <Titulo {...tt('Ligamos tudo com IA.', ['IA'], 86)} de={10} ate={180} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, height: 160 }}>
        <Titulo {...tt('Automação onde perdes tempo.', ['perdes', 'tempo'], 100)} de={205} ate={410} />
      </div>
      <div style={{ position: 'absolute', left: 160, right: 160, top: 400, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28 }}>
        {CARTOES.map(([ic, t, d], i) => {
          const s = spring({ frame: f - 230 - i * 10, fps, config: { damping: 15 } })
          const sai = interpolate(f, [405, 418], [1, 0], clamp)
          return (
            <div key={t} style={{ opacity: s * sai, transform: `translateY(${(1 - s) * 80}px) rotateX(${(1 - s) * 30}deg)`, padding: 32, borderRadius: 26, background: 'linear-gradient(170deg, rgba(40,32,14,.85), rgba(14,12,8,.9))', border: `1px solid ${ouro(0.35)}`, boxShadow: '0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.06)', fontFamily: fontTexto, minHeight: 300 }}>
              <div style={{ fontSize: 54 }}>{ic}</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 32, marginTop: 20, lineHeight: 1.1 }}>{t}</div>
              <div style={{ color: '#b8b0a0', fontSize: 22, marginTop: 12, lineHeight: 1.35 }}>{d}</div>
              <div style={{ marginTop: 22, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.08)' }}>
                <div style={{ height: 4, borderRadius: 2, width: `${interpolate(f, [250 + i * 10, 330 + i * 10], [0, 100], clamp)}%`, background: `linear-gradient(90deg, ${OURO}, ${OURO_CLARO})` }} />
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
