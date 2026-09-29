/**
 * A CADEIA «quem copia o quê» — a montagem da árvore, a fonte de verdade do modo (e a coluna que
 * mente), o executor de cada estratégia e as regras do arrastar-e-largar do quadro.
 *
 *   npx tsx lib/copia-contas/__tests__/cadeia.check.ts
 */
import assert from 'node:assert/strict'
import {
  accoesDoArrasto, contarSubscritores, executorDaEstrategia, montarCadeia, normalizarDisposicao, podeLigar,
  textoDaFonte, textoDoLote, type EntradaCadeia, type EstrategiaEntrada, type RotaEntrada,
} from '../cadeia'
import type { ConfigGlobalMestres, EstrategiaMestre } from '../../mestres/tipos'
import { linhaDeAgua } from '../../admin-centro/linha-de-agua'

const casos: { nome: string; f: () => void }[] = []
const caso = (nome: string, f: () => void) => casos.push({ nome, f })

const GLOBAL_LIVE: ConfigGlobalMestres = { ligado: true, kill: false, liveDesbloqueado: true }

const mestre = (over: Partial<EstrategiaMestre> = {}): EstrategiaMestre => ({
  providerId: 'p-1', slug: 'mtm-auto-wolf', contaMestreId: 'CM-1',
  modo: 'live', sinalModo: 'desligado', t2tModo: 'live', incluirMtmauto: true,
  mtmautoCortadoEm: '2026-09-01T00:00:00Z', copyfactoryIds: [], copyfactoryCortadoEm: null, maxAtrasoAberturaS: 30,
  ...over,
})

const estrategia = (over: Partial<EstrategiaEntrada> = {}): EstrategiaEntrada => ({
  mestre: mestre(), providerId: 'p-1', slug: 'mtm-auto-wolf', nome: 'MTM Auto Wolf', ativo: true,
  fonteSinais: 'primeverse', fonteFiltro: 'g_wolf', canalChat: null, copyfactoryPorCortar: [],
  // A mestre é simulada (motor='sim'): 10 250 sobre 10 000 de partida, marcada como simulado.
  contaMestre: {
    id: 'CM-1', login: '77460273', etiqueta: null, saldo: 10_250, equity: 10_250, saldoInicial: 10_000,
    linhaDeAgua: linhaDeAgua(10_250, 10_000, 'simulado'),
  },
  ...over,
})

const rota = (over: Partial<RotaEntrada> = {}): RotaEntrada => ({
  id: 'r-1', userId: 'u-1', mestres: true, tipoRota: 'estrategia', estrategiaSlug: 'mtm-auto-wolf',
  origemRef: 'prov:p-1', origemChave: 'mtmfunded:cm-1', destinoRef: 'auto:a-1', destinoChave: 'mt:123@Broker',
  rotulo: null, modoLote: 'fixo', valor: 0.02, ativa: true, estado: 'aprovada',
  // é SEMPRE 'shadow' na base — e é precisamente por isso que não se pode confiar nela
  modoColuna: 'shadow', pausadaMotivo: null, abertas: 0,
  ...over,
})

const base = (over: Partial<EntradaCadeia> = {}): EntradaCadeia => ({
  global: GLOBAL_LIVE,
  escritaNoProcesso: true,
  interruptores078: { globalLigado: true, liveDesbloqueado: false, escritaNoProcesso: false },
  estrategias: [estrategia()],
  rotas: [rota()],
  contasMestres: [{
    contaChave: 'mt:123@Broker', contaRef: 'auto:a-1', modo: 'live', loteFixoForcado: null,
    maxPosicoes: 10, maxRiscoTotalPct: 6, maxLoteTotal: null, falhasSeguidas: 0, bloqueada: false, bloqueioMotivo: null,
  }],
  nomes: [{ ref: 'auto:a-1', etiqueta: 'Conta grande', descricao: '123 @ Broker (MTM Auto)', email: 'a@b.pt', userId: 'u-1' }],
  ...over,
})

// ── a fonte de verdade ──────────────────────────────────────────────────────

caso('a rota conta como LIVE apesar de copia_rotas.modo ser «shadow»', () => {
  const c = montarCadeia(base())
  const s = c.estrategias[0].subscritores[0]
  assert.equal(s.efectivo, 'live', 'o modo real vem de mestres_estrategias + mestres_contas, não da coluna modo')
  assert.equal(c.estrategias[0].contagem.live, 1)
})

caso('a MESMA rota com a conta em sombra fica em sombra, e diz porquê', () => {
  const e = base()
  e.contasMestres[0].modo = 'sombra'
  const s = montarCadeia(e).estrategias[0].subscritores[0]
  assert.equal(s.efectivo, 'sombra')
  assert.match(s.motivo, /conta em sombra/)
})

