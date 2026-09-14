import { diaDaCorretora } from '@/lib/mtmfunded/simulado/ordens'
import { volumeDestino, stopsPorDistancia, planoParcial, simboloPermitido, clientIdDaCopia, type ModoLote } from './dimensionar'
import { motivoParaNaoAbrir } from './elegibilidade'
import { comentarioDaCopia, type CondutorDestino, type PosicaoDestino } from './destinos'

/**
 * O QUE O COPIADOR FAZ COM CADA EVENTO — sem Supabase e sem MetaApi dentro.
 *
 * O serviço do VPS (services/funded-copier/copier.ts) liga isto a uma `Loja` feita de Supabase e a
 * um `CondutorDestino` feito de MetaApi. O teste (lib/mtmfunded/__tests__/copia-consumidor.check.ts)
 * liga-o a uma loja em memória e a uma corretora falsa que morre no pior momento.
 *
 * As três garantias, e onde vivem:
 *
 *  1. NUNCA DUPLICAR. Antes de enviar uma ordem grava-se a cópia como `enviando` (com o clientId).
 *     Se o processo morrer depois de a corretora abrir e antes de se gravar `aberta`, a próxima
 *     passagem encontra `enviando`, LÊ as posições do destino e procura a ordem (pelo clientId,
 *     ou — em contas sem comentário — por símbolo+direcção+lote+hora). Encontrou: é essa. Não
 *     encontrou e já passou tempo de sobra: marca-se `erro` e NÃO se reenvia — uma cópia que falta
 *     vê-se no painel; uma cópia a dobrar é o dobro do risco na conta do aluno.
 *  2. LEITURA NULA NÃO É FECHO. Se não se conseguiu ler o destino, não se conclui nada: repete-se.
 *  3. SAÍDAS PASSAM SEMPRE. Pausa, interruptor desligado, direito perdido, perda diária: tudo isso
 *     só impede ABRIR. Fechar, parciais e SL/TP de cópias já abertas replicam-se sempre.
 */

export type TipoEvento = 'open' | 'modify' | 'partial' | 'close'

export interface EventoCopia {
  id: number
  account_id: string
  position_id: string
  tipo: TipoEvento
  payload: Record<string, unknown>
  chave: string
  criado_em: string
  tentativas: number
}

export interface Copiador {
  id: string
  user_id: string
  account_id: string
  destino_tipo: 'mtmcopy' | 'mtmauto' | 'tradelocker'
  destino_id: string
  modo_lote: ModoLote
  valor: number | null
  lote_max: number | null
  max_posicoes: number | null
  perda_diaria_max: number | null
  copiar_sl: boolean
  copiar_tp: boolean
  simbolos: string[]
  ativo: boolean
  ancora_equity: number | null
  ancora_dia: string | null
}

export interface CopiaPosicao {
  id: string
  copier_id: string
  funded_position_id: string
  dest_position_id: string | null
  dest_symbol: string | null
  volume_origem: number
  dest_volume_origem: number | null
  fechado_pct: number
  estado: 'enviando' | 'aberta' | 'fechada' | 'recusada' | 'erro'
  erro: string | null
  client_id: string | null
  preco_origem: number | null
  preco_destino: number | null
  latencia_ms: number | null
  parciais_aplicados: string[]
  enviado_em: string | null
}

export interface ContaOrigem { estado: string; saldo: number; login: string | null; userId: string }
export interface DestinoVivo { metaapiAccountId: string | null; ligado: boolean; demo: boolean | null }

export interface Loja {
  copiadores(accountId: string): Promise<Copiador[]>
  conta(accountId: string): Promise<ContaOrigem | null>
  destino(c: Copiador): Promise<DestinoVivo | null>
  copia(copierId: string, fundedPositionId: string): Promise<CopiaPosicao | null>
  /** false = já existia (outro processo chegou primeiro) */
  inserirCopia(c: Partial<CopiaPosicao> & { copier_id: string; funded_position_id: string; volume_origem: number }): Promise<boolean>
  atualizarCopia(id: string, patch: Partial<CopiaPosicao>): Promise<void>
  copiasAbertas(copierId: string): Promise<number>
  /** ids de posições do destino já associados a cópias abertas de QUALQUER copiador desse destino
   *  (para a procura sem clientId não apanhar a posição de outra cópia) */
  idsDestinoUsados(c: Copiador): Promise<Set<string>>
  atualizarCopiador(id: string, patch: Partial<Copiador>): Promise<void>
  /** MTM Copy / MTM Auto / admin — e se é admin (os admins podem usar destinos reais) */
  direito(userId: string): Promise<{ ok: boolean; admin: boolean }>
  interruptor(): Promise<boolean>
  reaisLigadas(): Promise<boolean>
}

