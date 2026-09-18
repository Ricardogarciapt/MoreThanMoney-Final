/**
 * O MOTOR DA CÓPIA ENTRE CONTAS — o que fazer com cada evento, por rota. Sem Supabase e sem
 * corretoras dentro: o serviço do VPS liga isto a uma `LojaCopia` (Supabase) e a um
 * `EscritorDestino` (adaptadores MT5 REST /trade, TradeLocker, MTM Funded). O teste liga-o a
 * memória e a uma corretora falsa que rebenta se alguém lhe tentar escrever em sombra.
 *
 * Garantias:
 *  1. SOMBRA NUNCA ESCREVE. Em modo sombra só se chamam leituras (contexto, símbolos); abrir,
 *     modificar e fechar nem são alcançáveis. A acção pretendida fica em `acaoPretendida`.
 *  2. NUNCA DUPLICAR. Em live grava-se a cópia `enviando` (com clientId) ANTES da ordem. Se o
 *     processo morrer entre a corretora abrir e a cópia ficar `aberta`, a próxima passagem procura a
 *     posição pelo clientId; não encontrou ao fim de `esperaIncertaMs` → `erro`, nunca reenvio.
 *  3. LEITURA NULA NÃO É FECHO. Sem conseguir ler o destino, não se conclui nada: repete-se.
 *  4. SAÍDAS PASSAM SEMPRE. Rota em pausa, filtros ou máximo de abertas só impedem ABRIR.
 */
import {
  calcularLote, chaveEvento, clientIdDaCopia, distanciaDoSl, mapearSimbolo, motivoFiltro, pctDoEvento,
  planoParcial, precoDeReferencia, REGRA_POR_OMISSAO, stopsNoDestino,
} from './calculo'
import { modoEfectivo, type Interruptores } from './regras'
import { digitosSeguros, reancorar } from '../mestres/pips'
import type { AcaoDestino, ContextoDestino, CopiaPosicao, Direcao, EventoCopia, ResultadoEvento, RotaCopia } from './tipos'

export interface PosicaoDestinoLida {
  id: string
  symbol: string
  direcao: Direcao
  volume: number
  clientId?: string | null
}

export interface EscritorDestino {
  // leituras (as únicas permitidas em sombra)
  contexto(simbolo: string, direcao: Direcao): Promise<ContextoDestino | null>
  simbolos(): Promise<string[] | null>
  posicoes(): Promise<PosicaoDestinoLida[] | null>
  // escritas (só live)
  abrir(o: { simbolo: string; direcao: Direcao; volume: number; sl: number | null; tp: number | null; clientId: string }): Promise<{ positionId: string | null; simbolo: string | null; preco?: number | null }>
  modificar(positionId: string, sl: number | null, tp: number | null): Promise<void>
  fechar(positionId: string, volume?: number | null): Promise<void>
}

export interface LojaCopia {
  copia(rotaId: string, origemPosicaoId: string): Promise<CopiaPosicao | null>
  /** false = já existia (outro processo chegou primeiro) */
  inserirCopia(c: Partial<CopiaPosicao> & { rota_id: string; origem_posicao_id: string; volume_origem_abertura: number }): Promise<boolean>
  atualizarCopia(id: string, patch: Partial<CopiaPosicao>): Promise<void>
  abertasNaRota(rotaId: string): Promise<number>
  /** saldo/equity da conta de origem (proporcional_saldo) */
  saldoOrigem(rota: RotaCopia): Promise<number | null>
}

export interface OpcoesMotor {
  interruptores: Interruptores
  agora?: () => number
  esperaIncertaMs?: number
  log?: (...a: unknown[]) => void
  /** Rotas do motor das mestres (116): decisão própria, guardas de abertura e registo de cada ordem. */
  ganchos?: GanchosMotor
}

type AcaoAbrir = Extract<AcaoDestino, { tipo: 'abrir' }>

/** Uma ordem (ou a decisão em sombra) tal como fica em `mestres_ordens`. */
export interface RegistoOrdemMotor {
  rota: RotaCopia
  ev: EventoCopia
  tipo: 'abrir' | 'modificar' | 'parcial' | 'fechar'
  modo: 'sombra' | 'live'
  estado: 'sombra' | 'enviando' | 'ok' | 'recusado' | 'erro' | 'bloqueado'
  pedido: Record<string, unknown>
  resposta?: Record<string, unknown> | null
  erro?: string | null
  latenciaCorretoraMs?: number | null
  /** 'reancorar' = ajuste do SL/TP à entrada REAL logo depois de abrir */
  sufixo?: 'reancorar'
}

