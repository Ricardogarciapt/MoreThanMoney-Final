import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches, setExecSwitches } from '@/lib/mtmcopy/exec-switches'
import { publicCaption, rehostMedia } from '@/lib/instagram/publish'

/**
 * Núcleo da MÁQUINA DE VENDAS — estado + comandos, partilhado pelo hub (/api/sales-machine)
 * e pelo agente do site (/api/agent/v1/business, usado pelo AIOS: FRIDAY=vendas, EDITH=admin).
 * Uma só fonte de verdade → as 3 pontas (admin, AIOS site, AIOS local) veem o mesmo.
 */

const IG_MTM = '17841474872672009'
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

export interface SalesState {
  day: string
  funnel: { byStage: Record<string, number>; novos24h: number; grantedToday: number; total: number }
  content: { pending: number; drafts: Array<Record<string, unknown>>; autopilot: { morethanmoney: boolean; ricardo: boolean } }
  conversions_24h: number
  broker_clients: number
  signals_24h: number
  execution: Record<string, boolean>
  /**
   * Os andares do funil, por ordem, com a queda entre cada um.
   *
   * A contagem por `stage` que já existia é um saco: diz quantos estão em cada estado mas não
   * onde se perdem. E é onde se perdem que decide o que fazer a seguir — foi assim que o passo da
   * corretora esteve meses a zero sem ninguém dar por isso.
   */
  andares: Andar[]
  /** Saúde do motor de automações — o que substitui o ManyChat. */
  automacoes: { total: number; ativas: number; disparos: number; ultimoDisparo: string | null; naFila: number }
  /** Últimos 14 dias, para o número de hoje ter com o que se comparar. */
  tendencia: Array<{ dia: string; leads: number; corretora: number }>
}

export interface Andar {
  nome: string
  /** Quantas pessoas chegaram aqui. */
  n: number
  /** O que este número conta, em palavras — para não se ler um número sem saber de onde vem. */
  fonte: string
  /** Percentagem que sobreviveu do andar anterior. Null no primeiro. */
  passou: number | null
}

export async function buildSalesState(): Promise<SalesState> {
  const supabase = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

  const [{ data: leads }, { data: drafts }, { count: pagos24h }, { count: brokerClients }, { count: signals24h }, { data: ap }, execSwitches] =
    await Promise.all([
      supabase.from('telegram_leads').select('stage, granted_at, created_at'),
      supabase
        .from('social_scheduled_posts')
        .select('id, ig_username, pillar, status, scheduled_at, media_urls, caption')
        .in('status', ['draft', 'approved', 'processing'])
        .order('scheduled_at', { ascending: true })
        .limit(20),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active').neq('subscription_platform', 'manual').gte('updated_at', sinceIso),
      supabase.from('broker_clients').select('uid', { count: 'exact', head: true }),
      supabase.from('tradingview_signals').select('id', { count: 'exact', head: true }).gte('received_at', sinceIso),
      supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle(),
      getExecSwitches(),
    ])

  // Segunda ronda: o que alimenta os andares e a tendência. Fica à parte porque nada disto é
  // preciso para os cartões de cima — se falhar, o painel continua a abrir.
  const [{ count: registados }, { count: pagantes }, { data: automacoes }, { count: naFila }, { data: corretoraRecente }] =
    await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      supabase.from('mtm_automacoes').select('ativa, disparos, ultimo_disparo'),
      supabase.from('mtm_conversa_fila').select('id', { count: 'exact', head: true }).eq('processada', false),
      supabase.from('broker_clients').select('updated_at').gte('updated_at', new Date(Date.now() - 14 * 86400_000).toISOString()),
    ])

  const byStage: Record<string, number> = {}
  let novos24h = 0
  let grantedToday = 0
  for (const l of leads ?? []) {
    byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
    if (l.created_at && l.created_at >= sinceIso) novos24h++
    if (l.granted_at && String(l.granted_at).slice(0, 10) === day) grantedToday++
  }

  const drafted = (drafts ?? []).map((d) => ({
    id: d.id,
    account: d.ig_username,
    pillar: d.pillar,
    status: d.status,
    scheduled_at: d.scheduled_at,
    has_image: Array.isArray(d.media_urls) && d.media_urls.length > 0,
    preview: publicCaption(d.caption || '').slice(0, 140),
  }))

  const autopilot = (ap?.value as { morethanmoney?: boolean; ricardo?: boolean } | null) || {}

  /**
   * A escada, do topo para o fim. Cada degrau é uma tabela diferente de propósito: se todos os
   * números viessem do mesmo sítio, o funil só mostrava o que esse sítio sabe.
   */
  const totalLeads = (leads ?? []).length
  const escada: Array<{ nome: string; n: number; fonte: string }> = [
    { nome: 'Leads no Telegram', n: totalLeads, fonte: 'telegram_leads' },
    { nome: 'Conta na corretora', n: brokerClients ?? 0, fonte: 'broker_clients' },
    { nome: 'Registados no site', n: registados ?? 0, fonte: 'profiles' },
    { nome: 'Subscrição ativa', n: pagantes ?? 0, fonte: "profiles · subscription_status = 'active'" },
  ]
  const andares = escada.map((a, i) => ({
    ...a,
    // A queda só faz sentido contra o andar de cima; e dividir por zero não é 0%, é "não há base".
    passou: i === 0 || escada[i - 1].n === 0 ? null : Math.round((a.n / escada[i - 1].n) * 1000) / 10,
  }))

  const dias: Array<{ dia: string; leads: number; corretora: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(
      new Date(Date.now() - i * 86400_000),
    )
    dias.push({
      dia: d,
      leads: (leads ?? []).filter((l) => String(l.created_at ?? '').slice(0, 10) === d).length,
      corretora: (corretoraRecente ?? []).filter((b) => String(b.updated_at ?? '').slice(0, 10) === d).length,
    })
  }

  return {
    day,
    andares,
    automacoes: {
      total: (automacoes ?? []).length,
      ativas: (automacoes ?? []).filter((a) => a.ativa === true).length,
      disparos: (automacoes ?? []).reduce((t, a) => t + Number(a.disparos ?? 0), 0),
      ultimoDisparo:
        (automacoes ?? [])
          .map((a) => (a.ultimo_disparo ? String(a.ultimo_disparo) : ''))
          .filter(Boolean)
          .sort()
          .pop() ?? null,
      naFila: naFila ?? 0,
    },
    tendencia: dias,
    funnel: { byStage, novos24h, grantedToday, total: totalLeads },
    content: { pending: drafted.length, drafts: drafted, autopilot: { morethanmoney: !!autopilot.morethanmoney, ricardo: !!autopilot.ricardo } },
    conversions_24h: pagos24h ?? 0,
    broker_clients: brokerClients ?? 0,
    signals_24h: signals24h ?? 0,
    execution: execSwitches as unknown as Record<string, boolean>,
  }
}

