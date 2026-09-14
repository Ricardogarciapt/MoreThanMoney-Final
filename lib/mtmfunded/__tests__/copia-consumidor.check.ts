/**
 * O CONSUMIDOR da cópia contra uma corretora FALSA que falha no pior momento.
 *
 *   npx tsx lib/mtmfunded/__tests__/copia-consumidor.check.ts
 *
 * O que tem de ser verdade, sempre:
 *   1. crash depois de a corretora abrir e antes de se gravar → a repetição NÃO abre outra;
 *   2. leitura nula do destino → nunca se marca uma cópia como fechada;
 *   3. destino em pausa / interruptor desligado → aberturas recusadas, saídas passam.
 */
import type { CondutorDestino, PosicaoDestino, OrdemCopia, ContextoDestino } from '../copia/destinos'
import {
  processarEvento, type Loja, type Copiador, type CopiaPosicao, type EventoCopia, type ContaOrigem, type DestinoVivo,
} from '../copia/processar'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${JSON.stringify(b)}\n   obtido:   ${JSON.stringify(a)}`)
}

// ── corretora falsa ──────────────────────────────────────────────────────────
class Corretora implements CondutorDestino {
  posicoesAbertas: PosicaoDestino[] = []
  ordens: OrdemCopia[] = []
  fechos: Array<{ id: string; volume?: number }> = []
  leituraNula = false
  morrerDepoisDeAbrir = false
  comClientId = true
  private seq = 100
  async contexto(): Promise<ContextoDestino | null> {
    if (this.leituraNula) return null
    return { brokerSymbol: 'XAUUSD.r', spec: { point: 0.01, digits: 2, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01 }, bid: 2400, ask: 2400.2, balance: 10_000, equity: 10_000, tickSize: 0.01, tickValue: 1 }
  }
  async posicoes() { return this.leituraNula ? null : this.posicoesAbertas.map((p) => ({ ...p })) }
  async abrir(o: OrdemCopia) {
    this.ordens.push(o)
    const id = String(this.seq++)
    this.posicoesAbertas.push({ id, symbol: 'XAUUSD.r', direcao: o.direcao, volume: o.volume, openPrice: 2400.3, clientId: this.comClientId ? o.clientId : null, comment: null, time: new Date().toISOString() })
    if (this.morrerDepoisDeAbrir) { this.morrerDepoisDeAbrir = false; throw new Error('processo morreu') }
    return { ok: true as const, positionId: id, brokerSymbol: 'XAUUSD.r' }
  }
  async modificar() { return { ok: true } }
  async fechar(_c: string, id: string, volume?: number) {
    if (this.leituraNula) return { ok: false, erro: 'timeout' }
    const p = this.posicoesAbertas.find((x) => x.id === id)
    if (!p) return { ok: false, erro: 'Position not found' }
    this.fechos.push({ id, volume })
    if (volume && volume < p.volume) p.volume = Number((p.volume - volume).toFixed(2))
    else this.posicoesAbertas = this.posicoesAbertas.filter((x) => x.id !== id)
    return { ok: true }
  }
  aceitaClientId() { return this.comClientId }
}

// ── loja em memória ──────────────────────────────────────────────────────────
class Memoria implements Loja {
  copiador: Copiador = {
    id: 'c0ffee00-0000-0000-0000-000000000001', user_id: 'u1', account_id: 'acc', destino_tipo: 'mtmauto', destino_id: 'd1',
    modo_lote: 'proporcional_saldo', valor: null, lote_max: null, max_posicoes: null, perda_diaria_max: null,
    copiar_sl: true, copiar_tp: true, simbolos: [], ativo: true, ancora_equity: null, ancora_dia: null,
  }
  contaOrigem: ContaOrigem = { estado: 'ativa', saldo: 100_000, login: '9000001', userId: 'u1' }
  destinoVivo: DestinoVivo = { metaapiAccountId: 'meta-1', ligado: true, demo: true }
  ligado = true
  reais = false
  copias: CopiaPosicao[] = []
  private n = 0
  async copiadores() { return [this.copiador] }
  async conta() { return this.contaOrigem }
  async destino() { return this.destinoVivo }
  async copia(copierId: string, pos: string) { return this.copias.find((c) => c.copier_id === copierId && c.funded_position_id === pos) ?? null }
  async inserirCopia(c: Partial<CopiaPosicao> & { copier_id: string; funded_position_id: string; volume_origem: number }) {
    if (await this.copia(c.copier_id, c.funded_position_id)) return false
    this.copias.push({
      id: `cp${this.n++}`, dest_position_id: null, dest_symbol: null, dest_volume_origem: null, fechado_pct: 0, estado: 'enviando',
      erro: null, client_id: null, preco_origem: null, preco_destino: null, latencia_ms: null, parciais_aplicados: [], enviado_em: null, ...c,
    } as CopiaPosicao)
    return true
  }
  async atualizarCopia(id: string, patch: Partial<CopiaPosicao>) { Object.assign(this.copias.find((c) => c.id === id)!, patch) }
  async copiasAbertas() { return this.copias.filter((c) => c.estado === 'aberta' || c.estado === 'enviando').length }
  async idsDestinoUsados() { return new Set(this.copias.map((c) => c.dest_position_id).filter(Boolean) as string[]) }
  async atualizarCopiador(_id: string, patch: Partial<Copiador>) { Object.assign(this.copiador, patch) }
  async direito() { return { ok: true, admin: false } }
  async interruptor() { return this.ligado }
  async reaisLigadas() { return this.reais }
}

let seqEv = 1
const evento = (tipo: EventoCopia['tipo'], payload: Record<string, unknown>, pos = 'p1'): EventoCopia => ({
  id: seqEv++, account_id: 'acc', position_id: pos, tipo, payload, chave: `${tipo}:${pos}:${seqEv}`, criado_em: new Date().toISOString(), tentativas: 0,
})
const ABRIR = { symbol: 'XAUUSD', direcao: 'buy', volume: 1, preco_entrada: 2400, sl: 2390, tp: 2430 }
const op = { escrita: true, log: () => {} }

async function main() {
  // ── 1. crash depois da ordem → sem duplicado ──
  {
    const loja = new Memoria(); const br = new Corretora()
    br.morrerDepoisDeAbrir = true
    const ev = evento('open', ABRIR)
    const r1 = await processarEvento(ev, loja, br, op)
    eq('1ª passagem falha (processo morreu)', r1.ok, false)
    eq('ficou «enviando»', loja.copias[0]?.estado, 'enviando')
    const r2 = await processarEvento(ev, loja, br, op)
    eq('repetição ok', r2.ok, true)
    eq('uma só ordem na corretora', br.ordens.length, 1)
    eq('cópia recuperada pelo clientId', [loja.copias[0].estado, loja.copias[0].dest_position_id], ['aberta', '100'])
    eq('lote proporcional: 1 × 10 000 / 100 000', br.ordens[0].volume, 0.1)
    eq('SL/TP pela distância a partir do ask', [br.ordens[0].sl, br.ordens[0].tp], [2390.2, 2430.2])
  }
  // ── 1b. o mesmo, numa conta sem comentário (sem clientId) ──
  {
    const loja = new Memoria(); const br = new Corretora()
    br.comClientId = false; br.morrerDepoisDeAbrir = true
    const ev = evento('open', ABRIR)
    await processarEvento(ev, loja, br, op)
    await processarEvento(ev, loja, br, op)
    eq('sem clientId: uma só ordem', br.ordens.length, 1)
    eq('sem clientId: recuperada por símbolo+lote+hora', loja.copias[0].estado, 'aberta')
  }
  // ── 1c. evento repetido depois de aberta → nada ──
  {
    const loja = new Memoria(); const br = new Corretora()
    const ev = evento('open', ABRIR)
    await processarEvento(ev, loja, br, op)
    await processarEvento(ev, loja, br, op)
    eq('open repetido não reabre', br.ordens.length, 1)
  }

  // ── 2. leitura nula → não fecha ──
  {
    const loja = new Memoria(); const br = new Corretora()
    await processarEvento(evento('open', ABRIR), loja, br, op)
    br.leituraNula = true
    const rp = await processarEvento(evento('partial', { pct: 0.5 }), loja, br, op)
    eq('parcial com leitura nula → repete', rp.ok, false)
    const rc = await processarEvento(evento('close', {}), loja, br, op)
    eq('fecho com leitura nula → repete', rc.ok, false)
    eq('cópia continua aberta', loja.copias[0].estado, 'aberta')
    br.leituraNula = false
    const rp2 = await processarEvento(evento('partial', { pct: 0.5 }), loja, br, op)
    eq('parcial passa depois', [rp2.ok, br.fechos[0]], [true, { id: '100', volume: 0.05 }])
    const rc2 = await processarEvento(evento('close', {}), loja, br, op)
    eq('fecho passa depois', [rc2.ok, loja.copias[0].estado, br.posicoesAbertas.length], [true, 'fechada', 0])
  }
  // ── 2b. leitura BOA sem a posição (fechou lá por SL) → fechada, sem ordem ──
  {
    const loja = new Memoria(); const br = new Corretora()
    await processarEvento(evento('open', ABRIR), loja, br, op)
    br.posicoesAbertas = []
    const r = await processarEvento(evento('close', {}), loja, br, op)
    eq('fechada no destino', [r.ok, loja.copias[0].estado, br.fechos.length], [true, 'fechada', 0])
  }

  // ── 3. pausa / interruptor → aberturas bloqueadas, saídas passam ──
  {
    const loja = new Memoria(); const br = new Corretora()
    await processarEvento(evento('open', ABRIR, 'p1'), loja, br, op)
    loja.copiador.ativo = false
    await processarEvento(evento('open', ABRIR, 'p2'), loja, br, op)
    eq('pausado: não abre a segunda', br.ordens.length, 1)
    eq('pausado: fica registada a recusa', loja.copias.find((c) => c.funded_position_id === 'p2')?.estado, 'recusada')
    loja.ligado = false
    const r = await processarEvento(evento('close', {}, 'p1'), loja, br, op)
    eq('pausado + interruptor off: o fecho passa', [r.ok, loja.copias[0].estado, br.fechos.length], [true, 'fechada', 1])
    const r2 = await processarEvento(evento('close', {}, 'p2'), loja, br, op)
    eq('fecho de uma recusada não faz nada', [r2.ok, br.fechos.length], [true, 1])
  }
  // ── 3b. destino real bloqueado no arranque ──
  {
    const loja = new Memoria(); const br = new Corretora()
    loja.destinoVivo = { ...loja.destinoVivo, demo: false }
    await processarEvento(evento('open', ABRIR), loja, br, op)
    eq('real sem interruptor → recusa', [br.ordens.length, loja.copias[0].estado], [0, 'recusada'])
  }
  // ── 3c. modo seco não envia nem grava ──
  {
    const loja = new Memoria(); const br = new Corretora()
    const linhas: string[] = []
    await processarEvento(evento('open', ABRIR), loja, br, { escrita: false, log: (...a: unknown[]) => linhas.push(a.join(' ')) })
    eq('seco: zero ordens, zero linhas', [br.ordens.length, loja.copias.length], [0, 0])
    eq('seco: escreve a decisão no log', linhas.some((l) => l.startsWith('[seco] abriria XAUUSD.r buy 0.1')), true)
  }

  console.log(mau ? `\n${mau} errado(s), ${ok} certo(s)` : `todos certos (${ok})`)
  if (mau) process.exit(1)
}
main()
