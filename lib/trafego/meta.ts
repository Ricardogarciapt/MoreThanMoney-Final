/**
 * TRÁFEGO PAGO — as campanhas Meta (Facebook/Instagram Ads) pela Marketing API.
 *
 * LÊ (insights, estado, orçamento) e faz as TRÊS escritas que um gestor de tráfego faz todos os dias:
 * pausar, reactivar e mudar o orçamento diário de uma campanha (`mudarCampanha`). As escritas gastam
 * ou poupam dinheiro, por isso a rota só as deixa ao dono e pede confirmação no ecrã. Criar campanhas
 * e anúncios continua no Gestor de Anúncios. É o mesmo leque de operações do meta-ads-mcp (BSL 1.1),
 * feito directamente na Graph API — sem mais um serviço Python e uma porta para manter.
 *
 * Variáveis (Vercel):
 *   META_ADS_ACCESS_TOKEN  token de utilizador de sistema com `ads_read` (e `ads_management` para as
 *                          escritas). O mesmo cuidado do WhatsApp: tipo SYSTEM_USER e `expires_at: 0`
 *   META_AD_ACCOUNT_IDS    ids das contas de anúncios, separados por vírgula (sem `act_`)
 */
const VERSAO = 'v21.0'

export type PeriodoMeta = 'today' | 'yesterday' | 'last_7d' | 'last_30d' | 'this_month' | 'last_month'
export const PERIODOS: PeriodoMeta[] = ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month']

export type CampanhaMeta = {
  conta: string
  id: string
  nome: string
  estado: string | null
  objectivo: string | null
  gasto: number
  impressoes: number
  cliques: number
  ctr: number | null
  cpc: number | null
  /** Acções de lead que a Meta atribui (formulário instantâneo, pixel «Lead», mensagens iniciadas). */
  leads: number
  /** Vezes que, em média, a mesma pessoa viu o anúncio no período. */
  frequencia: number | null
  /** Orçamento diário da CAMPANHA (CBO), em unidades da moeda. null = o orçamento está nos conjuntos. */
  orcamentoDiario: number | null
}

export type LeituraMeta =
  | { configurado: false; falta: string[] }
  | { configurado: true; periodo: PeriodoMeta; campanhas: CampanhaMeta[]; erros: string[]; moeda: string | null }

const ACCOES_DE_LEAD = new Set([
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.messaging_conversation_started_7d',
  'leadgen_grouped',
])

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)

export function contasConfiguradas(): string[] {
  return (process.env.META_AD_ACCOUNT_IDS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^act_/, ''))
    .filter((s) => /^\d+$/.test(s))
}

