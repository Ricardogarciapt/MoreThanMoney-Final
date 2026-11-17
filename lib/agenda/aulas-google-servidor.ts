/**
 * AS AULAS AO VIVO NAS AGENDAS GOOGLE — a parte que lê a base e fala com o Google.
 * A decisão (título, ocupado/livre, o que criar/mudar/apagar) é pura e vive em `aulas-google.ts`.
 *
 * Para cada anfitrião com o Google ligado:
 *  · com `lms_educador_id` (ex.: Ricardo, na agenda pessoal): só as aulas desse educador, ocupado;
 *  · sem educador (ex.: «MoreThanMoney Team», a agenda morethanmoneypt): todas as aulas, com o nome
 *    de quem dá; ocupado só se quem dá for anfitrião, livre para os restantes educadores.
 *
 * Só toca em eventos que ela própria criou (extendedProperties.private.mtm_origem = 'aulas').
 * Nunca avisa convidados (sendUpdates=none) — estes eventos não têm convidados.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { projectSchedule } from '@/lib/lms-schedule'
import type { Anfitriao } from './servidor'
import { pedidoNaAgenda } from './google'
import { ORIGEM, eventoDaAula, planear, type AulaConcreta, type EventoDesejado, type EventoExistente } from './aulas-google'

const db = () => getSupabaseAdmin()

type Educador = { id: string; display_name: string | null }
type Sala = { id: string; title: string | null; access_tier: string | null; educator_id: string | null; educator?: Educador | Educador[] | null }
const um = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null)

/** As aulas concretas entre `de` e `de + dias`: horário recorrente + avulsas. */
export async function aulasConcretas(de: Date, dias: number): Promise<AulaConcreta[]> {
  const ate = new Date(de.getTime() + dias * 86_400_000)
  const [{ data: slotRows, error: e1 }, { data: avulsas, error: e2 }] = await Promise.all([
    db().from('lms_stream_schedules')
      .select('id, stream_id, weekday, start_time, duration_min, timezone, access_tier, stream:lms_streams(id, title, access_tier, educator_id, educator:lms_educators(id, display_name))')
      .eq('is_active', true),
    db().from('lms_streams')
      .select('id, title, access_tier, scheduled_start_at, educator_id, educator:lms_educators(id, display_name)')
      .gte('scheduled_start_at', de.toISOString())
      .lte('scheduled_start_at', ate.toISOString()),
  ])
  // Sem horário não há espelho: falhar aqui é melhor do que apagar as aulas todas do Google.
  if (e1) throw new Error(`horário das aulas ilegível: ${e1.message}`)
  if (e2) throw new Error(`aulas avulsas ilegíveis: ${e2.message}`)

  const salas = new Map<string, Sala>()
  const slots = []
  for (const r of (slotRows ?? []) as Array<Record<string, unknown>>) {
    const sala = um(r.stream as Sala | Sala[] | null)
    if (!sala) continue
    salas.set(sala.id, sala)
    slots.push({
      id: String(r.id),
      stream_id: String(r.stream_id),
      weekday: Number(r.weekday),
      start_time: String(r.start_time),
      duration_min: (r.duration_min as number | null) ?? null,
      timezone: (r.timezone as string | null) ?? null,
      access_tier: (r.access_tier as string | null) ?? null,
      is_active: true,
    })
  }

  const out: AulaConcreta[] = projectSchedule(slots, { from: de, days: dias }).map((p) => {
    const sala = salas.get(p.streamId)
    const ed = um(sala?.educator)
    return {
      chave: p.id,
      titulo: sala?.title ?? 'Aula ao vivo',
      educadorId: sala?.educator_id ?? null,
      educadorNome: ed?.display_name ?? null,
      inicio: new Date(p.scheduledAt),
      duracaoMin: p.durationMin && p.durationMin > 0 ? p.durationMin : 60,
      tier: p.accessTier ?? sala?.access_tier ?? null,
    }
  })
  for (const s of (avulsas ?? []) as Array<Record<string, unknown>>) {
    if (!s.scheduled_start_at) continue
    const ed = um(s.educator as Educador | Educador[] | null)
    const inicio = new Date(String(s.scheduled_start_at))
    out.push({
      chave: `${s.id}:${inicio.toISOString()}`,
      titulo: String(s.title ?? 'Aula ao vivo'),
      educadorId: (s.educator_id as string | null) ?? null,
      educadorNome: ed?.display_name ?? null,
      inicio,
      duracaoMin: 60,
      tier: (s.access_tier as string | null) ?? null,
    })
  }
  return out
}

