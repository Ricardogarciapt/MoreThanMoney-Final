/**
 * SL/TP EM DINHEIRO E LOTE POR RISCO — as conversões do ticket, com a matemática da execução.
 *
 * Quem negoceia pensa de três maneiras: em preço (do gráfico), em pips (dos sinais) e em dinheiro
 * («arrisco 50 $», «arrisco 1 % da conta»). As duas primeiras já existiam; esta é a terceira. O que
 * importa é que 50 $ no ticket sejam 50 $ quando o SL bate — por isso a distância em preço sai da
 * MESMA fórmula que `lucroUsd` usa para fechar a posição:
 *
 *   dinheiro = distância × volume × contract_size × usdPorUnidade(moeda de cotação)
 *
 * e ao contrário, distância = dinheiro / (volume × contract_size × usdPorUnidade).
 *
 * Como `matematica.ts`, não importa nada de fora: o site e os testes usam-no directamente.
 */

import {
  type Direcao, type MapaPrecos, type Simbolo, lucroUsd, moedaDeCotacao, normalizarVolume, usdPorUnidade,
} from './matematica'

export type CampoSlTp = 'sl' | 'tp'

/** Quantos USD vale mover o preço UMA unidade com `volume` lotes. null sem preço de conversão. */
export function usdPorUnidadeDePreco(s: Simbolo, volume: number, precos: MapaPrecos): number | null {
  const conv = usdPorUnidade(moedaDeCotacao(s.symbol, s.classe, s.moeda_lucro), precos)
  if (conv == null || !(volume > 0) || !(s.contract_size > 0)) return null
  return volume * s.contract_size * conv
}

/** Percentagem do saldo → USD. */
export function usdDePercentagem(pct: number, saldo: number | null): number | null {
  if (saldo == null || !(saldo > 0) || !Number.isFinite(pct)) return null
  return (saldo * pct) / 100
}

/** USD → percentagem do saldo (2 casas). */
export function percentagemDeUsd(valor: number | null, saldo: number | null): number | null {
  if (valor == null || saldo == null || !(saldo > 0)) return null
  return Math.round((valor / saldo) * 10000) / 100
}

/**
 * O preço do SL/TP que perde/ganha `valorUsd` com `volume` lotes a partir de `entrada`.
 * SL fica abaixo da entrada na compra e acima na venda; o TP ao contrário. Arredondado aos
 * dígitos do símbolo. null quando não há conversão ou o nível cairia em preço ≤ 0.
 */
export function precoDeValor(
  s: Simbolo, lado: Direcao, campo: CampoSlTp, entrada: number, volume: number, valorUsd: number, precos: MapaPrecos,
): number | null {
  const porUnidade = usdPorUnidadeDePreco(s, volume, precos)
  if (porUnidade == null || !(valorUsd > 0) || !(entrada > 0)) return null
  const distancia = valorUsd / porUnidade
  const sinal = (lado === 'buy' ? 1 : -1) * (campo === 'sl' ? -1 : 1)
  const f = Math.pow(10, s.digits)
  const preco = Math.round((entrada + sinal * distancia) * f) / f
  return preco > 0 ? preco : null
}

/** O mesmo, com a percentagem do saldo. */
export function precoDePercentagem(
  s: Simbolo, lado: Direcao, campo: CampoSlTp, entrada: number, volume: number, pct: number, saldo: number | null, precos: MapaPrecos,
): number | null {
  const valor = usdDePercentagem(pct, saldo)
  return valor == null ? null : precoDeValor(s, lado, campo, entrada, volume, valor, precos)
}

/** Quanto se perde (SL) ou ganha (TP) nesse nível, em USD e sempre positivo — para mostrar. */
export function valorDoNivel(
  s: Simbolo, lado: Direcao, entrada: number, nivel: number, volume: number, precos: MapaPrecos,
): number | null {
  const l = lucroUsd(s, lado, volume, entrada, nivel, precos)
  return l == null ? null : Math.abs(l)
}

export interface VolumePorRisco {
  /** O volume a usar (já no passo e dentro dos limites), ou null se não dá para calcular. */
  volume: number | null
  /** O volume exacto que o risco pedia, antes de arredondar ao passo. */
  bruto: number | null
  /** Ficou preso ao mínimo ou ao máximo do símbolo. */
  limitado: 'min' | 'max' | null
  /** O risco que o volume escolhido corre de facto (arredondar para baixo deixa-o ≤ ao pedido, excepto no mínimo). */
  riscoReal: number | null
  motivo: 'sem_sl' | 'sem_conversao' | 'sem_risco' | null
}

/**
 * Lote pelo risco: volume = risco / (|entrada − SL| × contract_size × usdPorUnidade).
 * Arredonda para BAIXO ao passo (nunca arrisca mais do que o pedido por arredondamento); se nem o
 * mínimo cabe, fica no mínimo e diz-se — o risco real aparece para o trader decidir.
 */
export function volumePorRisco(
  s: Simbolo, entrada: number | null, sl: number | null, riscoUsd: number | null, precos: MapaPrecos,
): VolumePorRisco {
  const nada = (motivo: VolumePorRisco['motivo']): VolumePorRisco => ({ volume: null, bruto: null, limitado: null, riscoReal: null, motivo })
  if (!(riscoUsd != null && riscoUsd > 0)) return nada('sem_risco')
  if (entrada == null || sl == null || Math.abs(entrada - sl) <= 0) return nada('sem_sl')
  const porLote = usdPorUnidadeDePreco(s, 1, precos)
  if (porLote == null) return nada('sem_conversao')
  const bruto = riscoUsd / (Math.abs(entrada - sl) * porLote)
  const passo = s.volume_step > 0 ? s.volume_step : 0.01
  let v = Math.floor(bruto / passo + 1e-9) * passo
  let limitado: VolumePorRisco['limitado'] = null
  if (v < s.volume_min - 1e-9) { v = s.volume_min; limitado = 'min' }
  else if (v > s.volume_max + 1e-9) { v = s.volume_max; limitado = 'max' }
  const volume = normalizarVolume(s, v)
  if (volume == null) return { volume: null, bruto, limitado, riscoReal: null, motivo: null }
  const lado: Direcao = sl < entrada ? 'buy' : 'sell'
  return { volume, bruto, limitado, riscoReal: valorDoNivel(s, lado, entrada, sl, volume, precos), motivo: null }
}
