/**
 * A GUARDA DOS HORÁRIOS QUINZENAIS.
 *
 *   npx tsx lib/lms-schedule.check.ts
 *
 * O caso mau: uma sala «de 15 em 15 dias» aparecer todas as semanas na agenda, ou na semana errada.
 */
import { projectSchedule, type ScheduleSlot } from './lms-schedule'

let falhas = 0
function teste(nome: string, ok: boolean) {
  console.log(`${ok ? '✓' : '✗'} ${nome}`)
  if (!ok) falhas++
}

const base: ScheduleSlot = {
  id: 's1', stream_id: 'sala', weekday: 3, start_time: '22:00', timezone: 'Europe/Lisbon',
}
const de = new Date('2026-11-22T00:00:00Z') // domingo
const dias = (s: ScheduleSlot) =>
  projectSchedule([s], { from: de, days: 42 }).map((p) => p.scheduledAt.slice(0, 10))

teste('semanal continua semanal', dias(base).length === 6)

const quinzenal = { ...base, every_n_weeks: 2, anchor_date: '2026-11-25' }
const q = dias(quinzenal)
teste('quinzenal: 25/11, 9/12, 23/12', JSON.stringify(q) === JSON.stringify(['2026-11-25', '2026-12-09', '2026-12-23']))
teste('quinzenal às 22:00 de Lisboa', projectSchedule([quinzenal], { from: de, days: 7 })[0]?.scheduledAt === '2026-11-25T22:00:00.000Z')
teste('nada antes da âncora', dias({ ...base, anchor_date: '2026-12-02' })[0] === '2026-12-02')
teste('sem âncora, every_n_weeks não esconde semanas', dias({ ...base, every_n_weeks: 2 }).length === 6)

if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1) }
