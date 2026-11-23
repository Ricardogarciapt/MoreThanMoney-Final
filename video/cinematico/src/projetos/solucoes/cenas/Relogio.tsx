import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Titulo, clamp, ease, rng, Plano } from '../../../motor/util'
import { OURO, OURO_CLARO } from '../tempo'
import { t, tt } from '../i18n'

const Poeira: React.FC<{ n?: number; seed?: number; cor?: string; t: number }> = ({ n = 400, seed = 3, cor = OURO_CLARO, t }) => {
  const pos = useMemo(() => {
    const r = rng(seed); const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { a[i * 3] = (r() - 0.5) * 30; a[i * 3 + 1] = (r() - 0.5) * 18; a[i * 3 + 2] = -r() * 20 }
    return a
  }, [n, seed])
  return (
    <points rotation={[0, t * 0.002, 0]} position={[0, t * 0.004, 0]}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.05} color={cor} transparent opacity={0.7} />
    </points>
  )
}
export { Poeira }

export const Relogio: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const vel = interpolate(f, [0, 110, 175], [0.02, 0.05, 0.9], { ...clamp, easing: (x) => x * x })
  // ângulo acumulado do ponteiro dos minutos
  let ang = 0; for (let i = 0; i < f; i++) ang += interpolate(i, [0, 110, 175], [0.02, 0.05, 0.9], clamp)
  const camZ = interpolate(f, [0, 150, 180], [9, 6.5, 1.2], { ...clamp, easing: ease })
  const inclina = interpolate(f, [0, 180], [0.35, -0.05], clamp)
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, camZ], fov: 40 }} gl={{ antialias: true }}>
        <color attach="background" args={['#050507']} />
        <ambientLight intensity={0.25} />
        <pointLight position={[4, 4, 6]} intensity={120} color={OURO_CLARO} />
        <pointLight position={[-5, -2, 4]} intensity={60} color="#ffffff" />
        <pointLight position={[0, 0, -3]} intensity={40} color={OURO} />
        <group rotation={[inclina, inclina * 0.6, 0]} position={[0, 0, 0]}>
          <mesh>
            <torusGeometry args={[2.2, 0.09, 32, 128]} />
            <meshStandardMaterial color={OURO} metalness={0.9} roughness={0.25} emissive={OURO} emissiveIntensity={0.35} />
          </mesh>
          <mesh>
            <torusGeometry args={[2.45, 0.015, 16, 128]} />
            <meshStandardMaterial color={OURO_CLARO} emissive={OURO_CLARO} emissiveIntensity={1.2} />
          </mesh>
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * Math.PI * 2; const grande = i % 5 === 0
            return (
              <mesh key={i} position={[Math.sin(a) * 1.95, Math.cos(a) * 1.95, 0]} rotation={[0, 0, -a]}>
                <boxGeometry args={[grande ? 0.06 : 0.025, grande ? 0.28 : 0.12, 0.04]} />
                <meshStandardMaterial color={grande ? OURO_CLARO : '#8a7a55'} emissive={grande ? OURO_CLARO : '#000'} emissiveIntensity={grande ? 0.8 : 0} />
              </mesh>
            )
          })}
          {/* horas */}
          <group rotation={[0, 0, -ang / 12 - 5.2]}><mesh position={[0, 0.55, 0.05]}><boxGeometry args={[0.09, 1.1, 0.05]} /><meshStandardMaterial color="#f5f0e6" emissive="#ffffff" emissiveIntensity={0.3} /></mesh></group>
          {/* minutos */}
          <group rotation={[0, 0, -ang - 4.9]}><mesh position={[0, 0.8, 0.09]}><boxGeometry args={[0.05, 1.6, 0.05]} /><meshStandardMaterial color={OURO_CLARO} emissive={OURO_CLARO} emissiveIntensity={1.5} /></mesh></group>
          {/* segundos */}
          <group rotation={[0, 0, -f * (0.105 + vel)]}><mesh position={[0, 0.7, 0.12]}><boxGeometry args={[0.015, 1.9, 0.02]} /><meshStandardMaterial color="#ff5b4a" emissive="#ff3b2a" emissiveIntensity={2} /></mesh></group>
          <mesh position={[0, 0, 0.14]}><cylinderGeometry args={[0.08, 0.08, 0.05, 32]} /><meshStandardMaterial color={OURO_CLARO} metalness={1} roughness={0.2} /></mesh>
        </group>
        <Poeira t={f} />
        <EffectComposer><Bloom intensity={1.4} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur /></EffectComposer>
      </ThreeCanvas>
      <Plano src="noite_cansado_2" de={0} dur={60} grade="noite" fade={3} desde={20} />
      <Plano src="noite_cansado_1" de={54} dur={62} grade="noite" desde={30} />
      <Titulo texto="23:47" de={12} ate={70} size={230} y={-10} cor="#fff" />
      <Titulo {...tt('E ainda estás a responder a mensagens?', ['mensagens'], 96)} de={78} ate={160} />
    </AbsoluteFill>
  )
}