/**
 * Ganchos do motor das mestres (lib/mestres). Sem ganchos, o motor da cópia comporta-se exactamente
 * como antes (os testes da cópia provam-no). Com eles:
 *  · `modo` substitui a fechadura da cópia (global/estratégia/conta/CopyFactory — lib/mestres/decisao);
 *  · `bloqueioAbertura` só impede ABRIR (pausa, exposição, atraso, duplicado entre caminhos, T2T sem
 *    aceite) — parciais, BE, trailing e fechos passam sempre;
 *  · `podeEscrever` é o kill-switch verificado imediatamente antes de cada escrita na corretora;
 *  · `registar` grava pedido, resposta e latência de cada ordem;
 *  · `reancorar` corrige SL/TP para os pips da mestre sobre o preço REAL de enchimento.
 */
export interface GanchosMotor {
  modo?(rota: RotaCopia, ev: EventoCopia): 'parado' | 'sombra' | 'live'
  bloqueioAbertura?(p: { rota: RotaCopia; ev: EventoCopia; acao: AcaoAbrir; ctx: ContextoDestino | null; modo: 'sombra' | 'live' }): Promise<{ motivo: string; gravarRecusa: boolean } | null>
  podeEscrever?(): boolean
  registar?(r: RegistoOrdemMotor): Promise<void>
  reancorar?: boolean
  /**
   * Uma posição que o motor ABRIU em live é gerida em live até fechar, mesmo que a estratégia/conta
   * tenha voltado a sombra ou sido desligada entretanto (senão ficava só com o SL da corretora). true =
   * o processo pode escrever agora (escrita ligada, motor ligado, sem kill).
   */
  gerirAbertasEmLive?(): boolean
  /** depois de uma abertura live bem sucedida (ex.: gravar a execução para o anti-duplicado entre caminhos) */
  aposAbrir?(p: { rota: RotaCopia; ev: EventoCopia; acao: AcaoAbrir; positionId: string | null; preco: number | null }): Promise<void>
}

export interface DecisaoEvento {
  resultado: ResultadoEvento
  acaoPretendida: AcaoDestino
  acaoReal?: Record<string, unknown> | null
  erro?: string | null
  /** true = erro transitório: repetir o evento mais tarde */
  repetir?: boolean
  modo: 'parado' | 'sombra' | 'live'
}

const nada = (motivo: string): AcaoDestino => ({ tipo: 'nada', motivo })
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function erroIncerto(msg: string): boolean {
  return /timeout|timed out|not connected|disconnected|econnreset|etimedout|socket|network|503|502|504|demorou/i.test(msg)
}

const KILL = 'kill-switch: escrita suspensa'

/** Kill-switch verificado imediatamente antes de uma escrita (sem ganchos = pode sempre). */
function podeEscrever(op: OpcoesMotor): boolean {
  return op.ganchos?.podeEscrever ? op.ganchos.podeEscrever() : true
}

async function registar(op: OpcoesMotor, r: RegistoOrdemMotor): Promise<void> {
  if (!op.ganchos?.registar) return
  try { await op.ganchos.registar(r) } catch (e) { op.log?.('[registo] falhou', e instanceof Error ? e.message : e) }
}

/** Escrita cronometrada: devolve o resultado e a latência da corretora. */
async function cronometrar<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t0 = Date.now()
  const v = await fn()
  return { v, ms: Date.now() - t0 }
}

