/**
 * A AGENDA DAS AULAS EM .ics — o mesmo horário da app, para o calendário de cada pessoa.
 *
 * ═══ PORQUE É UMA SUBSCRIÇÃO E NÃO UM LOGIN NO GOOGLE ══════════════════════════════════════
 *
 * Um feed `.ics` serve o Google Calendar, o calendário da Apple (iCloud) e o Outlook com o mesmo
 * endereço, sem o aluno dar acesso à agenda dele. A agenda dele vai buscar o feed sozinha e as
 * mudanças de horário chegam sem ninguém fazer nada. Um login no Google por aluno pedia um
 * consentimento que muitos recusam, e servia só um dos três calendários.
 *
 * ═══ O QUE LEVA, E O QUE NÃO LEVA ══════════════════════════════════════════════════════════
 *
 * Só o que o horário público da app já mostra: título da sala, educador, hora, acesso e o link da
 * app. Nunca a chave de transmissão, o URL de reprodução nem nada que deixe ver a aula sem conta —
 * quem a abre no calendário cai na app, e a app decide o acesso.
 */

export type AulaIcs = {
  id: string
  title: string
  educatorName?: string | null
  scheduledAt: string // ISO UTC
  durationMin?: number | null
  tier?: string | null
}

const APP_URL = 'https://www.morethanmoney.pt/app-mobile?tab=live'

const TIER_PT: Record<string, string> = {
  all: 'Todos',
  free: 'Todos',
  member: 'Membros',
  premium: 'Premium',
  vip: 'VIP',
}

/** Escapa texto para uma propriedade iCalendar (RFC 5545 §3.3.11). */
export function escaparIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Data em UTC no formato básico iCalendar: 20261116T140000Z. */
export function dataIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/** Dobra linhas a 75 octetos (RFC 5545 §3.1); as continuações começam por um espaço. */
export function dobrar(linha: string): string {
  const bytes = new TextEncoder().encode(linha)
  if (bytes.length <= 75) return linha
  const partes: string[] = []
  let atual = ''
  let tamanho = 0
  for (const ch of linha) {
    const n = new TextEncoder().encode(ch).length
    const limite = partes.length === 0 ? 75 : 74
    if (tamanho + n > limite) {
      partes.push(atual)
      atual = ''
      tamanho = 0
    }
    atual += ch
    tamanho += n
  }
  partes.push(atual)
  return partes.join('\r\n ')
}

export function gerarIcs(aulas: AulaIcs[], opts: { nome?: string; agora?: Date } = {}): string {
  const agora = dataIcs(opts.agora ?? new Date())
  const nome = opts.nome ?? 'MoreThanMoney · Aulas ao vivo'
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MoreThanMoney//Aulas ao vivo//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparIcs(nome)}`,
    'X-WR-TIMEZONE:Europe/Lisbon',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ]
  for (const a of aulas) {
    const inicio = new Date(a.scheduledAt)
    if (Number.isNaN(inicio.getTime())) continue
    const fim = new Date(inicio.getTime() + (a.durationMin && a.durationMin > 0 ? a.durationMin : 60) * 60_000)
    const acesso = TIER_PT[String(a.tier ?? 'all').toLowerCase()] ?? String(a.tier)
    const titulo = `${a.title}${a.educatorName ? ` · ${a.educatorName}` : ''}`
    const descricao = `Aula ao vivo MoreThanMoney.\nAcesso: ${acesso}\nAbre a app: ${APP_URL}\n\nConteúdo educativo, não constitui consultoria financeira.`
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${escaparIcs(a.id)}@morethanmoney.pt`,
      `DTSTAMP:${agora}`,
      `DTSTART:${dataIcs(inicio)}`,
      `DTEND:${dataIcs(fim)}`,
      `SUMMARY:${escaparIcs(titulo)}`,
      `DESCRIPTION:${escaparIcs(descricao)}`,
      `URL:${APP_URL}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Aula ao vivo daqui a 15 minutos',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  linhas.push('END:VCALENDAR')
  return linhas.map(dobrar).join('\r\n') + '\r\n'
}

/** Endereços para o botão «Adicionar à agenda» (Google e Apple/Outlook). */
export function linksSubscricao(feedHttps: string): { google: string; apple: string } {
  const webcal = feedHttps.replace(/^https?:\/\//, 'webcal://')
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    apple: webcal,
  }
}
