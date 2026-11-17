import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { mensagensParaEquipa, responderEquipa } from '@/lib/suporte/servidor'
import { ESTADOS, type Estado } from '@/lib/suporte/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O CRM DO APOIO — para o dono e para quem tem «Clientes & CRM» na Gestão.
 *
 * GET              → a ronda: conversas por ordem de urgência + contagens.
 * GET ?id=<uuid>   → uma conversa com as mensagens.
 * POST             → responder como equipa ({ conversaId, texto, fechar? }); traduzida para o idioma da conversa.
 * PATCH            → mudar estado/notas ({ conversaId, estado?, notas? }).
 *
 * Fechar uma conversa NÃO devolve dinheiro nenhum. Reembolsos ficam sempre com o Ricardo, fora daqui.
 */

const UUID = /^[0-9a-f-]{36}$/i

export async function GET(req: NextRequest) {
  const g = await exigirGestao(req, 'bo.gestao_crm')
  if (g.negado) return g.negado
  const db = getSupabaseAdmin()

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const { data: conversa } = await db.from('suporte_conversas').select('*').eq('id', id).maybeSingle()
    if (!conversa) return NextResponse.json({ error: 'Não existe' }, { status: 404 })
    let perfil = null
    if (conversa.user_id) {
      const { data } = await db.from('profiles').select('full_name, email, user_type, subscription_plan').eq('id', conversa.user_id).maybeSingle()
      perfil = data ?? null
    }
    // Conversas noutro idioma: o CRM recebe também a tradução para português (texto_pt).
    const mensagens = await mensagensParaEquipa(db, id, conversa.idioma)
    return NextResponse.json({ conversa, perfil, mensagens })
  }

  const filtro = req.nextUrl.searchParams.get('estado')
  let q = db
    .from('suporte_conversas')
    .select('id, nome, email, user_id, assunto, estado, escalada, prazo_em, nivel_aviso, ultima_mensagem_em, ultima_resposta_equipa_em, site, pagina_origem, idioma, criado_em')
    .order('ultima_mensagem_em', { ascending: false })
    .limit(200)
  if (filtro && (ESTADOS as readonly string[]).includes(filtro)) q = q.eq('estado', filtro)
  else if (filtro !== 'todas') q = q.neq('estado', 'resolvida')
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Contagens da ronda (o MTMOS e o topo do ecrã leem isto).
  const contagens: Record<string, number> = {}
  for (const e of ESTADOS) {
    const { count } = await db.from('suporte_conversas').select('id', { count: 'exact', head: true }).eq('estado', e)
    contagens[e] = count ?? 0
  }
  const { count: atrasadas } = await db
    .from('suporte_conversas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['a_aguardar_equipa', 'escalada'])
    .gt('nivel_aviso', 0)

  // Ordem de trabalho: escaladas, depois à espera (prazo mais antigo primeiro), depois o resto.
  const peso: Record<string, number> = { escalada: 0, a_aguardar_equipa: 1, com_agente: 2, resolvida: 3 }
  const conversas = (data ?? []).sort((a: any, b: any) => {
    const d = (peso[a.estado] ?? 9) - (peso[b.estado] ?? 9)
    if (d) return d
    return String(b.ultima_mensagem_em).localeCompare(String(a.ultima_mensagem_em))
  })

  return NextResponse.json({ conversas, contagens, atrasadas: atrasadas ?? 0 })
}

export async function POST(req: NextRequest) {
  const g = await exigirGestao(req, 'bo.gestao_crm')
  if (g.negado) return g.negado
  const body = await req.json().catch(() => ({}))
  const conversaId = String(body?.conversaId ?? '')
  const texto = String(body?.texto ?? '').trim().slice(0, 4000)
  if (!UUID.test(conversaId) || !texto) return NextResponse.json({ error: 'Falta a conversa ou o texto' }, { status: 400 })
  // Em conversas noutro idioma, a resposta segue traduzida e o original fica guardado.
  const r = await responderEquipa(getSupabaseAdmin(), { conversaId, texto, userId: g.userId, fechar: body?.fechar === true })
  return NextResponse.json({ ok: true, ...r })
}

export async function PATCH(req: NextRequest) {
  const g = await exigirGestao(req, 'bo.gestao_crm')
  if (g.negado) return g.negado
  const body = await req.json().catch(() => ({}))
  const conversaId = String(body?.conversaId ?? '')
  if (!UUID.test(conversaId)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (typeof body?.estado === 'string' && (ESTADOS as readonly string[]).includes(body.estado)) {
    patch.estado = body.estado as Estado
    // Fechar ou devolver ao agente pára os prazos; reabrir para a equipa não mexe neles aqui.
    if (body.estado === 'resolvida' || body.estado === 'com_agente') Object.assign(patch, { prazo_em: null, em_espera_desde: null, nivel_aviso: 0 })
  }
  if (typeof body?.notas === 'string') patch.notas = body.notas.slice(0, 4000)
  const { error } = await getSupabaseAdmin().from('suporte_conversas').update(patch).eq('id', conversaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