export async function processarEventoCopia(
  ev: EventoCopia,
  rota: RotaCopia | null,
  loja: LojaCopia,
  escritor: EscritorDestino | null,
  op: OpcoesMotor,
): Promise<DecisaoEvento> {
  if (!rota) return { resultado: 'saltado', acaoPretendida: nada('rota apagada'), modo: 'parado' }
  let modo = op.ganchos?.modo ? op.ganchos.modo(rota, ev) : modoEfectivo(rota, op.interruptores)
  // Saídas de uma posição aberta EM LIVE continuam em live (ver GanchosMotor.gerirAbertasEmLive).
  const copiaViva = ev.tipo !== 'open' && modo !== 'live' && op.ganchos?.gerirAbertasEmLive?.()
    ? await loja.copia(rota.id, ev.origem_posicao_id).catch(() => null) : null
  if (copiaViva && (copiaViva.estado === 'aberta' || copiaViva.estado === 'enviando')) modo = 'live'
  if (modo === 'parado') return { resultado: 'saltado', acaoPretendida: nada('rota parada ou interruptor global desligado'), modo }
  try {
    const copia = copiaViva ?? await loja.copia(rota.id, ev.origem_posicao_id)
    if (ev.tipo === 'open') return await abrir(ev, rota, copia, loja, escritor, modo, op)
    if (!copia) return { resultado: 'saltado', acaoPretendida: nada('posição nunca copiada nesta rota'), modo }
    if (ev.tipo === 'modify') return await modificar(ev, rota, copia, loja, escritor, modo, op)
    if (ev.tipo === 'partial') return await parcial(ev, rota, copia, loja, escritor, modo, op)
    return await fechar(ev, rota, copia, loja, escritor, modo, op)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { resultado: 'erro', acaoPretendida: nada('erro'), erro: msg, repetir: erroIncerto(msg), modo }
  }
}

