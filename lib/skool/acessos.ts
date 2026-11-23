import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarApi, idDoGrupo, lerPagina } from '@/lib/skool/cliente'

/**
 * Acessos do Skool em sintonia com os utilizadores do site (/admin).
 *
 * Decisão do Ricardo (23/11/2026):
 *  · O grupo é GRÁTIS para entrar e vê só os cursos «grátis» (montra).
 *  · Quem PAGA a mensalidade no site (Membro/Premium) recebe convite e os cursos «mensal».
 *  · Admins, VIP e quem compra o BootCamp têm acesso «total».
 *  · Quem deixa de pagar volta ao grátis: tiramos SÓ os cursos que nós próprios demos.
 *  · Os membros que já lá estavam a 23/11 são «legado»: nunca se lhes tira nada.
 *
 * O registo vive em `skool_members` (status: legado | pagante | convidado | gratis | comprador),
 * com os cursos que concedemos em `webhook_payload.concedidos` — é isso que sabemos retirar.
 * Os cursos identificam-se pelo nome curto do URL (/classroom/<nome>), que não muda.
 */

export const CURSOS = {
  gratis: ['7c1a897e', '6124701a'], // Começa já Aqui · Início Rápido (tem o GoldKiller)
  mensal: ['04b96697', '434e4159', '4f2db8db', 'd29215e4', 'dc5268e9', '276f344e', '1e5f5dcc', '8d942a51'],
  // Scanners · Momentum · XTB · Portefólios · Cripto · Mindset · Redes Sociais · Básicos de Forex
  total: ['f17ea2b8', 'f20c4258', '0d931958', 'a992de98'], // BootCamp MTM · BootCamp Trading · IB · Mentorias
}
const BOOTCAMP = 'f17ea2b8'

const MAX_CONVITES = 10
const MAX_RETIRADAS = 15 // travão: mais do que isto numa corrida é suspeito → não retira nada

type Patamar = 'mensal' | 'total'

interface MembroSkool {
  mid: string
  email: string
  nome: string
  role: string
  entrou?: string
}

interface Registo {
  id: string
  user_id: string | null
  skool_member_id: string | null
  skool_email: string | null
  status: string
  webhook_payload: { concedidos?: string[]; patamar?: Patamar; nome?: string } | null
}

const db = () => getSupabaseAdmin()

/** Todos os membros ativos do grupo (o Skool pagina de 30 em 30). */
export async function listarMembros(grupo: string): Promise<MembroSkool[]> {
  const todos: MembroSkool[] = []
  for (let p = 1; p <= 40; p++) {
    const { pageProps } = await lerPagina(`${grupo}/-/members?t=active&p=${p}`)
    const users: any[] = pageProps?.users ?? []
    if (!users.length) break
    for (const u of users) {
      todos.push({
        mid: u.member?.id,
        email: String(u.email || u.member?.inviteEmail || '').toLowerCase().trim(),
        nome: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        role: u.member?.role,
        entrou: u.member?.approvedAt || u.member?.createdAt,
      })
    }
    if (users.length < 30) break
  }
  return todos.filter((m) => m.mid)
}

/** nome curto → id interno dos cursos. */
async function idsDosCursos(grupo: string): Promise<Record<string, string>> {
  const { pageProps } = await lerPagina(`${grupo}/classroom`)
  return Object.fromEntries((pageProps?.allCourses ?? []).map((c: any) => [c.name, c.id]))
}

/** Quem tem direito, segundo o site. */
async function pagantes(): Promise<Map<string, { user_id: string; patamar: Patamar; nome: string }>> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, email, full_name, user_type, subscription_status, access_revoked_at')
    .in('user_type', ['admin', 'vip', 'member'])
    .is('access_revoked_at', null)
  if (error) throw new Error(`profiles: ${error.message}`)
  const m = new Map<string, { user_id: string; patamar: Patamar; nome: string }>()
  for (const p of data ?? []) {
    const email = String(p.email || '').toLowerCase().trim()
    if (!email) continue
    const tipo = String(p.user_type)
    const paga = ['active', 'trialing'].includes(String(p.subscription_status || ''))
    if (tipo === 'admin' || tipo === 'vip') m.set(email, { user_id: p.id, patamar: 'total', nome: p.full_name || '' })
    else if (paga) m.set(email, { user_id: p.id, patamar: 'mensal', nome: p.full_name || '' })
  }
  return m
}

