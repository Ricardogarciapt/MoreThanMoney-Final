/**
 * CANAIS CONFORME O ADMIN — permissões e lista que as apps mostram.
 *
 * Correr: npx tsx lib/__tests__/chat-canais.check.ts
 *
 * Prova-se:
 *   1. sem configuração (colunas a null / migração 117 por aplicar) tudo continua como antes;
 *   2. com configuração, manda o admin (ler, escrever, UID da corretora);
 *   3. a lista das apps tira os escondidos (e os filhos de um pai escondido), ordena pela posição
 *      e traz ícone/cor/etiqueta/regras da tabela, caindo no CHANNEL_META quando vazios;
 *   4. as regras de sempre da RLS (117) são as mesmas das funções TS.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canReadChannel, canWriteChannel, isReadOnlyChannel, nivelEscrita, nivelLeitura, requiresBrokerUidChannel } from '../chat-channel-permissions'
import { canaisVisiveis, canalParaApp } from '../chat-canais'

let ko = 0
function t(nome: string, f: () => void) {
  try { f(); console.log(`  ✓ ${nome}`) } catch (e) { ko++; console.error(`  ✗ ${nome}\n    ${e instanceof Error ? e.message : String(e)}`) }
}
const membro = { is_active: true, user_type: 'member', member_category: 'member', subscription_plan: 'basic' }
const premium = { is_active: true, user_type: 'member', subscription_plan: 'premium' }
const vipTipo = { is_active: true, user_type: 'vip' }
const admin = { is_active: true, user_type: 'admin' }
const inativo = { is_active: false, user_type: 'admin' }

console.log('\n1. regras de sempre')
t('Premium/Sensei/GoldKiller pagos; o resto aberto a membros activos', () => {
  for (const s of ['premium-ideas', 'sensei-scanner', 'sinais-goldkiller']) {
    assert.equal(canReadChannel(s, membro), false)
    assert.equal(canReadChannel(s, premium), true)
    assert.equal(canReadChannel(s, vipTipo), true)
  }
  assert.equal(canReadChannel('geral', membro), true)
  assert.equal(canReadChannel('geral', inativo), false)
})
t('escrita: comunidade aberta, sinais VIP/admin, canais do sistema fechados', () => {
  assert.equal(canWriteChannel('geral', membro), true)
  assert.equal(canWriteChannel('premium-ideas', premium), false)
  assert.equal(canWriteChannel('premium-ideas', vipTipo), true)
  assert.equal(canWriteChannel('sinais-scanner-mtm', admin), false)
  assert.equal(canWriteChannel('aurum-flow', membro), false)
  assert.equal(isReadOnlyChannel('sinais-scanner-mtm'), true)
  assert.equal(requiresBrokerUidChannel('premium-ideas'), true)
})

console.log('\n2. manda o admin')
t('leitura admin / premium / membros', () => {
  assert.equal(canReadChannel('geral', membro, { slug: 'geral', leitura: 'admin' }), false)
  assert.equal(canReadChannel('geral', admin, { slug: 'geral', leitura: 'admin' }), true)
  assert.equal(canReadChannel('sensei-scanner', membro, { slug: 'sensei-scanner', leitura: 'membros' }), true)
})
t('escrita configurada', () => {
  assert.equal(canWriteChannel('torneio', membro, { slug: 'torneio', escrita: 'membros' }), true)
  assert.equal(canWriteChannel('geral', membro, { slug: 'geral', escrita: 'ninguem' }), false)
  assert.equal(isReadOnlyChannel('geral', { slug: 'geral', escrita: 'vip' }), true)
  assert.equal(requiresBrokerUidChannel('premium-ideas', { slug: 'premium-ideas', exige_uid_corretora: false }), false)
})
t('configuração de OUTRO canal não se aplica', () => {
  assert.equal(nivelLeitura('premium-ideas', { slug: 'geral', leitura: 'membros' }), 'premium')
})
t('valores inválidos caem na regra de sempre', () => {
  assert.equal(nivelEscrita('geral', { slug: 'geral', escrita: 'todos' }), 'membros')
})

console.log('\n3. lista das apps')
const linhas = [
  { slug: 'sinais', name: 'Sinais & Ideias', parent_slug: null, position: 10 },
  { slug: 'comunidade', name: 'Comunidade', parent_slug: null, position: 0, hidden: true },
  { slug: 'geral', name: 'Geral', parent_slug: 'comunidade', position: 1 },
  { slug: 'aurum-flow', name: 'MTM Auto Aurum Flow & Perpétuos', parent_slug: 'sinais', position: 15 },
  { slug: 'sinais-scanner-mtm', name: 'MTM Auto Edge/Wolf/King', parent_slug: 'sinais', position: 17, hidden: true },
  { slug: 'premium-ideas', name: 'MTM Auto Premium', parent_slug: 'sinais', position: 13, icone: '👑', cor: '#123456', etiqueta: 'VIP', regras: ['Só Premium'] },
]
t('escondidos e filhos de pai escondido saem; ordem pela posição', () => {
  const l = canaisVisiveis(linhas, premium)
  assert.deepEqual(l.map((c) => c.slug), ['sinais', 'premium-ideas', 'aurum-flow'])
})
t('visual da tabela manda; vazio cai no de sempre', () => {
  const p = canalParaApp(linhas[5] as never, membro)
  assert.deepEqual([p.icone, p.cor, p.etiqueta, p.regras], ['👑', '#123456', 'VIP', ['Só Premium']])
  assert.equal(p.pode_ler, false)
  const a = canalParaApp(linhas[3] as never, membro)
  assert.equal(a.icone, '⚡')
  assert.equal(a.pode_escrever, false)
  assert.equal(canalParaApp(linhas[3] as never).pode_ler, null) // sem sessão
})

console.log('\n4. RLS (117) = funções TS')
const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '117_canais_config_admin.sql'), 'utf8')
t('defaults de escrita da RLS iguais aos da web', () => {
  assert.match(sql, /when p_slug in \('premium-ideas', 'sensei-scanner', 'trade-ideas'\) then 'vip'/)
  assert.match(sql, /when p_slug in \('trade-ideas-setup', 'ideias-e-sinais', 'sinais-goldkiller', 'sinais-scanner-mtm'\) then 'ninguem'/)
})
t('preenchimento da leitura paga = regra da web', () => {
  assert.match(sql, /set leitura = 'premium'\s+where leitura is null and slug in \('premium-ideas', 'sensei-scanner', 'sinais-goldkiller'\)/)
})
t('VIP pelos dois campos na RLS', () => {
  assert.match(sql, /p\.user_type in \('admin', 'vip'\) or p\.member_category = 'vip'/)
})

if (ko) { console.error(`\n${ko} falha(s)`); process.exit(1) }
console.log('\nTudo certo.')
