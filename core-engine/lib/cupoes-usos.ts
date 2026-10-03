/**
 * QUANTAS VEZES UM CUPÃO FOI MESMO USADO — contado em `coupon_usages`, não no contador.
 *
 * 25/09: descobriu-se que `coupons.used_count` NUNCA subia. A RPC `increment_coupon_usage` que o
 * devia incrementar não existe em `pg_proc`, e o caminho alternativo gravava
 * `used_count: supabase.rpc as unknown as number` — uma função passada como número, que o
 * `JSON.stringify` deixa cair em silêncio. Foi o `as unknown as` que escondeu isto do compilador.
 *
 * Consequência: como quem valida um cupão comparava `used_count >= max_uses`, o limite NUNCA
 * disparava. Um cupão de uso único — o um-por-pessoa do MTM Funded, por exemplo — podia ser
 * resgatado sem limite pela app iOS. (Verificado a 25/09: o buraco existia mas ainda não tinha sido
 * usado; os três cupões já resgatados tinham contador certo.)
 *
 * PORQUÊ CONTAR EM VEZ DE ARRANJAR O CONTADOR (decisão do dono, 25/09): a tabela `coupon_usages`
 * já regista o uso real, por cupão e por pessoa, e é ela que manda na regra de «um por pessoa».
 * Um contador é uma segunda versão da verdade que pode voltar a divergir — e já divergiu. Contar
 * a fonte não pode ficar dessincronizado, e dispensa uma migração.
 *
 * O `used_count` fica onde está, para não partir o que o lê, mas deixa de MANDAR em coisa nenhuma.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Usos reais de um cupão. Em caso de dúvida devolve `null` — e quem chama decide. */
export async function usosDoCupao(
  db: Pick<SupabaseClient, 'from'>,
  couponId: string,
): Promise<number | null> {
  const { count, error } = await db
    .from('coupon_usages')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId)
  if (error || count == null) return null
  return count
}

/**
 * O cupão está esgotado?
 *
 * Sem limite, nunca. Com limite e SEM conseguir contar, responde `true`: um cupão que dá acesso
 * pago não se concede às cegas. É o oposto do que acontecia — em que a dúvida dava sempre o
 * benefício a quem resgatava.
 */
export async function cupaoEsgotado(
  db: Pick<SupabaseClient, 'from'>,
  coupon: { id: string; max_uses: number | null },
): Promise<boolean> {
  if (coupon.max_uses == null) return false
  const usos = await usosDoCupao(db, coupon.id)
  if (usos == null) return true
  return usos >= coupon.max_uses
}