export async function lerCampanhasMeta(periodo: PeriodoMeta): Promise<LeituraMeta> {
  const token = process.env.META_ADS_ACCESS_TOKEN
  const contas = contasConfiguradas()
  const falta = [!token && 'META_ADS_ACCESS_TOKEN', !contas.length && 'META_AD_ACCOUNT_IDS'].filter(Boolean) as string[]
  if (falta.length) return { configurado: false, falta }

  const campanhas: CampanhaMeta[] = []
  const erros: string[] = []
  let moeda: string | null = null
  await Promise.all(
    contas.map(async (conta) => {
      const q = new URLSearchParams({
        level: 'campaign',
        date_preset: periodo,
        fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,cpc,frequency,actions,account_currency',
        limit: '200',
        access_token: token!,
      })
      try {
        const r = await fetch(`https://graph.facebook.com/${VERSAO}/act_${conta}/insights?${q}`, { cache: 'no-store' })
        const d = await r.json()
        if (!r.ok || d.error) {
          erros.push(`act_${conta}: ${d?.error?.message ?? r.status}`)
          return
        }
        // O estado vem de outro pedido (insights não o traz); um só pedido por conta, pelos ids.
        const estados = new Map<string, string>()
        const orcamentos = new Map<string, number>()
        const ids = (d.data ?? []).map((l: { campaign_id: string }) => l.campaign_id)
        if (ids.length) {
          const e = await fetch(
            `https://graph.facebook.com/${VERSAO}/?ids=${ids.join(',')}&fields=effective_status,daily_budget&access_token=${encodeURIComponent(token!)}`,
            { cache: 'no-store' },
          ).then((x) => x.json()).catch(() => ({}))
          for (const [k, v] of Object.entries(e ?? {})) {
            const x = v as { effective_status?: string; daily_budget?: string }
            estados.set(k, String(x?.effective_status ?? ''))
            // A Meta dá o orçamento em cêntimos da moeda da conta.
            if (x?.daily_budget) orcamentos.set(k, num(x.daily_budget) / 100)
          }
        }
        for (const l of d.data ?? []) {
          moeda = moeda ?? l.account_currency ?? null
          const leads = (l.actions ?? []).filter((a: { action_type: string }) => ACCOES_DE_LEAD.has(a.action_type))
            .reduce((s: number, a: { value: string }) => Math.max(s, num(a.value)), 0)
          campanhas.push({
            conta,
            id: l.campaign_id,
            nome: l.campaign_name,
            estado: estados.get(l.campaign_id) || null,
            objectivo: l.objective ?? null,
            gasto: num(l.spend),
            impressoes: num(l.impressions),
            cliques: num(l.clicks),
            ctr: l.ctr == null ? null : num(l.ctr),
            cpc: l.cpc == null ? null : num(l.cpc),
            leads,
            frequencia: l.frequency == null ? null : num(l.frequency),
            orcamentoDiario: orcamentos.get(l.campaign_id) ?? null,
          })
        }
      } catch (e) {
        erros.push(`act_${conta}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }),
  )
  campanhas.sort((a, b) => b.gasto - a.gasto)
  return { configurado: true, periodo, campanhas, erros, moeda }
}

/** Dias que cada período cobre, para contar os leads do CRM na mesma janela. */
export function inicioDoPeriodo(p: PeriodoMeta, agora = new Date()): { de: Date; ate: Date } {
  const d = new Date(agora)
  const inicioDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  switch (p) {
    case 'today': return { de: inicioDia(d), ate: d }
    case 'yesterday': { const o = inicioDia(d); return { de: new Date(o.getTime() - 86_400_000), ate: o } }
    case 'last_7d': return { de: new Date(inicioDia(d).getTime() - 7 * 86_400_000), ate: inicioDia(d) }
    case 'last_30d': return { de: new Date(inicioDia(d).getTime() - 30 * 86_400_000), ate: inicioDia(d) }
    case 'this_month': return { de: new Date(d.getFullYear(), d.getMonth(), 1), ate: d }
    case 'last_month': return { de: new Date(d.getFullYear(), d.getMonth() - 1, 1), ate: new Date(d.getFullYear(), d.getMonth(), 1) }
  }
}

export type MudancaCampanha = { acao: 'pausar' } | { acao: 'activar' } | { acao: 'orcamento'; diario: number }

/**
 * Pausar, reactivar ou mudar o orçamento diário (CBO) de uma campanha. Devolve a mensagem da Meta
 * em caso de recusa — sem a traduzir para «falhou», porque é ela que diz o que falta (permissão
 * `ads_management`, orçamento abaixo do mínimo, orçamento nos conjuntos e não na campanha…).
 */
export async function mudarCampanha(campanhaId: string, m: MudancaCampanha): Promise<{ ok: true } | { ok: false; erro: string }> {
  const token = process.env.META_ADS_ACCESS_TOKEN
  if (!token) return { ok: false, erro: 'META_ADS_ACCESS_TOKEN não está configurado.' }
  if (!/^\d+$/.test(campanhaId)) return { ok: false, erro: 'Campanha inválida.' }
  const corpo = new URLSearchParams({ access_token: token })
  if (m.acao === 'pausar') corpo.set('status', 'PAUSED')
  else if (m.acao === 'activar') corpo.set('status', 'ACTIVE')
  else {
    if (!Number.isFinite(m.diario) || m.diario < 1 || m.diario > 5000) return { ok: false, erro: 'Orçamento diário entre 1 e 5000.' }
    corpo.set('daily_budget', String(Math.round(m.diario * 100)))
  }
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${campanhaId}`, { method: 'POST', body: corpo, cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) return { ok: false, erro: d?.error?.error_user_msg ?? d?.error?.message ?? `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}

// ── CRIAR (sempre em pausa) ─────────────────────────────────────────────────────────────────────

export interface NovaCampanhaMeta {
  conta: string
  nome: string
  /** Euros por dia, no conjunto de anúncios. */
  orcamentoDiario: number
  paises: string[]
  texto: string
  titulo: string
  descricao: string
  link: string
  cta: 'LEARN_MORE' | 'SIGN_UP' | 'BOOK_TRAVEL' | 'CONTACT_US' | 'SUBSCRIBE' | 'APPLY_NOW' | 'GET_QUOTE'
  /** URL público de uma imagem (Feed 1:1 ou 4:5). Sem ela a Meta usa a pré-visualização do link. */
  imagem?: string
}

/** Validação pura — o que a rota recusa antes de gastar um pedido à Meta. Testada em `meta.check.ts`. */
export function validarNovaCampanha(c: Partial<NovaCampanhaMeta>, contas = contasConfiguradas()): string[] {
  const erros: string[] = []
  if (!c.conta || !contas.includes(String(c.conta).replace(/^act_/, ''))) erros.push('conta de anúncios fora das configuradas')
  if (!c.nome || c.nome.trim().length < 3) erros.push('nome da campanha')
  if (!Number.isFinite(c.orcamentoDiario) || c.orcamentoDiario! < 1 || c.orcamentoDiario! > 500) erros.push('orçamento diário entre 1 e 500')
  if (!c.paises?.length || !c.paises.every((p) => /^[A-Z]{2}$/.test(p))) erros.push('países (códigos de 2 letras, ex.: PT, BR)')
  if (!c.texto?.trim() || c.texto.length > 2000) erros.push('texto principal')
  if (!c.titulo?.trim() || c.titulo.length > 255) erros.push('título')
  if (!c.link || !/^https:\/\/(www\.)?morethanmoney\.pt(\/|$)/.test(c.link)) erros.push('link (tem de ser https://www.morethanmoney.pt/…)')
  return erros
}

/**
 * Cria campanha → conjunto → criativo → anúncio, TUDO em `PAUSED`. Nada gasta um cêntimo até o dono
 * activar a campanha em Gestão → Tráfego (ou no Gestor de Anúncios). É o `create_campaign`,
 * `create_adset`, `create_ad_creative` e `create_ad` do meta-ads-mcp, feitos directamente na Graph
 * API. Educação financeira/trading cai na categoria especial FINANCIAL_PRODUCTS_SERVICES, que limita
 * a segmentação: idade 18-65 fixa, sem género — por isso a campanha só escolhe países.
 *
 * Precisa de META_ADS_ACCESS_TOKEN com `ads_management` e de META_PAGE_ID (a página do Facebook
 * ligada ao Instagram @morethanmoney.pt). Se um passo falhar a meio, o que já foi criado fica em
 * pausa e o erro diz em que passo parou.
 */
export async function criarCampanhaPausada(c: NovaCampanhaMeta): Promise<
  { ok: true; campanhaId: string; conjuntoId: string; anuncioId: string } | { ok: false; erro: string; criados: Record<string, string> }
> {
  const token = process.env.META_ADS_ACCESS_TOKEN
  const pagina = process.env.META_PAGE_ID
  const criados: Record<string, string> = {}
  if (!token) return { ok: false, erro: 'META_ADS_ACCESS_TOKEN não está configurado.', criados }
  if (!pagina) return { ok: false, erro: 'META_PAGE_ID não está configurado (id da página do Facebook ligada ao Instagram).', criados }
  const conta = `act_${c.conta.replace(/^act_/, '')}`

  const post = async (caminho: string, campos: Record<string, unknown>): Promise<string> => {
    const corpo = new URLSearchParams({ access_token: token })
    for (const [k, v] of Object.entries(campos)) corpo.set(k, typeof v === 'string' ? v : JSON.stringify(v))
    const r = await fetch(`https://graph.facebook.com/${VERSAO}/${caminho}`, { method: 'POST', body: corpo, cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error || !d.id) throw new Error(d?.error?.error_user_msg ?? d?.error?.message ?? `HTTP ${r.status}`)
    return String(d.id)
  }

  let passo = 'campanha'
  try {
    criados.campanha = await post(`${conta}/campaigns`, {
      name: c.nome,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: ['FINANCIAL_PRODUCTS_SERVICES'],
      buying_type: 'AUCTION',
    })
    passo = 'conjunto de anúncios'
    criados.conjunto = await post(`${conta}/adsets`, {
      name: `${c.nome} · conjunto`,
      campaign_id: criados.campanha,
      status: 'PAUSED',
      daily_budget: String(Math.round(c.orcamentoDiario * 100)),
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      destination_type: 'WEBSITE',
      targeting: { geo_locations: { countries: c.paises }, age_min: 18, age_max: 65 },
    })
    passo = 'criativo'
    const linkData: Record<string, unknown> = {
      message: c.texto,
      link: c.link,
      name: c.titulo,
      description: c.descricao,
      call_to_action: { type: c.cta, value: { link: c.link } },
    }
    if (c.imagem) linkData.picture = c.imagem
    criados.criativo = await post(`${conta}/adcreatives`, {
      name: `${c.nome} · criativo`,
      object_story_spec: { page_id: pagina, link_data: linkData },
    })
    passo = 'anúncio'
    criados.anuncio = await post(`${conta}/ads`, {
      name: `${c.nome} · anúncio`,
      adset_id: criados.conjunto,
      creative: { creative_id: criados.criativo },
      status: 'PAUSED',
    })
    return { ok: true, campanhaId: criados.campanha, conjuntoId: criados.conjunto, anuncioId: criados.anuncio }
  } catch (e) {
    return { ok: false, erro: `Parou no passo «${passo}»: ${e instanceof Error ? e.message : String(e)}`, criados }
  }
}