export interface Opcoes {
  escrita: boolean
  log: (...a: unknown[]) => void
  agora?: () => number
  /** quanto tempo depois de enviar se conclui que uma ordem não chegou a abrir */
  esperaIncertaMs?: number
}

export type Resultado = { ok: true; notas: string[] } | { ok: false; erro: string; notas: string[] }

/** Atrasos entre tentativas: 1 s, 5 s, 30 s, 2 min — depois disso, erro. */
export const ATRASOS_MS = [1_000, 5_000, 30_000, 120_000]
export function proximaTentativa(tentativasFeitas: number): { desistir: true } | { desistir: false; emMs: number } {
  if (tentativasFeitas >= ATRASOS_MS.length) return { desistir: true }
  return { desistir: false, emMs: ATRASOS_MS[Math.max(0, tentativasFeitas)] }
}

/**
 * Modificações em rajada (arrastar o SL no gráfico gera dez): numa fila da mesma posição, só a
 * ÚLTIMA modificação de cada sequência contígua conta. As outras marcam-se como processadas.
 */
export function colapsarModificacoes(eventos: EventoCopia[]): { aProcessar: EventoCopia[]; saltados: EventoCopia[] } {
  const aProcessar: EventoCopia[] = []
  const saltados: EventoCopia[] = []
  const ordenados = [...eventos].sort((a, b) => a.id - b.id)
  for (let i = 0; i < ordenados.length; i++) {
    const e = ordenados[i]
    const seguinte = ordenados[i + 1]
    if (e.tipo === 'modify' && seguinte && seguinte.tipo === 'modify' && seguinte.position_id === e.position_id) saltados.push(e)
    else aProcessar.push(e)
  }
  return { aProcessar, saltados }
}

/** Erros em que a ordem PODE ter chegado à corretora — não se conclui nada, repete-se. */
export function erroIncerto(msg: string): boolean {
  return /timeout|timed out|not connected|disconnected|econnreset|etimedout|socket|network|503|502|504/i.test(msg)
}

class Repetir extends Error {}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Encontra no destino a posição de uma cópia `enviando`. */
export function procurarPosicaoEnviada(
  posicoes: PosicaoDestino[],
  copia: Pick<CopiaPosicao, 'client_id' | 'dest_symbol' | 'dest_volume_origem' | 'enviado_em'>,
  direcao: 'buy' | 'sell',
  usados: Set<string>,
): PosicaoDestino | null {
  if (copia.client_id) {
    const porId = posicoes.find((p) => p.clientId === copia.client_id)
    if (porId) return porId
  }
  // Sem clientId (contas sem comentário): símbolo, direcção, lote e hora — e nunca uma já associada.
  const desde = copia.enviado_em ? new Date(copia.enviado_em).getTime() - 5_000 : 0
  const candidatas = posicoes.filter((p) =>
    !usados.has(p.id) && p.direcao === direcao &&
    (!copia.dest_symbol || p.symbol === copia.dest_symbol) &&
    (copia.dest_volume_origem == null || Math.abs(p.volume - copia.dest_volume_origem) < 1e-6) &&
    (!p.time || new Date(p.time).getTime() >= desde),
  )
  return candidatas.length === 1 ? candidatas[0] : null
}

