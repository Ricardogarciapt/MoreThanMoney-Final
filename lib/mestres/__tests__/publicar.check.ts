/**
 * PUBLICADOR DA MESTRE — o chat «MTM Auto Sensei» e o Telegram contam o que a conta-mestre fez.
 *
 * Correr: npx tsx lib/mestres/__tests__/publicar.check.ts
 *
 * Prova-se (com posições reais da mestre, funded_positions 18/09):
 *   1. só as posições-mãe vindas de SINAL são publicadas (não as do espelho da mestre MT5 antiga, nem as filhas);
 *   2. os alvos da entrada são os da gestão da mestre (níveis das parciais + alvo final);
 *   3. o fecho diz a verdade: stop acima da entrada numa compra = «Stop protegido», não «Stop loss»;
 *   4. todos os outros escritores do canal perguntam primeiro se o canal é publicado pela mestre
 *      (webhook: cartão, Pine, espelho de fecho, avisos, relay Telegram; tracker; monitor T2T;
 *      ciclo de vida T2T; gestão T2T; espelhos do grupo Telegram).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { alvosDaMestre, eventoDeFecho, posicaoDeSinal } from '../servidor/publicar'
import { PUBLICACOES } from '../servidor/canais-publicados'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}
const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')

// Posições reais da mestre Edge (2ff64e17) e da mestre Sensei (9782326a), 18/09.
const MAE_EDGE = { ideia_ref: 'sinal:mtm-auto-edge:msg:15021', mae_id: null, tps: [{ pct: 50, preco: 4389.39, atingido: true }, { pct: 25, preco: 4392.39, atingido: true }], tp: 4401.39 }
const FILHA_EDGE = { ideia_ref: 'sinal:mtm-auto-edge:msg:15021', mae_id: '55c1e8f5-f5cd-459a-9fc2-ca60e1439b16' }
const ESPELHO_SENSEI = { ideia_ref: 'espelho-provider:sensei:9202926', mae_id: null }

console.log('\n1. que posições')
t('mãe de sinal → publica', () => assert.equal(posicaoDeSinal(MAE_EDGE), true))
t('filha (parcial) → não é uma entrada', () => assert.equal(posicaoDeSinal(FILHA_EDGE), false))
t('espelho da mestre MT5 antiga → não', () => assert.equal(posicaoDeSinal(ESPELHO_SENSEI), false))

console.log('\n2. alvos')
t('níveis das parciais + alvo final', () => assert.deepEqual(alvosDaMestre(MAE_EDGE, [4388, 4391]), [4389.39, 4392.39, 4401.39]))
t('sem gestão gravada → alvos do sinal', () => assert.deepEqual(alvosDaMestre({ tps: null, tp: null }, [4388, 4391]), [4388, 4391]))

console.log('\n3. fecho')
t('compra, stop 4391.7 acima da entrada 4386.39 → Stop protegido', () =>
  assert.equal(eventoDeFecho({ motivo_fecho: 'sl', direcao: 'buy', preco_entrada: 4386.39, preco_fecho: 4391.7 }, 4375), 'stop_protegido'))
t('compra, stop no stop original → Stop loss', () =>
  assert.equal(eventoDeFecho({ motivo_fecho: 'sl', direcao: 'buy', preco_entrada: 4386.39, preco_fecho: 4376.39 }, 4376.39), 'stop_loss'))
t('tp → Alvo final', () => assert.equal(eventoDeFecho({ motivo_fecho: 'tp', direcao: 'sell', preco_entrada: 10, preco_fecho: 9 }, 11), 'target_final'))
t('estratégia/manual → Posição fechada', () => assert.equal(eventoDeFecho({ motivo_fecho: 'estrategia', direcao: 'buy', preco_entrada: 4378.3, preco_fecho: 4385.76 }, 4362), 'closed'))

console.log('\n4. os outros escritores calam-se')
t('Sensei publicado no canal certo', () => assert.equal(PUBLICACOES.sensei.canal, 'sensei-scanner'))
const WEBHOOK = ler('app/api/webhooks/tradingview/route.ts')
t('webhook: cartão, espelho de fecho, avisos e relay Telegram passam pelo publicador', () => {
  assert.match(WEBHOOK, /estrategiasPublicadasPelaMestre\(\)\)\.find\(\(e\) => e\.canal === route\.channel\)/)
  assert.match(WEBHOOK, /if \(publicacaoMestre\) \{[\s\S]{0,600}publicarEntradaDaMestre\(/)
  assert.match(WEBHOOK, /route\.channel && !publicacaoMestre\) \{/)
  assert.match(WEBHOOK, /!RELAY_DISABLED && !publicacaoMestre\)/)
  assert.match(WEBHOOK, /!publicacaoMestre && \(tradeStatus === "loss"/)
})
for (const f of [
  'lib/mtmcopy/signal-tracker.ts',
  'lib/mtmcopy/t2t-price-monitor.ts',
  'lib/mtmcopy/t2t-lifecycle.ts',
  'lib/mtmcopy/t2t-management.ts',
  'app/api/telegram/webhook/route.ts',
  'app/api/telegram/webhook-aibot/route.ts',
  'app/api/telegram/catchup-aibot/route.ts',
]) {
  t(`${f} pergunta ao canalPublicadoPelaMestre`, () => assert.match(ler(f), /canalPublicadoPelaMestre\(/))
}
t('cron de minuto a minuto registado', () => assert.match(ler('vercel.json'), /"\/api\/cron\/mestre-publicar"/))

if (ko) { console.error(`\n${ko} falha(s)`); process.exit(1) }
console.log('\nTudo certo.')
