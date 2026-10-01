import type { SupabaseClient } from '@supabase/supabase-js'
import { tipoCurto, estadoCurto, type EstadoCurto, type TipoCurto } from './etiquetas'
import { barrasDeRegras, type BarraRegra } from './admin-conta'
import { ehContaRealDaCasa } from './conta-real-casa'
import { estatisticasDaConta, type Estatisticas, type LinhaTrade, type Snapshot } from './simulado/estatisticas'

/**
 * OS NÚMEROS DE UMA CONTA MTM FUNDED — UMA fonte para o dono e para o admin.
 *
 * Antes de 2026-09-15 cada ecrã fazia as contas à sua maneira, e o mesmo trader via uma coisa e o
 * admin outra:
 *  · o estado «Pause» (pausa do admin, `pausada_em`, 079) só aparecia no modal do admin — no
 *    WebTrader, no seletor e na lista de contas do admin a conta dizia «Active»;
 *  · o levantável que o dono via (GET /api/mtmfunded/levantamentos) media a equity pelas métricas
 *    antigas; o pedido (POST) e o admin mediam pelo saldo exacto da conta simulada — o ecrã podia
 *    dizer 0 e o pedido aceitar, ou o contrário;
 *  · as barras das regras do WebTrader tinham outra base para a perda diária e não mostravam a
 *    consistência; as do admin sim;
 *  · as estatísticas liam a base em duas rotas copiadas uma da outra.
 *
 * Tudo o que mostra números de uma conta passa por aqui: `numerosDaConta` (pura), `barrasDaConta`
 * (pura, as regras), `equityParaLevantamento` (pura) e `estatisticasDaContaServidor` (lê a base,
 * as mesmas três consultas indexadas por `account_id`). O teste de paridade
 * (lib/mtmfunded/__tests__/numeros-conta.check.ts) e o script scripts/verificar-paridade-contas.ts
 * confirmam que o dono e o admin recebem os mesmos valores.
 */

export interface LinhaContaNumeros {
  id: string
  tipo: string
  estado: string
  motor?: string | null
  saldo_inicial?: number | string | null
  sim_saldo?: number | string | null
  sim_equity?: number | string | null
  sim_margem?: number | string | null
  sim_ancora_dia?: number | string | null
  sim_dias_negociados?: number | string | null
  pausada_em?: string | null
  metricas?: Record<string, unknown> | null
  segue_estrategia?: string | null
  conta_casa?: boolean | null
  /** 109 — conta real da casa (lib/mtmfunded/conta-real-casa.ts). */
  conta_real_casa?: boolean | null
  /** 173 — carteira reconstituída: `sim_equity` é o valor de mercado, não um espelho do saldo. */
  conta_portefolio?: boolean | null
}

export interface NumerosConta {
  id: string
  etiqueta: TipoCurto
  estadoCurto: EstadoCurto
  motor: 'sim' | 'mt5'
  saldoInicial: number
  saldo: number
  equity: number
  flutuante: number
  margem: number
  resultadoPct: number | null
  fase: number
  analise: boolean
  pausada: boolean
  diasNegociados: number
  ancoraDia: number | null
  lucroPorDia: Record<string, number> | null
  segueEstrategia: string | null
  contaCasa: boolean
  /** Conta real da casa: negociação real, mesmo sendo `analise` (sem regras). */
  contaReal: boolean
}

const n = (v: unknown, d = 0) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? d : x }
const r2 = (x: number) => Math.round(x * 100) / 100

export function numerosDaConta(c: LinhaContaNumeros): NumerosConta {
  const m = (c.metricas ?? {}) as Record<string, unknown>
  const sim = c.motor === 'sim'
  const saldoInicial = n(c.saldo_inicial)
  const saldo = sim ? n(c.sim_saldo) : n(m.saldo ?? m.balance, n(m.equity, saldoInicial))
  const equity = sim ? n(c.sim_equity, saldo) : n(m.equity, saldoInicial)
  const ancora = sim ? c.sim_ancora_dia : m.saldoReferenciaDia
  return {
    id: c.id,
    etiqueta: tipoCurto(c.tipo, m),
    estadoCurto: estadoCurto(c.estado, m, c.pausada_em ?? null),
    motor: sim ? 'sim' : 'mt5',
    saldoInicial,
    saldo: r2(saldo),
    equity: r2(equity),
    flutuante: r2(equity - saldo),
    margem: r2(sim ? n(c.sim_margem) : n(m.margemUsada)),
    resultadoPct: saldoInicial > 0 ? r2(((equity - saldoInicial) / saldoInicial) * 100) : null,
    fase: n(m.fase, 1),
    analise: m.analise === true || m.analise === 'true',
    pausada: Boolean(c.pausada_em),
    diasNegociados: n(sim ? c.sim_dias_negociados : m.diasNegociados),
    ancoraDia: ancora == null || ancora === '' ? null : n(ancora),
    lucroPorDia: (m.lucroPorDia ?? null) as Record<string, number> | null,
    segueEstrategia: c.segue_estrategia ?? null,
    contaCasa: c.conta_casa === true,
    contaReal: ehContaRealDaCasa(c),
  }
}

/**
 * As barras das regras (objectivo, perda diária, drawdown máximo, dias mínimos, consistência) —
 * as MESMAS no WebTrader e no admin. `equity` opcional: o WebTrader passa a do ecrã (preços ao vivo).
 * Conta de análise: as barras vêm na mesma (com «análise: não quebra»); o ecrã do dono troca-as
 * por «sem regras», o admin mostra-as — os valores são os mesmos.
 */