async function abrir(
  ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao | null, loja: LojaCopia, escritor: EscritorDestino | null,
  modo: 'sombra' | 'live', op: OpcoesMotor,
): Promise<DecisaoEvento> {
  const agora = (op.agora ?? Date.now)()
  const p = ev.payload
  const symbol = String(p.symbol ?? '')
  const direcao = p.direcao === 'sell' ? 'sell' : 'buy'
  const volumeOrigem = Number(p.volume ?? 0)

  // Já tratada? (reinício / segundo leitor)
  if (copia && copia.estado !== 'enviando') {
    return { resultado: 'saltado', acaoPretendida: nada(`já ${copia.estado}`), modo }
  }
  if (copia && copia.estado === 'enviando') {
    if (modo !== 'live' || !escritor) return { resultado: 'saltado', acaoPretendida: nada('envio pendente sem escrita activa'), modo }
    return recuperarEnvio(rota, copia, loja, escritor, agora, op)
  }

  const abertas = await loja.abertasNaRota(rota.id)
  const filtro = motivoFiltro(rota, { symbol, direcao }, abertas)
  if (filtro) {
    await loja.inserirCopia({ rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem, direcao, estado: 'recusada', erro: filtro })
    return { resultado: 'recusado', acaoPretendida: nada(filtro), modo }
  }

  // Leituras (permitidas em sombra). Uma leitura que falha em sombra não repete: regista-se.
  const lista = rota.destino_tipo === 'mtmfunded' ? null : escritor ? await escritor.simbolos().catch(() => null) : null
  const mapa = mapearSimbolo(symbol, rota.destino_tipo, rota.mapa_simbolos, lista)
  const simboloDestino = mapa.simbolo ?? (rota.destino_tipo === 'mtmfunded' ? mapa.canonico : null)
  if (!simboloDestino && lista) {
    const motivo = `${mapa.canonico} não existe no destino`
    await loja.inserirCopia({ rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem, direcao, estado: 'recusada', erro: motivo })
    return { resultado: 'recusado', acaoPretendida: nada(motivo), modo }
  }
  const ctx: ContextoDestino | null = escritor ? await escritor.contexto(simboloDestino ?? mapa.canonico, direcao).catch(() => null) : null
  if (!ctx && modo === 'live') return { resultado: 'erro', acaoPretendida: nada('contexto do destino indisponível'), erro: 'contexto do destino indisponível', repetir: true, modo }

  const lote = calcularLote({
    modo: rota.modo_lote, valor: Number(rota.valor), volumeOrigem,
    saldoOrigem: rota.modo_lote === 'proporcional_saldo' ? await loja.saldoOrigem(rota) : null,
    equityDestino: ctx?.equity ?? null, loteMax: rota.lote_max, regra: ctx?.regra ?? REGRA_POR_OMISSAO,
    distanciaSl: distanciaDoSl(direcao, num(p.preco), num(p.sl)), valorPorPrecoPorLote: ctx?.valorPorPrecoPorLote ?? null,
  })
  if (!lote.ok) {
    await loja.inserirCopia({ rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem, direcao, estado: 'recusada', erro: lote.motivo })
    return { resultado: 'recusado', acaoPretendida: nada(lote.motivo), modo }
  }
  const stops = stopsNoDestino({
    direcao, entradaOrigem: num(p.preco), slOrigem: num(p.sl), tpOrigem: num(p.tp),
    precoDestino: ctx ? precoDeReferencia(ctx, direcao) : null, digits: ctx?.digits ?? null,
    copiarSl: rota.copiar_sl, copiarTp: rota.copiar_tp,
  })
  const clientId = clientIdDaCopia(rota.id, ev.origem_posicao_id)
  // Símbolo: o mapa manual manda; senão o que o destino escolheu com as specs (salta DISABLED/CLOSEONLY).
  const simboloFinal = mapa.via === 'mapa' ? simboloDestino : ctx?.simbolo ?? simboloDestino
  const acao: AcaoAbrir = { tipo: 'abrir', simbolo: simboloFinal ?? mapa.canonico, direcao, volume: lote.volume, sl: stops.sl, tp: stops.tp, clientId }
  const pedido = { ...acao, precoReferencia: ctx ? precoDeReferencia(ctx, direcao) : null, entradaMestre: num(p.preco), slMestre: num(p.sl), tpMestre: num(p.tp), equity: ctx?.equity ?? null }

  // Guardas do motor das mestres: só impedem ABRIR (pausa, exposição, atraso, duplicado, T2T sem aceite).
  const bloqueio = op.ganchos?.bloqueioAbertura ? await op.ganchos.bloqueioAbertura({ rota, ev, acao, ctx, modo }) : null
  if (bloqueio) {
    if (bloqueio.gravarRecusa) {
      await loja.inserirCopia({ rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem, direcao, estado: 'recusada', erro: bloqueio.motivo })
      await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'bloqueado', pedido, erro: bloqueio.motivo })
      return { resultado: 'recusado', acaoPretendida: nada(bloqueio.motivo), modo }
    }
    return { resultado: 'saltado', acaoPretendida: nada(bloqueio.motivo), modo }
  }

  if (modo === 'sombra') {
    await loja.inserirCopia({
      rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem,
      volume_destino_abertura: lote.volume, destino_simbolo: acao.simbolo, direcao, estado: 'sombra', client_id: clientId,
      preco_origem: num(p.preco), preco_destino: ctx ? precoDeReferencia(ctx, direcao) : null,
      erro: ctx ? null : 'contexto do destino indisponível (sombra calculou com a regra de lote por omissão)',
    })
    await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'sombra', pedido })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }

  // ── live ──
  if (!podeEscrever(op)) return { resultado: 'erro', acaoPretendida: acao, erro: KILL, repetir: true, modo }
  const inserida = await loja.inserirCopia({
    rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem,
    volume_destino_abertura: lote.volume, destino_simbolo: acao.simbolo, direcao, estado: 'enviando', client_id: clientId,
    preco_origem: num(p.preco), enviado_em: new Date(agora).toISOString(),
  })
  if (!inserida) return { resultado: 'saltado', acaoPretendida: nada('outro processo já está a enviar'), modo }
  const gravada = await loja.copia(rota.id, ev.origem_posicao_id)
  await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'enviando', pedido })
  try {
    const { v: r, ms } = await cronometrar(() => escritor!.abrir({ simbolo: acao.simbolo, direcao, volume: lote.volume, sl: stops.sl, tp: stops.tp, clientId }))
    if (gravada) await loja.atualizarCopia(gravada.id, { estado: 'aberta', destino_posicao_id: r.positionId, destino_simbolo: r.simbolo ?? acao.simbolo, preco_destino: r.preco ?? null })
    await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'ok', pedido, resposta: { positionId: r.positionId, simbolo: r.simbolo, preco: r.preco ?? null }, latenciaCorretoraMs: ms })
    if (op.ganchos?.aposAbrir) await op.ganchos.aposAbrir({ rota, ev, acao, positionId: r.positionId, preco: r.preco ?? null }).catch(() => undefined)
    if (op.ganchos?.reancorar && r.positionId && r.preco != null) {
      await reancorarNaEntradaReal(ev, rota, acao, ctx, r.positionId, r.preco, escritor!, op)
    }
    return { resultado: 'ok', acaoPretendida: acao, acaoReal: { positionId: r.positionId, simbolo: r.simbolo, preco: r.preco ?? null, latenciaMs: ms }, modo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (erroIncerto(msg)) {
      await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'erro', pedido, erro: `incerto (a confirmar pelo clientId): ${msg}` })
      return { resultado: 'erro', acaoPretendida: acao, erro: msg, repetir: true, modo }
    }
    if (gravada) await loja.atualizarCopia(gravada.id, { estado: 'recusada', erro: msg.slice(0, 500) })
    await registar(op, { rota, ev, tipo: 'abrir', modo, estado: 'recusado', pedido, erro: msg })
    return { resultado: 'recusado', acaoPretendida: acao, erro: msg, modo }
  }
}

