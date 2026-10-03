import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * O AURUM FLOW TAMBÉM CORRE NA CONTA MESTRE — quando a corretora cota o par.
 *
 * A estratégia negoceia perpétuos da Bybit (BTCUSDT.P, ETHUSDT.P, SOLUSDT.P, XRPUSDT.P,
 * JUPUSDT.P) e é lá que a execução principal acontece. Mas os mesmos pares existem como CFD
 * em MT5 com outro nome — BTCUSD, ETHUSD — e nesses a conta mestre pode abrir a posição, que
 * é o que dá à estratégia um histórico MetaApi próprio e a torna copiável pela CopyFactory.
 *
 * «Quando a corretora cota» não é uma formalidade: uma conta de forex não tem JUPUSD nem
 * SOLUSD, e tentar abrir o que não existe devolve um erro por sinal — ruído que esconde os
 * erros a sério. Pergunta-se ao broker antes de tentar, e o que ele não tiver é saltado em
 * silêncio, que é o comportamento certo para uma condição normal.
 */

/** Perpétuo da Bybit → o par equivalente em MT5. */
const EQUIVALENTE_MT5: Record<string, string> = {
  BTCUSDT: 'BTCUSD',
  ETHUSDT: 'ETHUSD',
  SOLUSDT: 'SOLUSD',
  XRPUSDT: 'XRPUSD',
  JUPUSDT: 'JUPUSD',
}

export function equivalenteMt5(ticker: string | null | undefined): string | null {
  if (!ticker) return null
  const limpo = String(ticker).toUpperCase().replace(/^[A-Z]+:/, '').replace(/[^A-Z0-9]/g, '').replace(/P$/, '')
  return EQUIVALENTE_MT5[limpo] ?? null
}

export interface ResultadoMestre {
  ok: boolean
  motivo?: string
  simbolo?: string
  volume?: number
}

/**
 * Abre o sinal na conta mestre do Aurum Flow, se der.
 *
 * Best-effort por desenho: a execução que conta é a da Bybit, e uma falha aqui não pode
 * atrasar nem impedir essa. Devolve sempre o motivo — um `false` sem explicação transforma
 * cada «porque é que não abriu?» numa investigação.
 */
export async function abrirNaContaMestreAurum(sinal: {
  ticker: string
  direcao: 'buy' | 'sell'
  entrada: number | null
  sl: number | null
  tp: number | null
}): Promise<ResultadoMestre> {
  const simbolo = equivalenteMt5(sinal.ticker)
  if (!simbolo) return { ok: false, motivo: 'par sem equivalente em MT5' }

  const db = getSupabaseAdmin()
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('metaapi_account_id, metricas, saldo_inicial')
    .eq('tipo', 'provider')
    // Slug `aurum-flow` desde 2026-09-14; o antigo fica aceite até 2026-10-14 (alias de 30 dias).
    .in('provider_slug', ['aurum-flow', 'golden-moves'])
    .maybeSingle()

  if (!conta?.metaapi_account_id) return { ok: false, motivo: 'conta mestre do Aurum não está na MetaApi' }

  const metricas = (conta.metricas ?? {}) as Record<string, unknown>
  const riscoPct = Number(metricas.risco_pct ?? 0.5)

  try {
    const { getAccountSymbols, placeOrdersSequential } = await import('./metaapi')

    /**
     * O broker tem este par?
     *
     * Pergunta-se pela lista de símbolos da conta e aceita-se o nome exacto ou um com sufixo
     * do broker (BTCUSD.s, BTCUSD-STD). É a única forma de saber sem tentar — e tentar às
     * cegas gera um erro por sinal em cinco pares, dos quais três nunca existirão numa conta
     * de CFD.
     */
    const simbolos = await getAccountSymbols(conta.metaapi_account_id as string)
    const negociavel =
      simbolos.find((x) => x.toUpperCase() === simbolo) ??
      simbolos.find((x) => x.toUpperCase().startsWith(simbolo)) ??
      null
    if (!negociavel) return { ok: false, motivo: `a corretora não cota ${simbolo}` }

    /**
     * O VOLUME sai do risco da estratégia e da distância ao stop.
     *
     * Sem stop não se abre: numa conta mestre que outros copiam, uma posição sem stop é uma
     * posição cujo risco ninguém consegue dimensionar — e a CopyFactory replicaria isso em
     * todas as contas subscritas.
     */
    if (sinal.sl == null || sinal.entrada == null) {
      return { ok: false, motivo: 'sinal sem stop ou sem entrada — não se abre na mestre' }
    }
    const distancia = Math.abs(sinal.entrada - sinal.sl)
    if (!(distancia > 0)) return { ok: false, motivo: 'distância ao stop é zero' }

    const saldo = Number(conta.saldo_inicial ?? 0)
    const riscoUsd = saldo * (riscoPct / 100)
    // Volume bruto = risco / distância. O ajuste ao passo e ao mínimo do broker é feito pelo
    // `placeOrdersSequential`, que conhece as especificações do símbolo.
    const volume = Math.max(0.01, Math.round((riscoUsd / distancia) * 100) / 100)

    const [r] = await placeOrdersSequential(conta.metaapi_account_id as string, [
      {
        accountId: conta.metaapi_account_id as string,
        symbol: negociavel,
        direction: sinal.direcao,
        volume,
        orderType: 'market',
        stopLoss: sinal.sl,
        takeProfit: sinal.tp,
        comment: 'Aurum Flow',
      },
    ])

    return r?.success
      ? { ok: true, simbolo: negociavel, volume }
      : { ok: false, motivo: r?.error ?? 'a ordem não foi aceite', simbolo: negociavel }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}
