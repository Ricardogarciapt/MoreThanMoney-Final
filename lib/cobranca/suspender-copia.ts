/**
 * CÓPIA EM PAUSA POR FALTA DE PAGAMENTO — o executor (servidor). Regra em suspender-copia-regras.ts.
 *
 * Corre no fim do cron diário /api/cron/cobranca-recuperar e, para religar depressa, também a seguir
 * a um `invoice.payment_succeeded` (só para essa pessoa, depois de o webhook responder ao resto).
 *
 * Modo em `site_settings.copia_suspensao.modo`:
 *   • 'sombra' (por omissão) → calcula a lista e grava-a no resumo; não toca em nada.
 *   • 'live'   → pausa e religa de verdade.
 *
 * Pausar = mtmcopy_connections.is_active=false, mtmauto_accounts.copia_ativa=false,
 * mtmauto_subscriptions.ativo=false, undeploy das contas MetaApi DEPLOYED, rotas re-sincronizadas
 * e UM email. O que foi desligado fica em `copia_suspensoes.desligado`, e é SÓ isso que se religa.
 * O acesso ao site/app já é cortado pela regra de sempre (is_active/direito_mtm_auto), não aqui.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } from '@/lib/mail-transport'
import { procurarSubscricaoPorEmail } from '@/lib/cobranca/renovacao'
import { tokenMetaApiDoUtilizador } from '@/lib/contas/metaapi-contas'
import { lerEstadosMetaApi } from '@/lib/mtmcopy/contas-ociosas'
import { sincronizarRotasDaEstrategia } from '@/lib/mestres/servidor/sincronizar-rotas'
import {
  decidir,
  situacaoPagamento,
  type AutoPagamento,
  type Ligado,
  type PerfilPagamento,
  type SituacaoPagamento,
} from '@/lib/cobranca/suspender-copia-regras'
import { buildEmailCopiaPausada, buildEmailCopiaReligada } from '@/lib/cobranca/suspender-copia-emails'

const CHAVE = 'copia_suspensao'
const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ?? 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'
/** Travão: se um dia a regra quiser pausar mais do que isto de uma vez, não pausa ninguém. */
const MAX_PAUSAS_POR_CORRIDA = 25

export interface ConfigSuspensao {
  modo: 'sombra' | 'live'
  excecoes: string[]
}

export interface LinhaResumo {
  email: string
  nome: string | null
  situacao: string
  ligado: string
  accao: 'pausar' | 'religar' | 'nada'
  porque?: string
  feito?: boolean
  erros?: string[]
}

export interface ResumoSuspensao {
  atualizadoEm: string
  modo: 'sombra' | 'live'
  pausar: LinhaResumo[]
  religar: LinhaResumo[]
  /** Perfil diz que não paga, Stripe diz que paga: o perfil está dessincronizado. */
  dessincronizados: string[]
  emPausa: number
  travao?: string
}

async function lerConfig(): Promise<ConfigSuspensao & Record<string, unknown>> {
  const db = getSupabaseAdmin()
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const v = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
  return {
    ...v,
    modo: v.modo === 'live' ? 'live' : 'sombra',
    excecoes: Array.isArray(v.excecoes) ? v.excecoes.map(String) : [],
  }
}

async function metaApi(accao: 'deploy' | 'undeploy', id: string, token: string): Promise<boolean> {
  try {
    const r = await fetch(`${PROVISIONING_BASE}/users/current/accounts/${id}/${accao}`, {
      method: 'POST',
      headers: { 'auth-token': token },
      signal: AbortSignal.timeout(15000),
    })
    // 204 = feito; 404 = a conta já não existe (nada a fazer).
    return r.ok || r.status === 404
  } catch {
    return false
  }
}

const nomeCurto = (full?: string | null, email?: string | null) =>
  (full || '').trim().split(/\s+/)[0] || (email || '').split('@')[0] || 'Olá'

const descreverLigado = (l: Ligado) =>
  [
    l.site.length && `${l.site.length} ligação(ões) site`,
    l.auto.length && `${l.auto.length} conta(s) MTM Auto/Funded`,
    l.subs.length && `${l.subs.length} estratégia(s)`,
    l.metaapi.length && `${l.metaapi.length} MetaApi deployed`,
  ]
    .filter(Boolean)
    .join(', ') || 'nada'