/**
 * Os stops foram calculados sobre a cotação ANTES da ordem; a corretora encheu a outro preço. Volta a
 * pô-los aos mesmos pips da mestre sobre o preço REAL (lib/mestres/pips). Uma falha aqui não desfaz a
 * abertura: o stop enviado continua na posição e fica registado o erro.
 */
async function reancorarNaEntradaReal(
  ev: EventoCopia, rota: RotaCopia, acao: AcaoAbrir, ctx: ContextoDestino | null, positionId: string, preco: number,
  escritor: EscritorDestino, op: OpcoesMotor,
): Promise<void> {
  const p = ev.payload
  const novo = reancorar({
    direcao: acao.direcao, symbol: acao.simbolo, digits: ctx?.digits ?? digitosSeguros(acao.simbolo),
    entradaMestre: num(p.preco), slMestre: num(p.sl), tpMestre: num(p.tp),
    entradaReal: preco, slEnviado: acao.sl, tpEnviado: acao.tp, copiarSl: rota.copiar_sl, copiarTp: rota.copiar_tp,
  })
  if (!novo) return
  const pedido = { positionId, sl: novo.sl, tp: novo.tp, slPips: novo.slPips, tpPips: novo.tpPips, entradaReal: preco }
  if (!podeEscrever(op)) {
    await registar(op, { rota, ev, tipo: 'modificar', modo: 'live', estado: 'erro', pedido, erro: KILL, sufixo: 'reancorar' })
    return
  }
  try {
    const { ms } = await cronometrar(() => escritor.modificar(positionId, novo.sl, novo.tp))
    await registar(op, { rota, ev, tipo: 'modificar', modo: 'live', estado: 'ok', pedido, latenciaCorretoraMs: ms, sufixo: 'reancorar' })
  } catch (e) {
    await registar(op, { rota, ev, tipo: 'modificar', modo: 'live', estado: 'erro', pedido, erro: e instanceof Error ? e.message : String(e), sufixo: 'reancorar' })
  }
}

async function recuperarEnvio(
  rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino, agora: number, op: OpcoesMotor,
): Promise<DecisaoEvento> {
  const posicoes = await escritor.posicoes()
  if (posicoes == null) return { resultado: 'erro', acaoPretendida: nada('a confirmar envio'), erro: 'destino ilegível', repetir: true, modo: 'live' }
  const achada = copia.client_id ? posicoes.find((x) => x.clientId === copia.client_id) : undefined
  if (achada) {
    await loja.atualizarCopia(copia.id, { estado: 'aberta', destino_posicao_id: achada.id, destino_simbolo: achada.symbol })
    return { resultado: 'ok', acaoPretendida: nada('envio confirmado após reinício'), acaoReal: { positionId: achada.id }, modo: 'live' }
  }
  const enviado = copia.enviado_em
  const passou = enviado ? agora - Date.parse(enviado) : Infinity
  if (passou < (op.esperaIncertaMs ?? 60_000)) return { resultado: 'erro', acaoPretendida: nada('a confirmar envio'), erro: 'envio por confirmar', repetir: true, modo: 'live' }
  await loja.atualizarCopia(copia.id, { estado: 'erro', erro: 'ordem não encontrada no destino — não se reenvia' })
  return { resultado: 'erro', acaoPretendida: nada('ordem não encontrada — não se reenvia'), erro: 'ordem não encontrada no destino', modo: 'live' }
}

