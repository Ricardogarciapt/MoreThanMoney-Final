import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import FormularioSorteio from './formulario'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sorteio de lançamento · MTM Funded',
  description:
    '5 contas de desafio de 5.000 USD, 3 mensalidades de Membro, 1 Premium e 1 mentoria VIP. ' +
    'Participação gratuita.',
}

/**
 * A PÁGINA DO SORTEIO.
 *
 * O que está em jogo vem da base de dados, não daqui: acabada a campanha, a página diz que
 * acabou sem ninguém ter de a editar. Um sorteio a anunciar prémios já entregues é pior do que
 * não ter página nenhuma.
 *
 * O código de referência aparece no URL (`?ref=ABC123`) porque é assim que ele viaja — colado
 * num story, mandado por mensagem. Quem chega por um deles entra já ligado a quem o trouxe.
 */
export default async function PaginaSorteio({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; porta?: string }>
}) {
  const sp = await searchParams
  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()

  const [{ data: campanhas }, { data: premios }, { count: participantes }] = await Promise.all([
    db.from('giveaways')
      .select('slug, nome, variante, descricao, mecanica, acaba_em')
      .eq('estado', 'a_decorrer').gt('acaba_em', agora).order('variante'),
    db.from('giveaway_prizes').select('slug, nome, descricao, quantidade').order('ordem'),
    db.from('giveaway_entries').select('id', { count: 'exact', head: true }).eq('validada', true),
  ])

  const aberto = Boolean(campanhas?.length)
  const acaba = campanhas?.[0]?.acaba_em as string | undefined
  const total = (premios ?? []).reduce((a, p) => a + Number(p.quantidade ?? 0), 0)

  return (
    <main className="min-h-screen bg-[#08080a] text-white">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <div className="flex items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mtm-transparent.png" alt="More Than Money" className="h-12 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mtmfunded/logo-mtm-funded-v2.png" alt="MTM Funded" className="h-12 w-auto" />
        </div>

        <p className="mt-12 text-xs uppercase tracking-[0.3em] text-[#D2A63C]">
          Sorteio de lançamento
        </p>
        <h1 className="mt-3 text-4xl font-black leading-[1.05] sm:text-6xl">
          {total} prémios.
          <br />
          <span className="text-[#D2A63C]">Cinco contas de 5.000 USD.</span>
        </h1>

        {aberto ? (
          <>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/60">
              Estamos a lançar a MTM Funded e não queríamos fazê-lo em silêncio. Participar é
              gratuito e não precisas de comprar nada.
              {acaba && (
                <>
                  {' '}O sorteio é a{' '}
                  <strong className="text-white">
                    {new Date(acaba).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}
                  </strong>
                  .
                </>
              )}
            </p>

            <ul className="mt-10 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03]">
              {(premios ?? []).map((p) => (
                <li key={p.slug} className="flex items-start gap-4 p-4 sm:p-5">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D2A63C]/15 text-sm font-bold text-[#D2A63C]">
                    {p.quantidade}×
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">{p.nome}</p>
                    {p.descricao && (
                      <p className="mt-0.5 text-[13px] leading-relaxed text-white/50">{p.descricao}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <FormularioSorteio
              referencia={sp.ref ?? null}
              participantes={participantes ?? 0}
              campanhaOmissa={
                (campanhas ?? []).find((c) => c.slug === sp.porta)?.slug ??
                (campanhas ?? []).find((c) => c.variante === 'B')?.slug ??
                (campanhas ?? [])[0]?.slug ??
                ''
              }
            />
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[15px] leading-relaxed text-white/70">
              O sorteio já fechou. Os vencedores são contactados por email e por mensagem — se
              entraste, fica atento à caixa de entrada.
            </p>
            <a
              href="/mtmfunded"
              className="mt-5 inline-block rounded-lg bg-[#D2A63C] px-6 py-3 text-[14px] font-bold text-black"
            >
              Ver os desafios MTM Funded
            </a>
          </div>
        )}

        <p className="mt-14 text-[11.5px] leading-relaxed text-white/35">
          Participação gratuita e sem obrigação de compra. O sorteio é aleatório, feito com uma
          semente registada, e o resultado pode ser reconstruído por qualquer pessoa. Não associado
          nem patrocinado pelo Instagram. As contas de desafio são simuladas, com dinheiro virtual,
          e nada nesta página é aconselhamento financeiro.
        </p>
      </div>
    </main>
  )
}
