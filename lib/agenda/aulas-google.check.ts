/**
 * A GUARDA DO ESPELHO DAS AULAS NO GOOGLE.
 *
 *   npx tsx lib/agenda/aulas-google.check.ts
 */
import { eventoDaAula, planear, tituloDoEvento, type AulaConcreta, type EventoExistente } from './aulas-google'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const aula = (p: Partial<AulaConcreta> = {}): AulaConcreta => ({
  chave: 's1:2026-11-17T21:00:00.000Z', titulo: 'Império Cripto', educadorId: 'ruben', educadorNome: 'Ruben Pereira',
  inicio: new Date('2026-11-17T21:00:00Z'), duracaoMin: 60, tier: 'app_member', ...p,
})

// Títulos
teste('título com educador', tituloDoEvento(aula()) === '🔴 [MTM · Ruben Pereira] Império Cripto (Membro €35+)')
teste('educador colectivo não repete MTM', tituloDoEvento(aula({ titulo: 'Mindset e Liderança', educadorNome: 'MTM Mindset & Liderança', tier: 'free' })) === '🔴 [MTM Mindset & Liderança] Mindset e Liderança (Todos)')
teste('sem educador fica MTM', tituloDoEvento(aula({ educadorNome: null, tier: 'vip' })) === '🔴 [MTM] Império Cripto (VIP)')

// Ocupado / livre
teste('de outro educador = livre', eventoDaAula(aula(), false).transparency === 'transparent')
teste('do anfitrião = ocupado', eventoDaAula(aula(), true).transparency === 'opaque')
teste('fim = início + duração', eventoDaAula(aula({ duracaoMin: 90 }), true).fim === '2026-11-17T22:30:00.000Z')

// Plano
const d = eventoDaAula(aula(), false)
const existente = (p: Partial<EventoExistente> = {}): EventoExistente => ({
  id: 'g1', chave: d.chave, summary: d.summary, description: d.description,
  inicio: '2026-11-17T21:00:00+00:00', fim: '2026-11-17T22:00:00+00:00', transparency: 'transparent', ...p,
})
let p = planear([d], [])
teste('cria o que falta', p.criar.length === 1 && !p.actualizar.length && !p.apagar.length)
p = planear([d], [existente()])
teste('igual (mesmo instante noutro formato) não mexe', !p.criar.length && !p.actualizar.length && !p.apagar.length)
p = planear([d], [existente({ summary: '🔴 [MTM · Educador] Império Cripto' })])
teste('título mudou → actualiza', p.actualizar.length === 1 && p.actualizar[0].id === 'g1')
p = planear([d], [existente({ transparency: 'opaque' })])
teste('passou a livre → actualiza', p.actualizar.length === 1)
p = planear([], [existente()])
teste('aula saiu do site → apaga', p.apagar.length === 1 && p.apagar[0] === 'g1')
p = planear([d], [existente(), existente({ id: 'g2' })])
teste('duplicado → apaga o segundo', p.apagar.length === 1 && p.apagar[0] === 'g2' && !p.criar.length)
p = planear([d, d], [])
teste('desejado repetido cria uma vez', p.criar.length === 1)

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log('✓ aulas-google: tudo certo')
