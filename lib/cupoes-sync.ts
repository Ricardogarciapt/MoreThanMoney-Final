/**
 * Mantém a tabela `coupons` e o Stripe iguais (19/11/2026). Corre no painel (cada edição) e no
 * cron diário `/api/cron/cupoes-sincronizar`.
 *
 * Regras:
 *  - `coupons` manda. O Stripe espelha: promotion code ativo só quando o cupão está vivo
 *    (ativo, dentro das datas, com usos — contados em `coupon_usages`).
 *  - Cupões que não passam pelo checkout (parceria, atribuição, campanha 90d, por pessoa
 *    MTM-APP/MTM-BROKER, marketplace) não têm promotion code — ficam de fora.
 *  - Um cupão com data de fim já passada deixa de estar ativo também na base.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { precisaDeStripe } from '@/lib/cupoes-codigo'
import { usosDoCupao } from '@/lib/cupoes-usos'
import { sincronizarCupaoComStripe, type AcaoSync, type LinhaParaSync } from '@/lib/stripe-coupons'

type Db = Pick<SupabaseClient, 'from'>

export type ResultadoSyncCupao = { code: string; acao: AcaoSync | 'expirado'; detalhe?: string }
type Origem = 'painel' | 'cron'

async function estaVivo(db: Db, row: LinhaParaSync, agora: Date): Promise<boolean> {
  if (!row.is_active) return false
  if (row.valid_from && new Date(row.valid_from) > agora) return false
  if (row.valid_until && new Date(row.valid_until) < agora) return false
  if (row.max_uses != null) {
    const usos = await usosDoCupao(db, row.id)
    if (usos == null || usos >= row.max_uses) return false
  }
  return true
}

/** Sincroniza uma linha e grava na base os ids Stripe novos, se os houver. */
export async function sincronizarLinhaCupao(
  db: Db,
  row: LinhaParaSync,
  opts: { agora?: Date; origem?: Origem } = {},
): Promise<ResultadoSyncCupao> {
  const agora = opts.agora ?? new Date()
  if (!precisaDeStripe(row)) return { code: row.code, acao: 'ignorado' }
  const vivo = await estaVivo(db, row, agora)
  const r = await sincronizarCupaoComStripe(row, vivo, opts.origem ?? 'cron')
  if (r.acao === 'desligar_na_base') {
    await db.from('coupons').update({ is_active: false, updated_at: agora.toISOString() }).eq('id', row.id)
  }
  if (r.stripe_coupon_id && r.stripe_promotion_code_id) {
    await db
      .from('coupons')
      .update({
        stripe_coupon_id: r.stripe_coupon_id,
        stripe_promotion_code_id: r.stripe_promotion_code_id,
        updated_at: agora.toISOString(),
      })
      .eq('id', row.id)
  }
  return { code: row.code, acao: r.acao, detalhe: r.detalhe }
}

export async function sincronizarCupaoPorId(db: Db, id: string): Promise<ResultadoSyncCupao | null> {
  const { data } = await db.from('coupons').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  return sincronizarLinhaCupao(db, data as LinhaParaSync, { origem: 'painel' })
}

/** Passa por todos os cupões. `ensaio` = só diz o que está fora de sítio, não mexe em nada. */
export async function sincronizarTodosOsCupoes(db: Db, opts: { ensaio?: boolean } = {}) {
  const agora = new Date()
  const { data, error } = await db.from('coupons').select('*')
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as LinhaParaSync[]
  const resultados: ResultadoSyncCupao[] = []

  for (const row of linhas) {
    // Data de fim passada → desligado também na base (o Stripe trata-se a seguir).
    if (row.is_active && row.valid_until && new Date(row.valid_until) < agora) {
      if (!opts.ensaio) {
        await db.from('coupons').update({ is_active: false, updated_at: agora.toISOString() }).eq('id', row.id)
      }
      row.is_active = false
      resultados.push({ code: row.code, acao: 'expirado' })
    }
    if (opts.ensaio) {
      if (precisaDeStripe(row) && row.is_active && !row.stripe_promotion_code_id) {
        resultados.push({ code: row.code, acao: 'criado', detalhe: 'falta no Stripe (ensaio)' })
      }
      continue
    }
    const r = await sincronizarLinhaCupao(db, row, { agora, origem: 'cron' })
    if (r.acao !== 'ok' && r.acao !== 'ignorado') resultados.push(r)
  }

  const contar = (a: string) => resultados.filter((r) => r.acao === a).length
  return {
    total: linhas.length,
    criados: contar('criado'),
    recriados: contar('recriado'),
    desativados: contar('desativado'),
    desligados_na_base: contar('desligar_na_base'),
    expirados: contar('expirado'),
    erros: resultados.filter((r) => r.acao === 'erro'),
    alteracoes: resultados,
    em: agora.toISOString(),
  }
}
