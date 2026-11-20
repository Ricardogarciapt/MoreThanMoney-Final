import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { requireSuperAdmin } from '@/lib/super-admin'
import { limparSeccoes, urlSegura } from '@/lib/ricardogarcia/pagina'

export const dynamic = 'force-dynamic'

const t = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
const ESTADOS = ['novo', 'respondido', 'agendado', 'cliente', 'arquivado']

// Painel pessoal do Ricardo: só administradores.
export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const db = getSupabaseAdmin()
  const agora = new Date(), daqui = new Date(Date.now() + 14 * 864e5), ontem = new Date(Date.now() - 864e5)
  const desde30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const [pag, prods, conts, dados, agenda, tipos, mkt, cliques] = await Promise.all([
    db.from('rg_pagina').select('seccoes, atualizado').eq('id', 1).maybeSingle(),
    db.from('rg_produtos').select('*').order('ordem').order('criado'),
    db.from('rg_contactos').select('*').order('criado', { ascending: false }).limit(200),
    db.from('rg_dados').select('k, v'),
    db.from('agenda_marcacoes').select('id, tipo_id, nome, email, telefone, inicio, fim, estado, join_url, local')
      .gte('inicio', ontem.toISOString()).lte('inicio', daqui.toISOString()).not('estado', 'in', '(cancelada,cancelado)').order('inicio').limit(60),
    db.from('agenda_tipos').select('id, nome, slug, cor'),
    db.from('marketplace_produtos').select('slug, titulo, preco_cents, imagem_url, subtitulo').eq('activo', true).eq('estado', 'publicado').order('titulo').limit(200),
    db.from('rg_cliques').select('alvo, tipo, criado').gte('criado', desde30).order('criado', { ascending: false }).limit(20000),
  ])
  // Conversões dos últimos 30 dias: cliques por alvo, visitas e contactos.
  const porAlvo: Record<string, number> = {}, porDia: Record<string, { v: number; c: number }> = {}
  let visitas = 0, cliquesTot = 0
  for (const c of (cliques.data ?? []) as any[]) {
    const d = String(c.criado).slice(0, 10); porDia[d] = porDia[d] || { v: 0, c: 0 }
    if (c.tipo === 'visita') { visitas++; porDia[d].v++ } else { cliquesTot++; porDia[d].c++; porAlvo[c.alvo] = (porAlvo[c.alvo] || 0) + 1 }
  }
  const contactos30 = (conts.data ?? []).filter((c: any) => c.criado >= desde30).length
  const tipoDe = new Map((tipos.data ?? []).map((x: any) => [x.id, x]))
  return NextResponse.json({
    agora: agora.toISOString(),
    seccoes: limparSeccoes(pag.data?.seccoes),
    produtos: prods.data ?? [],
    contactos: conts.data ?? [],
    dados: Object.fromEntries((dados.data ?? []).map((d: any) => [d.k, d.v])),
    agenda: (agenda.data ?? []).map((m: any) => ({ ...m, tipo: tipoDe.get(m.tipo_id)?.nome ?? null, cor: tipoDe.get(m.tipo_id)?.cor ?? null })),
    marketplace: mkt.data ?? [],
    metricas: { visitas, cliques: cliquesTot, contactos: contactos30, porAlvo, porDia },
  })
}

export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const db = getSupabaseAdmin()
  let b: any = {}
  try { b = await req.json() } catch {}
  const ok = (extra: object = {}) => NextResponse.json({ ok: true, ...extra })
  const falha = (erro: string, status = 400) => NextResponse.json({ ok: false, erro }, { status })

  switch (b?.acao) {
    case 'pagina': {
      const seccoes = limparSeccoes(b.seccoes)
      const { error } = await db.from('rg_pagina').upsert({ id: 1, seccoes, atualizado: new Date().toISOString() })
      return error ? falha(error.message, 500) : ok({ seccoes })
    }
    case 'produto': {
      const p = b.produto || {}
      const linha = {
        titulo: t(p.titulo, 140), subtitulo: t(p.subtitulo, 200) || null, descricao: t(p.descricao, 3000) || null,
        preco_cents: p.preco_cents === '' || p.preco_cents == null ? null : Math.max(0, Math.round(Number(p.preco_cents) || 0)),
        imagem_url: urlSegura(p.imagem_url) || null, marketplace_slug: t(p.marketplace_slug, 160) || null,
        url: urlSegura(p.url) || null, so_landing: p.so_landing !== false, activo: p.activo !== false,
        ordem: Number.isFinite(Number(p.ordem)) ? Number(p.ordem) : 0, atualizado: new Date().toISOString(),
      }
      if (!linha.titulo) return falha('O produto precisa de um nome.')
      if (!linha.marketplace_slug && !linha.url) return falha('Escolhe um produto do marketplace ou cola o link de compra.')
      const q = p.id ? db.from('rg_produtos').update(linha).eq('id', p.id).select('*').single() : db.from('rg_produtos').insert(linha).select('*').single()
      const { data, error } = await q
      return error ? falha(error.message, 500) : ok({ produto: data })
    }
    case 'produto_apagar': {
      const { error } = await db.from('rg_produtos').delete().eq('id', t(b.id, 40))
      return error ? falha(error.message, 500) : ok()
    }
    case 'contacto_estado': {
      if (!ESTADOS.includes(b.estado)) return falha('Estado inválido.')
      const { error } = await db.from('rg_contactos').update({ estado: b.estado }).eq('id', t(b.id, 40))
      return error ? falha(error.message, 500) : ok()
    }
    case 'dado': {
      const k = t(b.k, 80).replace(/[^a-z0-9_:-]/gi, '')
      if (!k) return falha('Chave inválida.')
      const v = b.v ?? null
      if (JSON.stringify(v).length > 200_000) return falha('Demasiado grande.')
      const { error } = await db.from('rg_dados').upsert({ k, v, atualizado: new Date().toISOString() })
      return error ? falha(error.message, 500) : ok()
    }
    default:
      return falha('Acção desconhecida.')
  }
}
