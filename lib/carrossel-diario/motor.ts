/**
 * O MOTOR do carrossel diário: escolhe o carrossel do dia, desenha as lâminas, guarda-as no
 * Storage e põe a publicação na fila `social_scheduled_posts` (o cron ig-publish publica).
 *
 * Ordem do Ricardo (06/11/2026): um carrossel novo por dia em cada perfil, publicado sozinho.
 *   · @ricardogarciapt — às 19:00 de Lisboa; branding Ricardo Garcia.
 *   · @morethanmoney.pt — às 12:30 de Lisboa; branding MTM, a rodar pelas áreas da casa.
 * Primeiro sai o banco escrito à mão; depois a IA escreve sobre o próximo tema da lista.
 *
 * O interruptor vive em `site_settings.carrossel_diario` ({"ricardo":true,"mtm":true}). Desligado,
 * o motor não agenda e o ig-publish devolve a rascunho o que já estava na fila.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { uploadBufferToBucket } from '@/lib/instagram/publish'
import { carregarFontes } from '@/lib/conteudo-magnetico/desenho'
import { DISCLAIMER_PT, verificarObjecto } from '@/lib/conteudo-magnetico/regras'
import { BANCO } from './banco'
import { TEMAS, type Tema } from './temas'
import { gerarCarrossel } from './gerar'
import { ALTURA, LARGURA, elementoCarrossel, type Imagens } from './desenho'
import { lerInterruptor } from './interruptor'
import { ARROBA, CRIADO_POR, EDUCADOR_AREA, EDUCADOR_NOME, IG_ID, type Carrossel, type Educador, type Perfil } from './tipos'
import { visuaisDoCarrossel } from './visuais'

/** Hora de publicação (UTC). Lisboa está em UTC+0 no inverno e UTC+1 no verão. */
const HORA: Record<Perfil, { h: number; m: number }> = { ricardo: { h: 19, m: 0 }, mtm: { h: 12, m: 30 } }

/**
 * Fotografias do Ricardo para a capa e o fecho (sempre desenhadas a preto e branco).
 * As locais são as fotos de referência que ele aprovou (PR #165); as remotas são retratos gerados
 * por IA a partir delas (Higgsfield, 23/10). Se uma remota falhar, usa-se uma local.
 */
const FOTOS_LOCAIS = ['capas/ref/rg-cerebro.jpg', 'capas/ref/rg-bracos.jpg']
const FOTOS_IA = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_3EREu4FRjd9JfQ4QQ3vtvBw838A/hf_20261023_211219_edd1726b-46cb-4a14-9b88-1c5e0a1a7717.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3EREu4FRjd9JfQ4QQ3vtvBw838A/hf_20261023_211220_819f988e-e49f-4024-8bab-73f50b0a2f8a.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3EREu4FRjd9JfQ4QQ3vtvBw838A/hf_20261023_211220_9bfe033d-f42e-46a7-9dba-ccdfe2fd1e1c.png',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3EREu4FRjd9JfQ4QQ3vtvBw838A/hf_20261023_211306_2fa61a2a-2bfe-4faf-be47-abb3f3522c80.png',
]
const AVATAR = 'capas/ref/rg-bracos.jpg'
/** Fotografias dos educadores (as mesmas dos reels; retratos a ouro sobre preto). */
const FOTO_EDUCADOR: Record<Educador, string> = {
  ricardo: 'reels/educadores/fotos/ricardo-garcia.jpg',
  ruben: 'reels/educadores/fotos/ruben-pereira.jpg',
  maria: 'reels/educadores/fotos/maria-costa.jpg',
}
const LOGO = 'logo-mtm-transparent.png'

function local(rel: string): string | null {
  try {
    const f = path.join(process.cwd(), 'public', rel)
    const tipo = rel.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return `data:${tipo};base64,${fs.readFileSync(f).toString('base64')}`
  } catch {
    return null
  }
}

/** Só endereços desta lista fixa — nunca um URL vindo de fora. */
async function remota(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return null
    const tipo = (r.headers.get('content-type') || 'image/png').split(';')[0]
    if (!/^image\/(png|jpe?g|webp)$/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return buf.byteLength < 8_000_000 ? `data:${tipo};base64,${buf.toString('base64')}` : null
  } catch {
    return null
  }
}

/** A foto do dia `n` (roda pela lista: IA e locais intercaladas). */
async function fotoDoDia(n: number): Promise<string | null> {
  const lista = [...FOTOS_IA.map((u) => ({ u, ia: true })), ...FOTOS_LOCAIS.map((u) => ({ u, ia: false }))]
  const escolha = lista[((n % lista.length) + lista.length) % lista.length]
  const img = escolha.ia ? await remota(escolha.u) : local(escolha.u)
  return img ?? local(FOTOS_LOCAIS[n % FOTOS_LOCAIS.length])
}