async function runCron(path: string): Promise<unknown> {
  const secret = process.env.CRON_SECRET || ''
  const r = await fetch(`${SITE}${path}`, { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store' })
  return r.json().catch(() => ({ ok: r.ok }))
}

export interface SalesCommand {
  action: string
  id?: string
  account?: string
  key?: string
  on?: boolean
  url?: string
}

/** Executa um comando da máquina de vendas. Devolve {ok, ...} — nunca lança (erros no campo error). */
export async function runSalesCommand(cmd: SalesCommand): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin()
  const action = (cmd.action || '').trim()
  try {
    switch (action) {
      case 'approve_post': {
        if (!cmd.id) return { ok: false, error: 'id em falta' }
        const { error } = await supabase
          .from('social_scheduled_posts')
          .update({ status: 'approved', approved_by: 'sales-machine', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', cmd.id)
          .eq('status', 'draft')
        return error ? { ok: false, error: error.message } : { ok: true, approved: cmd.id }
      }
      case 'reject_post': {
        if (!cmd.id) return { ok: false, error: 'id em falta' }
        const { error } = await supabase.from('social_scheduled_posts').delete().eq('id', cmd.id).in('status', ['draft', 'approved'])
        return error ? { ok: false, error: error.message } : { ok: true, rejected: cmd.id }
      }
      case 'attach_image': {
        // Encaixa uma imagem (ex.: export do Canva via MCP) num rascunho: re-hospeda no bucket + set media_urls.
        if (!cmd.id || !cmd.url) return { ok: false, error: 'id e url obrigatórios' }
        const stable = await rehostMedia(cmd.url, { prefix: 'canva' })
        const { error } = await supabase
          .from('social_scheduled_posts')
          .update({ media_urls: [stable], updated_at: new Date().toISOString() })
          .eq('id', cmd.id)
        return error ? { ok: false, error: error.message } : { ok: true, id: cmd.id, image: stable }
      }
      case 'set_autopilot': {
        const acc = (cmd.account || '').trim()
        if (!['morethanmoney', 'ricardo'].includes(acc)) return { ok: false, error: 'account inválido' }
        const { data: cur } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
        const val = { ...((cur?.value as object) || {}), [acc]: !!cmd.on }
        await supabase.from('site_settings').upsert({ key: 'content_autopilot', value: val }, { onConflict: 'key' })
        return { ok: true, autopilot: val }
      }
      case 'set_exec': {
        if (!cmd.key) return { ok: false, error: 'key em falta' }
        const next = await setExecSwitches({ [cmd.key]: !!cmd.on } as never)
        return { ok: true, execution: next }
      }
      case 'generate_now':
        return { ok: true, result: await runCron('/api/cron/content-draft') }
      case 'repost_now':
        return { ok: true, result: await runCron('/api/cron/content-repost') }
      case 'digest_now':
        return { ok: true, result: await runCron('/api/cron/sales-digest') }
      default:
        return { ok: false, error: `ação desconhecida: ${action}` }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Resumo curto em texto (para o cérebro do AIOS falar / voz). */
export function salesStateSummary(s: SalesState): string {
  const stages = Object.entries(s.funnel.byStage).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(', ') || '—'
  const ap = `marca ${s.content.autopilot.morethanmoney ? 'ON' : 'OFF'}, ricardo ${s.content.autopilot.ricardo ? 'ON' : 'OFF'}`
  return (
    `Funil: ${stages} (${s.funnel.novos24h} novos 24h, ${s.funnel.grantedToday} acessos hoje). ` +
    `Conversões pagas 24h: ${s.conversions_24h}. Corretora validada: ${s.broker_clients}. Sinais 24h: ${s.signals_24h}. ` +
    `Conteúdo: ${s.content.pending} rascunhos por rever (autopilot ${ap}).`
  )
}
