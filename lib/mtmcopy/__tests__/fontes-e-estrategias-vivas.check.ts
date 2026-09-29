import assert from 'node:assert/strict'
import { T2T_SOURCES } from '../t2t-source'
import {
  ESTRATEGIAS_PRIMEVERSE,
  ESTRATEGIAS_PRIMEVERSE_VIVAS,
} from '../../mtmfunded/estrategias-sinais/calculo'
import { ESTRATEGIAS_DO_DONO } from '../../mtmfunded/estrategias-sinais/contas'

/**
 * DUAS LISTAS QUE JÁ DIVERGIRAM, E O QUE A DIVERGÊNCIA CUSTOU.
 *
 * 1) O ecrã de ligação aceitava CINCO fontes de T2T enquanto o catálogo já tinha OITO. Não dava
 *    erro nenhum: quem escolhesse GoldKiller, MTM Scanner ou Ideias de Forex via a escolha ser
 *    gravada e desaparecer. Um filtro escrito à mão ao lado de um catálogo acaba sempre assim.
 *
 * 2) A King e a Wolf saíram a 29/09 e continuavam a ser OFERECIDAS a quem cria conta na MTM
 *    Funded. Não executavam (o gate do provider recusa), mas estavam na lista — e uma opção que
 *    se escolhe e não faz nada é pior do que uma opção que não existe.
 *
 * Estas guardas não repetem as listas: comparam-nas uma com a outra. É isso que as faz apanhar
 * o próximo desalinhamento em vez do que já passou.
 */

// ── As fontes aceites saem do catálogo ───────────────────────────────────────

const chaves = T2T_SOURCES.map((f) => f.key)
assert.ok(chaves.length >= 8, `o catálogo encolheu para ${chaves.length} — alguém apagou uma fonte?`)
assert.equal(new Set(chaves).size, chaves.length, 'há chaves repetidas no catálogo')
for (const k of ['premium', 'sensei', 'james', 'primeverse', 'aurum', 'goldkiller', 'mtmscanner', 'forexideas']) {
  assert.ok(chaves.includes(k as never), `«${k}» saiu do catálogo — se foi de propósito, actualiza esta guarda`)
}

// ── Vivas ⊆ todas, e a Edge é a única viva ───────────────────────────────────

for (const e of ESTRATEGIAS_PRIMEVERSE_VIVAS) {
  assert.ok(ESTRATEGIAS_PRIMEVERSE.includes(e), `${e.slug} está nas vivas e não está na lista toda`)
}
assert.deepEqual(
  ESTRATEGIAS_PRIMEVERSE_VIVAS.map((e) => e.slug),
  ['mtm-auto-edge'],
  'a 29/09 o dono ficou só com a Edge; se voltou a haver outra, actualiza esta guarda a dizer porquê',
)

// A King e a Wolf CONTINUAM na lista toda — sem elas não se fecha uma posição antiga nem se
// sabe o nome da estratégia que a abriu.
for (const slug of ['mtm-auto-king', 'mtm-auto-wolf']) {
  assert.ok(
    ESTRATEGIAS_PRIMEVERSE.some((e) => e.slug === slug),
    `${slug} desapareceu da lista — quem tiver uma posição dela deixa de a poder fechar`,
  )
}

// ── O que se OFERECE não inclui as mortas ────────────────────────────────────

const oferecidas = ESTRATEGIAS_DO_DONO.map((e) => e.slug)
for (const slug of ['mtm-auto-king', 'mtm-auto-wolf']) {
  assert.ok(!oferecidas.includes(slug), `${slug} ainda é oferecida a quem cria conta`)
}
assert.ok(oferecidas.includes('mtm-auto-edge'), 'a Edge tem de continuar a oferecer-se')

console.log('fontes-e-estrategias-vivas: OK')
