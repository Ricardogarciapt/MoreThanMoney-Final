import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { Titulo, clamp, rng, Plano } from '../../../motor/util'
import { OURO, OURO_CLARO } from '../tempo'

const Sobem: React.FC<{ f: number }> = ({ f }) => {
  const base = useMemo(() => { const r = rng(21); return Array.from({ length: 900 }, () => [(r() - 0.5) * 40, r() * 14 - 2, -r() * 40, 0.5 + r()]) }, [])
  const pos = new Float32Array(base.length * 3)
  base.forEach(([x, y, z, v], i) => { pos[i * 3] = x + Math.sin(f * 0.02 + i) * 0.3; pos[i * 3 + 1] = ((y + f * 0.02 * v + 2) % 14) - 2; pos[i * 3 + 2] = z })
  return (
    <points key={f}><bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry><pointsMaterial size={0.08} color={OURO_CLARO} transparent opacity={0.8} /></points>
  )
}

export const Liberdade: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const sol = interpolate(f, [0, 210], [-3.2, -0.4], clamp)
  const cz = interpolate(f, [0, 210], [10, 4], clamp)
  return (
    <AbsoluteFill>
      {f < 14 && <ThreeCanvas width={width} height={height} camera={{ position: [0, 1.2, cz], fov: 50 }}>
        <color attach="background" args={['#0a0604']} />
        <fog attach="fog" args={['#2a1606', 6, 45]} />
        <mesh position={[0, sol, -30]}><sphereGeometry args={[5, 64, 64]} /><meshBasicMaterial color="#ffd27a" /></mesh>
        <mesh position={[0, sol, -31]}><sphereGeometry args={[9, 64, 64]} /><meshBasicMaterial color={OURO} transparent opacity={0.12} /></mesh>
        {/* mar dourado / horizonte */}
        <mesh position={[0, -1.5, -10]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[200, 80]} /><meshStandardMaterial color="#120a03" metalness={0.9} roughness={0.35} /></mesh>
        <pointLight position={[0, 2, -25]} intensity={260} distance={80} color="#ffc061" />
        {Array.from({ length: 30 }).map((_, i) => (
          <mesh key={i} position={[0, -1.49, -28 + i * 0.9 + ((f * 0.04) % 0.9)]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.4 + Math.sin(i * 1.7 + f * 0.05) * 0.3 + i * 0.08, 0.05]} />
            <meshBasicMaterial color={OURO_CLARO} transparent opacity={0.6 - i * 0.015} />
          </mesh>
        ))}
        <Sobem f={f} />
        <EffectComposer><Bloom intensity={1.8} luminanceThreshold={0.3} mipmapBlur /></EffectComposer>
      </ThreeCanvas>}
      <Plano src="liberdade_1" de={0} dur={112} grade="ouro" fade={6} zoom={[1.02, 1.1]} />
      <Plano src="liberdade_2" de={104} dur={106} grade="ouro" fade={8} zoom={[1.05, 1.12]} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0) 40%, rgba(0,0,0,.45))' }} />
      <Titulo texto="Mais tempo." de={8} ate={70} size={150} y={-60} />
      <Titulo texto="Mais liberdade." de={72} ate={130} size={150} y={-60} destaque={['liberdade']} />
      <Titulo texto="Mais do que dinheiro." de={135} ate={200} size={120} y={-60} destaque={['dinheiro']} />
    </AbsoluteFill>
  )
}
