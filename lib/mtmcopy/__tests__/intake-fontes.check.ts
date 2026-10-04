/**
 * OS INTERRUPTORES DE RECEPÇÃO DESLIGAM O QUE DIZEM QUE DESLIGAM.
 *
 * O painel do admin mostra um interruptor por FONTE. Se o rótulo disser «MTM Scanner» e o
 * interruptor cortar a Edge, quem o usa corta a maior fonte do sistema a pensar que está a mexer
 * na mais pequena — e só dá por isso quando os sinais pararem. Esta guarda prende as duas metades
 * da resposta para não voltarem a divergir:
 *
 *  1) o ESPELHO do Telegram: título do grupo → canal da app → interruptor;
 *  2) a promessa de que um slug PARTILHADO não decide sozinho quem o corta.
 *
 * Contexto medido a 29/09, que é o que torna isto preciso: o canal `sinais-scanner-mtm` («MTM Auto
 * Edge») tem 444 sinais acompanhados com `source_key = 'primeverse'` (a Edge, pelo pv-relay) e
 * recebe TAMBÉM o ouro/BTC do MTM Scanner pelo webhook do TradingView. Ler o slug como se fosse a
 * fonte dá a resposta errada para um deles, seja qual for a chave que se escolha. Por isso as
 * fontes que entram por webhook/relay gateiam-se pela CHAVE, directamente, e nunca pelo slug.
 */
import assert from 'node:assert'
import { INTAKE_CHANNELS, intakeKeyDoEspelhoTelegram, type IntakeKey } from '../intake-channels'
import { detectSlugFromChannelTitle } from '../../telegram-app-channels'

let feitos = 0
function ok(descricao: string, fn: () => void) {
  fn()
  feitos++
  console.log(`  ok  ${descricao}`)
}

// ── 1 · O catálogo do admin está coerente consigo próprio ─────────────────────────────────────
ok('as chaves do catálogo não se repetem e todas têm rótulo e pista', () => {
  const vistas = new Set<string>()
  for (const c of INTAKE_CHANNELS) {
    assert.ok(!vistas.has(c.key), `chave repetida no catálogo: ${c.key}`)
    vistas.add(c.key)
    assert.ok(c.label.trim().length > 0, `sem rótulo: ${c.key}`)
    assert.ok(c.hint.trim().length > 0, `sem pista: ${c.key}`)
  }
})

// ── 2 · Espelho do Telegram: o grupo que se desliga é o grupo que se pensa ────────────────────
// Cada linha é «título do grupo de Telegram» → interruptor que o corta no espelho.
const ESPELHO: [string, IntakeKey][] = [
  ['MoreThanMoney Premium Signals', 'premium'],
  ['MoreThanMoney Sensei Scanner', 'sensei'],
  ['More Than Money - Goldkiller Scanner', 'goldkiller'],
  ['More Than Money Ideias de Forex', 'forex_ideas'],
  ['Ideias de Perpétuos Cripto', 'perps'],
  ['MTM Scanner', 'mtmscanner'],
]

for (const [titulo, esperado] of ESPELHO) {
  ok(`«${titulo}» → interruptor «${esperado}»`, () => {
    const slug = detectSlugFromChannelTitle(titulo)
    assert.ok(slug, `o título «${titulo}» deixou de resolver para um canal da app`)
    assert.equal(
      intakeKeyDoEspelhoTelegram(slug),
      esperado,
      `o grupo «${titulo}» espelha para «${slug}» mas o interruptor deixou de ser «${esperado}»`,
    )
  })
}

// ── 3 · O canal de cripto é um só ─────────────────────────────────────────────────────────────
ok('os dois slugs de cripto caem no mesmo interruptor', () => {
  // O slug vivo é `aurum-flow`; o `cripto-perps` ficou como arquivo escondido (migração 147). Os
  // dois têm de dizer «perps», senão desligar a cripto deixava metade do histórico a entrar.
  assert.equal(intakeKeyDoEspelhoTelegram('aurum-flow'), 'perps')
  assert.equal(intakeKeyDoEspelhoTelegram('cripto-perps'), 'perps')
})

// ── 4 · Um slug desconhecido não corta nada por omissão ───────────────────────────────────────
ok('slug desconhecido devolve null (fail-open, não corta recepção por acidente)', () => {
  assert.equal(intakeKeyDoEspelhoTelegram('canal-que-nao-existe'), null)
  assert.equal(intakeKeyDoEspelhoTelegram(null), null)
  assert.equal(intakeKeyDoEspelhoTelegram(undefined), null)
})

// ── 5 · O rótulo do admin diz a fonte, não o canal ────────────────────────────────────────────
ok('o interruptor «primeverse» saiu (04/10/2026) e o do MTM Scanner não diz Edge', () => {
  // A fonte PrimeVerse acabou com o pv-relay; a rota que este interruptor gateava devolve 410. Um
  // interruptor que não corta nada «parece que se pode ligar» — por isso saiu do catálogo.
  assert.equal(INTAKE_CHANNELS.find((c) => c.key === ('primeverse' as string)), undefined,
    'o interruptor «primeverse» voltou ao catálogo — a fonte saiu a 04/10/2026; se voltou, actualiza esta guarda a dizer porquê')
  const scanner = INTAKE_CHANNELS.find((c) => c.key === 'mtmscanner')
  assert.ok(scanner && !/edge/i.test(scanner.label), 'o interruptor do MTM Scanner não pode dizer Edge')
  const fs = INTAKE_CHANNELS.find((c) => c.key === 'forex_swings')
  assert.ok(fs && !/james|relay/i.test(fs.label), 'o interruptor «forex_swings» governa o espelho do grupo da casa, não um relay externo')
})

console.log(`\nrecepção por fonte: ${feitos}/${feitos} OK`)
