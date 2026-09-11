import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { Promo } from '@/components/mtmfunded/splash-promos'

/**
 * AS PROMOÇÕES A DECORRER, lidas da base de dados.
 *
 * Nada aqui está escrito à mão. Uma campanha existe quando existe a linha — o cupão na tabela
 * `coupons`, o programa com `regras.campanha` em `mtm_funded_programs`. Escrever os textos
 * numa constante obrigava a um deploy para acabar uma campanha, e acabava sempre por deixar
 * no ar um pop-up a anunciar um desconto que já não é aceite no checkout.
 *
 * Por isso mesmo: um cupão desactivado ou fora de validade desaparece do splash sozinho, pela
 * mesma condição que o faz falhar na compra.
 */
export async function promosAtivas(): Promise<Promo[]> {
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  const [{ data: cupoes }, { data: programas }] = await Promise.all([
    db
      .from('coupons')
      .select('code, type, discount_value, plan_override, valid_until, description, is_active, max_uses, used_count')
      .eq('is_active', true)
      .in('plan_override', ['mtmfunded', 'any', 'both'])
      .eq('type', 'discount_pct')
      .or(`valid_until.is.null,valid_until.gte.${agora}`),
    db
      .from('mtm_funded_programs')
      .select('slug, nome, descricao, saldo, fases, preco_cents, regras, ativo')
      .eq('ativo', true),
  ])

  const promos: Promo[] = []

  // ── programas de campanha ─────────────────────────────────────────────────
  for (const p of programas ?? []) {
    const regras = (p.regras ?? {}) as Record<string, unknown>
    const campanha = typeof regras.campanha === 'string' ? regras.campanha : null
    if (!campanha) continue

    const euros = (Number(p.preco_cents) / 100).toLocaleString('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    })
    promos.push({
      campanha,
      etiqueta: campanha,
      titulo: `${Number(p.saldo).toLocaleString('pt-PT')} USD · ${p.fases} fases por ${euros}`,
      detalhe:
        regras.um_por_pessoa === true
          ? 'Um por pessoa, enquanto durar o lançamento. As regras são as do desafio normal.'
          : 'Enquanto durar o lançamento. As regras são as do desafio normal.',
      cta: 'Quero este',
      href: `/mtmfunded/checkout?programa=${p.slug}`,
    })
  }

  // ── cupões de desconto ────────────────────────────────────────────────────
  for (const c of cupoes ?? []) {
    // Um cupão esgotado continua activo na tabela, mas já não desconta nada. Anunciá-lo era
    // mandar a pessoa bater com a porta no checkout.
    const max = Number(c.max_uses ?? 0)
    if (max > 0 && Number(c.used_count ?? 0) >= max) continue

    promos.push({
      campanha: String(c.code),
      etiqueta: `${Number(c.discount_value)}% de desconto`,
      titulo: `${Number(c.discount_value)}% em qualquer desafio`,
      detalhe: 'Escreve o código no checkout, no campo do cupão. Aplica-se a todos os tamanhos.',
      cta: 'Ver os desafios',
      href: '/mtmfunded#programas',
      codigo: String(c.code),
      acabaEm: (c.valid_until as string) ?? undefined,
    })
  }

  return promos
}