caso('sem MESTRES_ESCRITA no VPS nada vai a live', () => {
  const s = montarCadeia(base({ escritaNoProcesso: false })).estrategias[0].subscritores[0]
  assert.equal(s.efectivo, 'sombra')
  assert.match(s.motivo, /MESTRES_ESCRITA/)
})

caso('kill-switch pára tudo', () => {
  const c = montarCadeia(base({ global: { ...GLOBAL_LIVE, kill: true } }))
  assert.equal(c.estrategias[0].subscritores[0].efectivo, 'parado')
  assert.equal(c.estrategias[0].executor, 'parado')
})

caso('CopyFactory por cortar → quem copia é a CopyFactory, não o motor', () => {
  const e = estrategia({ mestre: mestre({ modo: 'sombra', copyfactoryIds: ['Wl1B'] }), copyfactoryPorCortar: ['Wl1B'] })
  const x = executorDaEstrategia(e, GLOBAL_LIVE)
  assert.equal(x.executor, 'copyfactory')
  assert.match(x.nota, /Wl1B/)
})

caso('provider sem mestre nossa executa o caminho antigo', () => {
  assert.equal(executorDaEstrategia(estrategia({ mestre: null }), GLOBAL_LIVE).executor, 'legado')
})

caso('provider inactivo não executa por caminho nenhum', () => {
  assert.equal(executorDaEstrategia(estrategia({ ativo: false }), GLOBAL_LIVE).executor, 'parado')
})

// ── árvore ──────────────────────────────────────────────────────────────────

caso('uma rota com slug desconhecido fica órfã E grita', () => {
  const c = montarCadeia(base({ rotas: [rota({ estrategiaSlug: 'estrategia-que-morreu' })] }))
  assert.equal(c.estrategias[0].subscritores.length, 0)
  assert.equal(c.orfas.length, 1)
  assert.match(c.avisos.join(' '), /estrategia-que-morreu/)
})

caso('rota conta→conta (mestres=false) não entra em estratégia nenhuma e vive nas fechaduras da 078', () => {
  const c = montarCadeia(base({ rotas: [rota({ mestres: false, tipoRota: 'conta', estrategiaSlug: null, modoColuna: 'live' })] }))
  assert.equal(c.contaAConta.length, 1)
  // live_desbloqueado=false na 078 → sombra, por muito que a coluna diga 'live'
  assert.equal(c.contaAConta[0].efectivo, 'sombra')
})

caso('estratégia pedida em live sem nenhuma rota a executar entra nos avisos', () => {
  const e = base({ escritaNoProcesso: false })
  assert.match(montarCadeia(e).avisos.join(' '), /pedida em LIVE mas nenhuma/)
})

caso('a mesma conta em duas estratégias aparece nas duas, com a mesma chave de nó', () => {
  const e = base({
    estrategias: [estrategia(), estrategia({ providerId: 'p-2', slug: 'sensei', nome: 'MTM Auto Sensei', mestre: mestre({ providerId: 'p-2', slug: 'sensei', contaMestreId: 'CM-2' }), contaMestre: null })],
    rotas: [rota(), rota({ id: 'r-2', estrategiaSlug: 'sensei', origemChave: 'mtmfunded:cm-2' })],
  })
  const c = montarCadeia(e)
  const chaves = c.estrategias.map((x) => x.subscritores[0]?.chave)
  assert.deepEqual(chaves, ['mt:123@Broker', 'mt:123@Broker'])
})

caso('a contagem separa live, sombra, parado, t2t e pausados', () => {
  const c = contarSubscritores([
    { chave: 'a', rotaId: '1', ref: 'auto:1', tipo: 'estrategia', etiqueta: null, descricao: null, email: null, userId: null, lote: '', efectivo: 'live', motivo: '', pausadaMotivo: null, abertas: 0 },
    { chave: 'b', rotaId: '2', ref: 'site:2', tipo: 't2t', etiqueta: null, descricao: null, email: null, userId: null, lote: '', efectivo: 'sombra', motivo: '', pausadaMotivo: 'pausada pelo cliente', abertas: 1 },
    { chave: 'c', rotaId: '3', ref: 'auto:3', tipo: 'estrategia', etiqueta: null, descricao: null, email: null, userId: null, lote: '', efectivo: 'parado', motivo: '', pausadaMotivo: null, abertas: 0 },
  ])
  assert.deepEqual(c, { total: 3, live: 1, sombra: 1, parado: 1, t2t: 1, pausados: 1 })
})

// ── textos ──────────────────────────────────────────────────────────────────

