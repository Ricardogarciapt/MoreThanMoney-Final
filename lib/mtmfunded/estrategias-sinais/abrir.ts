/**
 * ABRIR / FECHAR UM SINAL NUMA CONTA SIMULADA — o cano partilhado pelas estratégias por sinais
 * (./executar.ts) e pela conta «Todos os sinais» (./todos-os-sinais.ts).
 *
 * Tudo pelas funções do site que já usam as operações atómicas (lib/mtmfunded/simulado/execucao.ts:
 * abrirPosicao → insert + funded_somar_saldo; fecharPosicao → funded_fechar_posicao). A gestão
 * (parciais, break-even, trailing) fica gravada na posição (072) e é o MOTOR do VPS que a executa a
 * cada preço — nada aqui corre por tick.
 *
 * NUNCA DUPLICAR: a ponte `funded_sinal_posicoes` (092) é gravada ANTES da posição, com
 * unique (conta, chave) e unique (conta, impressão do trade) enquanto viva. Dois pedidos paralelos
 * (o relay a reenviar um ENTRY HIT com timeout, o mesmo trade por duas fontes) → só um abre.
 *
 * Nunca lança: devolve o resultado por conta.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  aplicarLoteMinimo, decidirDuplicado, gestaoDoSinal, loteParaConta, niveisAncorados,
  type ConfigSinais, type PonteAberta,
} from './calculo'
import type { Direcao } from '../simulado/matematica'

export interface PedidoAbrir {
  accountId: string
  estrategia: string
  chave: string
  impressao: string | null
  fonte: string
  comentario: string
  chatMessageId?: string | null
  symbol: string
  direcao: Direcao
  entrada: number | null
  sl: number | null
  tps: number[]
  cfg: ConfigSinais
  /** lote fixo (conta «Todos os sinais»: 0,01); sem isto, por saldo */
  loteFixo?: number | null
  /** lote MÍNIMO por conta (mtm_trading_accounts.lote_minimo, 197): o lote por saldo nunca fica abaixo disto */
  loteMinimo?: number | null
}

export interface ResultadoAbrir {
  accountId: string
  ok: boolean
  estado: 'aberta' | 'duplicado' | 'recusada' | 'erro'
  positionId?: string
  volume?: number
  semGestao?: boolean
  motivo?: string
}

const VIVAS = ['a_abrir', 'aberta']

async function juntarFonteExtra(accountId: string, chaveOriginal: string, fonte: string) {
  const db = getSupabaseAdmin()
  const { data } = await db.from('funded_sinal_posicoes').select('id, fonte, fontes_extra')
    .eq('account_id', accountId).eq('chave', chaveOriginal).maybeSingle()
  if (!data) return
  const extra = new Set<string>((data.fontes_extra as string[] | null) ?? [])
  if (fonte === data.fonte || extra.has(fonte)) return
  extra.add(fonte)
  await db.from('funded_sinal_posicoes').update({ fontes_extra: [...extra], updated_at: new Date().toISOString() }).eq('id', data.id)
}

/**
 * Pontes «vivas» cuja posição já fechou (SL, TP, trailing, fecho à mão) passam a fechadas; uma
 * «a_abrir» com mais de 5 minutos é um pedido que morreu a meio (a posição nunca nasceu).
 */
async function arrumarPontes(accountId: string) {
  const db = getSupabaseAdmin()
  const { data } = await db.from('funded_sinal_posicoes').select('id, estado, funded_position_id, created_at')
    .eq('account_id', accountId).in('estado', VIVAS).limit(200)
  const linhas = data ?? []
  const agora = new Date().toISOString()
  const mortas = linhas.filter((l) => l.estado === 'a_abrir' && !l.funded_position_id && Date.now() - Date.parse(String(l.created_at)) > 5 * 60_000).map((l) => l.id)
  if (mortas.length) await db.from('funded_sinal_posicoes').update({ estado: 'recusada', erro: 'pedido interrompido', updated_at: agora }).in('id', mortas)
  const ids = linhas.filter((l) => l.funded_position_id).map((l) => String(l.funded_position_id))
  if (!ids.length) return
  const { data: abertas } = await db.from('funded_positions').select('id').in('id', ids).eq('estado', 'aberta')
  const vivas = new Set((abertas ?? []).map((x) => String(x.id)))
  const fechadas = linhas.filter((l) => l.funded_position_id && !vivas.has(String(l.funded_position_id))).map((l) => l.id)
  if (fechadas.length) await db.from('funded_sinal_posicoes').update({ estado: 'fechada', updated_at: agora }).in('id', fechadas)
}

/** Erros de gestão que não impedem a trade: abre-se com SL/TP e fica marcada `sem_gestao`. */
const ERRO_DE_GESTAO = /072|trailing|break-even|TP\d|take-profit|gatilho|offset/i

