/**
 * Acesso por estratégia (03/11/2026, decisão do dono) — lib/acesso-estrategias.
 *
 * Correr: npx tsx lib/__tests__/acesso-estrategias.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acessoEstrategia, corretoraDoServidor, nivelDaEstrategia } from '../acesso-estrategias'
import { planearRotasDaEstrategia } from '../mestres/planear'

let falhas = 0
const t = (nome: string, f: () => void | Promise<void>) => { Promise.resolve().then(f).then(() => console.log('✓', nome), (e) => { falhas++; console.error('✗', nome, e) }) }

t('Premium e GoldKiller abertos a todos os membros', () => {
  assert.equal(acessoEstrategia('premium-ouro', {}).pode, true)
  assert.equal(acessoEstrategia('Goldkiller', null).pode, true)
  assert.equal(nivelDaEstrategia('sensei'), 'membros')
})
t('Premium II: Premium 65 €, assinante MTM Auto ou corretora validada', () => {
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', {}).pode, false)
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', { premiumOuMais: true }).pode, true)
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', { mtmAutoPago: true }).pode, true)
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', { corretoraValidada: true }).pode, true)
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', { puPrimeValidado: true }).pode, true)
  assert.equal(acessoEstrategia('mtm-auto-premium-ii', { admin: true }).pode, true)
})
t('Edge: só PU Prime validada (Premium e MTM Auto pago não chegam)', () => {
  assert.equal(acessoEstrategia('mtm-auto-edge', { premiumOuMais: true, mtmAutoPago: true, corretoraValidada: true }).pode, false)
  assert.equal(acessoEstrategia('mtm-auto-edge', { puPrimeValidado: true }).pode, true)
  assert.equal(acessoEstrategia('mtm-auto-edge', { admin: true }).pode, true)
})
t('corretora pelo servidor', () => {
  assert.equal(corretoraDoServidor('PUPrime-Live 6'), 'puprime')
  assert.equal(corretoraDoServidor('VTMarkets-Live 6'), 'vtmarkets')
  assert.equal(corretoraDoServidor('FXIFY-Server'), null)
})
t('planeador ignora quem não tem acesso, com o motivo', () => {
  const r = planearRotasDaEstrategia({
    estrategia: { providerId: 'p', slug: 'mtm-auto-edge', nome: 'Edge', contaMestreId: 'm', copyfactoryIds: [], incluirMtmauto: true },
    site: [], contasAuto: [{ id: 'c1', user_id: 'u1', plataforma: 'mt5', login: '1', servidor: 'S', principal: true } as never],
    subsAuto: [{ id: 's1', user_id: 'u1', provider_id: 'p', ativo: true, auto_aceitar: true } as never],
    semAcesso: new Map([['u1', 'sem acesso à estratégia: só membros PU Prime validados']]),
  })
  assert.equal(r.rotas.length, 0)
  assert.match(r.ignorados[0]!.motivo, /PU Prime/)
})
t('sincronização (site e script) passa o acesso ao planeador', () => {
  assert.match(readFileSync('lib/mestres/servidor/sincronizar-rotas.ts', 'utf8'), /semAcesso,/)
  assert.match(readFileSync('scripts/mestres/sincronizar-rotas.ts', 'utf8'), /semAcesso,/)
})
t('o grupo Premium II é destino, nunca fonte', async () => {
  const { detectSlugFromChannelTitle } = await import('../telegram-app-channels')
  const { channelKeyFromTitle } = await import('../telegram-channel-ids')
  assert.equal(detectSlugFromChannelTitle('MTM Auto Premium II'), null)
  assert.equal(channelKeyFromTitle('MTM Auto Premium II'), null)
  assert.equal(detectSlugFromChannelTitle('MoreThanMoney Premium Signals'), 'premium-ideas')
})
t('espelho converte o gráfico SVG em PNG', async () => {
  const { imagemParaTelegram } = await import('../telegram-espelho-canal')
  assert.equal(imagemParaTelegram('https://x.pt/api/signals/chart-image?id=1'), 'https://x.pt/api/signals/chart-image?id=1&f=png')
  assert.equal(imagemParaTelegram(null), null)
})
setTimeout(() => { if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1) } console.log('tudo certo') }, 3000)
