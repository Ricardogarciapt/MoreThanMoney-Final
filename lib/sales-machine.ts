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
  /** Saúde do motor de automações — o que substituiu o ManyChat (retirado a 04/10/2026). */
  automacoes: { total: number; ativas: number; disparos: number; ultimoDisparo: string | null; naFila: number }
  /** Últimos 14 dias, para o número de hoje ter com o que se comparar. */
  tendencia: Array<{ dia: string; leads: number; corretora: number }>
  /**
   * O PIPELINE DA EQUIPA — o que o motor do dia preparou e o que dele foi feito.
   *
   * Faltava aqui e era o buraco mais caro do painel: a máquina de vendas mostrava leads a entrar e
   * clientes a pagar, e no meio — onde se vende — não mostrava nada. Um funil sem o andar do
   * trabalho humano explica a entrada e a saída e cala-se sobre a única parte que se pode mudar
   * amanhã de manhã.
   */
  pipeline: {
    porEstado: Record<string, number>
    total: number
    tarefasHoje: number
    feitasHoje: number
    /** Negócios cujo papel não é desempenhado por ninguém. É a falta de equipa, em número. */
    semPapel: number
  }
  /**
   * A REDE DE IBs — o volume que ainda paga comissão a outra casa.
   *
   * `foraDeCasa` é dinheiro que já existe e que não é nosso. Não é uma previsão nem um objectivo:
   * é volume medido, exportado pelas corretoras, à espera de ser trazido.
   */
  ib: {
    contas: number
    aTransitar: number
    lotesForaDeCasa: number
    comissaoForaDeCasa: number
  }
  /** Ver `AtribuicaoConteudo`. */
  atribuicao: AtribuicaoConteudo
  /** Ver `MensagensDeAgentes`. */
  mensagens: MensagensDeAgentes
}

/**
 * O QUE OS AGENTES MANDARAM — nos três canais, nas últimas 24 h.
 *
 * Decisão do dono de 01/10/2026: a capacidade de enviar mantém-se e é para usar. Este bloco é o
 * que torna isso verificável em vez de ser uma frase — e é a primeira vez que existe, porque o
 * Telegram, que é o canal que ele mandou crescer, não tinha livro de saídas NENHUM
 * (`sendTelegramChannelMessage` não escrevia em tabela nenhuma).
 *
 * `recusadas` não é um número a esconder: é o mais útil da lista. Uma recusa é uma regra a
 * funcionar — a janela das 24 h da Meta, um consentimento que falta, credenciais em falta — e sem
 * ela à vista a leitura de «saíram 3 mensagens» não diz se o canal está a trabalhar ou entupido.
 */
export interface MensagensDeAgentes {
  enviadas24h: number
  recusadas24h: number
  falhadas24h: number
  /** Por canal, o que saiu. */
  porCanal: Record<string, number>
  /** Mensagens enviadas com pelo menos um link medido — as únicas que podem gerar receita. */
  aMedir24h: number
  /**
   * As que não medem nada, pelo motivo. Nunca um total a seco: uma mensagem com dono e sem link
   * onde medir não é a mesma coisa que uma mensagem sem dono, e confundi-las faz um agente que
   * trabalhou parecer um agente que não fez nada.
   */
  porAtribuir: Record<string, number>
  /** Por agente, quantas mandou e quantos links mediram. */
  porAgente: Array<{ codigo: string; mensagens: number; links: number }>
}

/**
 * A MEDIÇÃO DO CONTEÚDO — quantos posts conseguem provar quem os trouxe.
 *
 * Isto não é um relatório a mais: é o único sítio do painel onde se vê a diferença entre um
 * agente que não trabalhou e um agente que trabalhou e não foi medido. A 01/10 os 200 posts na
 * base tinham ZERO links com `?ag=`, e os sete agentes tinham todos receita zero — a regra das
 * 48 h (lib/agentes/vida.ts) estava a caminho de parar a equipa inteira por isso. Ver
 * lib/agentes/marca-conteudo.ts.
 */
