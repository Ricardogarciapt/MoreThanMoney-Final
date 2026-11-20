// Página pessoal do Ricardo (/ricardogarcia): o que antes vivia no Beacons — secções, links,
// produtos e formulário — passa a ser gerido no painel /ricardogarcia/painel e servido daqui.
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type RgItem = { id: string; titulo: string; sub?: string; url: string; img?: string; ativo: boolean; destaque?: boolean }
export type RgSeccao = { id: string; titulo: string; sub?: string; tipo: 'links' | 'produtos' | 'contacto'; ativo: boolean; itens: RgItem[] }
export type RgProduto = {
  id: string; titulo: string; subtitulo: string | null; descricao: string | null; preco_cents: number | null
  imagem_url: string | null; marketplace_slug: string | null; url: string | null; so_landing: boolean; activo: boolean; ordem: number
}

const SITE = 'https://www.morethanmoney.pt'

/** Só aceita http(s), mailto, tel e caminhos internos. Tudo o resto fica vazio. */
export function urlSegura(u: unknown): string {
  const s = String(u ?? '').trim().slice(0, 600)
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (s.startsWith('#')) return s
  try {
    const x = new URL(s)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(x.protocol) ? x.toString() : ''
  } catch { return '' }
}

const txt = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

export function limparSeccoes(entrada: unknown): RgSeccao[] {
  if (!Array.isArray(entrada)) return []
  return entrada.slice(0, 20).map((s: any, i: number): RgSeccao => ({
    id: txt(s?.id, 40).replace(/[^a-z0-9_-]/gi, '') || 's' + i,
    titulo: txt(s?.titulo, 80) || 'Secção',
    sub: txt(s?.sub, 160),
    tipo: (['links', 'produtos', 'contacto'] as const).includes(s?.tipo) ? s.tipo : 'links',
    ativo: s?.ativo !== false,
    itens: Array.isArray(s?.itens) ? s.itens.slice(0, 30).map((it: any, k: number): RgItem => ({
      id: txt(it?.id, 40).replace(/[^a-z0-9_-]/gi, '') || `${i}-${k}`,
      titulo: txt(it?.titulo, 90),
      sub: txt(it?.sub, 160),
      url: urlSegura(it?.url),
      img: urlSegura(it?.img),
      ativo: it?.ativo !== false,
      destaque: !!it?.destaque,
    })).filter((it: RgItem) => it.titulo && it.url) : [],
  }))
}

export function linkDoProduto(p: Pick<RgProduto, 'marketplace_slug' | 'url'>): string {
  if (p.marketplace_slug) return `${SITE}/marketplace/${encodeURIComponent(p.marketplace_slug)}`
  return urlSegura(p.url)
}

/** O que a landing pública mostra: só o que está ligado. */
export async function paginaPublica() {
  const db = getSupabaseAdmin()
  const [{ data: pag }, { data: prods }, { data: blocos }] = await Promise.all([
    db.from('rg_pagina').select('seccoes, atualizado').eq('id', 1).maybeSingle(),
    db.from('rg_dados').select('v').eq('k', 'landing_blocos').maybeSingle(),
    db.from('rg_produtos').select('*').eq('activo', true).order('ordem').order('criado'),
  ])
  // Ordem e visibilidade dos blocos grandes da landing (painel → Página → Ordem da página)
  const ordem = (Array.isArray(blocos?.v) ? (blocos!.v as any[]) : [])
    .filter(b => b && typeof b.id === 'string' && /^[a-z]{2,20}$/.test(b.id)).slice(0, 20)
    .map(b => ({ id: b.id as string, ativo: b.ativo !== false }))
  const seccoes = limparSeccoes(pag?.seccoes).filter(s => s.ativo).map(s => ({ ...s, itens: s.itens.filter(i => i.ativo) }))
  const produtos = ((prods as RgProduto[] | null) ?? []).map(p => ({
    id: p.id, titulo: p.titulo, subtitulo: p.subtitulo, descricao: p.descricao,
    preco_cents: p.preco_cents, imagem_url: p.imagem_url, link: linkDoProduto(p),
  })).filter(p => p.link)
  return { seccoes, produtos, ordem, atualizado: pag?.atualizado ?? null }
}
