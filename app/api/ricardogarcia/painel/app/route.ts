import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { db, economia, ECONOMIA_BASE, PATENTES, hoje } from '@/lib/ricardogarcia/app'

export const dynamic = 'force-dynamic'
const t = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
const int = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d)

// Separador «App» do painel do Ricardo: membros, pedidos de recompensa, catálogo, missões, economia e cruzamento com o CRM.
export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const desde7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const [mem, resg, recs, miss, regs, eco, leads] = await Promise.all([
    db().from('rg_app_membros').select('id, nome, email, telefone, xp, moedas, dias_ativos, sequencia, patente, estado, criado, visto, negocio_id').order('criado', { ascending: false }).limit(500),
    db().from('rg_app_resgates').select('*').order('criado', { ascending: false }).limit(200),
    db().from('rg_app_recompensas').select('*').order('ordem'),
    db().from('rg_app_missoes').select('*').order('tipo').order('ordem'),
    db().from('rg_app_registos').select('dia, membro_id').gte('dia', desde7).not('concluido', 'is', null).limit(20000),
    economia(),
    db().from('vendas_negocios').select('id, nome, email, telefone, origem, estado, criado_em').not('telefone', 'is', null).neq('origem', 'app-ricardo').in('estado', ['lead', 'contactado', 'qualificado']).order('criado_em', { ascending: false }).limit(60),
  ])
  const membros = mem.data || []
  const emails = membros.map(m => m.email)
  const [perfis, negocios] = await Promise.all([
    emails.length ? db().from('profiles').select('email, user_type').in('email', emails) : Promise.resolve({ data: [] as any[] }),
    membros.some(m => m.negocio_id) ? db().from('vendas_negocios').select('id, estado').in('id', membros.map(m => m.negocio_id).filter(Boolean)) : Promise.resolve({ data: [] as any[] }),
  ])
  const perfil = new Map((perfis.data || []).map((p: any) => [String(p.email).toLowerCase(), p.user_type]))
  const negocio = new Map((negocios.data || []).map((n: any) => [n.id, n.estado]))
  const nomeMembro = new Map(membros.map(m => [m.id, m]))
  const nomeRec = new Map((recs.data || []).map(r => [r.id, r.titulo]))
  const ativos7 = new Set((regs.data || []).map(r => r.membro_id)).size
  const dia = hoje()
  const naApp = new Set(emails)
  return NextResponse.json({
    resumo: { membros: membros.length, ativos7, hoje: new Set((regs.data || []).filter(r => r.dia === dia).map(r => r.membro_id)).size,
      pendentes: (resg.data || []).filter(r => r.estado === 'pendente').length },
    membros: membros.map(m => ({ ...m, patente_nome: PATENTES[m.patente]?.nome, conta_mtm: perfil.get(m.email) || null, pipeline: m.negocio_id ? negocio.get(m.negocio_id) || null : null })),
    resgates: (resg.data || []).map(r => ({ ...r, membro: nomeMembro.get(r.membro_id)?.nome, email: nomeMembro.get(r.membro_id)?.email, recompensa: nomeRec.get(r.recompensa_id) })),
    recompensas: recs.data || [],
    missoes: miss.data || [],
    economia: eco, economia_base: ECONOMIA_BASE, patentes: PATENTES,
    convidar: (leads.data || []).filter(l => !l.email || !naApp.has(String(l.email).toLowerCase())).slice(0, 30),
  })
}

export async function POST(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  let b: any = {}
  try { b = await req.json() } catch {}
  const ok = (x: object = {}) => NextResponse.json({ ok: true, ...x })
  const falha = (e: string, s = 400) => NextResponse.json({ ok: false, erro: e }, { status: s })

  switch (b?.acao) {
    case 'resgate': {
      const estado = String(b.estado)
      if (!['aprovado', 'recusado', 'entregue'].includes(estado)) return falha('Estado inválido.')
      const { data: r } = await db().from('rg_app_resgates').select('*').eq('id', t(b.id, 40)).maybeSingle()
      if (!r) return falha('Pedido não encontrado.', 404)
      if (r.estado === 'recusado') return falha('Este pedido já foi recusado.')
      await db().from('rg_app_resgates').update({ estado, nota: t(b.nota, 500) || r.nota, decidido: new Date().toISOString() }).eq('id', r.id)
      if (estado === 'recusado') { // devolve as moedas
        const { data: m } = await db().from('rg_app_membros').select('moedas').eq('id', r.membro_id).single()
        if (m) await db().from('rg_app_membros').update({ moedas: m.moedas + r.custo }).eq('id', r.membro_id)
      }
      return ok()
    }
    case 'recompensa': {
      const r = b.recompensa || {}
      const linha = { titulo: t(r.titulo, 140), descricao: t(r.descricao, 600) || null, custo: int(r.custo, 50), min_dias_conta: int(r.min_dias_conta),
        min_dias_ativos: int(r.min_dias_ativos), min_patente: Math.min(PATENTES.length - 1, int(r.min_patente)), cooldown_dias: int(r.cooldown_dias, 30),
        stock_mes: r.stock_mes === '' || r.stock_mes == null ? null : int(r.stock_mes), activo: r.activo !== false, ordem: int(r.ordem) }
      if (!linha.titulo || linha.custo < 1) return falha('A recompensa precisa de nome e de custo.')
      const q = r.id ? db().from('rg_app_recompensas').update(linha).eq('id', r.id) : db().from('rg_app_recompensas').insert(linha)
      const { error } = await q
      return error ? falha(error.message, 500) : ok()
    }
    case 'missao': {
      const m = b.missao || {}
      if (!['treino', 'mindset', 'digital'].includes(m.tipo)) return falha('Tipo inválido.')
      const id = t(m.id, 40).replace(/[^a-z0-9-]/gi, '') || `${m.tipo[0]}-${Date.now().toString(36)}`
      const conteudo = typeof m.conteudo === 'object' && m.conteudo ? m.conteudo : {}
      if (JSON.stringify(conteudo).length > 8000) return falha('Conteúdo demasiado grande.')
      const { error } = await db().from('rg_app_missoes').upsert({ id, tipo: m.tipo, titulo: t(m.titulo, 120), resumo: t(m.resumo, 200) || null, conteudo,
        xp: Math.min(60, int(m.xp, 20)), min_seg: Math.min(3600, int(m.min_seg)), ordem: int(m.ordem), activo: m.activo !== false })
      return error ? falha(error.message, 500) : ok()
    }
    case 'membro_estado': {
      if (!['ativo', 'bloqueado'].includes(b.estado)) return falha('Estado inválido.')
      await db().from('rg_app_membros').update({ estado: b.estado }).eq('id', t(b.id, 40))
      if (b.estado === 'bloqueado') await db().from('rg_app_sessoes').delete().eq('membro_id', t(b.id, 40))
      return ok()
    }
    case 'economia': {
      const e: any = {}
      for (const k of Object.keys(ECONOMIA_BASE)) e[k] = Math.min(1000, int(b.economia?.[k], (ECONOMIA_BASE as any)[k]))
      const { error } = await db().from('rg_dados').upsert({ k: 'app_economia', v: e, atualizado: new Date().toISOString() })
      return error ? falha(error.message, 500) : ok({ economia: e })
    }
    default:
      return falha('Acção desconhecida.')
  }
}