caso('a fonte lê-se em português corrente', () => {
  assert.equal(textoDaFonte({ fonteSinais: 'primeverse', fonteFiltro: 'g_wolf', canalChat: null, slug: 'x' }), 'PrimeVerse · g_wolf')
  assert.equal(textoDaFonte({ fonteSinais: null, fonteFiltro: null, canalChat: 'sensei-scanner', slug: 'x' }), 'Chat · sensei-scanner')
  assert.equal(textoDaFonte({ fonteSinais: null, fonteFiltro: null, canalChat: null, slug: 'x' }), 'Sem fonte declarada')
})

caso('o lote lê-se sem decifrar o modo', () => {
  assert.equal(textoDoLote('multiplicador', 2), '×2')
  assert.equal(textoDoLote('fixo', 0.02), '0,02 lotes')
  assert.equal(textoDoLote('risco_pct', 1.5), '1,5 % de risco')
})

// ── quadro ──────────────────────────────────────────────────────────────────

const no = (over: Partial<ReturnType<typeof montarCadeia>['estrategias'][number]> = {}) => ({
  ...montarCadeia(base()).estrategias[0],
  ...over,
})

caso('não se liga a uma estratégia sem mestre nossa', () => {
  const destino = no({ modoPedido: 'sem-mestre' as const })
  const r = podeLigar(destino, { chave: 'x', ref: 'auto:a-9' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.erro, 'sem-mestre')
})

caso('não se liga a um provider inactivo', () => {
  const r = podeLigar(no({ ativo: false }), { chave: 'x', ref: 'auto:a-9' })
  assert.equal(r.ok === false && r.erro, 'provider-inactivo')
})

caso('uma conta mestre (prov:) nunca é subscritora', () => {
  const r = podeLigar(no(), { chave: 'mtmfunded:cm-2', ref: 'prov:00000000-0000-0000-0000-000000000002' })
  assert.equal(r.ok === false && r.erro, 'nao-e-conta')
})

caso('não se liga duas vezes a mesma conta à mesma estratégia', () => {
  const r = podeLigar(no(), { chave: 'mt:123@Broker', ref: 'auto:a-1' })
  assert.equal(r.ok === false && r.erro, 'ja-segue')
})

caso('largar onde já estava não é um pedido', () => {
  const n = no()
  assert.equal(podeLigar(n, { chave: 'x', ref: 'auto:a-9' }, n).ok, false)
})

caso('ligar uma conta nova passa', () => {
  assert.equal(podeLigar(no(), { chave: 'mt:999@X', ref: 'auto:a-9' }).ok, true)
})

caso('arrastar de fora é LIGAR; de uma estratégia para outra é MOVER', () => {
  const n = no()
  assert.deepEqual(accoesDoArrasto(null, n, 'auto:a-9'), [{ tipo: 'ligar', slug: 'mtm-auto-wolf', ref: 'auto:a-9' }])
  const outra = no({ slug: 'sensei' })
  assert.deepEqual(accoesDoArrasto(outra, n, 'auto:a-9'), [{ tipo: 'mover', de: 'sensei', para: 'mtm-auto-wolf', ref: 'auto:a-9' }])
})

caso('a disposição só aceita chaves conhecidas e coordenadas finitas', () => {
  const d = normalizarDisposicao(
    { 'estrategia:a': { x: 10.6, y: -3 }, 'nao-existe': { x: 1, y: 1 }, 'estrategia:b': { x: 'oi', y: 2 }, 'estrategia:c': { x: 1e9, y: 0 } },
    ['estrategia:a', 'estrategia:b', 'estrategia:c'],
  )
  assert.deepEqual(d, { 'estrategia:a': { x: 11, y: -3 }, 'estrategia:c': { x: 20_000, y: 0 } })
})

caso('disposição de lixo não rebenta', () => {
  assert.deepEqual(normalizarDisposicao(null, ['a']), {})
  assert.deepEqual(normalizarDisposicao('{}', ['a']), {})
})

caso('a mestre no topo traz a linha de água E a marca de simulado (nunca um número nu)', () => {
  const c = montarCadeia(base())
  const m = c.estrategias[0].contaMestre
  assert.ok(m, 'a estratégia tem de trazer a mestre')
  assert.equal(m.linhaDeAgua.pct, 2.5)
  assert.equal(m.linhaDeAgua.acima, true)
  // Isto é a guarda que importa: um saldo de conta SIM apresentado sem proveniência passaria por
  // prova, e o viés do preço de entrada já foi medido como ~56% do lucro.
  assert.equal(m.linhaDeAgua.proveniencia, 'simulado')
})

let n = 0
for (const c of casos) {
  try { c.f(); n++ } catch (e) { console.error(`✗ ${c.nome}\n  ${e instanceof Error ? e.message : e}`); process.exitCode = 1 }
}
console.log(process.exitCode ? `falharam ${casos.length - n} de ${casos.length}` : `cadeia: ${n} casos, todos certos`)
