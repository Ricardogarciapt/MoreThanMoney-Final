/**
 * O GOOGLE CALENDAR — opcional, e desenhado para a agenda funcionar sem ele.
 *
 * ═══ PORQUE É OPCIONAL ═════════════════════════════════════════════════════════════════════
 *
 * Porque a agenda tem de marcar chamadas hoje, e ligar uma conta Google exige três coisas fora do
 * código: activar a Calendar API no projecto do Google Cloud, registar o endereço de retorno, e
 * alguém carregar num botão de consentimento. Enquanto isso não acontecer, o site marca na mesma —
 * com as janelas e as marcações que já conhece. Quando acontecer, passa a ver o «ocupado» real e a
 * escrever os eventos na agenda de sempre.
 *
 * ═══ O TOKEN QUE FICA, E O QUE NÃO FICA ════════════════════════════════════════════════════
 *
 * Guarda-se o `refresh_token` (o que não expira) em `agenda_anfitrioes`, e NUNCA o `access_token`:
 * esse vale uma hora e pede-se de cada vez que é preciso. Guardar um token de acesso numa linha é
 * guardar uma coisa que já está morta na maior parte das vezes que se lê.
 *
 * A tabela tem RLS fechada e ninguém a lê pelo cliente — só o servidor, com a chave de serviço. Um
 * `refresh_token` do Google dá acesso à agenda de uma pessoa até ela o revogar; se alguma vez
 * alguém quiser expor esta tabela numa rota, a resposta é não.
 *
 * ═══ ÂMBITO ════════════════════════════════════════════════════════════════════════════════
 *
 * Pede-se `calendar.events` e `calendar.readonly` — escrever os nossos eventos e ler o ocupado. Não
 * se pede mais nada: nem contactos, nem email, nem Drive. Um consentimento que pede o que não usa é
 * um consentimento que as pessoas recusam, e com razão.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { Anfitriao } from './servidor'
import type { Intervalo } from './horas'

const AMBITOS = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

/**
 * O valor do ambiente, limpo.
 *
 * NÃO é paranóia: o `GOOGLE_CLIENT_ID` desta casa tinha, a 30/09, um `\n` LITERAL colado ao fim.
 * Basta isso para o Google responder «Acesso bloqueado» com um erro que não diz qual é o problema —
 * e ninguém olha para um client_id à procura de dois caracteres invisíveis. A mesma defesa já
 * existia em `lib/stripe-prices.ts` pela mesma razão; repete-se aqui porque o valor é outro.
 *
 * Tira aspas (quem cola de um painel traz-nas), espaços, quebras de linha reais e a sequência
 * `\n` escrita como texto.
 */
