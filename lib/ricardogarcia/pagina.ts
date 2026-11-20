// Página pessoal do Ricardo (/ricardogarcia): o que antes vivia no Beacons — secções, links,
// produtos e formulário — passa a ser gerido no painel /ricardogarcia/painel e servido daqui.
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type RgItem = { id: string; titulo: string; sub?: string; url: string; img?: string; ativo: boolean; destaque?: boolean }
export type RgSeccao = { id: string; titulo: string; sub?: string; tipo: 'links' | 'produtos' | 'contacto'; ativo: boolean; itens: RgItem[] }
export type RgProduto = {
  id: string; titulo: string; subtitulo: string | null; descricao: string | null; preco_cents: number | null
  imagem_url: string | null; marketplace_slug: string | null; url: string | null; so_landing: boolean; activo: boolean; ordem: number
  preco_antes_cents?: number | null; preco_sufixo?: string | null
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
  const [{ data: pag }, { data: blocos }, { data: prods }] = await Promise.all([
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
    preco_cents: p.preco_cents, preco_antes_cents: p.preco_antes_cents ?? null, preco_sufixo: p.preco_sufixo ?? null,
    imagem_url: p.imagem_url, link: linkDoProduto(p),
  })).filter(p => p.link)
  return { seccoes, produtos, ordem, atualizado: pag?.atualizado ?? null }
}

// ── Inglês ─────────────────────────────────────────────────────────────────
// O painel escreve em PT. Para a landing em EN, cada texto é traduzido uma vez pela IA grátis
// e guardado em rg_dados ('trad_en', mapa PT → EN). Texto novo traduz-se no pedido seguinte;
// se a IA falhar, mostra-se o PT (nunca fica a página sem conteúdo).
type Dados = Awaited<ReturnType<typeof paginaPublica>>

export async function paginaEmIngles(d: Dados): Promise<Dados> {
  const textos = new Set<string>()
  const pega = (s?: string | null) => { const t = (s ?? '').trim(); if (t && /[a-zà-ú]/i.test(t)) textos.add(t) }
  d.seccoes.forEach(s => { pega(s.titulo); pega(s.sub); s.itens.forEach(i => { pega(i.titulo); pega(i.sub) }) })
  d.produtos.forEach(p => { pega(p.titulo); pega(p.subtitulo); pega(p.descricao); pega(p.preco_sufixo) })

  const db = getSupabaseAdmin()
  const { data } = await db.from('rg_dados').select('v').eq('k', 'trad_en').maybeSingle()
  const mapa: Record<string, string> = (data?.v && typeof data.v === 'object' ? data.v : {}) as Record<string, string>
  const falta = [...textos].filter(t => !mapa[t]).slice(0, 80)
  if (falta.length) {
    try {
      const { chamarIAGratis } = await import('@/lib/ia/chamar')
      const r = await chamarIAGratis({
        sistema: 'Translate European Portuguese UI texts from a personal-brand landing page into natural, concise English. Keep brand and product names as they are (MoreThanMoney, MTM, PU Prime, Fitness Factory, Premium, Bootcamp, YouTube, Instagram, LinkedIn). Never add promises of profit. Answer only with a JSON object mapping each original string to its translation.',
        mensagens: [{ role: 'user', content: JSON.stringify(falta) }],
        json: true, maxTokens: 3000, temperatura: 0.2, tarefa: 'rg-landing-en', preferencia: 'qualidade', timeoutMs: 20_000,
      })
      const j = JSON.parse(r.texto.replace(/^```(?:json)?|```$/g, '').trim())
      let novos = 0
      for (const t of falta) { const v = typeof j?.[t] === 'string' ? j[t].trim() : ''; if (v && v.length < 600) { mapa[t] = v; novos++ } }
      if (novos) await db.from('rg_dados').upsert({ k: 'trad_en', v: mapa, atualizado: new Date().toISOString() })
    } catch { /* fica em PT até à próxima */ }
  }
  const tr = <T extends string | null | undefined>(s: T): T => (s && mapa[s.trim()] ? mapa[s.trim()] : s) as T
  return {
    ...d,
    seccoes: d.seccoes.map(s => ({ ...s, titulo: tr(s.titulo), sub: tr(s.sub), itens: s.itens.map(i => ({ ...i, titulo: tr(i.titulo), sub: tr(i.sub) })) })),
    produtos: d.produtos.map(p => ({ ...p, titulo: tr(p.titulo), subtitulo: tr(p.subtitulo), descricao: tr(p.descricao), preco_sufixo: tr(p.preco_sufixo) })),
  }
}