export async function abrirSinalNaConta(p: PedidoAbrir): Promise<ResultadoAbrir> {
  const db = getSupabaseAdmin()
  const base = { accountId: p.accountId }
  let ponteId: string | null = null
  try {
    // 1. duplicado? (antes, arrumar as pontes cujas posições o motor já fechou)
    await arrumarPontes(p.accountId)
    const { data: vivas } = await db.from('funded_sinal_posicoes')
      .select('chave, impressao, symbol, direcao, entrada, fonte, created_at')
      .eq('account_id', p.accountId).in('estado', VIVAS).limit(200)
    const abertas: PonteAberta[] = (vivas ?? []).map((v) => ({
      chave: String(v.chave), impressao: (v.impressao as string) ?? null, symbol: String(v.symbol),
      direcao: v.direcao as Direcao, entrada: v.entrada == null ? null : Number(v.entrada),
      fonte: String(v.fonte), criadaEm: Date.parse(String(v.created_at)),
    }))
    const dup = decidirDuplicado({ chave: p.chave, impressao: p.impressao, symbol: p.symbol, direcao: p.direcao, entrada: p.entrada }, abertas, p.cfg.permitirDuplicado)
    if (!dup.abrir) {
      if (dup.motivo === 'mesmo_trade') await juntarFonteExtra(p.accountId, dup.chaveOriginal, p.fonte)
      return { ...base, ok: false, estado: 'duplicado', motivo: dup.motivo }
    }

    // 2. a ponte ANTES da posição
    const { data: ponte, error: ePonte } = await db.from('funded_sinal_posicoes').insert({
      account_id: p.accountId, estrategia: p.estrategia, chave: p.chave,
      impressao: p.cfg.permitirDuplicado ? null : p.impressao, fonte: p.fonte,
      chat_message_id: p.chatMessageId ?? null, symbol: p.symbol, direcao: p.direcao,
      entrada: p.entrada, sl: p.sl, tps: p.tps, estado: 'a_abrir',
    }).select('id').single()
    if (ePonte || !ponte) {
      if (ePonte?.code === '23505') {
        // perdeu a corrida para outro pedido com a mesma chave/trade
        const { data: outra } = await db.from('funded_sinal_posicoes').select('chave')
          .eq('account_id', p.accountId).eq('impressao', p.impressao ?? '').in('estado', VIVAS).maybeSingle()
        if (outra && outra.chave !== p.chave) await juntarFonteExtra(p.accountId, String(outra.chave), p.fonte)
        return { ...base, ok: false, estado: 'duplicado', motivo: 'corrida' }
      }
      return { ...base, ok: false, estado: 'erro', motivo: ePonte?.message ?? 'ponte sem linha' }
    }
    ponteId = String(ponte.id)

    // 3. conta, símbolo e preço
    const ex = await import('../simulado/execucao')
    const { candidatosDeTicker, precoFresco } = await import('../simulado/ordens')
    const { precoDePreenchimento } = await import('../precos/preenchimento')
    const conta = await ex.lerConta(p.accountId)
    if (!conta || conta.motor !== 'sim' || conta.estado !== 'ativa') throw new Error('conta simulada inactiva ou inexistente')
    const candidatos = candidatosDeTicker(p.symbol)
    const simbolos = await ex.carregarSimbolos(candidatos)
    const symbol = candidatos.find((c) => simbolos[c])
    if (!symbol) throw new Error(`${p.symbol} não existe no MTM Funded`)
    const s = simbolos[symbol]
    // O tick vem do motor (memória, ~100 ms) e não do retrato da base (até 5 s) — é aqui que a
    // entrada é ancorada, e um preço de 3-4 s cai sempre do lado bom da casa. Ver
    // ../precos/tick-motor.ts; o motor em baixo devolve o retrato e nada disto muda.
    const { precos, em, emMercado } = await ex.carregarPrecos([symbol], [symbol])
    const px = precos[symbol]
    if (!px || !precoFresco(em[symbol])) throw new Error(`sem preço ao vivo para ${symbol}`)
    // O preço do sinal é o do mercado no instante da decisão: com ele, o preenchimento nunca pode
    // ser melhor do que o mercado ofereceu (../precos/preenchimento). `abrirPosicao` aplica a
    // mesma regra ao preço com que abre de facto — aqui é só para ancorar SL e TPs no mesmo sítio.
    const referencia = p.entrada != null && p.entrada > 0 ? p.entrada : null
    const fill = precoDePreenchimento({
      direcao: p.direcao,
      // Com a hora do MERCADO provada (migração 123), o tick vale sozinho; sem ela, caminho
      // pessimista — o mesmo que `abrirPosicao` aplica ao preço com que a trade abre de facto.
      tick: {
        bid: px.bid, ask: px.ask, em: Date.parse(em[symbol]),
        emMercado: emMercado[symbol] ? Date.parse(emMercado[symbol]!) : null,
      },
      referencia: referencia == null ? null : { preco: referencia }, digits: s.digits,
    })
    if (!fill.ok) throw new Error(`${symbol}: ${fill.erro}`)
    const precoExec = fill.preco

    // 4. lote, níveis ao nosso preço e gestão
    const volumeBase = p.loteFixo && p.loteFixo > 0
      ? Math.max(s.volume_min, Math.round(p.loteFixo / s.volume_step) * s.volume_step)
      : loteParaConta(Number(conta.sim_saldo ?? conta.saldo_inicial ?? 0), p.cfg, s)
    const volume = aplicarLoteMinimo(volumeBase, p.loteMinimo, s)
    const niveis = niveisAncorados({ direcao: p.direcao, entrada: p.entrada, sl: p.sl, tps: p.tps }, precoExec, s.digits)
    const { gestao, tpFinal } = gestaoDoSinal({ simbolo: s, direcao: p.direcao, precoExecucao: precoExec, volume, sl: niveis.sl, tps: niveis.tps, cfg: p.cfg })

    const entrada = { symbol, direcao: p.direcao, volume, sl: niveis.sl, tp: tpFinal, ideiaRef: `sinal:${p.chave}`, comentario: p.comentario, referencia }
    let semGestao = false
    let aberta: { posicao: Record<string, unknown> }
    try {
      aberta = await ex.abrirPosicao(conta, { ...entrada, gestao })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!(e instanceof ex.ErroOrdem) || !ERRO_DE_GESTAO.test(msg)) throw e
      // Sem a 072 (ou um nível da gestão que o preço já passou): a trade abre com SL/TP e fica a medir.
      semGestao = true
      aberta = await ex.abrirPosicao(conta, entrada)
    }
    const positionId = String((aberta.posicao as { id?: string }).id ?? '')
    // `estrategia` não entra pela porta dos pedidos externos (origemValida) — marca-se aqui.
    await db.from('funded_positions').update({ origem: 'estrategia' }).eq('id', positionId)
    await db.from('funded_sinal_posicoes').update({
      estado: 'aberta', funded_position_id: positionId, volume, symbol, sem_gestao: semGestao,
      sl: niveis.sl, tps: niveis.tps, updated_at: new Date().toISOString(),
    }).eq('id', ponteId)
    return { ...base, ok: true, estado: 'aberta', positionId, volume, semGestao }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (ponteId) {
      await db.from('funded_sinal_posicoes').update({ estado: 'recusada', erro: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', ponteId)
    }
    return { ...base, ok: false, estado: 'recusada', motivo: msg }
  }
}

export interface PonteViva {
  id: string
  account_id: string
  funded_position_id: string | null
  estado: string
}

/**
 * Fecha (ou move para break-even) as posições de um conjunto de pontes. Uma posição que o motor já
 * fechou (SL/TP/trailing) só marca a ponte como fechada.
 */
export async function aplicarNasPontes(pontes: PonteViva[], accao: 'fechar' | 'cancelar' | 'break_even'): Promise<{ fechadas: number; be: number; erros: string[] }> {
  const db = getSupabaseAdmin()
  const ex = await import('../simulado/execucao')
  const out = { fechadas: 0, be: 0, erros: [] as string[] }
  for (const pt of pontes) {
    try {
      const { data: pos } = pt.funded_position_id
        ? await db.from('funded_positions').select('id, estado, preco_entrada, sl, tp, direcao').eq('id', pt.funded_position_id).maybeSingle()
        : { data: null }
      if (!pos || pos.estado !== 'aberta') {
        if (accao !== 'break_even') {
          await db.from('funded_sinal_posicoes').update({ estado: pt.estado === 'a_abrir' ? 'cancelada' : 'fechada', updated_at: new Date().toISOString() }).eq('id', pt.id)
        }
        continue
      }
      const conta = await ex.lerConta(pt.account_id)
      if (!conta) continue
      if (accao === 'break_even') {
        const entrada = Number(pos.preco_entrada)
        const sl = pos.sl == null ? null : Number(pos.sl)
        const compra = pos.direcao === 'buy'
        // só aperta
        if (sl != null && (compra ? sl >= entrada : sl <= entrada)) continue
        try {
          await ex.modificarPosicao(conta, String(pos.id), entrada, pos.tp)
          out.be++
        } catch (e) {
          // do lado errado do preço (a trade está a perder): o BE do canal não se aplica aqui.
          out.erros.push(e instanceof Error ? e.message : String(e))
        }
        continue
      }
      await ex.fecharPosicao(conta, String(pos.id), null, 'estrategia')
      await db.from('funded_sinal_posicoes').update({ estado: 'fechada', updated_at: new Date().toISOString() }).eq('id', pt.id)
      out.fechadas++
    } catch (e) {
      out.erros.push(e instanceof Error ? e.message : String(e))
    }
  }
  return out
}
