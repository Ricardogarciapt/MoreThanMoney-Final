import assert from 'node:assert/strict'
import {
  SEM_DIREITOS,
  contarExtras,
  pareceDemo,
  podeLigarConta,
  type ContaLigada,
  type Direitos,
} from '../../entitlements'

/**
 * A regra das contas mexe em dinheiro nos dois sentidos: apertada de mais recusa quem pagou,
 * larga de mais dá de graça o que se vende. É por isso que tem testes.
 */

const membro: Direitos = { ...SEM_DIREITOS }
const comCopia: Direitos = { ...SEM_DIREITOS, copiaAutomatica: true, motivoCopia: 'premium', premium: true }
const admin: Direitos = { ...SEM_DIREITOS, admin: true }

// ── Demo reconhece-se pelo nome do servidor ───────────────────────────────────────────────────
assert.equal(pareceDemo('PUPrime-Demo'), true)
assert.equal(pareceDemo('PUPrime-Live'), false)
assert.equal(pareceDemo('VTMarkets-Practice'), true)

// ── Tap to Trade: aberto a membros, uma real e uma demo incluídas ──────────────────────────────
assert.equal(podeLigarConta(membro, 't2t', false, []).ok, true, 'o membro tem direito a uma conta T2T')
assert.equal(
  podeLigarConta(membro, 't2t', true, [{ superficie: 't2t', demo: false }]).ok,
  true,
  'a demo entra mesmo com a real ligada',
)
const t2tCheio: ContaLigada[] = [
  { superficie: 't2t', demo: false },
  { superficie: 't2t', demo: true },
]
const terceira = podeLigarConta(membro, 't2t', false, t2tCheio)
assert.equal(terceira.ok, false)
assert.equal(terceira.codigo, 'conta_extra')
assert.equal(terceira.precoEur, 7, 'o "não" traz o preço — senão não vende nada')

// ── A cópia automática é a parte paga ─────────────────────────────────────────────────────────
const semDireito = podeLigarConta(membro, 'mtmcopy', false, [])
assert.equal(semDireito.ok, false)
assert.equal(semDireito.codigo, 'sem_copia_automatica')
assert.equal(podeLigarConta(comCopia, 'mtmcopy', false, []).ok, true)
assert.equal(podeLigarConta(comCopia, 'mtmauto', true, []).ok, true)

// ── Cada produto tem o SEU incluído ───────────────────────────────────────────────────────────
// Ter a real do Tap to Trade não gasta a real do MTM Auto: são produtos diferentes.
assert.equal(
  podeLigarConta(comCopia, 'mtmauto', false, [{ superficie: 't2t', demo: false }]).ok,
  true,
  'o incluído de um produto não se gasta noutro',
)

// ── As extras são um saco comum ───────────────────────────────────────────────────────────────
const comUmaExtra: Direitos = { ...comCopia, extrasPagas: 1 }
assert.equal(podeLigarConta(comUmaExtra, 't2t', false, t2tCheio).ok, true, 'com uma extra paga, entra')

const extraGasta: ContaLigada[] = [...t2tCheio, { superficie: 't2t', demo: false }]
assert.equal(
  podeLigarConta(comUmaExtra, 'mtmauto', false, [
    ...extraGasta,
    { superficie: 'mtmauto', demo: false },
    { superficie: 'mtmauto', demo: true },
  ]).ok,
  false,
  'a extra gasta no T2T não pode ser gasta outra vez no MTM Auto',
)

// ── O bónus da corretora vale uma extra ───────────────────────────────────────────────────────
const comBonus: Direitos = { ...membro, bonusCorretora: true, depositoUsd: 400 }
assert.equal(podeLigarConta(comBonus, 't2t', false, t2tCheio).ok, true, 'a corretora validada dá a primeira')
assert.equal(
  podeLigarConta(comBonus, 't2t', true, extraGasta).ok,
  false,
  'só a primeira é oferecida — as seguintes pagam-se',
)

// ── Admin não tem limite ──────────────────────────────────────────────────────────────────────
assert.equal(podeLigarConta(admin, 'mtmcopy', false, extraGasta).ok, true)

// ── A contagem das extras ─────────────────────────────────────────────────────────────────────
assert.equal(contarExtras([]), 0)
assert.equal(contarExtras(t2tCheio), 0, 'o incluído não conta como extra')
assert.equal(contarExtras(extraGasta), 1)

console.log('✓ entitlements: 18 verificações')
