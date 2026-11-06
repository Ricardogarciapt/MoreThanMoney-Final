/**
 * O DESENHO dos carrosséis diários, em JSX para o Satori (next/og). 1080×1350 (4:5).
 *
 * Ricardo (@ricardogarciapt) — o estilo das capas dele: fotografia a preto e branco, uma linha em
 * teal e uma linha ENORME em branco, condensada e inclinada (Anton). As lâminas do meio são pretas,
 * com a cabeça «Ricardo Garcia · @ricardogarciapt» e a fotografia redonda.
 * MTM (@morethanmoney.pt) — ouro sobre carvão (#D2A63C / #E9C46A), logótipo da casa.
 *
 * Este ficheiro é PURO (só React): recebe as imagens já em data: URI. Assim a guarda e a
 * pré-visualização local desenham exactamente o mesmo que a produção.
 * Lembrete do Satori: cada <div> com mais de um filho leva `display: 'flex'`.
 */
import React from 'react'
import type { Lamina, Perfil } from './tipos'

export const LARGURA = 1080
export const ALTURA = 1350

const TEAL = '#0097b2'
const TEAL_CLARO = '#19b5d1'
const OURO = '#D2A63C'
const OURO_CLARO = '#E9C46A'

type Estilo = { cor: string; cor2: string; fundo: string; nome: string; arroba: string }
const ESTILO: Record<Perfil, Estilo> = {
  ricardo: { cor: TEAL, cor2: TEAL_CLARO, fundo: '#0a0a0a', nome: 'Ricardo Garcia', arroba: '@ricardogarciapt' },
  mtm: { cor: OURO, cor2: OURO_CLARO, fundo: '#0b0d12', nome: 'More Than Money', arroba: '@morethanmoney.pt' },
}

export type Imagens = {
  /** Fotografia de fundo da capa e do fecho (Ricardo). */
  foto?: string | null
  /** Fotografia redonda da cabeça das lâminas do meio (Ricardo). */
  avatar?: string | null
  /** Logótipo MTM. */
  logo?: string | null
}

export type PecaCarrossel = {
  perfil: Perfil
  lamina: Lamina
  indice: number
  total: number
  palavraChave?: string
  img: Imagens
  aviso: string
}

/** Tamanho da linha grande consoante o comprimento (Anton é condensada: cabe muito). */
function tamTitulo(t: string, capa: boolean): number {
  const n = t.length
  const base = capa ? 190 : 132
  if (n <= 10) return base
  if (n <= 16) return Math.round(base * 0.84)
  if (n <= 22) return Math.round(base * 0.72)
  if (n <= 30) return Math.round(base * 0.6)
  return Math.round(base * 0.5)
}

function LinhaCor({ texto, cor, tam }: { texto: string; cor: string; tam: number }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'Anton',
        fontSize: tam,
        lineHeight: 1.05,
        color: cor,
        textTransform: 'uppercase',
        transform: 'skewX(-9deg)',
        textShadow: '0 4px 0 rgba(0,0,0,0.85), 0 8px 26px rgba(0,0,0,0.6)',
        letterSpacing: 0.5,
      }}
    >
      {texto}
    </div>
  )
}

function LinhaGrande({ texto, tam }: { texto: string; tam: number }) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'Anton',
        fontSize: tam,
        lineHeight: 0.98,
        color: '#ffffff',
        textTransform: 'uppercase',
        transform: 'skewX(-9deg)',
        textShadow: '0 6px 30px rgba(0,0,0,0.7)',
        letterSpacing: -0.5,
      }}
    >
      {texto}
    </div>
  )
}

function Desliza({ cor }: { cor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 24, letterSpacing: 5, color: 'rgba(255,255,255,0.75)' }}>
      <div style={{ display: 'flex' }}>DESLIZA</div>
      <div style={{ display: 'flex', marginLeft: 14, color: cor, fontSize: 30 }}>→</div>
    </div>
  )
}

function Cabeca({ e, img, perfil, indice, total }: { e: Estilo; img: Imagens; perfil: Perfil; indice: number; total: number }) {
  const foto = perfil === 'ricardo' ? img.avatar : img.logo
  return (
    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {foto ? (
          <img
            alt=""
            src={foto}
            width={92}
            height={92}
            style={{
              borderRadius: 999,
              objectFit: perfil === 'ricardo' ? 'cover' : 'contain',
              objectPosition: 'center 22%',
              border: `3px solid ${e.cor}`,
              filter: perfil === 'ricardo' ? 'grayscale(1)' : 'none',
              background: '#000',
            }}
          />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22 }}>
          <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 32, color: '#ffffff' }}>{e.nome}</div>
          <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 500, fontSize: 25, color: 'rgba(255,255,255,0.6)' }}>{e.arroba}</div>
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: 'Anton', fontSize: 40, color: e.cor }}>{`${indice + 1}/${total}`}</div>
    </div>
  )
}

/** Barra de progresso: quanto do carrossel já foi lido. */
function Progresso({ e, indice, total }: { e: Estilo; indice: number; total: number }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 6 }}>
      <div style={{ display: 'flex', width: `${Math.round(((indice + 1) / total) * 100)}%`, height: 6, background: e.cor, borderRadius: 6 }} />
    </div>
  )
}

function FundoFoto({ foto }: { foto: string }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: LARGURA, height: ALTURA }}>
      <img
        alt=""
        src={foto}
        width={LARGURA}
        height={ALTURA}
        style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover', objectPosition: 'center 18%', filter: 'grayscale(1) contrast(1.12)' }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: LARGURA,
          height: ALTURA,
          backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 22%, rgba(0,0,0,0.05) 42%, rgba(0,0,0,0.82) 66%, rgba(0,0,0,0.97) 100%)',
        }}
      />
    </div>
  )
}