export type BaseBarras = Pick<NumerosConta, 'saldoInicial' | 'equity' | 'ancoraDia' | 'diasNegociados' | 'fase' | 'lucroPorDia' | 'analise'>

export function barrasDaConta(num: BaseBarras, regras: Record<string, unknown> | null, equity?: number): BarraRegra[] {
  return barrasDeRegras({
    regras, saldoInicial: num.saldoInicial, equity: equity ?? num.equity, ancoraDia: num.ancoraDia,
    diasNegociados: num.diasNegociados, fase: num.fase, lucroPorDia: num.lucroPorDia, analise: num.analise,
  })
}

/**
 * A equity sobre que se calcula o levantável. Conta simulada: o SALDO exacto (sem posições abertas,
 * que é a condição para levantar, saldo = equity). Conta da corretora: a última leitura das métricas.
 */
export function equityParaLevantamento(c: LinhaContaNumeros): number {
  const m = (c.metricas ?? {}) as Record<string, unknown>
  if (c.motor === 'sim' && c.sim_saldo != null) return n(c.sim_saldo)
  return typeof m.equity === 'number' ? m.equity : n(c.saldo_inicial)
}

/** As estatísticas da conta, lidas da base — a rota do WebTrader e a do admin chamam ESTA. */
export async function estatisticasDaContaServidor(
  db: SupabaseClient,
  conta: LinhaContaNumeros,
  opts: { equity?: number | null; agora?: Date } = {},
): Promise<Estatisticas> {
  const [{ data: fechadas }, { data: abertas }, { data: fotos }] = await Promise.all([
    db.from('funded_positions')
      .select('id, mae_id, symbol, direcao, volume, pnl, comissao, swap, aberta_em, fechada_em, origem, comentario, motivo_fecho, risco_inicial')
      .eq('account_id', conta.id).eq('estado', 'fechada').order('fechada_em', { ascending: true }).limit(10000),
    db.from('funded_positions').select('id').eq('account_id', conta.id).eq('estado', 'aberta'),
    db.from('funded_equity_snapshots').select('em, saldo, equity').eq('account_id', conta.id)
      .order('em', { ascending: false }).limit(2000),
  ])
  const eq = Number(opts.equity)
  const equity = Number.isFinite(eq) && eq > 0 ? eq : n(conta.sim_equity ?? conta.sim_saldo ?? conta.saldo_inicial)
  return estatisticasDaConta({
    saldoInicial: n(conta.saldo_inicial),
    equity,
    fechadas: (fechadas ?? []) as unknown as LinhaTrade[],
    abertasIds: new Set((abertas ?? []).map((a) => String(a.id))),
    snapshots: ((fotos ?? []) as unknown as Snapshot[]).reverse(),
    agora: opts.agora,
  })
}

/** Reduz a curva por baldes, guardando em cada balde o ponto de maior drawdown (o que importa ver). */
export function reduzirCurva<T extends { ddPct: number }>(pts: T[], max: number): T[] {
  if (pts.length <= max) return pts
  const balde = Math.ceil(pts.length / max)
  const out: T[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i += balde) {
    const fatia = pts.slice(i, Math.min(i + balde, pts.length - 1))
    out.push(fatia.reduce((acc, p) => (p.ddPct < acc.ddPct ? p : acc), fatia[0]))
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Pontos da curva que as duas rotas devolvem (o mesmo número nas duas: antes 600 no dono, 500 no admin). */
export const PONTOS_CURVA = 600

/**
 * Colunas que só existem com migrações que podem ainda não estar aplicadas: `pausada_em` (079),
 * `conta_casa` (082, outro ramo), `conta_real_casa` (109), `etiqueta` (113) e `conta_portefolio`
 * (173). Uma coluna em falta num select explícito
 * dá ERRO e lista vazia — o pior modo de falhar (ecrã sem contas). Tenta-se com todas; se a base
 * disser QUAL falta, repete-se sem essa e com as outras (com a 079 e a 082 aplicadas e a 109 por
 * aplicar, `pausada_em` e `conta_casa` continuam a vir). Se não disser, repete-se sem nenhuma.
 */
export const COLUNAS_OPCIONAIS = ['pausada_em', 'conta_casa', 'conta_real_casa', 'etiqueta', 'conta_portefolio'] as const

const COLUNA_EM_FALTA = /column\s+(?:"?\w+"?\.)?"?(\w+)"?\s+does not exist/i

export async function selecionarComOpcionais<T>(
  colunas: string,
  consulta: (cols: string) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  let opcionais: string[] = [...COLUNAS_OPCIONAIS]
  // No máximo uma volta por coluna opcional + a volta sem nenhuma.
  for (let volta = 0; volta <= COLUNAS_OPCIONAIS.length; volta++) {
    const r = await consulta(opcionais.length ? `${colunas}, ${opcionais.join(', ')}` : colunas)
    if (!r.error) return { data: r.data ?? [], error: null }
    const faltaColuna = r.error.code === '42703' || /column .* does not exist/i.test(r.error.message)
    if (!faltaColuna || !opcionais.length) return { data: [], error: r.error }
    const falta = COLUNA_EM_FALTA.exec(r.error.message)?.[1]
    opcionais = falta && opcionais.includes(falta) ? opcionais.filter((c) => c !== falta) : []
  }
  return { data: [], error: { message: 'colunas opcionais: sem resposta' } }
}
