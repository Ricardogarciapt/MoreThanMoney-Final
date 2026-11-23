/**
 * `npx tsx lib/__tests__/escada-caminhos.check.ts`
 *
 * Protege duas coisas:
 *  1. Há UM caminho por perfil, e todos têm um passo pago a seguir ao íman.
 *  2. Nenhum texto promete o trial do Premium «sem cartão» enquanto o trial pede cartão.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CAMINHO_DO_PERFIL,
  PERFIS,
  TRIAL_CONDICAO,
  TRIAL_CURTO,
  caminhosNumaLinha,
  passoSeguinte,
  perfilDoInteresse,
  porta,
} from '@/lib/escada-caminhos'
import { TRIAL_PEDE_CARTAO } from '@/lib/stripe-checkout-premium'

// 1. caminhos
for (const p of PERFIS) {
  const c = CAMINHO_DO_PERFIL[p]
  assert.equal(porta(c[0]).tipo, 'gratis', `${p}: começa por um íman`)
  assert.notEqual(porta(c[1]).tipo, 'gratis', `${p}: o 2.º degrau é pago (não se fecha com o grátis)`)
  assert.equal(c[c.length - 1], 'topo', `${p}: acaba no topo`)
}
assert.equal(passoSeguinte(null)?.chave, 'iman_aprender')
assert.equal(passoSeguinte('aprender', { recebeuIman: true })?.chave, 'entrada_ler')
assert.equal(passoSeguinte('aprender', { recebeuIman: true, comprouEntrada: true })?.chave, 'premium')
assert.equal(passoSeguinte('ferramentas', { recebeuIman: true })?.chave, 'membro')
assert.equal(porta('membro').alternativa, 'entrada_praticar')
assert.equal(passoSeguinte('aprender', { recebeuIman: true, ehMembro: true })?.chave, 'premium')
assert.equal(passoSeguinte('ferramentas', { recebeuIman: true, ehMembro: true })?.chave, 'premium')
assert.equal(passoSeguinte('capital', { recebeuIman: true })?.chave, 'corretora')
assert.equal(passoSeguinte('capital', { recebeuIman: true, depositoValidado: true })?.chave, 'topo')
assert.equal(passoSeguinte('aprender', { ehTopo: true, recebeuIman: true }), null)
assert.equal(perfilDoInteresse('corretora'), 'capital')
assert.equal(perfilDoInteresse('scanner goldkiller'), 'ferramentas')
assert.equal(perfilDoInteresse('formacao'), 'aprender')
assert.equal(perfilDoInteresse(''), null)

// 2. trial honesto
if (TRIAL_PEDE_CARTAO) {
  assert.ok(!/sem cartão/i.test(TRIAL_CURTO + TRIAL_CONDICAO))
  assert.ok(/cancelas/i.test(TRIAL_CURTO))
  const ficheiros = [
    'lib/freebies.ts',
    'lib/funis-publicidade.ts',
    'lib/instagram/dm-closer.ts',
    'lib/email-service.ts',
    'lib/ebooks/vendas.ts',
    'lib/backoffice-funis.ts',
    'components/captacao/contacto-rapido.tsx',
  ]
  for (const f of ficheiros) {
    const t = readFileSync(f, 'utf8')
    for (const linha of t.split('\n')) {
      if (/sem cartão/i.test(linha) && /premium|3 dias|trial|dias grátis/i.test(linha) && !/14 dias|14DayTrial|TRIAL_CODE/.test(linha)) {
        assert.fail(`${f}: promete o trial do Premium «sem cartão», mas TRIAL_PEDE_CARTAO=true → ${linha.trim().slice(0, 140)}`)
      }
    }
  }
}
assert.ok(caminhosNumaLinha().includes('aprender'))

console.log('escada-caminhos: ok')