function limpo(v: string | undefined): string {
  return String(v ?? '').trim().replace(/^["']|["']$/g, '').replace(/(\\n|\\r|\s)+$/g, '').trim()
}

export const clienteId = (): string => limpo(process.env.GOOGLE_CLIENT_ID)
export const clienteSegredo = (): string => limpo(process.env.GOOGLE_CLIENT_SECRET)

export function googleConfigurado(): boolean {
  return Boolean(clienteId() && clienteSegredo())
}

export function enderecoDeRetorno(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
  return `${base.replace(/\/$/, '')}/api/admin/agenda/google/retorno`
}

/**
 * O endereço para onde se manda o anfitrião consentir.
 *
 * `access_type=offline` + `prompt=consent` são obrigatórios: sem os dois, o Google devolve um
 * `refresh_token` só na PRIMEIRA autorização de sempre daquela conta. Quem ligasse, desligasse e
 * voltasse a ligar ficava sem token e sem perceber porquê.
 */
export function enderecoDeConsentimento(anfitriaoId: string, estado: string): string {
  const p = new URLSearchParams({
    client_id: clienteId(),
    redirect_uri: enderecoDeRetorno(),
    response_type: 'code',
    scope: AMBITOS,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: `${anfitriaoId}:${estado}`,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

async function trocarPorTokens(corpo: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clienteId(),
      client_secret: clienteSegredo(),
      ...corpo,
    }).toString(),
  })
  const j = (await r.json()) as Record<string, unknown>
  if (!r.ok) throw new Error(`Google recusou (${r.status}): ${JSON.stringify(j).slice(0, 300)}`)
  return j
}

/** O que o retorno do consentimento faz: código → refresh_token, guardado no anfitrião. */
export async function guardarConsentimento(anfitriaoId: string, codigo: string): Promise<{ email: string | null }> {
  const j = await trocarPorTokens({ code: codigo, grant_type: 'authorization_code', redirect_uri: enderecoDeRetorno() })
  const refresh = String(j.refresh_token ?? '')
  if (!refresh) {
    throw new Error('O Google não devolveu refresh_token. Revoga o acesso em myaccount.google.com/permissions e liga outra vez.')
  }

  // De quem é esta agenda, para o painel poder dizê-lo em vez de mostrar um «ligado» anónimo.
  let email: string | null = null
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${String(j.access_token)}` },
    })
    if (r.ok) email = String(((await r.json()) as { email?: string }).email ?? '') || null
  } catch { /* o email é conforto, não é requisito */ }

  await getSupabaseAdmin().from('agenda_anfitrioes').update({
    google_refresh_token: refresh,
    google_email: email,
    google_ligado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', anfitriaoId)

  return { email }
}

/** Um token de acesso fresco. Vale uma hora e não se guarda. */
async function tokenDeAcesso(a: Anfitriao): Promise<string> {
  if (!a.google_refresh_token) throw new Error('anfitrião sem Google ligado')
  const j = await trocarPorTokens({ refresh_token: a.google_refresh_token, grant_type: 'refresh_token' })
  return String(j.access_token)
}

/** O «ocupado» real da agenda, sem ver o que lá está escrito. É tudo o que precisamos de saber. */
export async function ocupadoNoGoogle(a: Anfitriao, de: Date, ate: Date): Promise<Intervalo[]> {
  const token = await tokenDeAcesso(a)
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      timeMin: de.toISOString(),
      timeMax: ate.toISOString(),
      items: [{ id: a.google_calendar_id || 'primary' }],
    }),
  })
  if (!r.ok) throw new Error(`freeBusy falhou (${r.status})`)
  const j = (await r.json()) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }> }
  const chave = a.google_calendar_id || 'primary'
  const ocupado = j.calendars?.[chave]?.busy ?? Object.values(j.calendars ?? {})[0]?.busy ?? []
  return ocupado.map((b) => ({ inicio: new Date(b.start), fim: new Date(b.end) }))
}

/**
 * O evento na agenda do anfitrião, com o convidado convidado a sério (recebe o convite do Google).
 *
 * `conferenceDataVersion=1` pede um Google Meet. Se a conta não puder criar um (acontece em contas
 * gratuitas com certas políticas), o evento é criado na mesma sem link — o que é o comportamento
 * certo: a chamada existe, e o sítio onde acontece está dito na confirmação.
 */
export async function criarEventoNoGoogle(p: {
  anfitriao: Anfitriao
  tipo: { nome: string; local: string }
  inicio: Date
  fim: Date
  nome: string
  email: string
  telefone: string | null
}): Promise<{ eventId: string; meetUrl: string | null } | null> {
  const token = await tokenDeAcesso(p.anfitriao)
  const cal = encodeURIComponent(p.anfitriao.google_calendar_id || 'primary')

  const descricao = [
    `Marcada em morethanmoney.pt/agendar`,
    `Convidado: ${p.nome} · ${p.email}${p.telefone ? ` · ${p.telefone}` : ''}`,
    p.tipo.local === 'whatsapp' ? 'Chamada de WhatsApp — ligamos nós para o número acima.' : '',
  ].filter(Boolean).join('\n')

  const corpo: Record<string, unknown> = {
    summary: `${p.tipo.nome} · ${p.nome}`,
    description: descricao,
    start: { dateTime: p.inicio.toISOString() },
    end: { dateTime: p.fim.toISOString() },
    attendees: [{ email: p.email, displayName: p.nome }],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
  }
  if (p.tipo.local === 'meet') {
    corpo.conferenceData = { createRequest: { requestId: `mtm-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  }

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${cal}/events?sendUpdates=all&conferenceDataVersion=1`,
    { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) },
  )
  if (!r.ok) throw new Error(`criar evento falhou (${r.status}): ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as { id?: string; hangoutLink?: string }
  return { eventId: String(j.id ?? ''), meetUrl: j.hangoutLink ?? null }
}

export async function apagarEventoNoGoogle(a: Anfitriao, eventId: string): Promise<void> {
  const token = await tokenDeAcesso(a)
  const cal = encodeURIComponent(a.google_calendar_id || 'primary')
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  })
  // 410 = já lá não estava. Não é erro: é o estado que se queria.
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`apagar evento falhou (${r.status})`)
}