export async function processarEvento(ev: EventoCopia, loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<Resultado> {
  const notas: string[] = []
  const copiadores = await loja.copiadores(ev.account_id)
  let falhou: string | null = null
  for (const c of copiadores) {
    try {
      const nota = await porCopiador(ev, c, loja, condutor, op)
      if (nota) notas.push(`${c.id.slice(0, 8)}: ${nota}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      notas.push(`${c.id.slice(0, 8)}: ${msg}`)
      // Um copiador com problema não trava os outros; o evento repete-se e os já feitos saltam.
      falhou = falhou ?? msg
    }
  }
  return falhou ? { ok: false, erro: falhou, notas } : { ok: true, notas }
}

async function porCopiador(ev: EventoCopia, c: Copiador, loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<string | null> {
  const copia = await loja.copia(c.id, ev.position_id)
  if (ev.tipo === 'open') return abrir(ev, c, copia, loja, condutor, op)
  if (!copia) return null // nunca foi copiada: nada a replicar
  if (copia.estado === 'enviando') throw new Repetir('abertura ainda por confirmar')
  if (copia.estado !== 'aberta' || !copia.dest_position_id) return null
  const destino = await loja.destino(c)
  if (!destino?.metaapiAccountId) throw new Repetir('destino sem conta MetaApi')
  const conta = destino.metaapiAccountId
  if (ev.tipo === 'modify') return modificar(ev, c, copia, conta, loja, condutor, op)
  if (ev.tipo === 'partial') return parcial(ev, copia, conta, loja, condutor, op)
  if (ev.tipo === 'close') return fechar(copia, conta, loja, condutor, op)
  return null
}

// ── abrir ────────────────────────────────────────────────────────────────────

async function abrir(ev: EventoCopia, c: Copiador, existente: CopiaPosicao | null, loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<string | null> {
  const agora = op.agora ?? Date.now
  const p = ev.payload
  const direcao = p.direcao === 'sell' ? 'sell' : 'buy'
  const symbol = String(p.symbol ?? '')
  const volumeOrigem = Number(p.volume ?? 0)
  const destino = await loja.destino(c)
  const conta = destino?.metaapiAccountId ?? null

  if (existente) {
    if (existente.estado !== 'enviando') return null // já tratada
    if (!conta) throw new Repetir('destino sem conta MetaApi')
    // Recuperação depois de um crash: a ordem abriu ou não?
    const posicoes = await condutor.posicoes(conta)
    if (posicoes == null) throw new Repetir('não consegui ler o destino para confirmar a abertura')
    const usados = await loja.idsDestinoUsados(c)
    const achada = procurarPosicaoEnviada(posicoes, existente, direcao, usados)
    if (achada) {
      await loja.atualizarCopia(existente.id, {
        estado: 'aberta', dest_position_id: achada.id, dest_symbol: achada.symbol, preco_destino: achada.openPrice, erro: null,
      })
      return `recuperada ${achada.id}`
    }
    const enviadoHa = existente.enviado_em ? agora() - new Date(existente.enviado_em).getTime() : Infinity
    if (enviadoHa < (op.esperaIncertaMs ?? 60_000)) throw new Repetir('ordem enviada ainda sem posição visível')
    // Passou tempo de sobra e não está lá: não abriu. Volta a decidir do zero (a posição simulada
    // ainda estará aberta? se já fechou, o evento de fecho a seguir não encontra nada — correcto).
    await loja.atualizarCopia(existente.id, { estado: 'erro', erro: 'ordem não confirmada no destino' })
    return 'ordem não confirmada no destino'
  }

  // ── pode abrir?
  const [origem, interruptor, reais] = await Promise.all([loja.conta(ev.account_id), loja.interruptor(), loja.reaisLigadas()])
  const direito = origem ? await loja.direito(origem.userId) : { ok: false, admin: false }
  const contexto = conta ? await condutor.contexto(conta, symbol, direcao) : null
  if (conta && destino?.ligado && contexto == null) throw new Repetir('não consegui ler o destino (preço/equity)')

  let perdaDiariaPct: number | null = null
  const equity = contexto?.equity ?? null
  if (equity != null && equity > 0 && c.perda_diaria_max) {
    const hoje = diaDaCorretora(new Date(agora()))
    let ancora = c.ancora_dia === hoje ? c.ancora_equity : null
    if (ancora == null) {
      ancora = equity
      if (op.escrita) await loja.atualizarCopiador(c.id, { ancora_equity: equity, ancora_dia: hoje })
    }
    perdaDiariaPct = ancora > 0 ? ((ancora - equity) / ancora) * 100 : null
  }

  const motivo = motivoParaNaoAbrir({
    interruptorGlobal: interruptor,
    contaEstado: origem?.estado ?? 'desconhecida',
    copierAtivo: c.ativo,
    direitoOk: direito.ok,
    destinoLigado: Boolean(destino?.ligado && conta),
    // Arranque prudente: real (ou desconhecido) só com o interruptor dos reais ou para admin.
    destinoProibido: destino && destino.demo !== true && !reais && !direito.admin
      ? 'destino real — contas reais disponíveis em breve' : null,
    simboloPermitido: simboloPermitido(symbol, c.simbolos),
    copiasAbertas: await loja.copiasAbertas(c.id),
    maxPosicoes: c.max_posicoes,
    perdaDiariaPct,
    perdaDiariaMax: c.perda_diaria_max,
  })

  const base = { copier_id: c.id, funded_position_id: ev.position_id, volume_origem: volumeOrigem, preco_origem: num(p.preco_entrada) }
  if (motivo) {
    op.log(`[recusa] ${c.id.slice(0, 8)} ${symbol} ${direcao} ${volumeOrigem}: ${motivo}`)
    if (op.escrita) await loja.inserirCopia({ ...base, estado: 'recusada', erro: motivo })
    return `recusada: ${motivo}`
  }

  const tam = volumeDestino({
    modo: c.modo_lote, valor: c.valor, volumeOrigem, saldoOrigem: origem!.saldo, equityDestino: equity,
    loteMax: c.lote_max, spec: contexto!.spec,
    distanciaSl: num(p.sl) != null && num(p.preco_entrada) != null ? Math.abs(Number(p.preco_entrada) - Number(p.sl)) : null,
    tickSize: contexto!.tickSize, tickValue: contexto!.tickValue,
  })
  if (!tam.ok) {
    op.log(`[recusa] ${c.id.slice(0, 8)} ${symbol}: ${tam.motivo}`)
    if (op.escrita) await loja.inserirCopia({ ...base, estado: 'recusada', erro: tam.motivo })
    return `recusada: ${tam.motivo}`
  }

  const precoRef = direcao === 'buy' ? contexto!.ask ?? contexto!.bid : contexto!.bid ?? contexto!.ask
  const stops = precoRef ? stopsPorDistancia({
    direcao, entradaOrigem: Number(p.preco_entrada), slOrigem: num(p.sl), tpOrigem: num(p.tp), precoDestino: precoRef,
    digits: contexto!.spec?.digits, copiarSl: c.copiar_sl, copiarTp: c.copiar_tp,
  }) : { sl: null, tp: null }
  const clientId = clientIdDaCopia(c.id, ev.position_id)

  if (!op.escrita) {
    op.log(`[seco] abriria ${contexto!.brokerSymbol} ${direcao} ${tam.volume} (bruto ${tam.bruto.toFixed(4)}) SL ${stops.sl ?? '—'} TP ${stops.tp ?? '—'} em ${conta} (${clientId})`)
    return `seco: ${direcao} ${tam.volume}`
  }

  const inserida = await loja.inserirCopia({
    ...base, estado: 'enviando', client_id: condutor.aceitaClientId(conta!) ? clientId : null,
    dest_symbol: contexto!.brokerSymbol, dest_volume_origem: tam.volume, enviado_em: new Date(agora()).toISOString(),
  })
  if (!inserida) return null // outro processo chegou primeiro
  const linha = await loja.copia(c.id, ev.position_id)
  if (!linha) throw new Repetir('cópia gravada mas não relida')

  const r = await condutor.abrir({
    accountId: conta!, symbol, direcao, volume: tam.volume, sl: stops.sl, tp: stops.tp,
    comentario: comentarioDaCopia(origem!.login), clientId,
  })
  if (!r.ok) {
    if (erroIncerto(r.erro)) throw new Repetir(`envio incerto: ${r.erro}`) // fica 'enviando' → recuperação
    await loja.atualizarCopia(linha.id, { estado: 'erro', erro: r.erro })
    return `erro: ${r.erro}`
  }

  // Confirmar o fill (preço real) e acertar SL/TP pela distância a partir DESSE preço.
  const posicoes = await condutor.posicoes(conta!)
  const usados = await loja.idsDestinoUsados(c)
  const achada = posicoes == null ? null
    : (r.positionId ? posicoes.find((x) => x.id === r.positionId) : null) ??
      procurarPosicaoEnviada(posicoes, { ...linha, dest_symbol: r.brokerSymbol ?? linha.dest_symbol }, direcao, usados)
  const latencia = Math.max(0, agora() - new Date(ev.criado_em).getTime())
  if (!achada && !r.positionId) {
    // Abriu (a corretora disse que sim) mas ainda não se vê: a recuperação trata na próxima passagem.
    throw new Repetir('ordem aceite, posição ainda não visível')
  }
  const fill = achada?.openPrice ?? null
  await loja.atualizarCopia(linha.id, {
    estado: 'aberta', dest_position_id: achada?.id ?? r.positionId, dest_symbol: achada?.symbol ?? r.brokerSymbol ?? linha.dest_symbol,
    preco_destino: fill, latencia_ms: latencia, erro: null,
  })
  if (fill && (stops.sl != null || stops.tp != null)) {
    const certos = stopsPorDistancia({
      direcao, entradaOrigem: Number(p.preco_entrada), slOrigem: num(p.sl), tpOrigem: num(p.tp), precoDestino: fill,
      digits: contexto!.spec?.digits, copiarSl: c.copiar_sl, copiarTp: c.copiar_tp,
    })
    const pt = contexto!.spec?.point ?? 0
    const difere = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) > pt
    if (difere(certos.sl, stops.sl) || difere(certos.tp, stops.tp)) {
      const m = await condutor.modificar(conta!, String(achada!.id), certos.sl, certos.tp)
      if (!m.ok) op.log(`[aviso] SL/TP pelo fill falhou em ${achada!.id}: ${m.erro}`)
    }
  }
  return `aberta ${achada?.id ?? r.positionId} ${tam.volume}`
}

// ── modificar ────────────────────────────────────────────────────────────────

async function modificar(ev: EventoCopia, c: Copiador, copia: CopiaPosicao, conta: string, _loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<string | null> {
  if (!c.copiar_sl && !c.copiar_tp) return null
  const p = ev.payload
  const entrada = num(p.preco_entrada) ?? copia.preco_origem
  if (entrada == null || copia.preco_destino == null) throw new Repetir('sem preços de entrada para medir distâncias')
  const direcao = p.direcao === 'sell' ? 'sell' : 'buy'
  const s = stopsPorDistancia({
    direcao, entradaOrigem: entrada, slOrigem: num(p.sl), tpOrigem: num(p.tp), precoDestino: copia.preco_destino,
    copiarSl: c.copiar_sl, copiarTp: c.copiar_tp, digits: null,
  })
  if (!op.escrita) { op.log(`[seco] modificaria ${copia.dest_position_id} SL ${s.sl ?? '—'} TP ${s.tp ?? '—'}`); return 'seco: modify' }
  const r = await condutor.modificar(conta, copia.dest_position_id!, s.sl, s.tp)
  if (!r.ok) throw new Error(`modificar falhou: ${r.erro}`)
  return `SL ${s.sl ?? '—'} TP ${s.tp ?? '—'}`
}

// ── parcial ──────────────────────────────────────────────────────────────────

async function parcial(ev: EventoCopia, copia: CopiaPosicao, conta: string, loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<string | null> {
  if (copia.parciais_aplicados?.includes(ev.chave)) return null
  const posicoes = await condutor.posicoes(conta)
  if (posicoes == null) throw new Repetir('não consegui ler o destino (parcial)')
  const pos = posicoes.find((x) => x.id === copia.dest_position_id)
  if (!pos) {
    // Leitura BOA e a posição não está: fechou no destino (SL/TP de lá, ou à mão).
    if (op.escrita) await loja.atualizarCopia(copia.id, { estado: 'fechada', erro: 'já não estava aberta no destino' })
    return 'já fechada no destino'
  }
  const ctx = await condutor.contexto(conta, pos.symbol, pos.direcao)
  const plano = planoParcial({
    destVolumeOrigem: copia.dest_volume_origem ?? pos.volume, fechadoPctAntes: Number(copia.fechado_pct ?? 0),
    pct: Number(ev.payload.pct ?? 0), volumeAbertoDestino: pos.volume, spec: ctx?.spec ?? null,
  })
  if (!op.escrita) { op.log(`[seco] parcial ${copia.dest_position_id}: ${JSON.stringify(plano)}`); return `seco: ${plano.tipo}` }
  if (plano.tipo === 'parcial') {
    const r = await condutor.fechar(conta, pos.id, plano.volume)
    if (!r.ok) throw new Error(`parcial falhou: ${r.erro}`)
  } else if (plano.tipo === 'total') {
    const r = await condutor.fechar(conta, pos.id)
    if (!r.ok) throw new Error(`fecho (resto abaixo do mínimo) falhou: ${r.erro}`)
  }
  await loja.atualizarCopia(copia.id, {
    fechado_pct: plano.fechadoPct, parciais_aplicados: [...(copia.parciais_aplicados ?? []), ev.chave],
    ...(plano.tipo === 'total' ? { estado: 'fechada' as const } : {}),
  })
  return plano.tipo === 'parcial' ? `parcial ${plano.volume}` : plano.tipo === 'total' ? 'fechada (resto abaixo do mínimo)' : `sem ordem (${plano.motivo})`
}

// ── fechar ───────────────────────────────────────────────────────────────────

async function fechar(copia: CopiaPosicao, conta: string, loja: Loja, condutor: CondutorDestino, op: Opcoes): Promise<string | null> {
  if (!op.escrita) { op.log(`[seco] fecharia ${copia.dest_position_id}`); return 'seco: close' }
  const r = await condutor.fechar(conta, copia.dest_position_id!)
  if (!r.ok) {
    // Pode ter fechado lá por SL/TP. Só se conclui isso com uma leitura BOA sem a posição.
    const posicoes = await condutor.posicoes(conta)
    if (posicoes == null) throw new Repetir(`fecho falhou e não consegui ler o destino: ${r.erro}`)
    if (posicoes.some((x) => x.id === copia.dest_position_id)) throw new Error(`fecho falhou: ${r.erro}`)
    await loja.atualizarCopia(copia.id, { estado: 'fechada', erro: 'já não estava aberta no destino', fechado_pct: 1 })
    return 'já fechada no destino'
  }
  await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1, erro: null })
  return 'fechada'
}

// ── limitador: no máximo N pedidos em paralelo por conta de destino ─────────

export function comLimite(condutor: CondutorDestino, maxPorConta = 4): CondutorDestino {
  const ativos = new Map<string, number>()
  const espera = new Map<string, Array<() => void>>()
  const entrar = async (conta: string) => {
    while ((ativos.get(conta) ?? 0) >= maxPorConta) {
      await new Promise<void>((res) => { const f = espera.get(conta) ?? []; f.push(res); espera.set(conta, f) })
    }
    ativos.set(conta, (ativos.get(conta) ?? 0) + 1)
  }
  const sair = (conta: string) => {
    ativos.set(conta, Math.max(0, (ativos.get(conta) ?? 1) - 1))
    espera.get(conta)?.shift()?.()
  }
  const envolver = <A extends unknown[], R>(conta: (...a: A) => string, f: (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => { const k = conta(...a); await entrar(k); try { return await f(...a) } finally { sair(k) } }
  return {
    contexto: envolver((c: string) => c, condutor.contexto.bind(condutor)),
    posicoes: envolver((c: string) => c, condutor.posicoes.bind(condutor)),
    abrir: envolver((o) => o.accountId, condutor.abrir.bind(condutor)),
    modificar: envolver((c: string) => c, condutor.modificar.bind(condutor)),
    fechar: envolver((c: string) => c, condutor.fechar.bind(condutor)),
    aceitaClientId: condutor.aceitaClientId.bind(condutor),
  }
}