async function modificar(ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live', op: OpcoesMotor): Promise<DecisaoEvento> {
  void loja
  if (!rota.copiar_modificacoes) return { resultado: 'saltado', acaoPretendida: nada('rota não copia modificações'), modo }
  if (!['sombra', 'aberta', 'enviando'].includes(copia.estado)) return { resultado: 'saltado', acaoPretendida: nada(`cópia ${copia.estado}`), modo }
  if (copia.estado === 'enviando') return { resultado: 'erro', acaoPretendida: nada('abertura por confirmar'), erro: 'abertura por confirmar', repetir: true, modo }
  const p = ev.payload
  const direcao = (copia.direcao ?? (p.direcao === 'sell' ? 'sell' : 'buy')) as Direcao
  // Distâncias da mestre (entrada → SL/TP) aplicadas à entrada REAL do destino (preco_destino).
  const stops = stopsNoDestino({
    direcao, entradaOrigem: num(p.preco) ?? copia.preco_origem, slOrigem: num(p.sl), tpOrigem: num(p.tp),
    precoDestino: copia.preco_destino, digits: copia.destino_simbolo ? digitosSeguros(copia.destino_simbolo) : null,
    copiarSl: rota.copiar_sl, copiarTp: rota.copiar_tp, permitirSlNoLucro: true,
  })
  const acao: AcaoDestino = { tipo: 'modificar', posicao: copia.destino_posicao_id, sl: stops.sl, tp: stops.tp }
  if (stops.sl == null && stops.tp == null) return { resultado: 'saltado', acaoPretendida: nada('sem SL/TP a copiar'), modo }
  const pedido = { ...acao, entradaMestre: num(p.preco), slMestre: num(p.sl), tpMestre: num(p.tp), entradaReal: copia.preco_destino }
  if (modo === 'sombra' || copia.estado === 'sombra') {
    await registar(op, { rota, ev, tipo: 'modificar', modo: 'sombra', estado: 'sombra', pedido })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }
  if (!copia.destino_posicao_id) return { resultado: 'saltado', acaoPretendida: nada('cópia sem posição no destino'), modo }
  if (!podeEscrever(op)) return { resultado: 'erro', acaoPretendida: acao, erro: KILL, repetir: true, modo }
  try {
    const { ms } = await cronometrar(() => escritor!.modificar(copia.destino_posicao_id!, stops.sl, stops.tp))
    await registar(op, { rota, ev, tipo: 'modificar', modo, estado: 'ok', pedido, latenciaCorretoraMs: ms })
    return { resultado: 'ok', acaoPretendida: acao, acaoReal: { sl: stops.sl, tp: stops.tp, latenciaMs: ms }, modo }
  } catch (e) {
    await registar(op, { rota, ev, tipo: 'modificar', modo, estado: 'erro', pedido, erro: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

async function parcial(ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live', op: OpcoesMotor): Promise<DecisaoEvento> {
  if (!rota.copiar_parciais) return { resultado: 'saltado', acaoPretendida: nada('rota não copia parciais'), modo }
  if (copia.estado === 'enviando') return { resultado: 'erro', acaoPretendida: nada('abertura por confirmar'), erro: 'abertura por confirmar', repetir: true, modo }
  if (copia.estado !== 'sombra' && copia.estado !== 'aberta') return { resultado: 'saltado', acaoPretendida: nada(`cópia ${copia.estado}`), modo }
  const pct = pctDoEvento(ev.payload)
  const abertura = Number(copia.volume_destino_abertura ?? 0)
  const sombra = modo === 'sombra' || copia.estado === 'sombra'

  let aberto: number
  if (sombra) {
    aberto = abertura * (1 - copia.fechado_pct)
  } else {
    if (!copia.destino_posicao_id) return { resultado: 'saltado', acaoPretendida: nada('cópia sem posição no destino'), modo }
    const posicoes = await escritor!.posicoes()
    if (posicoes == null) return { resultado: 'erro', acaoPretendida: nada('destino ilegível'), erro: 'destino ilegível', repetir: true, modo }
    const pos = posicoes.find((x) => x.id === copia.destino_posicao_id)
    if (!pos) {
      await loja.atualizarCopia(copia.id, { estado: 'fechada' })
      return { resultado: 'saltado', acaoPretendida: nada('posição já não existe no destino'), modo }
    }
    aberto = pos.volume
  }
  const ctx = !sombra && escritor && copia.destino_simbolo ? await escritor.contexto(copia.destino_simbolo, copia.direcao ?? 'buy').catch(() => null) : null
  const plano = planoParcial({ volumeDestinoAbertura: abertura, fechadoPctAntes: copia.fechado_pct, pct, volumeAbertoDestino: aberto, regra: ctx?.regra ?? REGRA_POR_OMISSAO })

  if (plano.tipo === 'nada') {
    await loja.atualizarCopia(copia.id, { fechado_pct: plano.fechadoPct })
    return { resultado: sombra ? 'sombra' : 'saltado', acaoPretendida: nada(plano.motivo), modo }
  }
  const acao: AcaoDestino = plano.tipo === 'total'
    ? { tipo: 'fechar', posicao: copia.destino_posicao_id }
    : { tipo: 'fechar_parcial', posicao: copia.destino_posicao_id, volume: plano.volume, fechadoPct: plano.fechadoPct }
  const pedido = { ...acao, pctDaMestre: pct, volumeAbertoDestino: aberto }
  if (sombra) {
    await loja.atualizarCopia(copia.id, { fechado_pct: plano.fechadoPct, ...(plano.tipo === 'total' ? { estado: 'fechada' as const } : {}) })
    await registar(op, { rota, ev, tipo: 'parcial', modo: 'sombra', estado: 'sombra', pedido })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }
  if (!podeEscrever(op)) return { resultado: 'erro', acaoPretendida: acao, erro: KILL, repetir: true, modo }
  try {
    const { ms } = await cronometrar(() => escritor!.fechar(copia.destino_posicao_id!, plano.tipo === 'total' ? null : plano.volume))
    await loja.atualizarCopia(copia.id, { fechado_pct: plano.fechadoPct, ...(plano.tipo === 'total' ? { estado: 'fechada' as const } : {}) })
    await registar(op, { rota, ev, tipo: 'parcial', modo, estado: 'ok', pedido, latenciaCorretoraMs: ms })
    return { resultado: 'ok', acaoPretendida: acao, acaoReal: { fechado: plano.tipo === 'total' ? 'tudo' : plano.volume, latenciaMs: ms }, modo }
  } catch (e) {
    await registar(op, { rota, ev, tipo: 'parcial', modo, estado: 'erro', pedido, erro: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

async function fechar(ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live', op: OpcoesMotor): Promise<DecisaoEvento> {
  if (!rota.fechar_com_origem) return { resultado: 'saltado', acaoPretendida: nada('rota não fecha com a origem'), modo }
  if (copia.estado === 'enviando') return { resultado: 'erro', acaoPretendida: nada('abertura por confirmar'), erro: 'abertura por confirmar', repetir: true, modo }
  if (copia.estado !== 'sombra' && copia.estado !== 'aberta') return { resultado: 'saltado', acaoPretendida: nada(`cópia ${copia.estado}`), modo }
  const acao: AcaoDestino = { tipo: 'fechar', posicao: copia.destino_posicao_id }
  const pedido = { ...acao, motivoMestre: ev.payload.motivo ?? null }
  if (modo === 'sombra' || copia.estado === 'sombra') {
    await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1 })
    await registar(op, { rota, ev, tipo: 'fechar', modo: 'sombra', estado: 'sombra', pedido })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }
  if (!copia.destino_posicao_id) return { resultado: 'saltado', acaoPretendida: nada('cópia sem posição no destino'), modo }
  if (!podeEscrever(op)) return { resultado: 'erro', acaoPretendida: acao, erro: KILL, repetir: true, modo }
  try {
    const { ms } = await cronometrar(() => escritor!.fechar(copia.destino_posicao_id!, null))
    await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1 })
    await registar(op, { rota, ev, tipo: 'fechar', modo, estado: 'ok', pedido, latenciaCorretoraMs: ms })
    return { resultado: 'ok', acaoPretendida: acao, acaoReal: { fechado: 'tudo', latenciaMs: ms }, modo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A posição já fechou no destino (SL/TP dele, fecho manual): não é erro — confirma-se e segue.
    if (op.ganchos && !erroIncerto(msg)) {
      const posicoes = await escritor!.posicoes()
      if (posicoes != null && !posicoes.some((x) => x.id === copia.destino_posicao_id)) {
        await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1 })
        await registar(op, { rota, ev, tipo: 'fechar', modo, estado: 'ok', pedido, resposta: { jaFechada: true }, erro: msg })
        return { resultado: 'saltado', acaoPretendida: nada('posição já fechada no destino'), modo }
      }
    }
    await registar(op, { rota, ev, tipo: 'fechar', modo, estado: 'erro', pedido, erro: msg })
    throw e
  }
}

/** Latência do evento em ms (origem viu → motor decidiu). */
export function latenciaMs(ev: Pick<EventoCopia, 'origem_em' | 'criado_em'>, agora: number): number | null {
  const base = Date.parse(ev.origem_em ?? ev.criado_em)
  return Number.isFinite(base) ? Math.max(0, Math.round(agora - base)) : null
}

export { chaveEvento }
