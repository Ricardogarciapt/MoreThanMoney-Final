import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { primeGateAtivo } from '@/lib/primegate/config'
import { verificar } from '@/lib/primegate/verificacao'
import { mensagemParaCliente } from '@/lib/primegate/mensagens'
import { normalizarPar, type EstadoPrimeGate } from '@/lib/primegate/resultado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O cliente (sessão do site/app) pede para verificar o seu registo na PU Prime.
 *
 *   GET  → o estado actual dele (e se o PrimeGate está ligado)
 *   POST { uid, email? } → guarda o UID no perfil e verifica. `email` = o da PU Prime; por
 *        omissão, o da conta MTM.
 *
 * O utilizador vem SEMPRE da sessão. Sem chave configurada responde `ativo:false` e o ecrã fica
 * como estava (o UID guarda-se na mesma). Um pedido por par por minuto — o resto vem da base.
 */
/** Sessão por cookie (site) ou Bearer (app-mobile guarda a sessão no browser, sem cookie). */
async function utilizador(req: NextRequest): Promise<{ userId?: string; email?: string }> {
  const porCookie = await getAuthenticatedUser()
  if (porCookie.userId) return porCookie
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return {}
  const { data, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data?.user) return {}
  return { userId: data.user.id, email: data.user.email ?? undefined }
}

export async function GET(req: NextRequest) {
  const auth = await utilizador(req)
  if (!auth.userId) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
  const ativo = await primeGateAtivo()
  const { data } = await getSupabaseAdmin()
    .from('primegate_verificacoes')
    .select('estado, email, uid_puprime, proxima_tentativa_em, verificado_em')
    .eq('user_id', auth.userId)
    .order('atualizado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return NextResponse.json({
    ok: true,
    ativo,
    estado: data?.estado ?? null,
    email: data?.email ?? null,
    uid: data?.uid_puprime ?? null,
    mensagem: data ? mensagemParaCliente(data.estado as EstadoPrimeGate, data.proxima_tentativa_em as string | null) : null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await utilizador(req)
  if (!auth.userId) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
  const corpo = (await req.json().catch(() => ({}))) as { uid?: unknown; email?: unknown }
  const par = normalizarPar(corpo.email || auth.email, corpo.uid)
  if (!par) return NextResponse.json({ ok: false, error: 'Indica um email válido e o UID da PU Prime (só números).' }, { status: 400 })

  const db = getSupabaseAdmin()
  // O UID passa a ficar guardado pelo servidor (antes o ecrã escrevia-o directamente no perfil).
  await db.from('profiles').update({ broker_uid: par.uid }).eq('id', auth.userId)

  if (!(await primeGateAtivo())) return NextResponse.json({ ok: true, ativo: false })

  // Travão por par: um pedido por minuto. Quem carrega cinco vezes no botão não gasta cinco
  // pedidos da quota partilhada com o resto do funil.
  const { data: recente } = await db
    .from('primegate_verificacoes')
    .select('estado, verificado_em, proxima_tentativa_em, user_id')
    .eq('email', par.email)
    .eq('uid_puprime', par.uid)
    .maybeSingle()
  const naoEDeOutro = !recente?.user_id || recente.user_id === auth.userId
  if (recente && naoEDeOutro && recente.verificado_em && Date.now() - Date.parse(recente.verificado_em as string) < 60_000) {
    return NextResponse.json({
      ok: true,
      ativo: true,
      estado: recente.estado,
      mensagem: mensagemParaCliente(recente.estado as EstadoPrimeGate, recente.proxima_tentativa_em as string | null),
    })
  }
  // Um par que já pertence a OUTRA conta não se reatribui por aqui (fala-se com o admin).
  if (recente && !naoEDeOutro) {
    return NextResponse.json({ ok: false, error: 'Este UID já está associado a outra conta MTM. Fala connosco.' }, { status: 409 })
  }

  const r = await verificar({ email: par.email, uid: par.uid, userId: auth.userId, origem: 'site', db })
  // Nunca devolve corpo cru nem detalhes da chamada ao cliente — só o estado e a mensagem.
  return NextResponse.json({ ok: true, ativo: r.ativo, estado: r.estado, mensagem: r.mensagem })
}
