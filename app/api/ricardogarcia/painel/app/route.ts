import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/super-admin'
import { db, economia, ECONOMIA_BASE, PATENTES, patenteDe, hoje, somarMoedas } from '@/lib/ricardogarcia/app'

export const dynamic = 'force-dynamic'
const t = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
const int = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : d)

// Separador «App» do painel do Ricardo: membros, pedidos de recompensa, catálogo, missões, economia e cruzamento com o CRM.
export async function GET(req: NextRequest) {
  const bloqueio = await requireSuperAdmin(req)
  if (bloqueio) return bloqueio
  const desde7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const [mem, resg, recs, miss, regs, eco, leads] = await Promise.all([
    db().from('rg_app_membros').select('id, moedas, dias_ativos, sequencia, estado, criado, visto, negocio_id, origem').order('criado', { ascending: false }).limit(500),
    db().from('rg_app_resgates').select('*').order('criado', { ascending: false }).limit(200),
    db().from('rg_app_recompensas').select('*').order('ordem'),
    db().from('rg_app_missoes').select('*').order('tipo').order('ordem'),
    db().from('rg_app_registos').select('dia, membro_id').gte('dia', desde7).not('concluido', 'is', null).limit(20000),
    economia(),
    db().from('vendas_negocios').select('id, nome, email, telefone, origem, estado, criado_em').not('telefone', 'is', null).neq('origem', 'app-ricardo').in('estado', ['lead', 'contactado', 'qualificado']).order('criado_em', { ascending: false }).limit(60),
  ])
  // Nome, email e telefone vêm do perfil MTM; o XP do registo único (user_xp).
  const ids = (mem.data || []).map(m => m.id)
  const [perfis, xps, negocios] = await Promise.all([
    ids.length ? db().from('profiles').select('id, full_name, email, phone, user_type').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db().from('user_xp').select('user_id, total_xp').in('user_id', ids) : Promise.resolve({ data: [] as any[] }),
    (mem.data || []).some(m => m.negocio_id) ? db().from('vendas_negocios').select('id, estado').in('id', (mem.data || []).map(m => m.negocio_id).filter(Boolean)) : Promise.resolve({ data: [] as any[] }),
  ])
  const pf = new Map((perfis.data || []).map((p: any) => [p.id, p]))
  const xpDe = new Map((xps.data || []).map((x: any) => [x.user_id, x.total_xp || 0]))
  const membros = (mem.data || []).map(m => {
    const p: any = pf.get(m.id) || {}, xp = xpDe.get(m.id) || 0
    return { ...m, nome: p.full_name || String(p.email || '').split('@')[0], email: p.email || null, telefone: p.phone || null, user_type: p.user_type || null, xp, patente: patenteDe(xp) }
  })
  const emails = membros.map(m => String(m.email || '').toLowerCase())
  const negocio = new Map((negocios.data || []).map((n: any) => [n.id, n.estado]))
  const nomeMembro = new Map(membros.map(m => [m.id, m]))
  const nomeRec = new Map((recs.data || []).map(r => [r.id, r.titulo]))
  const ativos7 = new Set((regs.data || []).map(r => r.membro_id)).size
  // Fase 3: desafios/eventos com quem respondeu, e presenças com comprovativo (links assinados, 1 h).
  const [evs, insc, pres] = await Promise.all([
    db().from('rg_app_eventos').select('*').order('activo', { ascending: false }).order('ordem').order('criado', { ascending: false }).limit(100),
    db().from('rg_app_eventos_membros').select('*').order('criado', { ascending: false }).limit(2000),
    db().from('rg_app_diarios').select('membro_id, dia, ref, xp, dados, prova_path, criado').eq('item', 'presenca').gte('dia', new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)).order('criado', { ascending: false }).limit(150),
  ])
  const caminhos = (pres.data || []).map(p => p.prova_path).filter(Boolean) as string[]
  const { data: assinados } = caminhos.length ? await db().storage.from('rg-app-provas').createSignedUrls(caminhos, 3600) : { data: [] as any[] }
  const urlDe = new Map((assinados || []).map((a: any) => [a.path, a.signedUrl]))
  // Comunidade: stories das últimas 48 h e as últimas mensagens, incluindo o que saiu do ar, para moderar.
  const [cst, cmsg] = await Promise.all([
    db().from('rg_app_stories').select('id, membro_id, imagem_path, texto, criado, expira, oculta, denuncias').gte('criado', new Date(Date.now() - 48 * 36e5).toISOString()).order('criado', { ascending: false }).limit(80),
    db().from('rg_app_chat').select('id, membro_id, texto, imagem_path, criado, apagado, denuncias').order('criado', { ascending: false }).limit(120),
  ])
  const caminhosC = [...(cst.data || []), ...(cmsg.data || [])].map(x => x.imagem_path).filter(Boolean) as string[]
  const { data: assinC } = caminhosC.length ? await db().storage.from('rg-app-media').createSignedUrls(caminhosC, 3600) : { data: [] as any[] }
  const urlC = new Map((assinC || []).map((a: any) => [a.path, a.signedUrl]))
  const quemC = async (lista: any[]) => {
    const fora = lista.map(x => x.membro_id).filter(id => !nomeMembro.has(id))
    if (!fora.length) return
    const { data } = await db().from('profiles').select('id, full_name, email').in('id', Array.from(new Set(fora)))
    ;(data || []).forEach((p: any) => nomeMembro.set(p.id, { nome: p.full_name || String(p.email || '').split('@')[0], email: p.email } as any))
  }
  await quemC([...(cst.data || []), ...(cmsg.data || [])])
  const linhaC = (alvo: string) => (x: any) => ({ alvo, id: x.id, texto: x.texto, criado: x.criado, denuncias: x.denuncias || 0, fora: alvo === 'story' ? x.oculta : x.apagado,
    expirada: alvo === 'story' ? Date.parse(x.expira) < Date.now() : false, imagem: x.imagem_path ? urlC.get(x.imagem_path) || null : null, nome: nomeMembro.get(x.membro_id)?.nome || 'Membro' })
  const dia = hoje()
  const naApp = new Set(emails)
  return NextResponse.json({
    resumo: { membros: membros.length, ativos7, hoje: new Set((regs.data || []).filter(r => r.dia === dia).map(r => r.membro_id)).size,
      pendentes: (resg.data || []).filter(r => r.estado === 'pendente').length },
    membros: membros.map(m => ({ ...m, patente_nome: PATENTES[m.patente]?.nome, conta_mtm: m.user_type, pipeline: m.negocio_id ? negocio.get(m.negocio_id) || null : null })),
    resgates: (resg.data || []).map(r => ({ ...r, membro: nomeMembro.get(r.membro_id)?.nome, email: nomeMembro.get(r.membro_id)?.email, recompensa: nomeRec.get(r.recompensa_id) })),
    recompensas: recs.data || [],
    missoes: miss.data || [],
    economia: eco, economia_base: ECONOMIA_BASE, patentes: PATENTES,
    eventos: (evs.data || []).map(e => {
      const l = (insc.data || []).filter(i => i.evento_id === e.id)
      return { ...e, inscritos: l.map(i => ({ estado: i.estado, resposta: i.resposta, criado: i.criado, nome: nomeMembro.get(i.membro_id)?.nome || 'Membro', email: nomeMembro.get(i.membro_id)?.email || null, telefone: nomeMembro.get(i.membro_id)?.telefone || null })) }
    }),
    presencas: (pres.data || []).map(p => ({ dia: p.dia, tipo: p.ref, xp: p.xp, nota: (p.dados as any)?.nota || null, nome: nomeMembro.get(p.membro_id)?.nome || 'Membro', prova: p.prova_path ? urlDe.get(p.prova_path) || null : null })),
    comunidade: { stories: (cst.data || []).map(linhaC('story')), mensagens: (cmsg.data || []).map(linhaC('mensagem')) },
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
        await somarMoedas(r.membro_id, r.custo)
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
      if (!['treino', 'mindset', 'digital', 'produtividade'].includes(m.tipo)) return falha('Tipo inválido.')
      const id = t(m.id, 40).replace(/[^a-z0-9-]/gi, '') || `${m.tipo[0]}-${Date.now().toString(36)}`
      const conteudo = typeof m.conteudo === 'object' && m.conteudo ? m.conteudo : {}
      if (JSON.stringify(conteudo).length > 8000) return falha('Conteúdo demasiado grande.')
      const { error } = await db().from('rg_app_missoes').upsert({ id, tipo: m.tipo, titulo: t(m.titulo, 120), resumo: t(m.resumo, 200) || null, conteudo,
        xp: Math.min(60, int(m.xp, 20)), min_seg: Math.min(3600, int(m.min_seg)), ordem: int(m.ordem), activo: m.activo !== false })
      return error ? falha(error.message, 500) : ok()
    }
    case 'evento': {
      const e = b.evento || {}
      const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)))
      const link = t(e.link_compra, 400), img = t(e.imagem_url, 400)
      if ((link && !/^https:\/\//.test(link)) || (img && !/^(https:\/\/|\/)/.test(img))) return falha('Os links têm de começar por https://')
      const linha = { tipo: e.tipo === 'desafio' ? 'desafio' : 'evento', titulo: t(e.titulo, 140), descricao: t(e.descricao, 2000) || null,
        quando: e.quando ? new Date(e.quando).toISOString() : null, local: t(e.local, 140) || null, imagem_url: img || null,
        preco_eur: num(e.preco_eur), preco_antes_eur: num(e.preco_antes_eur), link_compra: link || null,
        vagas: num(e.vagas), xp: Math.min(200, int(e.xp)), activo: e.activo !== false, ordem: int(e.ordem) }
      if (!linha.titulo) return falha('Dá um título ao desafio ou evento.')
      if (e.quando && isNaN(Date.parse(e.quando))) return falha('Data inválida.')
      const q = e.id ? db().from('rg_app_eventos').update(linha).eq('id', t(e.id, 40)) : db().from('rg_app_eventos').insert(linha)
      const { error } = await q
      return error ? falha(error.message, 500) : ok()
    }
    case 'moderar': {
      const fora = !!b.fora, id = t(b.id, 40)
      const { error } = b.alvo === 'story'
        ? await db().from('rg_app_stories').update({ oculta: fora }).eq('id', id)
        : await db().from('rg_app_chat').update({ apagado: fora }).eq('id', id)
      return error ? falha(error.message, 500) : ok()
    }
    case 'membro_estado': {
      if (!['ativo', 'bloqueado'].includes(b.estado)) return falha('Estado inválido.')
      await db().from('rg_app_membros').update({ estado: b.estado }).eq('id', t(b.id, 40))
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
