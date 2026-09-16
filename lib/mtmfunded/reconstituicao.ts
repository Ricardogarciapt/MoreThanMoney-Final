/**
 * RECONSTITUIÇÃO DE HISTÓRICO — o que UMA conta simulada que segue uma estratégia TERIA feito a um
 * sinal, replicado vela a vela sobre preços GRAVADOS (M1 da MetaApi). Puro: sem base de dados, sem
 * rede; os canos estão em scripts/reconstituir-sinais.ts.
 *
 * PORQUÊ: a 15/09 as contas seguidoras não abriram os sinais (o espelho depende das contas mestre
 * MetaApi, que ficaram paradas). O dono pediu o histórico reconstituído — mas isto NÃO é um
 * preenchimento real:
 *
 *   ⚠️  Uma posição reconstituída NUNCA é prova auditada. Leva sempre o comentário a começar por
 *       «RECONST · », `ideia_ref` a começar por `recon:` e `tick_entrada.reconstituido = true`, e
 *       a interface mostra o crachá «histórico reconstituído». Nada disto vai para marketing nem
 *       para números de prova (ver memória proof-pips-not-euros / medicao-trades-vs-ideias).
 *
 * REGRAS DA REPLICAÇÃO (nunca o melhor caso):
 *  1. Preço de entrada = FECHO da vela M1 do minuto em que o sinal encheu a entrada (`entry_hit_at`
 *     gravado em mtmcopy_signal_tracking), com o spread simulado do símbolo por cima. Nunca o
 *     máximo/mínimo da vela, nunca o preço do sinal.
 *  2. Dentro de uma vela, o extremo ADVERSO vem primeiro: numa compra o mínimo antes do máximo. Se
 *     a vela toca stop e alvo, ganha o STOP — a mesma regra de lib/mtmauto/reconstruir-desempenho.
 *  3. A posição nasce «nesta vela» e só é avaliada a partir da vela SEGUINTE (é o que o motor faz
 *     em services/funded-motor/avaliacao.ts: uma posição nascida no tick não é fechada nesse tick).
 *  4. Ordem dentro de cada tick, igual ao motor: SL → gestão (parciais, break-even, trailing) → TP.
 *  5. Fecho da FONTE (`closed_at`): com `seguirFechosDaFonte` (o defeito), se o sinal foi fechado
 *     pelo canal antes de bater SL/TP, a posição fecha ao fecho da vela desse minuto, motivo
 *     `estrategia` — o mesmo que `aplicarNasPontes(..., 'fechar')` faz ao vivo.
 *  6. Sem vela na entrada, sem conversão para USD ou sem preços = NÃO se reconstitui. Fica de fora
 *     e é listado no relatório. Nunca se inventa um preço.
 */
import {
  decidirGestao, GESTAO_VAZIA, volumeDaParte, type Gestao, type TpParcial,
} from './simulado/avancadas'
import {
  comissaoUsd, lucroUsd, precoComSpread, precoDeAbertura, tocaSl, tocaTp,
  type Direcao, type MapaPrecos, type Preco, type Simbolo,
} from './simulado/matematica'
import {
  decidirDuplicado, gestaoDoSinal, loteParaConta, niveisAncorados,
  type ConfigSinais, type PonteAberta,
} from './estrategias-sinais/calculo'
import { pipSizeForSymbol } from '../mtmcopy/trade-outcome'

// ─────────────────────────────────────────────────────────────────────────────
// Marcas — a única forma de saber que uma linha é reconstituída
// ─────────────────────────────────────────────────────────────────────────────

/** Começo do `comentario` das posições reconstituídas (o MT5 corta aos 64 no nosso lado). */
export const PREFIXO_COMENTARIO = 'RECONST'
/** Começo do `ideia_ref` — é também a chave do lote para o `--desfazer`. */
export const PREFIXO_REF = 'recon:'
/** Chave em `mtm_trading_accounts.metricas` com a janela reconstituída. */
export const CHAVE_METRICAS = 'reconstituicao'

/** «RECONST · MTM Auto Premium · tg:e071159a» */
export function comentarioReconstituido(nomeEstrategia: string, referencia: string): string {
  return `${PREFIXO_COMENTARIO} · ${nomeEstrategia} · ${referencia}`.slice(0, 64)
}

