import assert from 'node:assert/strict'
import { T2T_SOURCES, isAllowedT2TSource } from '../t2t-source'
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
assert.ok(chaves.length >= 7, `o catálogo encolheu para ${chaves.length} — alguém apagou uma fonte?`)
assert.equal(new Set(chaves).size, chaves.length, 'há chaves repetidas no catálogo')
for (const k of ['premium', 'sensei', 'primeverse', 'aurum', 'goldkiller', 'mtmscanner', 'forexideas']) {
  assert.ok(chaves.includes(k as never), `«${k}» saiu do catálogo — se foi de propósito, actualiza esta guarda`)
}
// `james` (Forex Swings) saiu do catálogo a 04/10/2026: a fonte externa foi desligada pelo dono. A chave
// continua a existir para LER as mensagens antigas de `ideias-e-sinais` (ver t2t-trailing-fontes.check).
assert.ok(!chaves.includes('james' as never), '«james» voltou ao catálogo — a fonte saiu a 04/10/2026; se voltou, actualiza esta guarda a dizer porquê')

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

// ── O MTM Scanner publica mas não se executa ─────────────────────────────────

/**
 * Medido a 29/09/2026: retorno médio +0,027 ATR contra 0,657 ATR de custo de spread. O custo é
 * 24× o sinal, e nenhum dos sete cortes sobrevive à correcção para comparações múltiplas. O
 * canal continua a publicar ~2 300 ideias por mês; o que saiu foi o botão de as executar.
 *
 * Esta guarda existe porque a mudança é uma AUSÊNCIA — um botão que deixou de aparecer — e uma
 * ausência não se nota quando alguém a desfaz.
 */
assert.ok(!isAllowedT2TSource('trade-ideas-setup', 'BUY EURUSD entrada 1.0850 SL 1.0840 TP 1.0870'),
  'as Ideias de Forex voltaram a ser executáveis no T2T')
assert.ok(!isAllowedT2TSource('sinais-scanner-mtm', 'MTM Scanner BUY EURUSD 1.0850'),
  'um sinal marcado MTM Scanner voltou a ser executável')

// E as que CONTINUAM a executar-se não podem ter sido apanhadas no mesmo laço.
assert.ok(isAllowedT2TSource('premium-ideas', 'Gold Buy Zone 4150 - 4155 SL 4100 TP 4250'),
  'o Premium deixou de ser executável — isso não foi pedido')
assert.ok(isAllowedT2TSource('sensei-scanner', 'Sensei BUY XAUUSD 4150 SL 4100 TP1 4200'),
  'o Sensei deixou de ser executável — a pausa dele é um interruptor, não esta lista')

console.log('fontes-so-leitura: OK')