async function eventosNossos(a: Anfitriao, de: Date, ate: Date): Promise<EventoExistente[]> {
  const out: EventoExistente[] = []
  let pagina: string | undefined
  do {
    const q = new URLSearchParams({
      privateExtendedProperty: `mtm_origem=${ORIGEM}`,
      timeMin: de.toISOString(),
      timeMax: ate.toISOString(),
      singleEvents: 'true',
      showDeleted: 'false',
      maxResults: '250',
    })
    if (pagina) q.set('pageToken', pagina)
    const r = await pedidoNaAgenda(a, `/events?${q}`)
    if (!r.ok) throw new Error(`listar eventos falhou (${r.status}): ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as {
      nextPageToken?: string
      items?: Array<{
        id: string; summary?: string; description?: string; transparency?: string
        start?: { dateTime?: string }; end?: { dateTime?: string }
        extendedProperties?: { private?: Record<string, string> }
      }>
    }
    for (const e of j.items ?? []) {
      const chave = e.extendedProperties?.private?.mtm_aula
      if (!chave || !e.start?.dateTime || !e.end?.dateTime) continue
      out.push({
        id: e.id,
        chave,
        summary: e.summary ?? '',
        description: e.description ?? '',
        inicio: e.start.dateTime,
        fim: e.end.dateTime,
        transparency: e.transparency === 'transparent' ? 'transparent' : 'opaque',
      })
    }
    pagina = j.nextPageToken
  } while (pagina)
  return out
}

const corpo = (d: EventoDesejado) => ({
  summary: d.summary,
  description: d.description,
  start: { dateTime: d.inicio, timeZone: 'Europe/Lisbon' },
  end: { dateTime: d.fim, timeZone: 'Europe/Lisbon' },
  transparency: d.transparency,
  reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
  extendedProperties: { private: { mtm_origem: ORIGEM, mtm_aula: d.chave } },
})

export interface ResultadoDaAgenda {
  anfitriao: string
  criados: number
  actualizados: number
  apagados: number
  erros: string[]
}

/**
 * Acerta as agendas de todos os anfitriões ligados ao Google para os próximos `dias`.
 * `simular` devolve o plano sem escrever nada.
 */
export async function sincronizarAulasNoGoogle(opts: { dias?: number; simular?: boolean } = {}): Promise<ResultadoDaAgenda[]> {
  const dias = opts.dias ?? 21
  const agora = new Date()
  // Começa 3 h atrás para uma aula a decorrer não ser vista como «já não existe» e apagada.
  const de = new Date(agora.getTime() - 3 * 3_600_000)
  const ate = new Date(agora.getTime() + dias * 86_400_000)

  const { data: linhas, error } = await db().from('agenda_anfitrioes').select('*').eq('ativo', true)
  if (error) throw new Error(`anfitriões ilegíveis: ${error.message}`)
  const anfitrioes = ((linhas ?? []) as Anfitriao[]).filter((a) => a.google_refresh_token)
  if (!anfitrioes.length) return []

  const aulas = await aulasConcretas(de, dias + 1)
  const educadoresDaCasa = new Set(anfitrioes.map((a) => a.lms_educador_id).filter(Boolean) as string[])

  const resultados: ResultadoDaAgenda[] = []
  for (const a of anfitrioes) {
    const res: ResultadoDaAgenda = { anfitriao: a.nome, criados: 0, actualizados: 0, apagados: 0, erros: [] }
    resultados.push(res)
    try {
      const desejados = a.lms_educador_id
        ? aulas.filter((x) => x.educadorId === a.lms_educador_id).map((x) => eventoDaAula(x, true))
        : aulas.map((x) => eventoDaAula(x, !!x.educadorId && educadoresDaCasa.has(x.educadorId)))
      const existentes = await eventosNossos(a, agora, ate)
      const plano = planear(desejados.filter((d) => new Date(d.fim) > agora && new Date(d.inicio) < ate), existentes)
      if (opts.simular) {
        res.criados = plano.criar.length
        res.actualizados = plano.actualizar.length
        res.apagados = plano.apagar.length
        continue
      }
      for (const d of plano.criar) {
        const r = await pedidoNaAgenda(a, '/events?sendUpdates=none', { method: 'POST', body: JSON.stringify(corpo(d)) })
        if (r.ok) res.criados++
        else res.erros.push(`criar ${d.chave}: ${r.status}`)
      }
      for (const { id, evento } of plano.actualizar) {
        const r = await pedidoNaAgenda(a, `/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(corpo(evento)) })
        if (r.ok) res.actualizados++
        else res.erros.push(`actualizar ${evento.chave}: ${r.status}`)
      }
      for (const id of plano.apagar) {
        const r = await pedidoNaAgenda(a, `/events/${encodeURIComponent(id)}?sendUpdates=none`, { method: 'DELETE' })
        if (r.ok || r.status === 404 || r.status === 410) res.apagados++
        else res.erros.push(`apagar ${id}: ${r.status}`)
      }
    } catch (e) {
      res.erros.push(e instanceof Error ? e.message : String(e))
    }
  }
  return resultados
}