/** A linha (posição, ordem ou ponte) veio de uma reconstituição? Serve o crachá da interface. */
export function ehReconstituida(l: { ideia_ref?: unknown; ideiaRef?: unknown; comentario?: unknown; chave?: unknown } | null | undefined): boolean {
  if (!l) return false
  const ref = String(l.ideia_ref ?? l.ideiaRef ?? '')
  const chave = String(l.chave ?? '')
  const com = String(l.comentario ?? '')
  return ref.startsWith(PREFIXO_REF) || chave.startsWith(PREFIXO_REF) || com.startsWith(`${PREFIXO_COMENTARIO} `) || com.startsWith(`${PREFIXO_COMENTARIO}·`)
}

/** Etiqueta única para a interface (PT-PT). */
export const ETIQUETA_RECONST = 'histórico reconstituído'

// ─────────────────────────────────────────────────────────────────────────────
// Entradas e saídas
// ─────────────────────────────────────────────────────────────────────────────

/** Uma vela M1 como a MetaApi a dá (t em segundos). */
export interface Vela { t: number; o: number; h: number; l: number; c: number }

export interface SinalParaReplay {
  /** id da linha de origem (mtmcopy_signal_tracking.id) — só para o relatório. */
  id: string
  /** referência curta para o comentário («tg:e071159a»). */
  referencia: string
  symbol: string
  direcao: Direcao
  /** entrada anunciada pelo sinal (null = a mercado) */
  entrada: number | null
  sl: number | null
  tps: number[]
  /** ms — `entry_hit_at`: o instante GRAVADO em que o sinal encheu a entrada. */
  entradaEm: number
  /** ms — `closed_at` da fonte, quando o canal fechou o sinal à mão. */
  fechoDaFonteEm: number | null
}

export interface ParcialReplay { volume: number; preco: number; pnl: number; em: number; tps: TpParcial[] }

export interface FechoReplay { preco: number; pnl: number; motivo: 'sl' | 'tp' | 'estrategia'; em: number }

export interface Replay {
  precoEntrada: number
  volume: number
  comissao: number
  sl: number | null
  tp: number | null
  gestao: Partial<Gestao>
  /** ms — o minuto da vela usada na entrada */
  abertaEm: number
  parciais: ParcialReplay[]
  /** null = ainda aberta no fim da janela */
  fecho: FechoReplay | null
  /** SL no momento em que fechou (ou o último) — o trailing/BE move-o */
  slFinal: number | null
  /** resultado em pips pela convenção de lib/mtmcopy/trade-outcome (ouro 0,1) */
  pips: number | null
  /** P&L total em USD (parciais + fecho), já sem a comissão */
  pnl: number
}

export type ResultadoReplay = Replay | { erro: string }

export const ehErro = (r: ResultadoReplay): r is { erro: string } => 'erro' in r

// ─────────────────────────────────────────────────────────────────────────────
// Replicação
// ─────────────────────────────────────────────────────────────────────────────

/** A vela M1 que contém `ms` (ou null). As velas têm de vir ordenadas por tempo. */
export function velaDoInstante(velas: Vela[], ms: number): Vela | null {
  const seg = Math.floor(ms / 1000)
  let escolhida: Vela | null = null
  for (const v of velas) {
    if (v.t > seg) break
    escolhida = v
  }
  // Mais de 10 min sem vela = mercado fechado ou buraco no histórico: não se inventa.
  return escolhida && seg - escolhida.t <= 600 ? escolhida : null
}

/**
 * Os preços de UMA vela pela ordem mais desfavorável: extremo adverso → extremo favorável → fecho.
 * Numa compra o adverso é o mínimo; numa venda, o máximo.
 */
export function ticksDaVela(v: Vela, direcao: Direcao): number[] {
  return direcao === 'buy' ? [v.l, v.h, v.c] : [v.h, v.l, v.c]
}

export interface PedidoReplay {
  sinal: SinalParaReplay
  simbolo: Simbolo
  /** saldo da conta no momento (para o lote) */
  saldo: number
  cfg: ConfigSinais
  /** velas M1 ordenadas, a cobrir desde `entradaEm` até ao fim da janela */
  velas: Vela[]
  /**
   * Preços auxiliares para converter o lucro em USD (ex.: USDJPY para um par cotado em JPY).
   * Símbolos cotados em USD não precisam de nada.
   */
  precosAux?: MapaPrecos
  /** ms — fim da janela («agora»): depois disto a posição fica aberta */
  ate: number
}

