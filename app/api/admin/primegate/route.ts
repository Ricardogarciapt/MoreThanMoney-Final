import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { apagarChave, estadoDaChave, gravarChave } from '@/lib/primegate/config'
import { resumoPrimeGate, verificar } from '@/lib/primegate/verificacao'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Painel «PrimeVerse · PrimeGate» (/admin/sales-machine). Só admins.
 *
 * GET  → estado da chave (últimos 4 + data, NUNCA a chave), quota de hoje, resumo, últimas 20
 *        verificações e os clientes com UID (perfis + leads do Telegram) com o estado de cada um.
 * POST { acao: 'gravar_chave', chave } | { acao: 'apagar_chave' }
 *      { acao: 'testar', email, uid }               → chamada real, sem tocar em perfis
 *      { acao: 'verificar_cliente', userId }       → «Verificar agora» de um perfil
 *      { acao: 'verificar_lead', chatId }          → «Verificar agora» de um lead do Telegram
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const db = getSupabaseAdmin()

  const [chave, resumo, ultimas, perfis, leads] = await Promise.all([
    estadoDaChave(),
    resumoPrimeGate(db),
    db
      .from('primegate_verificacoes')
      .select('id, email, uid_puprime, estado, motivo, http_status, corpo_cru, origem, tentativas, verificado_em, proxima_tentativa_em, user_id, chat_id')
      .order('atualizado_em', { ascending: false })
      .limit(20),
    db
      .from('profiles')
      .select('id, email, full_name, broker_uid, broker_verified, primegate_estado, primegate_confirmado_em')
      .not('broker_uid', 'is', null)
      .neq('broker_uid', '')
      .order('updated_at', { ascending: false })
      .limit(200),
    db
      .from('telegram_leads')
      .select('chat_id, first_name, username, email, broker_uid, stage')
      .not('broker_uid', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(200),
  ])

  // Estado PrimeGate por lead (a verdade está na tabela de verificações).
  const chats = (leads.data ?? []).map((l) => String(l.chat_id))
  const porChat = new Map<string, { estado: string; email: string }>()
  if (chats.length) {
    const { data: vs } = await db.from('primegate_verificacoes').select('chat_id, estado, email').in('chat_id', chats)
    for (const v of vs ?? []) porChat.set(String(v.chat_id), { estado: String(v.estado), email: String(v.email) })
  }

  return NextResponse.json({
    ok: true,
    chave,
    resumo,
    ultimas: ultimas.data ?? [],
    clientes: perfis.data ?? [],
    leads: (leads.data ?? []).map((l) => ({ ...l, primegate: porChat.get(String(l.chat_id)) ?? null })),
  })
}

export async function POST(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(corpo.acao ?? '')
  const db = getSupabaseAdmin()

  if (acao === 'gravar_chave') {
    const quem = (await getAuthenticatedUser()).email ?? null
    const r = await gravarChave(String(corpo.chave ?? ''), quem)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: 400 })
    return NextResponse.json({ ok: true, chave: await estadoDaChave() })
  }

  if (acao === 'apagar_chave') {
    await apagarChave()
    return NextResponse.json({ ok: true, chave: await estadoDaChave() })
  }

  if (acao === 'testar') {
    const r = await verificar({ email: corpo.email, uid: corpo.uid, origem: 'teste', soTeste: true, db })
    if (!r.ativo) return NextResponse.json({ ok: false, error: 'Sem chave configurada.' }, { status: 400 })
    return NextResponse.json({ ok: true, estado: r.estado, motivo: r.motivo, aviso: r.aviso ?? null, httpStatus: r.httpStatus, corpo: r.corpo })
  }

  if (acao === 'verificar_cliente') {
    const userId = String(corpo.userId ?? '')
    const { data: p } = await db.from('profiles').select('id, email, broker_uid').eq('id', userId).maybeSingle()
    if (!p?.broker_uid) return NextResponse.json({ ok: false, error: 'Este cliente não tem UID guardado.' }, { status: 400 })
    // O email da PU Prime pode ser diferente do da conta MTM: usa o último que o cliente deu.
    const { data: ultima } = await db
      .from('primegate_verificacoes')
      .select('email')
      .eq('user_id', userId)
      .eq('uid_puprime', String(p.broker_uid))
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    const r = await verificar({ email: corpo.email || ultima?.email || p.email, uid: p.broker_uid, userId, origem: 'admin', db })
    return NextResponse.json({ ok: r.ativo, estado: r.estado, motivo: r.motivo, aviso: r.aviso ?? null, httpStatus: r.httpStatus, corpo: r.corpo })
  }

  if (acao === 'verificar_lead') {
    const chatId = String(corpo.chatId ?? '')
    const { data: l } = await db.from('telegram_leads').select('chat_id, email, broker_uid').eq('chat_id', chatId).maybeSingle()
    const email = corpo.email || l?.email
    if (!l?.broker_uid || !email) {
      return NextResponse.json({ ok: false, error: 'O lead precisa de UID e email (escreve o email no campo).' }, { status: 400 })
    }
    const r = await verificar({ email, uid: l.broker_uid, chatId, origem: 'admin', db })
    return NextResponse.json({ ok: r.ativo, estado: r.estado, motivo: r.motivo, aviso: r.aviso ?? null, httpStatus: r.httpStatus, corpo: r.corpo })
  }

  return NextResponse.json({ ok: false, error: 'acção desconhecida' }, { status: 400 })
}
