/**
 * TRÁFEGO PAGO — leitura das campanhas Meta (Facebook/Instagram Ads) pela Marketing API.
 *
 * Só LÊ. Pausar, mudar orçamento ou criar anúncios gasta dinheiro e é acto do dono: fica para o
 * gestor da Meta (ou para o conector Meta Ads do Claude, que pede confirmação em cada escrita).
 * Ler directamente a Graph API — em vez de pôr o servidor Python do meta-ads-mcp (BSL 1.1) a correr
 * só para isto — poupa um serviço e uma porta; as perguntas são as mesmas.
 *
 * Variáveis (Vercel):
 *   META_ADS_ACCESS_TOKEN  token de utilizador de sistema com `ads_read` (o mesmo cuidado do WhatsApp:
 *                          tipo SYSTEM_USER e `expires_at: 0`, ver CLAUDE.md)
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
        fields: 'campaign_id,campaign_name,objective,spend,impressions,clicks,ctr,cpc,actions,account_currency',
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
        const ids = (d.data ?? []).map((l: { campaign_id: string }) => l.campaign_id)
        if (ids.length) {
          const e = await fetch(
            `https://graph.facebook.com/${VERSAO}/?ids=${ids.join(',')}&fields=effective_status&access_token=${encodeURIComponent(token!)}`,
            { cache: 'no-store' },
          ).then((x) => x.json()).catch(() => ({}))
          for (const [k, v] of Object.entries(e ?? {})) estados.set(k, String((v as { effective_status?: string })?.effective_status ?? ''))
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
