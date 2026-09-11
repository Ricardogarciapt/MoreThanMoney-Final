import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import FormularioCheckout from './formulario'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Checkout' }

/**
 * A página do checkout de um programa de avaliação.
 *
 * O programa e o preço são lidos no SERVIDOR e mostrados a partir daí. O que segue para o
 * Stripe é o slug, e é o servidor que lhe vai buscar o preço outra vez — o browser nunca
 * carrega um valor que alguém possa trocar pelo caminho.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ programa?: string }>
}) {
  const { programa: slug } = await searchParams
  const config = await getMtmFundedConfig()

  // O interruptor vale aqui também: com as vendas fechadas não há sequer página de compra.
  if (!config.ativo || !config.vendas_abertas) redirect('/mtmfunded')
  if (!slug) redirect('/mtmfunded')

  const { data: programa } = await getSupabaseAdmin()
    .from('mtm_funded_programs')
    .select('slug, nome, descricao, fases, saldo, preco_cents, regras, ativo')
    .eq('slug', slug)
    .maybeSingle()

  if (!programa || !programa.ativo) redirect('/mtmfunded')

  const r = (programa.regras ?? {}) as Record<string, number>

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 text-white">
      <p className="text-xs uppercase tracking-[0.3em] text-[#D2A63C]">MTM Funded</p>
      <h1 className="mt-3 text-3xl font-bold">{programa.nome}</h1>
      {programa.descricao && <p className="mt-2 text-zinc-400">{programa.descricao}</p>}

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-zinc-500">Total</span>
          <span className="text-3xl font-bold text-[#D2A63C]">
            {(programa.preco_cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
          </span>
        </div>
        <ul className="mt-5 space-y-1.5 border-t border-zinc-900 pt-5 text-sm text-zinc-400">
          <li>Conta simulada de {Number(programa.saldo).toLocaleString('pt-PT')} USD</li>
          <li>{programa.fases} {programa.fases === 1 ? 'fase' : 'fases'}</li>
          {r.objetivo_pct != null && <li>Objectivo: +{r.objetivo_pct}%</li>}
          {r.perda_diaria_pct != null && <li>Perda diária máxima: {r.perda_diaria_pct}%</li>}
          {r.perda_maxima_pct != null && <li>Perda máxima total: {r.perda_maxima_pct}%</li>}
          {r.dias_minimos != null && <li>Dias mínimos de negociação: {r.dias_minimos}</li>}
        </ul>
      </div>

      <FormularioCheckout slug={programa.slug} precoCents={programa.preco_cents} />
    </main>
  )
}
