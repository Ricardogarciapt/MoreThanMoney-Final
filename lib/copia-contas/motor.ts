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

export async function processarEventoCopia(
  ev: EventoCopia,
  rota: RotaCopia | null,
  loja: LojaCopia,
  escritor: EscritorDestino | null,
  op: OpcoesMotor,
): Promise<DecisaoEvento> {
  if (!rota) return { resultado: 'saltado', acaoPretendida: nada('rota apagada'), modo: 'parado' }
  const modo = modoEfectivo(rota, op.interruptores)
  if (modo === 'parado') return { resultado: 'saltado', acaoPretendida: nada('rota parada ou interruptor global desligado'), modo }
  try {
    const copia = await loja.copia(rota.id, ev.origem_posicao_id)
    if (ev.tipo === 'open') return await abrir(ev, rota, copia, loja, escritor, modo, op)
    if (!copia) return { resultado: 'saltado', acaoPretendida: nada('posição nunca copiada nesta rota'), modo }
    if (ev.tipo === 'modify') return await modificar(ev, rota, copia, loja, escritor, modo)
    if (ev.tipo === 'partial') return await parcial(ev, rota, copia, loja, escritor, modo)
    return await fechar(rota, copia, loja, escritor, modo)
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
  const acao: AcaoDestino = { tipo: 'abrir', simbolo: simboloDestino ?? ctx?.simbolo ?? mapa.canonico, direcao, volume: lote.volume, sl: stops.sl, tp: stops.tp, clientId }

  if (modo === 'sombra') {
    await loja.inserirCopia({
      rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem,
      volume_destino_abertura: lote.volume, destino_simbolo: acao.simbolo, direcao, estado: 'sombra', client_id: clientId,
      preco_origem: num(p.preco), preco_destino: ctx ? precoDeReferencia(ctx, direcao) : null,
      erro: ctx ? null : 'contexto do destino indisponível (sombra calculou com a regra de lote por omissão)',
    })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }

  // ── live ──
  const inserida = await loja.inserirCopia({
    rota_id: rota.id, origem_posicao_id: ev.origem_posicao_id, volume_origem_abertura: volumeOrigem,
    volume_destino_abertura: lote.volume, destino_simbolo: acao.simbolo, direcao, estado: 'enviando', client_id: clientId,
    preco_origem: num(p.preco), enviado_em: new Date(agora).toISOString(),
  })
  if (!inserida) return { resultado: 'saltado', acaoPretendida: nada('outro processo já está a enviar'), modo }
  const gravada = await loja.copia(rota.id, ev.origem_posicao_id)
  try {
    const r = await escritor!.abrir({ simbolo: acao.simbolo, direcao, volume: lote.volume, sl: stops.sl, tp: stops.tp, clientId })
    if (gravada) await loja.atualizarCopia(gravada.id, { estado: 'aberta', destino_posicao_id: r.positionId, destino_simbolo: r.simbolo ?? acao.simbolo, preco_destino: r.preco ?? null })
    return { resultado: 'ok', acaoPretendida: acao, acaoReal: { positionId: r.positionId, simbolo: r.simbolo, preco: r.preco ?? null }, modo }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (erroIncerto(msg)) return { resultado: 'erro', acaoPretendida: acao, erro: msg, repetir: true, modo }
    if (gravada) await loja.atualizarCopia(gravada.id, { estado: 'recusada', erro: msg.slice(0, 500) })
    return { resultado: 'recusado', acaoPretendida: acao, erro: msg, modo }
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

async function modificar(ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live'): Promise<DecisaoEvento> {
  if (!rota.copiar_modificacoes) return { resultado: 'saltado', acaoPretendida: nada('rota não copia modificações'), modo }
  if (!['sombra', 'aberta', 'enviando'].includes(copia.estado)) return { resultado: 'saltado', acaoPretendida: nada(`cópia ${copia.estado}`), modo }
  if (copia.estado === 'enviando') return { resultado: 'erro', acaoPretendida: nada('abertura por confirmar'), erro: 'abertura por confirmar', repetir: true, modo }
  const p = ev.payload
  const direcao = (copia.direcao ?? (p.direcao === 'sell' ? 'sell' : 'buy')) as Direcao
  const stops = stopsNoDestino({
    direcao, entradaOrigem: num(p.preco) ?? copia.preco_origem, slOrigem: num(p.sl), tpOrigem: num(p.tp),
    precoDestino: copia.preco_destino, digits: null, copiarSl: rota.copiar_sl, copiarTp: rota.copiar_tp,
  })
  const acao: AcaoDestino = { tipo: 'modificar', posicao: copia.destino_posicao_id, sl: stops.sl, tp: stops.tp }
  if (stops.sl == null && stops.tp == null) return { resultado: 'saltado', acaoPretendida: nada('sem SL/TP a copiar'), modo }
  if (modo === 'sombra' || copia.estado === 'sombra') return { resultado: 'sombra', acaoPretendida: acao, modo }
  if (!copia.destino_posicao_id) return { resultado: 'saltado', acaoPretendida: nada('cópia sem posição no destino'), modo }
  await escritor!.modificar(copia.destino_posicao_id, stops.sl, stops.tp)
  return { resultado: 'ok', acaoPretendida: acao, acaoReal: { sl: stops.sl, tp: stops.tp }, modo }
}

async function parcial(ev: EventoCopia, rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live'): Promise<DecisaoEvento> {
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
  if (sombra) {
    await loja.atualizarCopia(copia.id, { fechado_pct: plano.fechadoPct, ...(plano.tipo === 'total' ? { estado: 'fechada' as const } : {}) })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }
  await escritor!.fechar(copia.destino_posicao_id!, plano.tipo === 'total' ? null : plano.volume)
  await loja.atualizarCopia(copia.id, { fechado_pct: plano.fechadoPct, ...(plano.tipo === 'total' ? { estado: 'fechada' as const } : {}) })
  return { resultado: 'ok', acaoPretendida: acao, acaoReal: { fechado: plano.tipo === 'total' ? 'tudo' : plano.volume }, modo }
}

async function fechar(rota: RotaCopia, copia: CopiaPosicao, loja: LojaCopia, escritor: EscritorDestino | null, modo: 'sombra' | 'live'): Promise<DecisaoEvento> {
  if (!rota.fechar_com_origem) return { resultado: 'saltado', acaoPretendida: nada('rota não fecha com a origem'), modo }
  if (copia.estado === 'enviando') return { resultado: 'erro', acaoPretendida: nada('abertura por confirmar'), erro: 'abertura por confirmar', repetir: true, modo }
  if (copia.estado !== 'sombra' && copia.estado !== 'aberta') return { resultado: 'saltado', acaoPretendida: nada(`cópia ${copia.estado}`), modo }
  const acao: AcaoDestino = { tipo: 'fechar', posicao: copia.destino_posicao_id }
  if (modo === 'sombra' || copia.estado === 'sombra') {
    await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1 })
    return { resultado: 'sombra', acaoPretendida: acao, modo }
  }
  if (!copia.destino_posicao_id) return { resultado: 'saltado', acaoPretendida: nada('cópia sem posição no destino'), modo }
  await escritor!.fechar(copia.destino_posicao_id, null)
  await loja.atualizarCopia(copia.id, { estado: 'fechada', fechado_pct: 1 })
  return { resultado: 'ok', acaoPretendida: acao, acaoReal: { fechado: 'tudo' }, modo }
}

/** Latência do evento em ms (origem viu → motor decidiu). */
export function latenciaMs(ev: Pick<EventoCopia, 'origem_em' | 'criado_em'>, agora: number): number | null {
  const base = Date.parse(ev.origem_em ?? ev.criado_em)
  return Number.isFinite(base) ? Math.max(0, Math.round(agora - base)) : null
}

export { chaveEvento }
