import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'MTM Funded · More Than Money',
  description: 'Desafios de trading financiados e torneios trimestrais da More Than Money.',
}

/**
 * A porta do MTM Funded.
 *
 * Enquanto o produto estiver desligado — e nasce desligado — esta página não vende nada:
 * encaminha para o torneio, que existe à parte e continua a funcionar. É o interruptor a
 * ser respeitado no servidor, antes de qualquer preço chegar ao browser: esconder os preços
 * no cliente deixava-os no HTML para quem abrisse as ferramentas do browser.
 */
export default async function MtmFundedPage() {
  const config = await getMtmFundedConfig()

  if (!config.ativo) {
    redirect('/mtmfunded/tradingtournament')
  }

  const { data: programas } = await getSupabaseAdmin()
    .from('mtm_funded_programs')
    .select('slug, nome, descricao, fases, saldo, preco_cents, moeda, regras')
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  const euros = (cents: number) => (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

  return (
    <main className="min-h-screen bg-[#050608] text-white">
      <section className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-[#D2A63C]">More Than Money</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">MTM Funded</h1>
        <p className="mt-4 max-w-2xl text-zinc-400">
          Prova o que vales numa conta avaliada. Regras claras, métricas à vista, e um caminho
          até uma conta financiada da MTM.
        </p>

        {!config.vendas_abertas && (
          <div className="mt-8 rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4 text-sm text-[#D2A63C]">
            As inscrições nos desafios abrem em breve. Entretanto, o torneio trimestral está a
            decorrer — e é grátis.
          </div>
        )}

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(programas ?? []).map((p) => {
            const r = (p.regras ?? {}) as Record<string, number>
            return (
              <div key={p.slug} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                <h2 className="text-lg font-semibold">{p.nome}</h2>
                <p className="mt-1 text-3xl font-bold text-[#D2A63C]">{euros(p.preco_cents)}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Conta de {Number(p.saldo).toLocaleString('pt-PT')} USD · {p.fases}{' '}
                  {p.fases === 1 ? 'fase' : 'fases'}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm text-zinc-400">
                  {r.objetivo_pct != null && <li>Objectivo: +{r.objetivo_pct}%</li>}
                  {r.perda_diaria_pct != null && <li>Perda diária: {r.perda_diaria_pct}%</li>}
                  {r.perda_maxima_pct != null && <li>Perda máxima: {r.perda_maxima_pct}%</li>}
                  {r.dias_minimos != null && <li>Dias mínimos: {r.dias_minimos}</li>}
                  {r.consistencia_pct != null && <li>Consistência: máx. {r.consistencia_pct}%/dia</li>}
                </ul>
                {config.vendas_abertas ? (
                  <Link
                    href={`/mtmfunded/checkout?programa=${p.slug}`}
                    className="mt-5 block rounded-lg bg-[#D2A63C] py-2.5 text-center text-sm font-semibold text-black"
                  >
                    Começar
                  </Link>
                ) : (
                  <span className="mt-5 block rounded-lg border border-zinc-800 py-2.5 text-center text-sm text-zinc-600">
                    Brevemente
                  </span>
                )}
              </div>
            )
          })}
          {!(programas ?? []).length && (
            <p className="text-sm text-zinc-500">Os programas estão a ser preparados.</p>
          )}
        </div>

        <div className="mt-14 rounded-2xl border border-[#D2A63C]/25 bg-gradient-to-b from-[#D2A63C]/[0.07] to-transparent p-6">
          <h2 className="text-xl font-semibold">Trading Tournament</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Torneio trimestral, gratuito, com conta avaliada. Compete, cresce, conquista o teu lugar.
          </p>
          <Link
            href="/mtmfunded/tradingtournament"
            className="mt-4 inline-block rounded-lg border border-[#D2A63C]/60 px-5 py-2 text-sm font-medium text-[#D2A63C]"
          >
            Ver o torneio
          </Link>
        </div>
      </section>
    </main>
  )
}
