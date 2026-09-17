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
 * · CONTAS REAIS DA CASA (`conta_real_casa`, 109 — decisão do dono de 17/09) mandam sobre as duas
 *   regras de cima:
 *     – as de 1K (estratégias, T2T, «Todos os sinais») contam pelo valor INTEGRAL: «são mesmo 1K»;
 *     – as de 10K que são o espelho de uma estratégia (`mtmauto_providers.espelho_funded_account_id`)
 *       contam a 10% (1K), pela equity delas — que reflecte a conta-mestre pelo espelho do motor;
 *     – a conta-mestre (provider) dessa estratégia passa a contar 0: o capital dela JÁ está no
 *       espelho. Contar as duas (10% + 10%) era contar a mesma estratégia duas vezes — e isso já
 *       acontecia antes da 109 com os espelhos marcados como análise.
 *   Porque o espelho e não a mestre: o espelho é a conta que o dono declarou real e que negoceia na
 *   plataforma; a mestre é a demo da MetaApi que lhe dá os sinais, com histórico anterior ao espelho
 *   (posições abertas antes da ligação não passam), e somá-la contava resultados que a conta real
 *   não teve.
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

/** O que decide o factor de UMA conta — tudo lido da base, nada adivinhado pelo tamanho. */
export interface ContaParaFactor {
  tipo: TipoParaEquidade
  /** `conta_real_casa` (109) */
  contaReal?: boolean
  /** a conta é o espelho (`espelho_funded_account_id`) de uma estratégia */
  espelhoDe?: string | null
  /** conta-mestre cuja estratégia tem um espelho real da casa a representá-la */
  representadaPor?: string | null
}

export function factorNaEquidade(c: ContaParaFactor): number {
  if (c.tipo === 'provider' && c.representadaPor) return 0
  if (c.contaReal && c.tipo === 'financiada') return c.espelhoDe ? FACTOR_FUNDED : 1
  return factorDaConta(c.tipo)
}

export interface LinhaContaEquidade {
  id: string
  tipo: string
  mt5_login?: string | null
  provider_slug?: string | null
  metaapi_account_id?: string | null
  conta_real_casa?: boolean | null
}

export interface EstrategiaComEspelho {
  slug: string
  metaapi_account_id?: string | null
  espelho_funded_account_id?: string | null
}

/**
 * Puro: o factor e a razão de cada conta ACTIVA, com as ligações espelho↔mestre.
 * Uma mestre só sai da soma se o espelho dela estiver na lista (activo) E for conta real da casa —
 * um espelho que não conta como real não pode apagar a mestre.
 */
export function planoDaEquidade(
  contas: LinhaContaEquidade[],
  estrategias: EstrategiaComEspelho[],
): Map<string, ContaParaFactor & { factor: number }> {
  const porId = new Map(contas.map((c) => [c.id, c]))
  const espelhoDe = new Map<string, string>() // id do espelho → slug
  const representada = new Map<string, string>() // slug ou metaapi da mestre → login do espelho
  for (const e of estrategias) {
    const esp = e.espelho_funded_account_id ? porId.get(e.espelho_funded_account_id) : undefined
    if (!esp || esp.conta_real_casa !== true || esp.tipo !== 'financiada') continue
    espelhoDe.set(esp.id, e.slug)
    const rotulo = esp.mt5_login ?? esp.id
    representada.set(`slug:${e.slug}`, rotulo)
    if (e.metaapi_account_id) representada.set(`metaapi:${e.metaapi_account_id}`, rotulo)
  }
  const plano = new Map<string, ContaParaFactor & { factor: number }>()
  for (const c of contas) {
    const tipo: TipoParaEquidade = c.tipo === 'provider' ? 'provider' : 'financiada'
    const base: ContaParaFactor = {
      tipo,
      contaReal: c.conta_real_casa === true,
      espelhoDe: espelhoDe.get(c.id) ?? null,
      representadaPor: tipo === 'provider'
        ? (c.provider_slug ? representada.get(`slug:${c.provider_slug}`) : undefined)
          ?? (c.metaapi_account_id ? representada.get(`metaapi:${c.metaapi_account_id}`) : undefined)
          ?? null
        : null,
    }
    plano.set(c.id, { ...base, factor: factorNaEquidade(base) })
  }
  return plano
}

/** A frase curta que explica o factor (relatório diário e painel de desempenho). */
export function notaDoFactor(p: ContaParaFactor & { factor: number }, nominal: number): string {
  const valor = nominal.toLocaleString('pt-PT')
  if (p.representadaPor) return `0% de ${valor} — representada pelo espelho real ${p.representadaPor}`
  if (p.contaReal && p.espelhoDe) return `10% de ${valor} — conta real da casa, espelho de ${p.espelhoDe}`
  if (p.contaReal) return `100% de ${valor} — conta real da casa`
  return `${Math.round(p.factor * 100)}% de ${valor} — capital real da MTM`
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
  /** Porque é que o factor é este (ver `notaDoFactor`). */
  nota: string
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

  // `conta_real_casa` (109) quando existe; sem ela, lê-se sem ela e tudo fica como antes.
  const { selecionarComOpcionais } = await import('@/lib/mtmfunded/numeros-conta')
  const [{ data: contas }, { data: estrategias }] = await Promise.all([
    selecionarComOpcionais<Record<string, unknown>>(
      'id, mt5_login, tipo, provider_slug, saldo_inicial, metaapi_account_id, metricas, motor, sim_equity, sim_saldo',
      (cols) => db.from('mtm_trading_accounts').select(cols).in('tipo', ['financiada', 'provider']).eq('estado', 'ativa') as never,
    ),
    db.from('mtmauto_providers').select('slug, metaapi_account_id, espelho_funded_account_id'),
  ])
  const plano = planoDaEquidade(contas as unknown as LinhaContaEquidade[], (estrategias ?? []) as EstrategiaComEspelho[])

  const saida: ContaNaEquidade[] = []
  for (const c of contas) {
    const p = plano.get(String(c.id))!
    const tipo = p.tipo
    const factor = p.factor

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
          : `${p.contaReal ? 'Real da casa' : 'Financiada'} · ${c.mt5_login ?? '—'}`,
      tipo,
      metaapiId: (c.metaapi_account_id as string) ?? null,
      valorNominal: Math.round(nominal * 100) / 100,
      contribuicao: Math.round(nominal * factor * 100) / 100,
      factor,
      nota: notaDoFactor(p, Math.round(nominal * 100) / 100),
    })
  }
  return saida
}