export interface AtribuicaoConteudo {
  /** Posts contados. */
  total: number
  /** Posts com um agente dono. */
  comDono: number
  /** Posts com dono E pelo menos um link nosso marcado — os únicos que podem gerar receita. */
  aMedir: number
  /**
   * Os que não medem nada, pelo motivo. Nunca um total a seco: «por atribuir» sem motivo é um
   * número sem defesa.
   */
  porAtribuir: Record<string, number>
  /** Por agente, quantos posts e quantos links medidos. */
  porAgente: Array<{ codigo: string; posts: number; links: number }>
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
  const [
    { count: registados },
    { count: pagantes },
    { data: automacoes },
    { count: naFila },
    { data: corretoraRecente },
    { data: negocios },
    { data: tarefasHoje },
    { data: contasIb },
  ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      supabase.from('mtm_automacoes').select('ativa, disparos, ultimo_disparo'),
      supabase.from('mtm_conversa_fila').select('id', { count: 'exact', head: true }).eq('processada', false),
      supabase.from('broker_clients').select('updated_at').gte('updated_at', new Date(Date.now() - 14 * 86400_000).toISOString()),
      supabase.from('vendas_negocios').select('estado, prospector_id, setter_id, closer_id'),
      supabase.from('vendas_tarefas').select('estado').eq('prazo', day),
      supabase.from('ib_contas').select('corretora, estado_migracao, volume_lotes, comissao_usd'),
    ])

  /**
   * A medição do conteúdo lê-se à parte e NUNCA rebenta o painel: estas colunas são novas
   * (migração 168) e um painel que deixa de abrir por causa de um relatório é pior do que um
   * relatório em falta.
   */
  const { data: marcados } = await supabase
    .from('social_scheduled_posts')
    .select('agente_codigo, agente_motivo, agente_links_marcados')
    .order('created_at', { ascending: false })
    .limit(500)

  /**
   * O QUE OS AGENTES MANDARAM NAS ÚLTIMAS 24 H. Ver `MensagensDeAgentes`.
   *
   * Tecto de 1000 linhas pela mesma razão que o de cima: um painel que deixa de abrir por causa
   * de um relatório é pior do que um relatório em falta. E se este número chegar ao tecto, isso
   * por si é a informação — mil mensagens em 24 horas é um canal a ser gasto depressa.
   */
  const { data: saidas } = await supabase
    .from('agentes_mensagens')
    .select('canal, agente_codigo, agente_motivo, links_marcados, estado')
    .gte('criado_em', sinceIso)
    .order('criado_em', { ascending: false })
    .limit(1000)

  const msgPorCanal: Record<string, number> = {}
  const msgPorAtribuir: Record<string, number> = {}
  const msgPorAgente = new Map<string, { mensagens: number; links: number }>()
  let enviadas24h = 0
  let recusadas24h = 0
  let falhadas24h = 0
  let msgAMedir = 0
  for (const m of (saidas ?? []) as Array<{
    canal: string
    agente_codigo: string | null
    agente_motivo: string | null
    links_marcados: number | null
    estado: string
  }>) {
    if (m.estado === 'enviada') enviadas24h++
    else if (m.estado === 'recusada') recusadas24h++
    else falhadas24h++
    msgPorCanal[m.canal] = (msgPorCanal[m.canal] ?? 0) + 1

    // O que MEDE conta-se só entre as que saíram: uma mensagem recusada não traz ninguém, e
    // contá-la como «a medir» era prometer receita de uma mensagem que nunca chegou a existir.
    const links = Number(m.links_marcados ?? 0)
    if (m.agente_codigo) {
      const a = msgPorAgente.get(m.agente_codigo) ?? { mensagens: 0, links: 0 }
      a.mensagens++
      a.links += links
      msgPorAgente.set(m.agente_codigo, a)
      if (links > 0 && m.estado === 'enviada') msgAMedir++
      else {
        const motivo = m.agente_motivo || 'sem_link_nosso'
        msgPorAtribuir[motivo] = (msgPorAtribuir[motivo] ?? 0) + 1
      }
    } else {
      const motivo = m.agente_motivo || 'funil_sem_agente'
      msgPorAtribuir[motivo] = (msgPorAtribuir[motivo] ?? 0) + 1
    }
  }

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

  // ── O pipeline da equipa ──────────────────────────────────────────────────
  const porEstado: Record<string, number> = {}
  let semPapel = 0
  for (const n of negocios ?? []) {
    const e = String((n as { estado: string }).estado || 'lead')
    porEstado[e] = (porEstado[e] ?? 0) + 1
    const d = n as { prospector_id: string | null; setter_id: string | null; closer_id: string | null }
    if (!d.prospector_id && !d.setter_id && !d.closer_id && e !== 'ganho' && e !== 'perdido') semPapel++
  }

  // ── A rede de IBs ─────────────────────────────────────────────────────────
  let aTransitar = 0
  let lotesForaDeCasa = 0
  let comissaoForaDeCasa = 0
  for (const c of contasIb ?? []) {
    const l = c as { corretora: string; estado_migracao: string; volume_lotes: number | null; comissao_usd: number | null }
    if (l.estado_migracao === 'a_transitar') aTransitar++
    // «Fora de casa» é tudo o que não é PU Prime — é essa a definição de estar fora.
    if (l.corretora !== 'pu_prime') {
      lotesForaDeCasa += Number(l.volume_lotes ?? 0)
      comissaoForaDeCasa += Number(l.comissao_usd ?? 0)
    }
  }

  // ── A medição do conteúdo ─────────────────────────────────────────────────
  const porAtribuir: Record<string, number> = {}
  const porAgenteMapa = new Map<string, { posts: number; links: number }>()
  let comDono = 0
  let aMedir = 0
  for (const m of marcados ?? []) {
    const l = m as { agente_codigo: string | null; agente_motivo: string | null; agente_links_marcados: number | null }
    const links = Number(l.agente_links_marcados ?? 0)
    if (l.agente_codigo) {
      comDono++
      const a = porAgenteMapa.get(l.agente_codigo) ?? { posts: 0, links: 0 }
      a.posts++
      a.links += links
      porAgenteMapa.set(l.agente_codigo, a)
      if (links > 0) aMedir++
      // Dono mas sem link marcado: conta como «não mede», com o motivo. É o caso que de outra
      // forma se confunde com um agente mau.
      else porAtribuir[l.agente_motivo || 'sem_link_nosso'] = (porAtribuir[l.agente_motivo || 'sem_link_nosso'] ?? 0) + 1
    } else {
      // Os posts de antes da migração 168 não têm motivo escrito. Dizer «anterior_a_medicao» é
      // mais honesto do que os misturar com os que o motor decidiu não atribuir.
      const motivo = l.agente_motivo || 'anterior_a_medicao'
      porAtribuir[motivo] = (porAtribuir[motivo] ?? 0) + 1
    }
  }

  return {
    day,
    andares,
    atribuicao: {
      total: (marcados ?? []).length,
      comDono,
      aMedir,
      porAtribuir,
      porAgente: [...porAgenteMapa.entries()]
        .map(([codigo, v]) => ({ codigo, ...v }))
        .sort((a, b) => b.links - a.links || b.posts - a.posts),
    },
    mensagens: {
      enviadas24h,
      recusadas24h,
      falhadas24h,
      porCanal: msgPorCanal,
      aMedir24h: msgAMedir,
      porAtribuir: msgPorAtribuir,
      porAgente: [...msgPorAgente.entries()]
        .map(([codigo, v]) => ({ codigo, ...v }))
        .sort((a, b) => b.links - a.links || b.mensagens - a.mensagens),
    },
    pipeline: {
      porEstado,
      total: (negocios ?? []).length,
      tarefasHoje: (tarefasHoje ?? []).length,
      feitasHoje: (tarefasHoje ?? []).filter((t) => (t as { estado: string }).estado === 'feita').length,
      semPapel,
    },
    ib: {
      contas: (contasIb ?? []).length,
      aTransitar,
      lotesForaDeCasa: Math.round(lotesForaDeCasa * 100) / 100,
      comissaoForaDeCasa: Math.round(comissaoForaDeCasa * 100) / 100,
    },
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
