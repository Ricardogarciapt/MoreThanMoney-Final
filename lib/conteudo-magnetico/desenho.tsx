/**
 * O DESENHO das peças — capa, lâmina do meio e fecho — em JSX para o Satori (next/og).
 *
 * A capa segue as capas que o Ricardo já publica (anexadas no pedido de 05/11): fotografia a
 * encher, escurecida em cima e em baixo, título condensado ENORME em caixa alta e inclinado,
 * a palavra-chave na cor da marca, um traço de pincel por baixo e o logótipo no canto.
 *
 * O Satori só desenha com as fontes que lhe dão e só entende `display: flex`: cada <div> com
 * mais de um filho leva `display: 'flex'`, senão a imagem sai em branco sem erro nenhum.
 */
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { ImageResponse } from 'next/og'
import type { Lamina } from './guiao'
import { DISCLAIMER_PT } from './regras'
import type { Marca } from './marcas'

export type Peca = {
  lamina: Lamina
  marca: Marca
  largura: number
  altura: number
  indice: number
  total: number
  /** data: URI da fotografia de fundo (opcional). */
  fundo?: string | null
  /** data: URI do logótipo (opcional). */
  logo?: string | null
  palavraChave?: string
  /** Mostrar o aviso educativo no rodapé. */
  aviso?: boolean
  /** Sem arroba/logótipo (os cartões do reel: a assinatura vai nas legendas do vídeo). */
  semAssinatura?: boolean
}

const PRETO = '#05070b'

/** Divide o título em palavras e pinta as do destaque. */
function Titulo({ texto, destaque, cor, corDestaque, tamanho }: { texto: string; destaque: string; cor: string; corDestaque: string; tamanho: number }) {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const marcadas = new Set(destaque.split(/\s+/).filter(Boolean))
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        fontFamily: 'Anton',
        fontSize: tamanho,
        lineHeight: 1.02,
        letterSpacing: -1,
        textAlign: 'center',
        transform: 'skewX(-8deg)',
        textShadow: '0 6px 28px rgba(0,0,0,0.65)',
      }}
    >
      {palavras.map((p, i) => (
        <span key={i} style={{ color: marcadas.has(p) ? corDestaque : cor, marginRight: i < palavras.length - 1 ? tamanho * 0.22 : 0 }}>
          {p}
        </span>
      ))}
    </div>
  )
}

