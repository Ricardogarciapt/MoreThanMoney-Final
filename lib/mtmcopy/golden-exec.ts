/**
 * As pernas de execução da GOLDEN MOVES e da GOLDEN ASTRO.
 *
 * Vivem fora do `processor` porque são estratégias com forma própria — uma abre DUAS ordens por
 * sinal, a outra só abre dentro de janelas horárias — e enfiá-las no caminho genérico ou
 * enchia-o de excepções ou obrigava-as a ser o que não são.
 *
 * O que ambas partilham: os níveis vão na ordem como rede de segurança, mas quem as gere é o
 * MOTOR DE PREÇO. É por isso que cada posição fica registada em `mtmcopy_premium_active` — sem
 * esse registo a ordem abre e fica órfã, sem parciais, sem break-even e sem trailing.
 */

import type { OrderRequest, OrderResult } from './metaapi'
import { parseSignal } from './signal-parser'
import {
  planoGoldenAstro,
  direcaoGoldenAstro,
  dentroDaJanela,
  GOLDENASTRO_SAIDAS,
  GOLDENASTRO_SIMBOLO,
  planoPublicado,
} from './golden-astro'
import { GOLDENASTRO_PROVIDER_ACCOUNT_ID } from './provider-constants'
import { getExecSwitches } from './exec-switches'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export type ColocarOrdem = (accountId: string, req: OrderRequest, label: string) => Promise<OrderResult>

export interface ResultadoPerna {
  tratado: boolean
  abertas: number
  detalhe: string
}

/** Regista a posição no motor de preço. Sem isto, a ordem abre e fica sem quem a acompanhe. */
async function registarNoMotor(args: {
  accountId: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number
  sl: number
  tp: number[]
  lote: number
  saidas: { tp1: number; tp2: number; tp3: number }
  fonte: string
  telegramMessageId?: number
}): Promise<void> {
  await getSupabaseAdmin()
    .from('mtmcopy_premium_active')
    .insert({
      account_id: args.accountId,
      symbol: args.symbol,
      direction: args.direction,
      entry: args.entry,
      sl: args.sl,
      tp1: args.tp[0] ?? null,
      tp2: args.tp[1] ?? null,
      tp3: args.tp[2] ?? null,
      exit_pct_tp1: args.saidas.tp1,
      exit_pct_tp2: args.saidas.tp2,
      exit_pct_tp3: args.saidas.tp3,
      original_lot: args.lote,
      small_account: false,
      exits_done: 0,
      trailing_started: false,
      status: 'open',
      source_key: args.fonte,
      telegram_message_id: args.telegramMessageId ?? null,
    })
    .then(
      () => {},
      (e: unknown) => {
        // Não desfaz a ordem: a posição existe na corretora e escondê-la seria pior. Fica o
        // aviso alto, porque uma posição sem motor é uma posição sem gestão.
        console.error('[golden] ordem aberta MAS não registada no motor:', e)
      },
    )
}

/**
 * GOLDEN ASTRO — uma entrada, dentro da janela.
 *
 * O sinal não traz preços, traz uma direção: os níveis nascem do preço a que a ordem abriu, e
 * por isso só se conseguem calcular DEPOIS de ela abrir. Abre-se sem stop e escreve-se o stop a
 * seguir? Não — abre-se com o stop calculado a partir do preço pedido e o motor corrige-o com o
 * preço real de execução. Uma ordem de ouro sem stop nem que seja por dois segundos é uma
 * posição sem rede num instrumento que anda 100 pips em minutos.
 */
export async function pernaGoldenAstro(args: {
  accountId: string
  raw: string
  telegramMessageId?: number
  precoAtual: number | null
  construir: (accountId: string, sinal: NonNullable<ReturnType<typeof parseSignal>>, lote: number, comentario: string) => OrderRequest
  colocar: ColocarOrdem
  lote: number
  quando?: Date
}): Promise<ResultadoPerna> {
  if (args.accountId !== GOLDENASTRO_PROVIDER_ACCOUNT_ID) return { tratado: false, abertas: 0, detalhe: '' }

  const sw = await getExecSwitches()
  if (!sw.goldenastro_exec) return { tratado: true, abertas: 0, detalhe: 'goldenastro_exec=off' }

  const direction = direcaoGoldenAstro(args.raw)
  if (!direction) return { tratado: true, abertas: 0, detalhe: 'sem gatilho Gold Buy/Gold sell' }

  /**
   * A janela é regra ESCRITA da estratégia — mas o trader não a cumpre.
   *
   * Em 44 setups entre 25/08 e 08/09, 17 (39%) caíram fora das três janelas: manhãs às 09:47,
   * tardes às 16:25 e 17:36 de Londres. Com o guarda ligado deixam-se passar quatro em cada
   * dez sinais dele, e nada no sistema o diz — a execução some sem ruído.
   *
   * Fica em interruptor, ligado por omissão porque é a regra que o Ricardo escreveu. Quem o
   * desligar copia o trader como ele negoceia de facto, e não como se descreve.
   */
  if (sw.goldenastro_janelas !== false && !dentroDaJanela(args.quando ?? new Date())) {
    return { tratado: true, abertas: 0, detalhe: 'fora das janelas de Londres' }
  }

  const doTexto = parseSignal(args.raw)

  /**
   * OS NÍVEIS SÃO DELE, NÃO NOSSOS.
   *
   * O grupo publica a zona, o stop e os cinco alvos por extenso. Só se sintetiza a escada em
   * pips quando o setup vier sem níveis — refazê-la por cima dos dele dava outro trade.
   */
  const plano =
    (doTexto ? planoPublicado(doTexto, direction) : null) ??
    (() => {
      const preco = args.precoAtual ?? doTexto?.entry ?? null
      if (preco == null) return null
      return planoGoldenAstro(direction, preco, { symbol: doTexto?.symbol ?? GOLDENASTRO_SIMBOLO })
    })()
  if (!plano) return { tratado: true, abertas: 0, detalhe: 'sem níveis publicados nem preço de referência' }

  const req = args.construir(
    args.accountId,
    {
      symbol: plano.symbol, direction: plano.direction, entry: plano.entrada,
      sl: plano.sl, tp: plano.tp, orderType: 'market', raw: args.raw,
    } as NonNullable<ReturnType<typeof parseSignal>>,
    args.lote,
    `GA-${args.lote}`,
  )
  req.orderType = 'market'

  const r = await args.colocar(args.accountId, req, `GOLDEN ASTRO ${req.symbol} ${req.direction}`)
  if (!r?.success) return { tratado: true, abertas: 0, detalhe: `falhou: ${r?.error ?? '?'}` }

  await registarNoMotor({
    accountId: args.accountId,
    symbol: req.symbol,
    direction: plano.direction,
    entry: plano.entrada,
    sl: plano.sl,
    tp: plano.tp,
    lote: args.lote,
    saidas: GOLDENASTRO_SAIDAS,
    fonte: 'goldenastro',
    telegramMessageId: args.telegramMessageId,
  })

  return { tratado: true, abertas: 1, detalhe: `entrada @ ${plano.entrada} · stop ${plano.sl}` }
}
