import Link from 'next/link'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RegrasDeNegociacao, type RegrasNegociacao } from '@/components/mtmfunded/regras-negociacao'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Programas',
  description: 'Avaliação de traders em contas simuladas, de 500 a 10.000 USD. Regras publicadas, métricas à vista.',
}

/**
 * A porta do MTM Funded.
 *
 * Construída à volta da ESCADA DE CONTAS, que é a decisão que a pessoa vem tomar: qual o
 * tamanho, quanto custa, que regras tem. Tudo isso numa tabela onde se comparam de lado, em
 * vez de cinco cartões que obrigam a decorar números enquanto se rola.
 *
 * O que NÃO está aqui, e é de propósito: números de pagamentos, contagens de traders,
 * classificações de sites de avaliações. Não temos nenhum desses números — e inventá-los era
 * exactamente o que faz este mercado ter má fama. O que se mostra é o que é verdade: as
 * contas são simuladas, as regras estão publicadas, e a classificação é pública.
 */
export default async function MtmFundedPage() {
  const config = await getMtmFundedConfig()
  const db = getSupabaseAdmin()

  // Com o produto desligado, esta página encaminha para o torneio — que existe à parte e
  // continua a funcionar. O interruptor é respeitado no SERVIDOR, antes de qualquer preço
  // chegar ao browser: escondê-los no cliente deixava-os no HTML de quem soubesse procurar.
  if (!config.ativo) {
    const { redirect } = await import('next/navigation')
    redirect('/mtmfunded/tradingtournament')
  }

  const { data: programas } = await db
    .from('mtm_funded_programs')
    .select('slug, nome, descricao, fases, saldo, preco_cents, moeda, regras')
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('nome, estado, comeca_em, saldo_inicial')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lista = programas ?? []
  // As regras de negociação são as mesmas em toda a escada: lê-se do primeiro programa em vez
  // de as repetir escritas à mão numa página que depois deixa de bater certo com a base de dados.
  const regrasNegociacao = (lista[0]?.regras ?? null) as RegrasNegociacao | null
  const euros = (cents: number) =>
    (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

  return (
    <main className="text-white">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-20 pb-12 sm:pt-28">
        <p className="kicker r">More Than Money</p>
        <h1 className="r d1 mt-4 max-w-4xl text-[clamp(38px,7vw,74px)] font-extrabold">
          Prova o que vales numa{' '}
          <span className="bg-gradient-to-r from-[#eccb78] to-[#d2a63c] bg-clip-text text-transparent">
            conta avaliada
          </span>
          .
        </h1>
        <p className="r d2 mt-6 max-w-2xl text-lg leading-relaxed text-[#a9a49a]">
          Escolhes o tamanho, negoceias com as regras à vista, e as métricas actualizam
          sozinhas. Sem letra pequena e sem promessas de rendimento.
        </p>

        <div className="r d3 mt-9 flex flex-wrap gap-3">
          <a href="#programas" className="btn">Ver os programas</a>
          <Link href="/mtmfunded/tradingtournament" className="btn g">
            Torneio gratuito
          </Link>
        </div>

        {/* Factos, não estatísticas de marketing. Cada um destes é verificável nesta página. */}
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <Facto titulo="Contas simuladas" nota="Dinheiro virtual. Não há fundos de participantes em lado nenhum." />
          <Facto titulo="Regras publicadas" nota="Antes de te inscreveres, e não mudam a meio da prova." />
          <Facto titulo="Classificação pública" nota="Actualiza de hora a hora, com o motivo à vista de quem não conta." />
        </div>
      </section>

      {/* ── A escada ───────────────────────────────────────────────────────── */}
      <section id="programas" className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="r text-3xl font-bold">Escolhe o tamanho — e o caminho</h2>
        <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
          Duas famílias, a mesma escada de contas. A de <b className="text-zinc-300">uma fase</b> é
          a difícil: passa-se mais depressa, e por isso pede mais lucro e perdoa menos perda. A de{' '}
          <b className="text-zinc-300">duas fases</b> pede menos de cada vez, em troca de mais tempo.
        </p>

        {!config.vendas_abertas && (
          <div className="mt-6 rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4 text-sm text-[#D2A63C]">
            As inscrições nos programas abrem em breve. Entretanto, o torneio trimestral é
            gratuito e tem conta avaliada.
          </div>
        )}

        {!lista.length ? (
          <p className="mt-8 text-sm text-zinc-500">Os programas estão a ser preparados.</p>
        ) : (
          <>
            {/* Tabela em ecrã largo: é onde a comparação se faz sem decorar nada. */}
            <div className="vidro r mt-10 hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/40 text-xs uppercase tracking-wider text-[#7b756a]">
                  <tr>
                    <th className="px-5 py-3">Conta</th>
                    <th className="px-5 py-3">Caminho</th>
                    <th className="px-5 py-3">Objectivo</th>
                    <th className="px-5 py-3">Perda diária</th>
                    <th className="px-5 py-3">Perda máxima</th>
                    <th className="px-5 py-3">Dias mín.</th>
                    <th className="px-5 py-3 text-right">Preço</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {lista.map((p) => {
                    const r = (p.regras ?? {}) as Record<string, number>
                    return (
                      <tr key={p.slug} className="transition-colors hover:bg-white/[0.03]">
                        <td className="px-5 py-4">
                          <span className="font-semibold text-white">
                            {Number(p.saldo).toLocaleString('pt-PT')} USD
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs ${
                            p.fases === 1
                              ? 'bg-[#D2A63C]/15 text-[#D2A63C]'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {p.fases === 1 ? '1 fase · difícil' : '2 fases'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-zinc-400">{r.objetivo_pct != null ? `+${r.objetivo_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.perda_diaria_pct != null ? `${r.perda_diaria_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.perda_maxima_pct != null ? `${r.perda_maxima_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.dias_minimos ?? '—'}</td>
                        <td className="px-5 py-4 text-right text-lg font-bold text-[#D2A63C]">
                          {euros(p.preco_cents)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {config.vendas_abertas ? (
                            <Link href={`/mtmfunded/checkout?programa=${p.slug}`} className="btn !px-5 !py-2 !text-xs">
                              Começar
                            </Link>
                          ) : (
                            <span className="text-xs text-zinc-600">Brevemente</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cartões no telemóvel: uma tabela de sete colunas num ecrã de 375px não se lê. */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:hidden">
              {lista.map((p) => {
                const r = (p.regras ?? {}) as Record<string, number>
                return (
                  <div key={p.slug} className={`vidro r p-5 ${p.fases === 1 ? "destaque" : ""}`}>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-lg font-semibold">
                        {Number(p.saldo).toLocaleString('pt-PT')} USD
                      </h3>
                      <span className="text-2xl font-bold text-[#D2A63C]">{euros(p.preco_cents)}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">
                      {p.fases} {p.fases === 1 ? 'fase' : 'fases'}
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
                        className="btn mt-5 w-full justify-center"
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
            </div>
          </>
        )}
      </section>

      {/* ── Como funciona ──────────────────────────────────────────────────── */}
      <section className="border-y border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="r text-3xl font-bold">Como funciona</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <Passo
              n={1}
              titulo="Escolhes e recebes a conta"
              texto="A conta é criada no MetaTrader em teu nome e as credenciais chegam por email, com um código QR que entra na app com um toque."
            />
            <Passo
              n={2}
              titulo="Negoceias com as regras à vista"
              texto="O painel mostra quanto falta até cada limite. Tudo medido sobre equity — as posições abertas contam."
            />
            <Passo
              n={3}
              titulo="Passas, e o certificado é teu"
              texto="Cumprindo os objectivos, sais com um certificado verificável e o caminho aberto para uma conta financiada da MTM."
            />
          </div>
        </div>
      </section>

      {/* ── As regras, explicadas ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="r text-3xl font-bold">As regras, em português</h2>
        <p className="r d1 mt-3 text-sm text-[#a9a49a]">
          São quatro, valem para toda a escada, e nenhuma delas muda a meio de uma prova.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Regra
            titulo="Perda diária"
            texto="Mede-se sobre a equity com que o dia abriu. Chegando ao limite, a conta congela na posição em que estava — não há liquidação-surpresa nem margem escondida."
          />
          <Regra
            titulo="Perda máxima total"
            texto="Sobre o saldo inicial. É o chão da conta. Nunca é maior do que a diária, por construção: uma diária acima da máxima seria uma regra que nunca chegava a disparar."
          />
          <Regra
            titulo="Dias mínimos"
            texto="Um resultado feito num dia não prova nada. Abaixo dos dias mínimos o resultado não conta, e a classificação diz-te porquê em vez de te deixar a adivinhar."
          />
          <Regra
            titulo="Consistência"
            texto="Nenhum dia pode valer mais do que uma fatia do lucro total. Passa quem repete, não quem acertou uma vez."
          />
        </div>
      </section>

      {/* ── Regras de negociação ───────────────────────────────────────────── */}
      {regrasNegociacao && (
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="r text-3xl font-bold">O que podes e não podes fazer</h2>
            <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
              Valem para toda a escada, na avaliação e na conta financiada. Estão aqui antes de
              comprares, e não numa página que só se lê quando já é tarde.
            </p>
            <div className="mt-8">
              <RegrasDeNegociacao r={regrasNegociacao} />
            </div>
          </div>
        </section>
      )}

      {/* ── Torneio ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="vidro destaque r bg-gradient-to-b from-[#D2A63C]/[0.07] to-transparent p-8 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D2A63C]">Gratuito</p>
          <h2 className="mt-2 text-2xl font-bold">
            {torneio?.nome ?? 'Trading Tournament'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Torneio trimestral com conta avaliada de{' '}
            {Number(torneio?.saldo_inicial ?? 10000).toLocaleString('pt-PT')} USD, sem custo.
            As mesmas regras, uma classificação pública, e prémios para o pódio.
          </p>
          <Link
            href="/mtmfunded/tradingtournament"
            className="btn mt-7"
          >
            {torneio?.estado === 'inscricoes' ? 'Inscrições abertas' : 'Ver o torneio'}
          </Link>
        </div>
      </section>
    </main>
  )
}

function Facto({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="vidro r p-5">
      <p className="font-semibold text-white">{titulo}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#a9a49a]">{nota}</p>
    </div>
  )
}

function Passo({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className={`r d${n}`}>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/[0.06] font-bold text-[#D2A63C]">
        {n}
      </span>
      <h3 className="mt-5 text-lg font-semibold">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#a9a49a]">{texto}</p>
    </div>
  )
}

function Regra({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="vidro r p-6">
      <h3 className="font-semibold text-[#D2A63C]">{titulo}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{texto}</p>
    </div>
  )
}
