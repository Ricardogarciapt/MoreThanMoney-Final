/**
 * PARA ONDE LEVA CADA NOTIFICAÇÃO — regra do dono, 24/09.
 *
 * Correr: npx tsx lib/__tests__/notificacao-destino.check.ts
 *
 * Prova-se:
 *   1. entrada num canal com o T2T ligado → separador Tap to Trade, já no sinal, com a acção
 *      "⚡ Aceitar trade" (category T2T_SIGNAL);
 *   2. acompanhamento (alvo, break-even, stop, fecho) → o CHAT, na mensagem;
 *   3. abertura de sinal e conversa normal → o CHAT, na mensagem;
 *   4. fonte desligada pelo admin → nem a entrada vai ao T2T (não há lá o que aceitar);
 *   5. o chat lê mesmo o `&msg=` e o separador T2T lê o `signal=` — sem leitor, o deep-link
 *      aterra no sítio certo mas na mensagem errada.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { destinoDaMensagem, urlDoChat, urlDoTapToTrade } from '../notificacao-destino'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}

const CANAL = 'sinais-goldkiller'
const MSG = 'abc-123'
const ENTRADA = 'XAUUSD BUY\nEntrada: 4398\nStop Loss: 4390\nTP1: 4410\nTP2: 4425'

console.log('\n1. entrada para aceitar → Tap to Trade')
t('vai ao separador T2T, já no sinal', () => {
  const d = destinoDaMensagem({ channelSlug: CANAL, content: ENTRADA, messageId: MSG, t2tLigado: true })
  assert.equal(d.paraAceitar, true)
  assert.equal(d.url, urlDoTapToTrade(MSG))
  assert.ok(d.url.includes('tab=tap-to-trade') && d.url.includes(`signal=${MSG}`))
})
t('leva a acção "Aceitar trade" (iPhone e Apple Watch)', () => {
  const d = destinoDaMensagem({ channelSlug: CANAL, content: ENTRADA, messageId: MSG, t2tLigado: true })
  assert.equal(d.category, 'T2T_SIGNAL')
})

console.log('\n2. acompanhamento → chat, na mensagem')
for (const texto of [
  'HIT TP1 +106PIPS',
  'Break-even · stop protegido na entrada',
  'Stop Loss movido para 4400',
  'Posição fechada · +240 pips',
  'Ideia descartada',
]) {
  t(`«${texto}» abre o chat na mensagem`, () => {
    const d = destinoDaMensagem({ channelSlug: CANAL, content: texto, messageId: MSG, t2tLigado: true })
    assert.equal(d.paraAceitar, false)
    assert.equal(d.url, urlDoChat(CANAL, MSG))
    assert.equal(d.category, undefined)
    assert.ok(d.url.includes(`msg=${MSG}`), 'sem âncora à mensagem a pessoa cai no fundo do canal')
  })
}

console.log('\n3. conversa normal → chat, na mensagem')
t('mensagem de membro abre o chat na mensagem', () => {
  const d = destinoDaMensagem({ channelSlug: 'geral', content: 'bom dia malta', messageId: MSG, t2tLigado: false })
  assert.equal(d.url, urlDoChat('geral', MSG))
})
t('sem mensagem conhecida abre o canal (sem âncora)', () => {
  const d = destinoDaMensagem({ channelSlug: 'geral', content: 'bom dia' })
  assert.equal(d.url, '/app-mobile?tab=chat&channel=geral')
})

console.log('\n4. fonte desligada pelo admin')
t('entrada com o T2T desligado vai ao chat, não ao separador', () => {
  const d = destinoDaMensagem({ channelSlug: CANAL, content: ENTRADA, messageId: MSG, t2tLigado: false })
  assert.equal(d.paraAceitar, false)
  assert.equal(d.url, urlDoChat(CANAL, MSG))
})

console.log('\n5. do outro lado há quem leia os parâmetros')
const raiz = join(__dirname, '..', '..')
t('o chat lê o &msg= e salta para a mensagem', () => {
  const chat = readFileSync(join(raiz, 'components/mobile/chat-channels.tsx'), 'utf8')
  assert.ok(chat.includes('focarMensagemId'), 'ChannelView tem de receber a mensagem a focar')
  assert.ok(chat.includes('irParaOriginal(focarMensagemId)'), 'e tem de saltar para ela')
  const page = readFileSync(join(raiz, 'app/app-mobile/page.tsx'), 'utf8')
  assert.ok(page.includes('initialMessageId={searchParams.get("msg")}'), 'a app tem de passar o msg=')
})
t('o separador T2T lê signal= e sinal=', () => {
  const feed = readFileSync(join(raiz, 'components/mobile/tap-to-trade-feed.tsx'), 'utf8')
  assert.ok(feed.includes('q.get("sinal") ?? q.get("signal")'), 'o feed tem de aceitar os dois nomes')
  const page = readFileSync(join(raiz, 'app/app-mobile/page.tsx'), 'utf8')
  assert.ok(page.includes('n.data.url.includes("sinal=")'), 'o resgate do deep-link também')
})
t('o chat não tem botão de aceitar (a aceitação vive no T2T)', () => {
  const chat = readFileSync(join(raiz, 'components/mobile/chat-channels.tsx'), 'utf8')
  assert.ok(!chat.includes('onTapToTrade'), 'o botão por mensagem saiu a 24/09')
})

console.log(ko === 0 ? '\n✅ tudo certo\n' : `\n❌ ${ko} falha(s)\n`)
process.exit(ko === 0 ? 0 : 1)
