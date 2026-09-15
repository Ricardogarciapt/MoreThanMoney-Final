import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerInfoContaCache } from '@/lib/mtmcopy/metaapi-cache'

/**
 * A EQUIDADE DA MTM — e quanto é que cada conta lhe vale.
 *
 * Nem todas as contas contam pelo valor que mostram, e a diferença não é contabilística: é o
 * que a MTM tem MESMO em risco em cada uma.
 *
 * · Contas de CLIENTE (MTM Copy, T2T) contam pelo valor integral. É dinheiro real numa conta
 *   real, e o que lá está é o que lá está.
 *
 * · Contas FINANCIADAS contam a 10%. É a regra publicada do produto: a negociação é simulada e
 *   o que o Fundo MTM afecta a cada conta é 10% do nominal — 1.000 USD numa conta de 10.000.
 *   Somá-las pelo valor de face inflacionava a equidade em dez vezes, com um número que
 *   nenhuma das partes pode levantar.
 *
 * · Contas MESTRE das estratégias contam a 10% pela mesma razão, e por uma segunda: são demo.
 *   O saldo delas existe para dimensionar a cópia, não para ser património.
 *
 * O factor está aqui e não espalhado por quem soma — é uma regra do negócio, e uma regra
 * escrita em três sítios diverge em dois deles.
 */

/** Quanto do valor nominal de uma conta é capital real da MTM. */
export const FACTOR_FUNDED = 0.10

export type TipoParaEquidade = 'cliente' | 'financiada' | 'provider' | 'desafio' | 'torneio'

export function factorDaConta(tipo: TipoParaEquidade): number {
  switch (tipo) {
    case 'financiada':
    case 'provider':
      return FACTOR_FUNDED
    // Desafios e torneios são contas de AVALIAÇÃO, em dinheiro virtual. Não entram na
    // equidade de todo: contá-las, ainda que a 10%, seria dizer que a MTM tem capital afecto
    // a uma prova que ninguém pagou e que pode terminar amanhã.
    case 'desafio':
    case 'torneio':
      return 0
    default:
      return 1
  }
}

export interface ContaNaEquidade {
  etiqueta: string
  tipo: TipoParaEquidade
  metaapiId: string | null
  /** O que a conta mostra. */
  valorNominal: number
  /** O que conta para a equidade da MTM, já com o factor aplicado. */
  contribuicao: number
  factor: number
}

/**
 * As contas do MTM Funded que entram na equidade — financiadas e mestres.
 *
 * As de cliente vêm de outro lado (`mtmcopy_connections`) e já eram somadas; esta função
 * acrescenta as que nasceram com o MTM Funded e não estavam em lado nenhum.
 */
export async function contasFundedNaEquidade(): Promise<ContaNaEquidade[]> {
  const db = getSupabaseAdmin()
  const token = process.env.METAAPI_TOKEN

  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('mt5_login, tipo, provider_slug, saldo_inicial, metaapi_account_id, metricas, motor, sim_equity, sim_saldo')
    .in('tipo', ['financiada', 'provider'])
    .eq('estado', 'ativa')

  const saida: ContaNaEquidade[] = []
  for (const c of contas ?? []) {
    const tipo = (c.tipo as string) === 'provider' ? 'provider' : 'financiada'
    const factor = factorDaConta(tipo)

    /**
     * O valor ao vivo quando a MetaApi responde; o saldo inicial quando não responde.
     *
     * Não se salta a conta por a leitura falhar: uma conta que existe e não responde continua a
     * ter capital afecto, e tirá-la da soma fazia a equidade oscilar com a disponibilidade da
     * MetaApi em vez de com o dinheiro.
     */
    let nominal = Number(c.saldo_inicial ?? 0)
    // Conta simulada (motor do VPS): a equity ao vivo está na própria linha, sem MetaApi.
    if (c.motor === 'sim') {
      const eq = Number(c.sim_equity ?? c.sim_saldo)
      if (Number.isFinite(eq) && eq > 0) nominal = eq
    }
    if (c.motor !== 'sim' && c.metaapi_account_id && token) {
      try {
        // Cache de 45 s (só ecrãs/relatórios): o painel de desempenho abre-se muitas vezes seguidas e
        // cada abertura relia todas as contas na MetaApi.
        const d = (await lerInfoContaCache(String(c.metaapi_account_id), { regiao: 'london', timeoutMs: 8_000 })) as
          | { equity?: number }
          | null
        if (d && typeof d.equity === 'number') nominal = d.equity
      } catch {
        // fica o saldo inicial
      }
    }

    saida.push({
      etiqueta:
        tipo === 'provider'
          ? `Mestre · ${c.provider_slug ?? c.mt5_login}`
          : `Financiada · ${c.mt5_login ?? '—'}`,
      tipo,
      metaapiId: (c.metaapi_account_id as string) ?? null,
      valorNominal: Math.round(nominal * 100) / 100,
      contribuicao: Math.round(nominal * factor * 100) / 100,
      factor,
    })
  }
  return saida
}