export async function desenharCarrossel(c: Carrossel, dia: number): Promise<Buffer[]> {
  const fontes = await carregarFontes()
  const img: Imagens = { avatar: local(AVATAR), logo: local(LOGO) }
  const fotoEdu = c.perfil === 'mtm' && c.educador ? local(FOTO_EDUCADOR[c.educador]) : null
  const fotoCapa = c.perfil === 'ricardo' ? await fotoDoDia(dia) : fotoEdu
  const fotoFecho = c.perfil === 'ricardo' ? await fotoDoDia(dia + 3) : fotoEdu
  const assinatura = c.perfil === 'mtm' && c.educador ? `${EDUCADOR_NOME[c.educador]} · ${EDUCADOR_AREA[c.educador]}` : undefined
  const visuais = visuaisDoCarrossel(c)
  const total = c.laminas.length
  const out: Buffer[] = []
  for (let i = 0; i < total; i++) {
    const el = elementoCarrossel({
      perfil: c.perfil,
      lamina: c.laminas[i],
      indice: i,
      total,
      palavraChave: c.palavraChave,
      img: { ...img, foto: i === 0 ? fotoCapa : fotoFecho },
      aviso: DISCLAIMER_PT,
      visual: visuais[i],
      assinatura,
    })
    const res = new ImageResponse(el, { width: LARGURA, height: ALTURA, fonts: fontes })
    out.push(Buffer.from(await res.arrayBuffer()))
  }
  return out
}

/** Dia corrido desde 01/01/2026 — roda as fotos e serve de semente estável. */
export function diaN(d = new Date()): number {
  return Math.floor((d.getTime() - Date.UTC(2026, 0, 1)) / 86_400_000)
}

type Escolha = { carrossel?: Carrossel; origem: 'banco' | 'ia'; motivo?: string; fornecedor?: string }

/** O banco primeiro; esgotado, a IA sobre o tema que não sai há mais tempo. */
export async function escolherCarrossel(perfil: Perfil, agora = new Date()): Promise<Escolha> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('social_scheduled_posts')
    .select('pillar, created_at, status')
    .eq('created_by', CRIADO_POR[perfil])
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(500)
  const usados = (data ?? []).map((r) => String(r.pillar || '').replace(/^carrossel:/, ''))
  const doBanco = BANCO[perfil].find((c) => !usados.includes(c.id))
  if (doBanco) return { carrossel: doBanco, origem: 'banco' }

  // Tema: o primeiro que nunca saiu; senão o que saiu há mais tempo.
  const ultimaVez = (t: Tema) => {
    const i = usados.findIndex((u) => u.startsWith(`ia-${t.slug}-`))
    return i < 0 ? Infinity : i // índice maior = mais antigo (lista vem do mais recente)
  }
  const tema = [...TEMAS[perfil]].sort((a, b) => ultimaVez(b) - ultimaVez(a))[0]
  const dataId = agora.toISOString().slice(0, 10).replace(/-/g, '')
  const r = await gerarCarrossel(perfil, tema, `ia-${tema.slug}-${dataId}`)
  return { ...r, origem: 'ia' }
}

export type Resultado = {
  perfil: Perfil
  estado: 'agendado' | 'ja_havia' | 'desligado' | 'falhou'
  id?: string
  origem?: string
  agendado_para?: string
  capa?: string
  motivo?: string
}

function horaDePublicar(perfil: Perfil, agora: Date): Date {
  const h = HORA[perfil]
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), h.h, h.m))
  // Se o cron correu depois da hora (re-run manual), sai daqui a 10 minutos.
  return d.getTime() > agora.getTime() ? d : new Date(agora.getTime() + 10 * 60_000)
}

export async function agendarDia(perfil: Perfil, opts: { forcar?: boolean; agora?: Date } = {}): Promise<Resultado> {
  const agora = opts.agora ?? new Date()
  const db = getSupabaseAdmin()
  const ligado = await lerInterruptor()
  if (!ligado[perfil]) return { perfil, estado: 'desligado' }

  if (!opts.forcar) {
    const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())).toISOString()
    const { data: hoje } = await db
      .from('social_scheduled_posts')
      .select('id, pillar')
      .eq('created_by', CRIADO_POR[perfil])
      .gte('created_at', inicioDia)
      .limit(1)
    if (hoje && hoje.length) return { perfil, estado: 'ja_havia', id: String(hoje[0].pillar) }
  }

  const escolha = await escolherCarrossel(perfil, agora)
  if (!escolha.carrossel) return { perfil, estado: 'falhou', origem: escolha.origem, motivo: escolha.motivo }
  const c = escolha.carrossel
  // Última barreira: nem o banco escapa às regras (nomes proibidos, promessas, brasileirismos).
  const avisos = verificarObjecto(c)
  if (avisos.length) {
    return { perfil, estado: 'falhou', id: c.id, motivo: avisos.map((a) => `${a.tipo}: ${a.trecho}`).join('; ') }
  }

  const pngs = await desenharCarrossel(c, diaN(agora))
  const urls: string[] = []
  for (const png of pngs) urls.push(await uploadBufferToBucket(png, 'image/png', `carrossel-diario/${perfil}`))

  const quando = horaDePublicar(perfil, agora)
  const { error } = await db.from('social_scheduled_posts').insert({
    channel: 'instagram',
    ig_account_id: IG_ID[perfil],
    ig_username: ARROBA[perfil].slice(1),
    pillar: `carrossel:${c.id}`,
    media_type: 'CAROUSEL',
    media_urls: urls,
    caption: c.legenda,
    scheduled_at: quando.toISOString(),
    status: 'approved',
    approved_by: 'carrossel-diario (ordem do Ricardo, 06/11/2026)',
    approved_at: agora.toISOString(),
    created_by: CRIADO_POR[perfil],
  })
  if (error) return { perfil, estado: 'falhou', id: c.id, motivo: error.message }
  return {
    perfil,
    estado: 'agendado',
    id: c.id,
    origem: escolha.fornecedor ? `${escolha.origem} (${escolha.fornecedor})` : escolha.origem,
    agendado_para: quando.toISOString(),
    capa: urls[0],
  }
}
