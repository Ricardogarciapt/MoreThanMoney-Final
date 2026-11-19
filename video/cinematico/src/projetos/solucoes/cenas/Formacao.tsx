import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { ThreeCanvas } from '@remotion/three'
import { Titulo, clamp, fontTexto, Etiqueta, Plano } from '../../../motor/util'
import { OURO, OURO_CLARO } from '../tempo'
import { ouro } from '../../../motor/marca'

const Chao: React.FC<{ f: number }> = ({ f }) => (
  <group position={[0, -2, 0]} rotation={[-Math.PI / 2.3, 0, 0]}>
    {Array.from({ length: 41 }).map((_, i) => (
      <group key={i}>
        <mesh position={[(i - 20) * 1, (f * 0.03) % 1, 0]}><planeGeometry args={[0.02, 60]} /><meshBasicMaterial color={OURO} transparent opacity={0.35} /></mesh>
        <mesh position={[0, (i - 20) * 1 + ((f * 0.03) % 1), 0]}><planeGeometry args={[60, 0.02]} /><meshBasicMaterial color={OURO} transparent opacity={0.35} /></mesh>
      </group>
    ))}
  </group>
)

const PEDIDO = 'Resume os pedidos de hoje e prepara as respostas.'
const EQUIPA = [['Receção', 'R'], ['Vendas', 'V'], ['Gestão', 'G'], ['Operações', 'O']]

export const Formacao: React.FC = () => {
  const f = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const chars = Math.floor(interpolate(f, [110, 190], [0, PEDIDO.length], clamp))
  const cursor = Math.floor(f / 8) % 2 === 0
  const janela = spring({ frame: f - 100, fps, config: { damping: 16 } })
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #050506 0%, #0f0c06 100%)' }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0.5, 6], fov: 55 }}>
        <fog attach="fog" args={['#050506', 3, 22]} />
        <Chao f={f} />
      </ThreeCanvas>
      <Plano src="equipa_formacao_2" de={96} dur={264} grade="neutro" escuro={0.74} fade={14} />
      <Plano src="equipa_formacao_1" de={0} dur={104} grade="ouro" escuro={0.2} fade={6} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 60, height: 150 }}>
        <Titulo texto="Formamos a tua equipa em IA." de={6} ate={350} size={92} destaque={['IA']} />
      </div>
      {/* janela do assistente */}
      <div style={{ position: 'absolute', left: 130, top: 270, width: 860, opacity: janela, transform: `translateY(${(1 - janela) * 60}px) perspective(1600px) rotateY(8deg)`, fontFamily: fontTexto }}>
        <div style={{ borderRadius: 24, background: 'rgba(16,16,19,.92)', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 40px 100px rgba(0,0,0,.6)', padding: 30 }}>
          <Etiqueta style={{ fontSize: 16 }}>Assistente da equipa</Etiqueta>
          <div style={{ marginTop: 20, padding: '18px 22px', borderRadius: 16, background: '#1d1d22', color: '#fff', fontSize: 26, minHeight: 70 }}>
            {PEDIDO.slice(0, chars)}<span style={{ opacity: cursor && chars < PEDIDO.length ? 1 : 0, color: OURO_CLARO }}>▍</span>
          </div>
          <div style={{ marginTop: 22 }}>
            {['12 pedidos novos: 7 marcações, 3 orçamentos, 2 dúvidas.', 'Respostas prontas a enviar, no tom da casa.', 'Dois clientes para ligar ainda hoje.'].map((t, i) => {
              const s = spring({ frame: f - 200 - i * 18, fps, config: { damping: 15 } })
              return (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14, opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(180deg,${OURO_CLARO},${OURO})`, color: '#111', display: 'grid', placeItems: 'center', fontWeight: 900, flexShrink: 0 }}>✦</div>
                  <div style={{ color: '#e6e1d6', fontSize: 24, lineHeight: 1.35 }}>{t}</div>
                </div>
              )
            })}
          </div>
          <div style={{ color: '#666', fontSize: 15, marginTop: 6 }}>Exemplo ilustrativo</div>
        </div>
      </div>
      {/* equipa a evoluir */}
      <div style={{ position: 'absolute', right: 130, top: 280, width: 640, fontFamily: fontTexto }}>
        {EQUIPA.map(([area, ini], i) => {
          const s = spring({ frame: f - 112 - i * 12, fps, config: { damping: 15 } })
          const p = interpolate(f, [150 + i * 15, 280 + i * 15], [0, 100], clamp)
          const feito = p >= 100
          return (
            <div key={area} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '18px 22px', marginBottom: 16, borderRadius: 20, background: 'rgba(16,16,19,.85)', border: `1px solid ${feito ? `${ouro(0.6)}` : 'rgba(255,255,255,.07)'}`, opacity: s, transform: `translateX(${(1 - s) * 80}px)`, boxShadow: feito ? `0 0 40px ${ouro(0.25)}` : 'none' }}>
              <div style={{ width: 62, height: 62, borderRadius: 31, background: feito ? `linear-gradient(180deg,${OURO_CLARO},${OURO})` : '#2a2a30', color: feito ? '#111' : '#fff', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 26 }}>{ini}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontWeight: 700, fontSize: 24 }}>
                  <span>{area}</span><span style={{ color: feito ? OURO_CLARO : '#777', fontSize: 18 }}>{feito ? 'Formação concluída ✓' : 'Em formação'}</span>
                </div>
                <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: 'rgba(255,255,255,.08)' }}>
                  <div style={{ width: `${p}%`, height: 8, borderRadius: 4, background: `linear-gradient(90deg,${OURO},${OURO_CLARO})` }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, height: 100 }}>
        <Titulo texto="Menos tarefas repetidas. Mais tempo para o que importa." de={272} ate={352} size={54} peso="texto" destaque={['importa']} />
      </div>
    </AbsoluteFill>
  )
}