export function replicarSinal(p: PedidoReplay): ResultadoReplay {
  const { sinal, simbolo, cfg } = p
  const velaEntrada = velaDoInstante(p.velas, sinal.entradaEm)
  if (!velaEntrada) return { erro: 'sem vela M1 no minuto da entrada' }

  const precoBase: Preco = precoComSpread(simbolo, velaEntrada.c)
  const precoEntrada = precoDeAbertura(sinal.direcao, precoBase)
  const volume = loteParaConta(p.saldo, cfg, simbolo)
  if (!(volume > 0)) return { erro: 'lote abaixo do mínimo para este saldo' }
  const comissao = comissaoUsd(simbolo, volume)

  const niveis = niveisAncorados(
    { direcao: sinal.direcao, entrada: sinal.entrada, sl: sinal.sl, tps: sinal.tps },
    precoEntrada,
    simbolo.digits,
  )
  const { gestao, tpFinal } = gestaoDoSinal({
    simbolo, direcao: sinal.direcao, precoExecucao: precoEntrada, volume,
    sl: niveis.sl, tps: niveis.tps, cfg,
  })

  const precos = (x: Preco): MapaPrecos => ({ ...(p.precosAux ?? {}), [simbolo.symbol]: x })
  // Sem conversão para USD não há P&L possível — recusa-se antes de escrever seja o que for.
  if (lucroUsd(simbolo, sinal.direcao, volume, precoEntrada, precoEntrada, precos(precoBase)) == null) {
    return { erro: `sem conversão para USD (${simbolo.symbol})` }
  }

  const estado: Gestao = {
    ...GESTAO_VAZIA,
    ...gestao,
    volume_inicial: volume,
    tps: gestao.tps ? gestao.tps.map((t) => ({ ...t })) : null,
  }
  let sl = niveis.sl
  let volumeVivo = volume
  const parciais: ParcialReplay[] = []
  let fecho: FechoReplay | null = null
  let pnlTotal = 0

  const entradaSeg = Math.floor(sinal.entradaEm / 1000)
  const fimSeg = Math.floor(p.ate / 1000)
  const fonteSeg = sinal.fechoDaFonteEm != null ? Math.floor(sinal.fechoDaFonteEm / 1000) : null

  // Regra 3: a vela da entrada não é avaliada (a posição nasce nela).
  for (const v of p.velas) {
    if (v.t <= velaEntrada.t || v.t < entradaSeg) continue
    if (v.t > fimSeg) break
    const emMs = v.t * 1000

    for (const medio of ticksDaVela(v, sinal.direcao)) {
      const preco = precoComSpread(simbolo, medio)
      const mapa = precos(preco)
      const posicao = {
        symbol: simbolo.symbol, direcao: sinal.direcao, volume: volumeVivo,
        preco_entrada: precoEntrada, sl, tp: tpFinal, comissao: 0, swap: 0,
      }

      // 1) SL primeiro — num salto de preço o stop ganha ao alvo
      if (tocaSl(posicao, preco)) {
        const pnl = lucroUsd(simbolo, sinal.direcao, volumeVivo, precoEntrada, sl as number, mapa)
        if (pnl == null) return { erro: 'sem conversão para USD no fecho' }
        fecho = { preco: sl as number, pnl, motivo: 'sl', em: emMs }
        pnlTotal += pnl
        break
      }

      // 2) gestão: parciais → break-even → trailing
      const d = decidirGestao({ ...posicao, id: sinal.id, gestao: estado }, simbolo, preco, mapa)
      for (const parte of d.parciais) {
        parciais.push({ volume: parte.volume, preco: parte.preco, pnl: parte.pnl, em: emMs, tps: (d.tps ?? []).map((t) => ({ ...t })) })
        pnlTotal += parte.pnl
        volumeVivo = Math.round((volumeVivo - parte.volume) * 100) / 100
      }
      if (d.tps) estado.tps = d.tps.map((t) => ({ ...t }))
      estado.be_feito = d.beFeito
      if (d.novoSl != null) sl = d.novoSl
      if (volumeVivo <= 0) {
        const ultima = parciais[parciais.length - 1]
        fecho = { preco: ultima.preco, pnl: 0, motivo: 'tp', em: emMs }
        break
      }

      // 3) TP final
      const depois = { ...posicao, volume: volumeVivo, sl }
      if (tocaTp(depois, preco)) {
        const pnl = lucroUsd(simbolo, sinal.direcao, volumeVivo, precoEntrada, tpFinal as number, mapa)
        if (pnl == null) return { erro: 'sem conversão para USD no fecho' }
        fecho = { preco: tpFinal as number, pnl, motivo: 'tp', em: emMs }
        pnlTotal += pnl
        break
      }
    }
    if (fecho) break

    // 4) a fonte fechou o sinal à mão (só com seguirFechosDaFonte)
    if (cfg.seguirFechosDaFonte && fonteSeg != null && v.t >= fonteSeg) {
      const preco = precoComSpread(simbolo, v.c)
      const saida = sinal.direcao === 'buy' ? preco.bid : preco.ask
      const pnl = lucroUsd(simbolo, sinal.direcao, volumeVivo, precoEntrada, saida, precos(preco))
      if (pnl == null) return { erro: 'sem conversão para USD no fecho da fonte' }
      fecho = { preco: saida, pnl, motivo: 'estrategia', em: v.t * 1000 }
      pnlTotal += pnl
      break
    }
  }

  const pip = pipSizeForSymbol(simbolo.symbol)
  const sentido = sinal.direcao === 'buy' ? 1 : -1
  const saidaMedia = fecho
    ? (parciais.reduce((a, x) => a + x.preco * x.volume, 0) + fecho.preco * volumeVivo) / volume
    : null
  const pips = saidaMedia != null && pip > 0
    ? Math.round(((saidaMedia - precoEntrada) * sentido / pip) * 10) / 10
    : null

  return {
    precoEntrada, volume, comissao, sl: niveis.sl, tp: tpFinal, gestao,
    abertaEm: sinal.entradaEm, parciais, fecho, slFinal: sl, pips,
    pnl: Math.round((pnlTotal - comissao) * 100) / 100,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Não duplicar — com as regras do motor ao vivo
// ─────────────────────────────────────────────────────────────────────────────

/** Uma posição da conta dentro da janela (real ou já reconstituída). */
export interface PosicaoExistente {
  chave: string
  impressao: string | null
  symbol: string
  direcao: Direcao
  entrada: number | null
  fonte: string
  abertaEm: number
  /** null = ainda aberta */
  fechadaEm: number | null
}

/**
 * Já existe posição para este trade nesta conta NO INSTANTE em que o sinal encheu a entrada?
 *
 * Usa `decidirDuplicado` — as MESMAS regras do motor ao vivo (mesma chave, mesma impressão, ou o
 * mesmo par/direcção com a entrada a menos de 15 pips dentro de 30 min) — mas só contra as posições
 * que estavam VIVAS nesse instante, que é o que o motor teria visto. Uma posição já fechada não
 * bloqueia um sinal novo, e é por isso que o Premium das 08:03 entra mesmo tendo havido um às 07:43.
 *
 * Cobre as posições REAIS da janela (as três GoldKiller e as duas Premium do Fábio, e a Wolf do
 * Ricardo) e as que esta própria corrida já reconstituiu.
 */
export function jaExiste(
  novo: { chave: string; impressao: string | null; symbol: string; direcao: Direcao; entrada: number | null; entradaEm: number },
  existentes: PosicaoExistente[],
  permitirDuplicado = false,
): { chaveOriginal: string; fonteOriginal: string; motivo: 'mesma_chave' | 'mesmo_trade' } | null {
  const vivas: PonteAberta[] = existentes
    .filter((e) => e.abertaEm <= novo.entradaEm && (e.fechadaEm == null || e.fechadaEm > novo.entradaEm))
    .map((e) => ({ chave: e.chave, impressao: e.impressao, symbol: e.symbol, direcao: e.direcao, entrada: e.entrada, fonte: e.fonte, criadaEm: e.abertaEm }))
  const d = decidirDuplicado({ ...novo, agora: novo.entradaEm }, vivas, permitirDuplicado)
  return d.abrir ? null : { chaveOriginal: d.chaveOriginal, fonteOriginal: d.fonteOriginal, motivo: d.motivo }
}

/** Parte que não se faz num lote de 0,01 — só para o relatório dizer porquê. */
export const semParciais = (s: Simbolo, volume: number, pct: number): boolean => volumeDaParte(s, volume, pct) == null
