import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANOS_DCA, posicoesDaCarteira, type MovimentoMin, type PosicaoCarteira } from './dca-semanal'

/**
 * O LADO DA BASE DAS CONTAS DE PORTEFÓLIO (PORTF-CRIPTO e PORTF-ETF).
 *
 * ── O DEFEITO DE 06/11 ───────────────────────────────────────────────────────────────────────
 * O cron do DCA lia os movimentos com um `select` simples, e o PostgREST devolve no máximo 1 000
 * linhas. A conta Cripto tem 2 174 e a ETF 1 287: a carteira saía a meio e o valor de mercado
 * gravado na curva vinha errado (ETF 7 501 $ a 13/11 quando valia 9 900 $; a Cripto perdeu a caixa
 * da limpeza de 01/10). `lerMovimentos` lê em páginas até ao fim.
 *
 * ── O VALOR DE HOJE ──────────────────────────────────────────────────────────────────────────
 * A curva é semanal (o DCA de sexta). Entre sextas, o cron das cotações (15 min) marca as contas
 * ao mercado: grava em `metricas.valor_hoje`, `metricas.posicoes_hoje` e `sim_equity`. É em
 * `metricas` que a /portfolios lê, porque o motor antigo da VPS reescreve `sim_equity` com o saldo
 * de hora a hora (e junta `metricas`, sem as apagar).
 */

const PAGINA = 1000

export async function lerMovimentos(db: SupabaseClient, contaId: string, ate?: string): Promise<MovimentoMin[]> {
  const out: MovimentoMin[] = []
  for (let de = 0; de < 100_000; de += PAGINA) {
    let q = db.from('portefolio_movimentos').select('symbol, tipo, unidades, valor').eq('conta_id', contaId)
    if (ate) q = q.lte('data', ate)
    const { data, error } = await q.order('id').range(de, de + PAGINA - 1)
    if (error) throw error
    out.push(...((data ?? []) as MovimentoMin[]))
    if (!data || data.length < PAGINA) break
  }
  return out
}

export interface MarcaAoMercado {
  conta: string
  valor: number | null
  caixa?: number
  semCotacao?: string[]
  erro?: string
}

export interface PosicoesHoje {
  valor_hoje: number
  valor_hoje_em: string
  caixa_hoje: number
  posicoes_hoje: PosicaoCarteira[]
}

/** Marca as duas contas ao preço de `portfolio_cotacoes`. Activo sem cotação → a conta não se grava. */
export async function marcarPortefoliosAoMercado(db: SupabaseClient): Promise<MarcaAoMercado[]> {
  const { data: cot } = await db.from('portfolio_cotacoes').select('symbol, preco')
  const precos: Record<string, number> = {}
  for (const c of cot ?? []) if (Number(c.preco) > 0) precos[String(c.symbol).toUpperCase()] = Number(c.preco)

  const out: MarcaAoMercado[] = []
  for (const plano of PLANOS_DCA) {
    try {
      const { data: conta } = await db.from('mtm_trading_accounts').select('id, metricas')
        .eq('mt5_login', plano.login).eq('conta_portefolio', true).maybeSingle()
      if (!conta) { out.push({ conta: plano.login, valor: null, erro: 'conta não encontrada' }); continue }
      const movs = await lerMovimentos(db, String(conta.id))
      const r = posicoesDaCarteira(movs, precos)
      if (r.valor == null) {
        out.push({ conta: plano.login, valor: null, semCotacao: r.posicoes.filter((p) => p.preco == null).map((p) => p.symbol) })
        continue
      }
      const hoje: PosicoesHoje = { valor_hoje: r.valor, valor_hoje_em: new Date().toISOString(), caixa_hoje: r.caixa, posicoes_hoje: r.posicoes }
      const metricas = { ...((conta.metricas ?? {}) as Record<string, unknown>), ...hoje }
      const { error } = await db.from('mtm_trading_accounts').update({ sim_equity: r.valor, metricas }).eq('id', conta.id)
      if (error) throw error
      out.push({ conta: plano.login, valor: r.valor, caixa: r.caixa })
    } catch (e) {
      out.push({ conta: plano.login, valor: null, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
