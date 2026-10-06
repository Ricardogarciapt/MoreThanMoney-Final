/**
 * Cron diário — RECUPERAÇÃO DE CHECKOUTS ABANDONADOS. Cria RASCUNHOS de email; não envia nada.
 *
 * Lê os checkouts por concluir dos últimos 7 dias (`checkout_sessions` pending e
 * `marketplace_leads` em `iniciou_checkout`), decide quem é elegível com a regra pura de
 * `lib/vendas/recuperacao-checkout.ts` e grava cada lembrete na fila de aprovação
 * (`aios_tasks`, kind `envio:email_recuperacao_checkout`, chave única por sessão). Sai só quando
 * uma pessoa aprova no /admin/social/leads ou o agente chama `aprovar_envio`.
 *
 * `?ensaio=1` devolve o que faria sem gravar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  JANELA_DIAS,
  chaveDoLembrete,
  elegivel,
  emailDaPessoa,
  linkDeRetoma,
  rascunhoDoLembrete,
  type CheckoutAbandonado,
} from '@/lib/vendas/recuperacao-checkout'
import { KIND_ENVIO } from '@/lib/envios-aprovacao'
import { criarEnvioPorAprovar } from '@/lib/envios-fila'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Perfil = { id: string; email: string | null; full_name: string | null; subscription_expires_at: string | null; mtmcopy_subscription_active: boolean | null }

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'
  const agora = new Date()
  const desde = new Date(agora.getTime() - (JANELA_DIAS + 1) * 864e5).toISOString()

  const [sessQ, mlQ] = await Promise.all([
    db.from('checkout_sessions').select('id, user_id, plan, created_at').eq('status', 'pending').gte('created_at', desde),
    db
      .from('marketplace_leads')
      .select('id, email, created_at, produto_id, marketplace_produtos(slug, titulo)')
      .eq('etapa', 'iniciou_checkout')
      .gte('created_at', desde),
  ])

  // As pessoas por trás das sessões (o checkout do site exige conta: o email está no perfil).
  const userIds = [...new Set((sessQ.data ?? []).map((s) => String((s as { user_id: string }).user_id)).filter(Boolean))]
  const { data: perfis } = userIds.length
    ? await db.from('profiles').select('id, email, full_name, subscription_expires_at, mtmcopy_subscription_active').in('id', userIds)
    : { data: [] as Perfil[] }
  const perfilDe = new Map(((perfis ?? []) as Perfil[]).map((p) => [p.id, p]))

  const candidatos: CheckoutAbandonado[] = []
  for (const s of (sessQ.data ?? []) as Array<{ id: string; user_id: string; plan: string; created_at: string }>) {
    const p = perfilDe.get(s.user_id)
    candidatos.push({
      origem: 'checkout_sessions',
      referencia: s.id,
      email: p?.email ?? null,
      criadoEm: s.created_at,
      produto: s.plan,
      primeiroNome: (p?.full_name || '').split(' ')[0] || null,
    })
  }
  for (const l of (mlQ.data ?? []) as Array<{ id: string; email: string | null; created_at: string; marketplace_produtos: { slug: string; titulo: string } | { slug: string; titulo: string }[] | null }>) {
    const prod = Array.isArray(l.marketplace_produtos) ? l.marketplace_produtos[0] : l.marketplace_produtos
    if (!prod?.slug) continue
    candidatos.push({
      origem: 'marketplace_leads',
      referencia: l.id,
      email: l.email,
      criadoEm: l.created_at,
      produto: prod.slug,
      produtoNome: prod.titulo,
    })
  }

  const emails = [...new Set(candidatos.map((c) => emailDaPessoa(c.email)).filter(Boolean))]

  // Consentimento (a vista resolve o histórico: um «retirei» posterior ganha) e cliente.
  const [consQ, perfisPorEmailQ, existentesQ, mlPagouQ] = await Promise.all([
    emails.length ? db.from('captacao_permissao_email').select('email, pode_marketing, retirou_em').in('email', emails) : Promise.resolve({ data: [] }),
    emails.length ? db.from('profiles').select('id, email, subscription_expires_at, mtmcopy_subscription_active').in('email', emails) : Promise.resolve({ data: [] }),
    db.from('aios_tasks').select('chave').like('chave', 'recuperacao-checkout:%'),
    emails.length ? db.from('marketplace_leads').select('email, created_at').eq('etapa', 'pagou').in('email', emails) : Promise.resolve({ data: [] }),
  ])
  const consentimento = new Map(
    ((consQ.data ?? []) as Array<{ email: string; pode_marketing: boolean | null; retirou_em: string | null }>).map((c) => [emailDaPessoa(c.email), c]),
  )
  const perfisPorEmail = (perfisPorEmailQ.data ?? []) as Array<Omit<Perfil, 'full_name'>>
  const existentes = new Set(((existentesQ.data ?? []) as Array<{ chave: string }>).map((e) => e.chave))

  // Compras: checkouts concluídos dos mesmos utilizadores + marketplace pago do mesmo email.
  const idsPorEmail = new Map<string, string[]>()
  for (const p of perfisPorEmail) {
    const e = emailDaPessoa(p.email)
    idsPorEmail.set(e, [...(idsPorEmail.get(e) ?? []), p.id])
  }
  const todosIds = [...new Set(perfisPorEmail.map((p) => p.id))]
  const { data: concluidos } = todosIds.length
    ? await db.from('checkout_sessions').select('user_id, created_at, completed_at').in('status', ['completed', 'paid_pending_account']).in('user_id', todosIds)
    : { data: [] }
  const comprasDe = (email: string): string[] => {
    const ids = new Set(idsPorEmail.get(email) ?? [])
    const doSite = ((concluidos ?? []) as Array<{ user_id: string; created_at: string; completed_at: string | null }>)
      .filter((c) => ids.has(c.user_id))
      .map((c) => c.completed_at || c.created_at)
    const doMarketplace = ((mlPagouQ.data ?? []) as Array<{ email: string; created_at: string }>)
      .filter((m) => emailDaPessoa(m.email) === email)
      .map((m) => m.created_at)
    return [...doSite, ...doMarketplace]
  }
  const ehCliente = (email: string) =>
    perfisPorEmail.some(
      (p) =>
        emailDaPessoa(p.email) === email &&
        ((p.subscription_expires_at && new Date(p.subscription_expires_at) > agora) || p.mtmcopy_subscription_active === true),
    )

  const decisoes: Array<{ chave: string; origem: string; produto: string; pode: boolean; porque: string }> = []
  let criados = 0
  const avisos: string[] = []

  for (const c of candidatos) {
    const e = emailDaPessoa(c.email)
    const cons = consentimento.get(e)
    const d = elegivel(
      c,
      {
        baseLegal: cons?.pode_marketing ? 'consentimento' : null,
        retirou: !!cons?.retirou_em && !cons?.pode_marketing,
        ehCliente: e ? ehCliente(e) : false,
      },
      e ? comprasDe(e) : [],
      existentes,
      agora,
    )
    const chave = chaveDoLembrete(c)
    // Sem email nas decisões devolvidas: este JSON pode acabar num log.
    decisoes.push({ chave, origem: c.origem, produto: c.produto, pode: d.pode, porque: d.porque })
    if (!d.pode || ensaio) continue

    const link = linkDeRetoma(c)
    const { assunto, texto } = rascunhoDoLembrete(c, link)
    const r = await criarEnvioPorAprovar({
      kind: KIND_ENVIO.EMAIL_RECUPERACAO,
      chave,
      titulo: `Email · checkout por concluir · ${c.produtoNome || c.produto}`,
      detalhes: `Para: ${e}\nPorque pode: ${d.porque}\nAssunto: ${assunto}\n\n${texto}`,
      payload: { email: e, assunto, texto, link, origem: c.origem, referencia: c.referencia },
    })
    if (r.criado) {
      criados++
      existentes.add(chave)
    } else if (r.erro) avisos.push(`${chave}: ${r.erro}`)
  }

  const porMotivo = decisoes.reduce<Record<string, number>>((acc, d) => {
    acc[d.porque] = (acc[d.porque] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    ok: true,
    ensaio,
    candidatos: candidatos.length,
    elegiveis: decisoes.filter((d) => d.pode).length,
    rascunhosCriados: criados,
    porMotivo,
    avisos,
    nota: 'Nada foi enviado. Os rascunhos esperam aprovação em /admin/social/leads (ou aprovar_envio na API do agente).',
  })
}