/** O traço de pincel: uma barra inclinada com as pontas a desvanecer. */
function Traco({ cor, cor2, largura }: { cor: string; cor2: string; largura: number }) {
  return (
    <div
      style={{
        display: 'flex',
        width: largura,
        height: 16,
        marginTop: 18,
        marginBottom: 18,
        borderRadius: 12,
        transform: 'skewX(-20deg) rotate(-1.5deg)',
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${cor} 14%, ${cor2} 60%, ${cor} 86%, rgba(0,0,0,0) 100%)`,
      }}
    />
  )
}

function tamanhoTitulo(texto: string, largura: number, alto: boolean): number {
  const n = texto.length
  const base = alto ? 170 : 150
  if (n <= 12) return base
  if (n <= 24) return Math.round(base * 0.8)
  if (n <= 40) return Math.round(base * 0.62)
  if (n <= 60) return Math.round(base * 0.5)
  return Math.round((base * 0.42 * largura) / 1080)
}

function Assinatura({ marca, logo }: { marca: Marca; logo?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ display: 'flex', fontFamily: 'Montserrat', fontWeight: 800, fontSize: 30, color: '#ffffff', opacity: 0.85 }}>
        {marca.arroba}
      </div>
      {logo ? <img alt="" src={logo} width={120} height={120} style={{ objectFit: 'contain' }} /> : null}
    </div>
  )
}

export function pecaElemento(p: Peca) {
  const { lamina: l, marca, largura, altura } = p
  const alto = altura > largura * 1.5
  const tam = tamanhoTitulo(l.titulo, largura, alto)
  const capa = l.papel === 'capa'
  const fim = l.papel === 'fim'

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: largura,
        height: altura,
        background: marca.fundo,
        ...(p.fundo ? {} : { backgroundImage: marca.fundoGradiente }),
        fontFamily: 'Montserrat',
        overflow: 'hidden',
      }}
    >
      {p.fundo ? (
        <img alt="" src={p.fundo} width={largura} height={altura} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
      ) : null}
      {/* Escurece em cima e em baixo, onde vive o texto. */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: largura,
          height: altura,
          backgroundImage: p.fundo
            ? `linear-gradient(180deg, rgba(5,7,11,0.82) 0%, rgba(5,7,11,0.15) 34%, rgba(5,7,11,0.15) 52%, rgba(5,7,11,0.92) 100%)`
            : 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: largura,
          height: altura,
          flexDirection: 'column',
          justifyContent: capa ? 'space-between' : 'center',
          alignItems: 'center',
          padding: alto ? '120px 70px 90px' : '80px 70px 60px',
        }}
      >
        {/* Topo: contador nas lâminas do meio, antetítulo na capa. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {!capa && p.total > 1 ? (
            <div style={{ display: 'flex', fontFamily: 'Anton', fontSize: 34, color: marca.destaque, marginBottom: 26 }}>
              {`${String(p.indice + 1).padStart(2, '0')} / ${String(p.total).padStart(2, '0')}`}
            </div>
          ) : null}
          {l.antetitulo ? (
            <div
              style={{
                display: 'flex',
                fontWeight: 800,
                fontSize: 30,
                letterSpacing: 4,
                color: marca.destaque2,
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {l.antetitulo}
            </div>
          ) : null}
          <Titulo texto={l.titulo} destaque={l.destaque} cor={marca.texto} corDestaque={marca.destaque2} tamanho={capa ? tam : Math.round(tam * 0.8)} />
          <Traco cor={marca.destaque} cor2={marca.destaque2} largura={Math.round(largura * 0.62)} />
          {!capa && l.corpo ? (
            <div
              style={{
                display: 'flex',
                fontWeight: 500,
                fontSize: alto ? 46 : 42,
                lineHeight: 1.32,
                color: '#e8ebf0',
                textAlign: 'center',
                maxWidth: largura - 160,
              }}
            >
              {l.corpo}
            </div>
          ) : null}
          {fim && p.palavraChave ? (
            <div
              style={{
                display: 'flex',
                marginTop: 44,
                padding: '22px 46px',
                borderRadius: 999,
                background: marca.destaque,
                color: PRETO,
                fontWeight: 800,
                fontSize: 38,
                letterSpacing: 1,
              }}
            >
              {`COMENTA «${p.palavraChave}»`}
            </div>
          ) : null}
        </div>

        {/* Base: corpo da capa (curto) + assinatura. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 18 }}>
          {capa && l.corpo ? (
            <div style={{ display: 'flex', fontFamily: 'Anton', fontSize: alto ? 64 : 54, lineHeight: 1.08, color: '#ffffff', textAlign: 'center', transform: 'skewX(-8deg)' }}>
              {l.corpo.toUpperCase()}
            </div>
          ) : null}
          {p.semAssinatura ? null : (
            <div style={{ display: 'flex', width: '100%', justifyContent: 'flex-end' }}>
              <Assinatura marca={marca} logo={p.logo} />
            </div>
          )}
          {p.aviso ? (
            <div style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>{DISCLAIMER_PT}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── fontes e imagens (lidas do disco uma vez) ──────────────────────────────────────────────────

type Fonte = { name: string; data: ArrayBuffer; weight: 400 | 500 | 800; style: 'normal' }
let fontes: Fonte[] | null = null

/**
 * Montserrat (SIL OFL 1.1) vive em public/fonts (subconjunto latino, woff — o Satori lê woff,
 * não woff2). Até 06/11 vinha do Google Fonts a cada arranque, mas o primeiro `src` do CSS é o
 * subconjunto CIRÍLICO: sem letras latinas, o Satori caía na Anton e o texto de apoio saía
 * todo condensado sem ninguém dar por isso.
 */
function lerFonte(nome: string): ArrayBuffer {
  const b = fs.readFileSync(path.join(process.cwd(), 'public/fonts', nome))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

export async function carregarFontes(): Promise<Fonte[]> {
  if (fontes) return fontes
  fontes = [
    { name: 'Anton', data: lerFonte('Anton-Regular.ttf'), weight: 400, style: 'normal' },
    { name: 'Montserrat', data: lerFonte('Montserrat-500.woff'), weight: 500, style: 'normal' },
    { name: 'Montserrat', data: lerFonte('Montserrat-800.woff'), weight: 800, style: 'normal' },
  ]
  return fontes
}

/** Um ficheiro de `public/` como data: URI — o Satori não sabe o que é `/logo.png`. */
export function publicoComoDataUri(rel: string | null): string | null {
  if (!rel) return null
  try {
    const f = path.join(process.cwd(), 'public', rel.replace(/^\/+/, ''))
    const ext = path.extname(f).slice(1).toLowerCase()
    const tipo = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${tipo};base64,${fs.readFileSync(f).toString('base64')}`
  } catch {
    return null
  }
}

const ANFITRIOES_FUNDO = [/\.supabase\.co$/i, /(^|\.)morethanmoney\.pt$/i, /(^|\.)pexels\.com$/i, /(^|\.)unsplash\.com$/i]

/**
 * Vai buscar a fotografia de fundo e devolve-a como data: URI.
 *
 * Só de anfitriões conhecidos (o nosso Storage, o site, bancos de imagens) e com tecto de
 * tamanho: a rota corre no servidor, e um endereço qualquer seria um proxy aberto.
 */
export async function fundoComoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:image/')) return url.length < 8_000_000 ? url : null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !ANFITRIOES_FUNDO.some((re) => re.test(u.hostname))) return null
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const tipo = r.headers.get('content-type') || 'image/jpeg'
    if (!/^image\/(png|jpe?g|webp)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.byteLength > 6_000_000) return null
    return `data:${tipo.split(';')[0]};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function renderPeca(p: Peca): Promise<Buffer> {
  const res = new ImageResponse(pecaElemento(p), { width: p.largura, height: p.altura, fonts: await carregarFontes() })
  return Buffer.from(await res.arrayBuffer())
}
