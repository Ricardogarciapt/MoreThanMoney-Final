import assert from 'node:assert/strict'
import { dataIcs, dobrar, escaparIcs, gerarIcs, linksSubscricao } from './aulas-ics'

assert.equal(dataIcs(new Date('2026-11-16T14:00:00.000Z')), '20261116T140000Z')
assert.equal(escaparIcs('a,b;c\nd\\e'), 'a\\,b\\;c\\nd\\\\e')

// Linhas longas dobram a 75 octetos, mesmo com acentos (2 bytes).
const longa = 'DESCRIPTION:' + 'ção'.repeat(40)
for (const l of dobrar(longa).split('\r\n')) assert.ok(new TextEncoder().encode(l).length <= 75)
assert.equal(dobrar(longa).replace(/\r\n /g, ''), longa)

const ics = gerarIcs(
  [
    { id: 'abc:2026-11-16T14:00:00Z', title: 'Sensei Trading', educatorName: 'Ricardo Garcia', scheduledAt: '2026-11-16T14:00:00Z', durationMin: 60, tier: 'all' },
    { id: 'mau', title: 'Data inválida', scheduledAt: 'não é data' },
  ],
  { agora: new Date('2026-11-16T10:00:00Z') },
)
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'))
assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1, 'data inválida fica de fora')
assert.ok(ics.includes('DTSTART:20261116T140000Z'))
assert.ok(ics.includes('DTEND:20261116T150000Z'))
assert.ok(ics.includes('SUMMARY:Sensei Trading · Ricardo Garcia'))
assert.ok(!/stream_key|rtmps|playback/i.test(ics), 'nunca leva dados de transmissão')
assert.ok(ics.replace(/\r\n /g, '').includes('não constitui consultoria financeira'))

const l = linksSubscricao('https://www.morethanmoney.pt/api/aulas/agenda.ics')
assert.equal(l.apple, 'webcal://www.morethanmoney.pt/api/aulas/agenda.ics')
assert.ok(l.google.startsWith('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F'))

console.log('aulas-ics: verde')