function FundoMarca({ e, marcaDagua }: { e: Estilo; marcaDagua?: string | null }) {
  return (
    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: LARGURA, height: ALTURA }}>
      {marcaDagua ? (
        <img alt="" src={marcaDagua} width={820} height={820} style={{ position: 'absolute', top: 60, left: 330, objectFit: 'contain', opacity: 0.13 }} />
      ) : null}
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        top: 0,
        left: 0,
        width: LARGURA,
        height: ALTURA,
        backgroundImage: `radial-gradient(900px 700px at 85% 0%, rgba(210,166,60,0.22), rgba(0,0,0,0) 70%), radial-gradient(700px 600px at 0% 100%, rgba(210,166,60,0.10), rgba(0,0,0,0) 70%)`,
      }}
    />
    </div>
  )
}

/** Capa e fecho: fotografia (Ricardo) ou fundo da marca (MTM), texto em baixo. */
function CapaOuFecho(p: PecaCarrossel & { e: Estilo }) {
  const { e, lamina: l, perfil, img } = p
  const capa = p.indice === 0
  const comFoto = perfil === 'ricardo' && !!img.foto
  return (
    <div style={{ display: 'flex', position: 'relative', width: LARGURA, height: ALTURA, background: e.fundo, overflow: 'hidden' }}>
      {comFoto ? <FundoFoto foto={img.foto as string} /> : <FundoMarca e={e} marcaDagua={img.logo} />}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: LARGURA,
          height: ALTURA,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px 60px',
        }}
      >
        {/* Topo: arroba (Ricardo) ou logótipo (MTM). */}
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 28, color: 'rgba(255,255,255,0.92)', letterSpacing: 1 }}>{e.arroba}</div>
          {perfil === 'mtm' && img.logo ? <img alt="" src={img.logo} width={150} height={150} style={{ objectFit: 'contain' }} /> : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <LinhaCor texto={l.linha} cor={e.cor2} tam={capa ? 66 : 56} />
          <div style={{ display: 'flex', marginTop: 8 }}>
            <LinhaGrande texto={l.titulo} tam={tamTitulo(l.titulo, true)} />
          </div>
          {!comFoto ? <div style={{ display: 'flex', width: 220, height: 10, marginTop: 26, background: e.cor, borderRadius: 10, transform: 'skewX(-20deg)' }} /> : null}
          {!capa && l.corpo ? (
            <div style={{ display: 'flex', marginTop: 30, fontFamily: 'Montserrat', fontWeight: 500, fontSize: 36, lineHeight: 1.38, color: '#e6e6e6', maxWidth: 900 }}>
              {l.corpo}
            </div>
          ) : null}
          {!capa && p.palavraChave ? (
            <div style={{ display: 'flex', marginTop: 36 }}>
              <div style={{ display: 'flex', padding: '20px 44px', borderRadius: 999, background: e.cor, color: '#0b0b0b', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 36, letterSpacing: 1 }}>
                {`COMENTA «${p.palavraChave}»`}
              </div>
            </div>
          ) : null}
          {!capa && !p.palavraChave ? (
            <div style={{ display: 'flex', marginTop: 36 }}>
              <div style={{ display: 'flex', padding: '18px 40px', borderRadius: 999, border: `3px solid ${e.cor}`, color: '#ffffff', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 32 }}>
                {`SEGUE ${e.arroba}`}
              </div>
            </div>
          ) : null}
          <div style={{ display: 'flex', width: '100%', justifyContent: capa ? 'flex-end' : 'flex-start', marginTop: 40 }}>
            {capa ? <Desliza cor={e.cor2} /> : <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 500, fontSize: 19, color: 'rgba(255,255,255,0.5)' }}>{p.aviso}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Lâmina do meio: fundo preto, cabeça com nome, uma ideia grande. */
function Meio(p: PecaCarrossel & { e: Estilo }) {
  const { e, lamina: l } = p
  return (
    <div style={{ display: 'flex', position: 'relative', width: LARGURA, height: ALTURA, background: e.fundo, overflow: 'hidden' }}>
      {p.perfil === 'mtm' ? <FundoMarca e={e} /> : null}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: LARGURA,
          height: ALTURA,
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px 64px',
        }}
      >
        <Cabeca e={e} img={p.img} perfil={p.perfil} indice={p.indice} total={p.total} />
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <LinhaCor texto={l.linha} cor={e.cor2} tam={52} />
          <div style={{ display: 'flex', marginTop: 10 }}>
            <LinhaGrande texto={l.titulo} tam={tamTitulo(l.titulo, false)} />
          </div>
          <div style={{ display: 'flex', width: 180, height: 10, marginTop: 30, marginBottom: 34, background: e.cor, borderRadius: 10, transform: 'skewX(-20deg)' }} />
          <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 500, fontSize: 44, lineHeight: 1.42, color: '#e9e9e9', maxWidth: 920 }}>{l.corpo || ''}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <Progresso e={e} indice={p.indice} total={p.total} />
          <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end', marginTop: 22 }}>
            <Desliza cor={e.cor2} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function elementoCarrossel(p: PecaCarrossel) {
  const e = ESTILO[p.perfil]
  const extremo = p.indice === 0 || p.indice === p.total - 1
  return extremo ? <CapaOuFecho {...p} e={e} /> : <Meio {...p} e={e} />
}