function descreverSituacao(s: SituacaoPagamento) {
  return `${s.estado}:${s.motivo}`
}

/**
 * Corre a regra para toda a gente (ou só para `apenasUser`). `ensaio` = nunca escreve, seja qual for o modo.
 */
export async function correrSuspensaoCopia(opcoes: { ensaio?: boolean; apenasUser?: string } = {}): Promise<ResumoSuspensao> {
  const db = getSupabaseAdmin()
  const cfg = await lerConfig()
  const live = cfg.modo === 'live' && !opcoes.ensaio
  const agora = new Date()

  const u0 = opcoes.apenasUser
  const [site, auto, subs, abertas] = await Promise.all([
    u0
      ? db.from('mtmcopy_connections').select('id, user_id, is_active, mt5_status, metaapi_account_id').eq('user_id', u0)
      : db.from('mtmcopy_connections').select('id, user_id, is_active, mt5_status, metaapi_account_id'),
    u0
      ? db.from('mtmauto_accounts').select('id, user_id, copia_ativa, metaapi_account_id').eq('user_id', u0)
      : db.from('mtmauto_accounts').select('id, user_id, copia_ativa, metaapi_account_id'),
    u0 ? db.from('mtmauto_subscriptions').select('id, user_id, ativo').eq('user_id', u0) : db.from('mtmauto_subscriptions').select('id, user_id, ativo'),
    u0
      ? db.from('copia_suspensoes').select('id, user_id, motivo, desligado').is('religada_em', null).eq('user_id', u0)
      : db.from('copia_suspensoes').select('id, user_id, motivo, desligado').is('religada_em', null),
  ])
  if (site.error || auto.error || subs.error || abertas.error) {
    throw new Error(`leitura: ${site.error?.message ?? auto.error?.message ?? subs.error?.message ?? abertas.error?.message}`)
  }

  const estados = await lerEstadosMetaApi() // conta da casa; null = listagem falhou
  const deployed = (id: string | null) => Boolean(id && estados?.get(id)?.state === 'DEPLOYED')

  const ligadoPor = new Map<string, Ligado>()
  const de = (u: string) => {
    let l = ligadoPor.get(u)
    if (!l) ligadoPor.set(u, (l = { site: [], auto: [], subs: [], metaapi: [] }))
    return l
  }
  const vistos = new Set<string>()
  for (const c of site.data ?? []) {
    const u = String(c.user_id)
    if (c.is_active && c.mt5_status !== 'disconnected') de(u).site.push(String(c.id))
    if (deployed(c.metaapi_account_id) && !vistos.has(c.metaapi_account_id)) {
      vistos.add(c.metaapi_account_id)
      de(u).metaapi.push({ id: c.metaapi_account_id, origem: 'site' })
    }
  }
  for (const a of auto.data ?? []) {
    const u = String(a.user_id)
    if (a.copia_ativa) de(u).auto.push(String(a.id))
    if (deployed(a.metaapi_account_id) && !vistos.has(a.metaapi_account_id)) {
      vistos.add(a.metaapi_account_id)
      de(u).metaapi.push({ id: a.metaapi_account_id, origem: 'auto' })
    }
  }
  for (const s of subs.data ?? []) if (s.ativo) de(String(s.user_id)).subs.push(String(s.id))

  const abertaDe = new Map((abertas.data ?? []).map((a) => [String(a.user_id), a]))
  const users = [...new Set([...ligadoPor.keys(), ...abertaDe.keys()])]

  const [perfis, autos] = users.length
    ? await Promise.all([
        db
          .from('profiles')
          .select('id, email, full_name, user_type, member_category, subscription_plan, is_active, subscription_status, subscription_expires_at, mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
          .in('id', users),
        db
          .from('mtmauto_users')
          .select('user_id, papel, super_admin, subscricao, isento, motivo_isencao, acesso_manual, acesso_ate, apple_estado, apple_expira_em')
          .in('user_id', users),
      ])
    : [{ data: [] }, { data: [] }]
  const perfilDe = new Map(((perfis.data ?? []) as Array<PerfilPagamento & { id: string; full_name?: string | null }>).map((p) => [p.id, p]))
  const autoDe = new Map(((autos.data ?? []) as Array<AutoPagamento & { user_id: string }>).map((a) => [a.user_id, a]))

  const resumo: ResumoSuspensao = { atualizadoEm: agora.toISOString(), modo: live ? 'live' : 'sombra', pausar: [], religar: [], dessincronizados: [], emPausa: 0 }
  const planos: Array<{ u: string; accao: 'pausar' | 'religar'; linha: LinhaResumo; situacao: SituacaoPagamento; ligado: Ligado }> = []

  for (const u of users) {
    const perfil = perfilDe.get(u) ?? null
    const ligado = ligadoPor.get(u) ?? { site: [], auto: [], subs: [], metaapi: [] }
    const situacao = situacaoPagamento(perfil, autoDe.get(u), { agora, excecoes: cfg.excecoes, userId: u })
    const aberta = abertaDe.has(u)
    // A Stripe só se pergunta a quem o perfil diz que deve (são poucos).
    let stripePaga: boolean | 'erro' | undefined
    if (situacao.estado === 'deve') {
      const s = await procurarSubscricaoPorEmail(perfil?.email)
      stripePaga = s === 'erro' ? 'erro' : Boolean(s)
      if (stripePaga === true) resumo.dessincronizados.push(perfil?.email ?? u)
    }
    const d = decidir({ situacao, ligado, suspensaoAberta: aberta, stripePaga })
    if (d.accao === 'nada') continue
    const linha: LinhaResumo = {
      email: perfil?.email ?? u,
      nome: perfil?.full_name ?? null,
      situacao: descreverSituacao(situacao),
      ligado: d.accao === 'pausar' ? descreverLigado(ligado) : descreverLigado((abertaDe.get(u)?.desligado ?? {}) as Ligado),
      accao: d.accao,
    }
    planos.push({ u, accao: d.accao, linha, situacao, ligado })
  }

  const aPausar = planos.filter((p) => p.accao === 'pausar')
  if (live && aPausar.length > MAX_PAUSAS_POR_CORRIDA) {
    resumo.travao = `A regra pedia ${aPausar.length} pausas (máximo ${MAX_PAUSAS_POR_CORRIDA}). Nada foi pausado: confirma a lista.`
  }

  const transporter = live ? createMailTransporter() : null
  let mexeu = false
  for (const p of planos) {
    const perfil = perfilDe.get(p.u)
    if (live && !(p.accao === 'pausar' && resumo.travao)) {
      p.linha.erros = []
      if (p.accao === 'pausar') {
        await pausar(p.u, p.situacao.motivo, p.ligado, p.linha.erros)
        await enviar(transporter, perfil?.email, buildEmailCopiaPausada({ nome: nomeCurto(perfil?.full_name, perfil?.email), motivo: p.situacao.motivo }), p.linha.erros)
        await db.from('copia_suspensoes').update({ email_suspensao_em: new Date().toISOString() }).eq('user_id', p.u).is('religada_em', null)
      } else {
        const aberta = abertaDe.get(p.u)!
        await religar(p.u, String(aberta.id), (aberta.desligado ?? {}) as Partial<Ligado>, p.situacao, p.linha.erros)
        await enviar(transporter, perfil?.email, buildEmailCopiaReligada({ nome: nomeCurto(perfil?.full_name, perfil?.email) }), p.linha.erros)
      }
      p.linha.feito = p.linha.erros.length === 0
      mexeu = true
    }
    ;(p.accao === 'pausar' ? resumo.pausar : resumo.religar).push(p.linha)
  }
  transporter?.close()

  // As rotas do motor saem/voltam ao re-sincronizar cada estratégia (o planeador lê os interruptores e o direito).
  if (mexeu) {
    const { data: estrategias } = await db.from('mestres_estrategias').select('slug')
    for (const e of estrategias ?? []) await sincronizarRotasDaEstrategia(String(e.slug)).catch(() => null)
  }

  const { count } = await db.from('copia_suspensoes').select('id', { count: 'exact', head: true }).is('religada_em', null)
  resumo.emPausa = count ?? 0

  if (!opcoes.ensaio && !opcoes.apenasUser) {
    await db.from('site_settings').upsert(
      {
        key: CHAVE,
        value: { ...cfg, resumo },
        description: 'Pausa da cópia (MTM Auto/MTM Funded/MetaApi) por falta de pagamento: modo sombra|live, excecoes e último resumo',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  }
  return resumo
}

async function pausar(userId: string, motivo: string, l: Ligado, erros: string[]) {
  const db = getSupabaseAdmin()
  // 1.º regista (a suspensão aberta é a prova do que se desligou; sem ela não se religava).
  const { error: eIns } = await db.from('copia_suspensoes').insert({ user_id: userId, motivo, desligado: l })
  if (eIns) {
    erros.push(`registo: ${eIns.message}`)
    return
  }
  if (l.site.length) {
    const { error } = await db.from('mtmcopy_connections').update({ is_active: false }).in('id', l.site)
    if (error) erros.push(`site: ${error.message}`)
  }
  if (l.auto.length) {
    const { error } = await db.from('mtmauto_accounts').update({ copia_ativa: false }).in('id', l.auto)
    if (error) erros.push(`auto: ${error.message}`)
  }
  if (l.subs.length) {
    const { error } = await db.from('mtmauto_subscriptions').update({ ativo: false }).in('id', l.subs)
    if (error) erros.push(`subs: ${error.message}`)
  }
  for (const m of l.metaapi) {
    const token = await tokenMetaApiDoUtilizador(userId, m.origem)
    if (!token || !(await metaApi('undeploy', m.id, token))) erros.push(`undeploy ${m.id.slice(0, 8)}`)
  }
  if (erros.length) await db.from('copia_suspensoes').update({ erros }).eq('user_id', userId).is('religada_em', null)
}

async function religar(userId: string, suspensaoId: string, l: Partial<Ligado>, s: SituacaoPagamento, erros: string[]) {
  const db = getSupabaseAdmin()
  for (const m of l.metaapi ?? []) {
    const token = await tokenMetaApiDoUtilizador(userId, m.origem)
    if (!token || !(await metaApi('deploy', m.id, token))) erros.push(`deploy ${m.id.slice(0, 8)}`)
  }
  if (l.site?.length) {
    const { error } = await db.from('mtmcopy_connections').update({ is_active: true }).in('id', l.site)
    if (error) erros.push(`site: ${error.message}`)
  }
  if (l.auto?.length) {
    const { error } = await db.from('mtmauto_accounts').update({ copia_ativa: true }).in('id', l.auto)
    if (error) erros.push(`auto: ${error.message}`)
  }
  if (l.subs?.length) {
    const { error } = await db.from('mtmauto_subscriptions').update({ ativo: true }).in('id', l.subs)
    if (error) erros.push(`subs: ${error.message}`)
  }
  await db
    .from('copia_suspensoes')
    .update({ religada_em: new Date().toISOString(), religada_motivo: `${s.estado}:${s.motivo}`, erros })
    .eq('id', suspensaoId)
}

async function enviar(
  transporter: ReturnType<typeof createMailTransporter> | null,
  to: string | null | undefined,
  mail: { subject: string; html: string; text: string },
  erros: string[],
) {
  if (!transporter || !to) return
  try {
    await transporter.sendMail({ from: mailFrom(), to, subject: mail.subject, html: prepareBrandedEmailHtml(mail.html), text: mail.text, attachments: brandedMailAttachments() })
  } catch (e) {
    erros.push(`email: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Para os emails de reativação: quem, destes, tem a cópia em pausa agora. */
export async function utilizadoresComCopiaPausada(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const { data } = await getSupabaseAdmin().from('copia_suspensoes').select('user_id').in('user_id', userIds).is('religada_em', null)
  return new Set((data ?? []).map((r) => String(r.user_id)))
}
