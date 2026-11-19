/**
 * O GESTOR DE ROTAS — organização das colunas, contas sem estratégia, fonte real e o que cada
 * largar pede.
 *
 *   npx tsx lib/copia-contas/__tests__/gestor-rotas.check.ts
 */
import assert from 'node:assert/strict'
import type { NoEstrategia, SubscritorCadeia } from '../cadeia'
import { botoesTipoConta, capitalDaColuna, desfazerDe, fonteDaEstrategia, iniciais, organizarGestor, pedidoDoLargar, type ContaGestor } from '../gestor-rotas'
import { SEM_TRAVAS } from '../mestre-travas'
import { GESTAO_VAZIA } from '../mestre-gestao'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

const sub = (ref: string, over: Partial<SubscritorCadeia> = {}): SubscritorCadeia => ({
  chave: ref, rotaId: `r-${ref}`, ref, tipo: 'estrategia', etiqueta: null, descricao: null, email: null, userId: 'u',
  lote: '0,01 lotes', efectivo: 'live', motivo: '', pausadaMotivo: null, abertas: 0, ...over,
})

const no = (slug: string, over: Partial<NoEstrategia> = {}): NoEstrategia => ({
  chave: `estrategia:${slug}`, slug, nome: slug, providerId: `p-${slug}`, ativo: true, fonte: '', fonteSinais: null,
  fonteFiltro: null, canalChat: `sinais-${slug}`, contaMestre: null, executor: 'motor', executorNota: '',
  travas: SEM_TRAVAS, comTravas: false, gestao: GESTAO_VAZIA, gestaoTexto: '', modoPedido: 'live', t2tModo: 'live',
  subscritores: [], contagem: { total: 0, live: 0, sombra: 0, parado: 0, t2t: 0, pausados: 0 }, ...over,
})

const conta = (ref: string, over: Partial<ContaGestor> = {}): ContaGestor => ({
  ref, origem: ref.startsWith('auto') ? 'auto' : 'site', plataforma: 'mt5', userId: 'u', email: `${ref}@x.pt`, nome: null,
  rotulo: null, etiqueta: null, mestre: null, login: '1', servidor: 'B', ativa: true, demo: false, saldo: null, ...over,
})

const A = 'auto:00000000-0000-0000-0000-00000000000a'
const B = 'site:00000000-0000-0000-0000-00000000000b'
const W = 'wt:00000000-0000-0000-0000-00000000000c'

caso('só as estratégias LIGADAS são colunas; as desligadas ficam em baixo', () => {
  const g = organizarGestor({ estrategias: [no('premium-ouro', { ativo: false }), no('aurum-flow'), no('mtm-auto-premium-ii', { subscritores: [sub(A)], contagem: { total: 1, live: 1, sombra: 0, parado: 0, t2t: 0, pausados: 0 } })] }, [])
  assert.deepEqual(g.ativas.map((n) => n.slug), ['mtm-auto-premium-ii', 'aurum-flow'], 'mais contas primeiro')
  assert.deepEqual(g.desligadas.map((n) => n.slug), ['premium-ouro'])
})

caso('«Sem estratégia» tem as contas activas de cliente que não seguem nenhuma ligada', () => {
  const g = organizarGestor(
    { estrategias: [no('x', { subscritores: [sub(A)] }), no('off', { ativo: false, subscritores: [sub(B)] })] },
    [conta(A), conta(B), conta(W), conta('auto:m', { mestre: 'Mestre · X' }), conta('site:p', { ativa: false })],
  )
  assert.deepEqual(g.semEstrategia.map((c) => c.ref), [B], 'B só segue uma desligada; WebTrader, mestre e pausada ficam fora')
  assert.equal(g.presasEmDesligadas.length, 1)
})

caso('a fonte real: Premium vem do Telegram, Premium II do webhook', () => {
  assert.equal(fonteDaEstrategia(no('premium-ouro')).tipo, 'telegram')
  assert.equal(fonteDaEstrategia(no('mtm-auto-premium-ii')).tipo, 'webhook')
  assert.equal(fonteDaEstrategia(no('nova', { canalChat: 'sinais-nova' })).texto, 'Chat · sinais-nova')
  assert.equal(fonteDaEstrategia(no('w', { fonteSinais: 'primeverse', fonteFiltro: 'g_wolf' })).texto, 'PrimeVerse · g_wolf')
})

caso('largar: mover, ligar, copiar (Alt) e deixar de seguir', () => {
  const x = no('x', { subscritores: [sub(A)] })
  const y = no('y')
  assert.deepEqual(pedidoDoLargar({ ref: A, de: x, para: y }), { ok: true, pedido: { accao: 'mover', ref: A, de: 'x', para: 'y' } })
  assert.deepEqual(pedidoDoLargar({ ref: A, de: x, para: y, copiar: true }), { ok: true, pedido: { accao: 'ligar', ref: A, slug: 'y' } })
  assert.deepEqual(pedidoDoLargar({ ref: B, de: null, para: y }), { ok: true, pedido: { accao: 'ligar', ref: B, slug: 'y' } })
  assert.deepEqual(pedidoDoLargar({ ref: A, de: x, para: null }), { ok: true, pedido: { accao: 'desligar', ref: A, slug: 'x' } })
})

caso('largar recusa com motivo: WebTrader, estratégia desligada, já segue', () => {
  const x = no('x', { subscritores: [sub(A)] })
  assert.equal(pedidoDoLargar({ ref: W, de: null, para: x }).ok, false)
  assert.equal(pedidoDoLargar({ ref: B, de: null, para: no('off', { ativo: false }) }).ok, false)
  const r = pedidoDoLargar({ ref: A, de: null, para: x })
  assert.ok(!r.ok && /já segue/.test(r.motivo))
})

caso('filtro de tipo de conta: nomes claros, só os que existem, com contagem', () => {
  const b = botoesTipoConta([{ plataforma: 'mt5' }, { plataforma: 'mt5' }, { plataforma: 'mtmfunded' }])
  assert.deepEqual(b.map((x) => `${x.nome}:${x.n}`), ['Todas:3', 'MetaTrader 5:2', 'MTM Funded:1'])
})

caso('desfazer devolve o estado anterior', () => {
  assert.deepEqual(desfazerDe({ accao: 'mover', ref: A, de: 'x', para: 'y' }), { accao: 'mover', ref: A, de: 'y', para: 'x' })
  assert.deepEqual(desfazerDe({ accao: 'ligar', ref: A, slug: 'y' }), { accao: 'desligar', ref: A, slug: 'y' })
  assert.deepEqual(desfazerDe({ accao: 'desligar', ref: A, slug: 'y' }), { accao: 'ligar', ref: A, slug: 'y' })
})

caso('capital da coluna conta cada conta física uma vez e só saldos conhecidos', () => {
  const m = new Map([[A, conta(A, { saldo: 1000.5 })], [B, conta(B, { saldo: null })]])
  assert.deepEqual(capitalDaColuna([sub(A), sub(A, { rotaId: 'r2' }), sub(B)], m), { total: 1000.5, conhecidas: 1 })
})

caso('iniciais', () => {
  assert.equal(iniciais('Pedro Gonçalves · FXIFY'), 'PG')
  assert.equal(iniciais('ruben@x.pt'), 'RU')
  assert.equal(iniciais(null), '··')
})

let n = 0
for (const c of casos) {
  try { c.f(); n++ } catch (e) { console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `gestor-rotas: ${n} casos, todos certos`)
