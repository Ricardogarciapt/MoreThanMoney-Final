import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avisarDono, carregarConfig, contarEnviados, excluir } from '@/lib/b2b/envio'
import { recolherDaPagina } from '@/lib/b2b/recolha'
import { SEGMENTOS, type Pais, type Segmento } from '@/lib/b2b/sequencias'

/**
 * PROSPEÇÃO B2B — painel (/admin/sales-machine) e agente (Bearer CRON_SECRET).
 *  GET  → contagens por estado, prospectos, envios recentes, configuração.
 *  POST → { action: 'excluir'|'estado'|'confirmar_pc'|'config'|'recolher', ... }
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ESTADOS = ['novo', 'contactado', 'respondeu', 'reuniao', 'fechado', 'excluido'] as const

async function autorizar(req: NextRequest): Promise<NextResponse | null> {
  const s = process.env.CRON_SECRET
  if (s && (req.headers.get('authorization') || '') === `Bearer ${s}`) return null
  return requireAdmin(req)
}

export async function GET(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const [pros, envs, cfg, cont] = await Promise.all([
    db.from('b2b_prospectos').select('id, empresa, site, segmento, pais, email, email_tipo, fonte_url, pessoa_colectiva, estado, agente, toques, ultimo_toque_em, respondeu_em, nota').order('atualizado_em', { ascending: false }).limit(500),
    db.from('b2b_envios').select('id, email, toque, assunto, decisao, motivo, enviado_em, erro, criado_em').order('criado_em', { ascending: false }).limit(50),
    carregarConfig(db),
    contarEnviados(db).catch(() => ({ hoje: -1, sempre: -1 })),
  ])
  if (pros.error) return NextResponse.json({ ok: false, error: pros.error.message }, { status: 500 })
  const porEstado: Record<string, number> = Object.fromEntries(ESTADOS.map((e) => [e, 0]))
  const porSegmento: Record<string, number> = {}
  for (const p of pros.data ?? []) {
    porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1
    porSegmento[p.segmento] = (porSegmento[p.segmento] ?? 0) + 1
  }
  return NextResponse.json({ ok: true, config: cfg, enviados: cont, porEstado, porSegmento, prospectos: pros.data ?? [], envios: envs.data ?? [] })
}

export async function POST(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const agora = new Date().toISOString()

  switch (b.action) {
    case 'excluir': {
      const { data: p } = await db.from('b2b_prospectos').select('email').eq('id', String(b.id ?? '')).maybeSingle()
      const email = String(p?.email ?? b.email ?? '')
      const r = await excluir(db, email, 'painel_admin', 'excluído no painel B2B')
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }
    case 'estado': {
      const estado = String(b.estado ?? '')
      if (!['respondeu', 'reuniao', 'fechado', 'contactado', 'novo'].includes(estado)) {
        return NextResponse.json({ ok: false, error: 'estado inválido (para excluir usa a acção excluir)' }, { status: 400 })
      }
      const { data, error } = await db
        .from('b2b_prospectos')
        .update({ estado, atualizado_em: agora, ...(estado === 'respondeu' ? { respondeu_em: agora } : {}) })
        .eq('id', String(b.id ?? ''))
        .neq('estado', 'excluido')
        .select('empresa, email, segmento')
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      const p = data?.[0]
      if (p && estado === 'respondeu') await avisarDono(`📬 B2B: ${p.empresa} (${p.email}, ${p.segmento}) respondeu. Vê em /admin/sales-machine.`)
      return NextResponse.json({ ok: !!p })
    }
    case 'confirmar_pc': {
      const { error } = await db.from('b2b_prospectos').update({ pessoa_colectiva: b.valor === true, atualizado_em: agora }).eq('id', String(b.id ?? ''))
      return NextResponse.json({ ok: !error, error: error?.message })
    }
    case 'config': {
      const atual = await carregarConfig(db)
      const novo = { ...atual }
      if (typeof b.ligado === 'boolean') novo.ligado = b.ligado
      if (b.tecto_dia != null) novo.tecto_dia = Math.max(0, Math.min(50, Math.floor(Number(b.tecto_dia)) || 0))
      if (b.intervalo_seg != null) novo.intervalo_seg = Math.max(5, Math.min(60, Math.floor(Number(b.intervalo_seg)) || 12))
      const { error } = await db.from('site_settings').update({ value: novo, updated_at: agora, updated_by: 'admin_b2b' }).eq('key', 'b2b_prospeccao')
      return NextResponse.json({ ok: !error, config: novo, error: error?.message })
    }
    case 'recolher': {
      const segmento = String(b.segmento ?? '') as Segmento
      const pais = (String(b.pais ?? 'PT').toUpperCase() === 'BR' ? 'BR' : 'PT') as Pais
      if (!SEGMENTOS.includes(segmento)) return NextResponse.json({ ok: false, error: 'segmento inválido' }, { status: 400 })
      const empresa = String(b.empresa ?? '').trim()
      if (!empresa) return NextResponse.json({ ok: false, error: 'falta a empresa' }, { status: 400 })
      const url = String(b.url ?? '')
      const r = await recolherDaPagina({
        url, empresa, segmento, pais,
        pessoaColectiva: b.pessoa_colectiva === true,
        comerciaisPublicados: Array.isArray(b.comerciais) ? (b.comerciais as string[]) : [],
      })
      if (!r.ok) return NextResponse.json(r, { status: 422 })
      const linhas = r.aceites.map((a) => ({
        empresa, site: (() => { try { return new URL(url).origin } catch { return null } })(), segmento, pais,
        email: a.email, email_tipo: a.tipo, fonte_url: url, fonte_verificada_em: agora,
        identificacao: b.identificacao ? String(b.identificacao) : null, pessoa_colectiva: b.pessoa_colectiva === true,
        agente: 'AG-CLOSER', nota: 'recolha automática',
      }))
      if (linhas.length) {
        const { error } = await db.from('b2b_prospectos').upsert(linhas, { onConflict: 'email', ignoreDuplicates: true })
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ...r, gravados: linhas.length })
    }
    default:
      return NextResponse.json({ ok: false, error: 'acção desconhecida' }, { status: 400 })
  }
}