const cursosDo = (p: Patamar) => (p === 'total' ? [...CURSOS.mensal, ...CURSOS.total] : CURSOS.mensal)

async function conceder(gid: string, mid: string, ids: string[]): Promise<string[]> {
  const dados: string[] = []
  for (const id of ids) {
    try {
      await chamarApi('POST', `groups/${gid}/update-member-course-permission`, { member_id: mid, grant: [id], revoke: [] })
      dados.push(id)
    } catch (err) {
      // «already has access» = já tinha por outra via; não é nosso para retirar depois.
      if (!/already has access/i.test(String(err))) throw err
    }
  }
  return dados
}

async function retirar(gid: string, mid: string, ids: string[]) {
  if (!ids.length) return
  await chamarApi('POST', `groups/${gid}/update-member-course-permission`, { member_id: mid, grant: [], revoke: ids })
}

export async function sincronizarAcessos(opts: { simular?: boolean } = {}): Promise<Record<string, unknown>> {
  const { data: cfg } = await db().from('site_settings').select('value').eq('key', 'skool_acessos').maybeSingle()
  const conf = (cfg?.value ?? {}) as { ligado?: boolean; modo?: 'sombra' | 'live'; ultimaCorrida?: string; resumo?: unknown }
  if (conf.ligado === false) return { ok: true, desligado: true }
  const simular = opts.simular || conf.modo === 'sombra'

  const gid = await idDoGrupo()
  const { data: s } = await db().from('integracoes_privadas').select('valor').eq('chave', 'skool_sessao').maybeSingle()
  const grupo = (s?.valor as { grupo?: string } | null)?.grupo || 'morethanmoney-1132'

  const [membros, ids, direito] = await Promise.all([listarMembros(grupo), idsDosCursos(grupo), pagantes()])
  const { data: regs } = await db().from('skool_members').select('id, user_id, skool_member_id, skool_email, status, webhook_payload')
  const registos = (regs ?? []) as Registo[]
  const porMid = new Map(registos.filter((r) => r.skool_member_id).map((r) => [r.skool_member_id!, r]))
  const porEmail = new Map(registos.filter((r) => r.skool_email).map((r) => [r.skool_email!, r]))
  const resumo = { legado: 0, concedidos: 0, convites: 0, retirados: 0, compradores: 0, acoes: [] as string[] }
  const nomesParaIds = (nomes: string[]) => nomes.map((n) => ids[n]).filter(Boolean)

  // 1) Primeira corrida: quem já lá está fica «legado» para sempre.
  if (!registos.length) {
    const linhas = membros.map((m) => ({
      skool_member_id: m.mid,
      skool_email: m.email || null,
      status: 'legado',
      activated_at: m.entrou || new Date().toISOString(),
      webhook_payload: { nome: m.nome, concedidos: [] },
    }))
    if (!simular && linhas.length) await db().from('skool_members').insert(linhas)
    resumo.legado = linhas.length
    resumo.acoes.push(`${linhas.length} membros atuais marcados como legado`)
    await gravarConf(conf, resumo, simular)
    return { ok: true, simular, ...resumo }
  }

  // 2) Quem paga no site: dentro do Skool → garantir cursos; fora → convite.
  let convites = 0
  for (const [email, d] of direito) {
    const membro = membros.find((m) => m.email === email)
    const reg = (membro && porMid.get(membro.mid)) || porEmail.get(email)
    if (reg?.status === 'legado' && d.patamar === 'mensal') continue // já tem o que tinha; não mexer
    const alvo = nomesParaIds(cursosDo(d.patamar))
    if (membro) {
      const ja = new Set(reg?.webhook_payload?.concedidos ?? [])
      const falta = alvo.filter((id) => !ja.has(id))
      if (!falta.length && reg?.status === 'pagante') continue
      resumo.acoes.push(`conceder ${d.patamar} a ${membro.nome || email} (${falta.length})`)
      if (simular) continue
      const dados = falta.length ? await conceder(gid, membro.mid, falta) : []
      resumo.concedidos += dados.length
      const payload = { ...(reg?.webhook_payload ?? {}), nome: membro.nome, patamar: d.patamar, concedidos: [...ja, ...dados] }
      if (reg) await db().from('skool_members').update({ status: reg.status === 'legado' ? 'legado' : 'pagante', user_id: d.user_id, skool_member_id: membro.mid, webhook_payload: payload }).eq('id', reg.id)
      else await db().from('skool_members').insert({ user_id: d.user_id, skool_member_id: membro.mid, skool_email: email, status: 'pagante', activated_at: new Date().toISOString(), webhook_payload: payload })
    } else if (!reg && convites < MAX_CONVITES) {
      convites++
      resumo.acoes.push(`convidar ${d.nome || email} (${d.patamar})`)
      if (simular) continue
      await chamarApi('POST', `groups/${gid}/invite`, { emails: [email], course_ids: alvo })
      resumo.convites++
      await db().from('skool_members').insert({ user_id: d.user_id, skool_email: email, status: 'convidado', activated_at: new Date().toISOString(), webhook_payload: { nome: d.nome, patamar: d.patamar, concedidos: alvo } })
    }
  }

  // 3) Quem deixou de pagar: retirar só o que nós demos. Legado nunca.
  const aRetirar = registos.filter((r) => ['pagante', 'convidado'].includes(r.status) && r.skool_email && !direito.has(r.skool_email))
  if (aRetirar.length > MAX_RETIRADAS) {
    resumo.acoes.push(`TRAVÃO: ${aRetirar.length} retiradas numa corrida — nada retirado, verificar à mão`)
  } else {
    for (const r of aRetirar) {
      const mid = r.skool_member_id || membros.find((m) => m.email === r.skool_email)?.mid
      const dados = r.webhook_payload?.concedidos ?? []
      resumo.acoes.push(`retirar a ${r.webhook_payload?.nome || r.skool_email} (${dados.length})`)
      if (simular) continue
      if (mid) await retirar(gid, mid, dados)
      else if (r.status === 'convidado') await chamarApi('POST', `groups/${gid}/revoke-invite-email?email=${encodeURIComponent(r.skool_email!)}`).catch(() => null)
      resumo.retirados++
      await db().from('skool_members').update({ status: 'gratis', webhook_payload: { ...(r.webhook_payload ?? {}), concedidos: [] } }).eq('id', r.id)
    }
  }

  // 4) Membros novos sem registo: grátis, ou comprador se o BootCamp lhe aparece desbloqueado.
  const novos = membros.filter((m) => !porMid.has(m.mid) && !(m.email && porEmail.has(m.email)) && m.role === 'member').slice(0, 20)
  for (const m of novos) {
    let comprou = false
    try {
      const perm = (await chamarApi('GET', `groups/${gid}/member-course-permissions?member=${m.mid}&progression=true`)) as any
      comprou = Boolean((perm?.courses ?? []).find((c: any) => c.name === BOOTCAMP)?.metadata?.user_has_access)
    } catch {
      /* fica para a próxima */
    }
    if (direito.has(m.email)) continue // trata-se no passo 2 na próxima corrida
    resumo.acoes.push(`${comprou ? 'comprador' : 'grátis'}: ${m.nome || m.email}`)
    if (simular) continue
    let concedidos: string[] = []
    if (comprou) {
      concedidos = await conceder(gid, m.mid, nomesParaIds(cursosDo('total')).filter((id) => id !== ids[BOOTCAMP]))
      resumo.compradores++
    }
    await db().from('skool_members').insert({ skool_member_id: m.mid, skool_email: m.email || null, status: comprou ? 'comprador' : 'gratis', activated_at: m.entrou || new Date().toISOString(), webhook_payload: { nome: m.nome, patamar: comprou ? 'total' : undefined, concedidos } })
  }

  await gravarConf(conf, resumo, simular)
  return { ok: true, simular, ...resumo, acoes: resumo.acoes.slice(0, 40) }
}

async function gravarConf(conf: Record<string, unknown>, resumo: Record<string, unknown>, simular: boolean) {
  await db()
    .from('site_settings')
    .upsert({ key: 'skool_acessos', value: { ...conf, ultimaCorrida: new Date().toISOString(), ultimoResumo: { ...resumo, simular } } }, { onConflict: 'key' })
}
