/**
 * GUARDA do portão de activação. A regra: bloquear é legítimo, bloquear em SILÊNCIO não é.
 *
 * 25/09 encontrámos 48 membros bloqueados desde 19/08, nenhum com registo de aviso, 17 sem
 * comunicação nenhuma. Passaram cinco semanas até alguém reparar — e só porque um deles voltou a
 * tentar entrar. Estas verificações existem para isso não poder repetir-se em silêncio.
 *
 *   npx tsx lib/member-activation.check.ts
 */
import { readFileSync } from 'node:fs'
import { readActivation, activationPatch, activationNotifiedPatch, avisoEmFalta } from './member-activation'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

// Bloquear grava explicitamente que ainda NINGUÉM foi avisado — um campo ausente confundia-se com
// um registo antigo e ninguém sabia o que tinha acontecido.
const bloqueado = { profile_data: activationPatch(null, { decision: 'pay', newMember: true, campaign: 'teste' }) }
teste('bloquear marca notified_at a null', readActivation(bloqueado).notifiedAt === null)
teste('bloquear deixa a activação por fazer', readActivation(bloqueado).required === true)

// A falta de aviso é DETECTÁVEL, e cresce com o tempo.
const desde = Date.parse(readActivation(bloqueado).since ?? '')
teste('sem aviso, a falta é visível', avisoEmFalta(bloqueado, desde + 3 * 3_600_000) === 3)
teste('a falta cresce com os dias', (avisoEmFalta(bloqueado, desde + 72 * 3_600_000) ?? 0) === 72)

// Depois de avisar, deixa de estar em falta.
const avisado = { profile_data: activationNotifiedPatch(bloqueado) }
teste('avisar deixa rasto', typeof readActivation(avisado).notifiedAt === 'string')
teste('avisado já não está em falta', avisoEmFalta(avisado, desde + 72 * 3_600_000) === null)
teste('avisar não desbloqueia ninguém', readActivation(avisado).required === true)
teste('avisar não perde a campanha', readActivation(avisado).campaign === 'teste')

// Quem não está bloqueado nunca aparece na lista.
teste('sem bloqueio não há falta', avisoEmFalta({ profile_data: {} }) === null)
teste('perfil vazio não rebenta', avisoEmFalta(null) === null)

// E existe alguém a gritar: sem o vigia, a falta fica registada e ninguém a lê.
const vigia = readFileSync('app/api/cron/activacao-vigia/route.ts', 'utf8')
teste('o vigia usa a detecção', /avisoEmFalta/.test(vigia))
teste('o vigia avisa o admin', /sendTelegramChannelMessage/.test(vigia))
// O vigia NUNCA pode escrever: nem desbloquear, nem marcar como avisado, nem mandar emails. Só
// contar e gritar — a decisão de escrever a alguém, e o que escrever, é de quem manda.
teste('o vigia não escreve na base', !/\.update\(|\.upsert\(|\.delete\(|\.insert\(/.test(vigia))
teste('o vigia não envia emails a membros', !/sendEmail|sendMail|gmail|resend/i.test(vigia))
const cron = readFileSync('vercel.json', 'utf8')
teste('o vigia corre sozinho', /activacao-vigia/.test(cron))

if (falhas.length) {
  console.error(`member-activation: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('member-activation: bloquear deixa rasto, a falta de aviso é detectável, e há quem grite ✓')
