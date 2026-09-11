import Link from 'next/link'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RegrasDeNegociacao, type RegrasNegociacao } from '@/components/mtmfunded/regras-negociacao'
import VitrineCertificados, { type CertificadoVitrine } from '@/components/mtmfunded/vitrine-certificados'
import T from '@/components/mtmfunded/t'
import SplashPromos from '@/components/mtmfunded/splash-promos'
import { promosAtivas } from '@/lib/mtmfunded/promos'

// Cache de 60s em vez de render por pedido: a classificação actualiza de hora a hora e os
// programas mudam raramente. Sem isto, cada visita esperava pela base de dados antes do
// primeiro pixel — e numa página de vendas isso são visitas perdidas.
export const revalidate = 60

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

  /**
   * As três leituras vão JUNTAS.
   *
   * Em série, a página esperava por cada uma antes de pedir a seguinte — três idas ao
   * servidor somadas antes de o primeiro pixel aparecer. Não dependem umas das outras; não
   * há razão para esperarem umas pelas outras.
   */
  const [{ data: programas }, { data: torneio }, { data: emitidos }, promos] = await Promise.all([
    db
      .from('mtm_funded_programs')
      .select('slug, nome, descricao, fases, saldo, preco_cents, moeda, regras')
      .eq('ativo', true)
      .order('ordem', { ascending: true }),
    db
      .from('mtm_tournaments')
      .select('nome, estado, comeca_em, saldo_inicial')
      .eq('publicado', true)
      .order('comeca_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('mtm_certificates')
      .select('codigo, tipo, nome, emitido_em')
      .order('emitido_em', { ascending: false })
      .limit(6),
    promosAtivas(),
  ])

  /**
   * Os certificados da vitrine: os últimos SEIS emitidos de verdade.
   *
   * Faltando, completa-se com exemplares marcados como tal. Inventar nomes de pessoas que não
   * existem para encher a vitrine é o que faz este mercado ter má fama — e um dia alguém
   * pergunta por um deles.
   */
  const vitrine: CertificadoVitrine[] = (emitidos ?? []).map((c) => ({
    codigo: c.codigo as string,
    tipo: c.tipo as string,
    nome: c.nome as string,
    emitidoEm: c.emitido_em as string,
  }))
  const TIPOS_EXEMPLO = ['financiado', 'desafio', 'classificacao', 'participacao', 'payout', 'financiado']
  while (vitrine.length < 6) {
    const tipo = TIPOS_EXEMPLO[vitrine.length]
    vitrine.push({
      codigo: `EXEMPLAR-${String(vitrine.length + 1).padStart(2, '0')}`,
      tipo,
      nome: 'O teu nome aqui',
      emitidoEm: new Date().toISOString(),
      exemplar: true,
    })
  }

  const lista = programas ?? []
  // As regras de negociação são as mesmas em todos os programas: lê-se do primeiro em vez
  // de as repetir escritas à mão numa página que depois deixa de bater certo com a base de dados.
  const regrasNegociacao = (lista[0]?.regras ?? null) as RegrasNegociacao | null
  const euros = (cents: number) =>
    (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

  return (
    <main className="text-white">
      <SplashPromos promos={promos} />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-20 pb-12 sm:pt-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mtmfunded/logo-mtm-funded.webp"
            srcSet="/mtmfunded/logo-mtm-funded.webp 1x, /mtmfunded/logo-mtm-funded@2x.webp 2x"
            loading="eager"
            decoding="async"
          alt="MTM Funded"
          className="r mb-8 h-24 w-auto sm:h-32"
        />
        <p className="kicker r d1"><T k="mtmfunded.hero.kicker" /></p>
        <h1 className="r d2 mt-4 max-w-4xl text-[clamp(38px,7vw,74px)] font-extrabold">
          Prova o que vales numa{' '}
          <span className="bg-gradient-to-r from-[#eccb78] to-[#d2a63c] bg-clip-text text-transparent">
            conta avaliada
          </span>
          .
        </h1>
        <p className="r d3 mt-6 max-w-2xl text-lg leading-relaxed text-[#a9a49a]">
          Escolhes o tamanho, negoceias com as regras à vista, e as métricas actualizam
          sozinhas. Sem letra pequena e sem promessas de rendimento.
        </p>

        <div className="r d4 mt-9 flex flex-wrap gap-3">
          <a href="#programas" className="btn"><T k="mtmfunded.hero.ver" /></a>
          <Link href="/mtmfunded/tradingtournament" className="btn g">
            <T k="mtmfunded.hero.torneio" />
          </Link>
        </div>

        {/* Factos, não estatísticas de marketing. Cada um destes é verificável nesta página. */}
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <Facto titulo="Contas simuladas" nota="Dinheiro virtual. Não há fundos de participantes em lado nenhum." />
          <Facto titulo="Regras publicadas" nota="Antes de te inscreveres, e não mudam a meio da prova." />
          <Facto titulo="Classificação pública" nota="Actualiza de hora a hora, com o motivo à vista de quem não conta." />
        </div>
      </section>

      {/* ── Os programas ───────────────────────────────────────────────────── */}
      <section id="programas" className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="r text-3xl font-bold"><T k="mtmfunded.escada.titulo" /></h2>
        <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
          Dois caminhos, os mesmos tamanhos de conta. <b className="text-zinc-300">Uma fase</b> é
          o caminho rápido: pede mais lucro e perdoa menos perda.{' '}
          <b className="text-zinc-300">Duas fases</b> pede menos de cada vez, com mais tempo para o fazer.
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
                    <th className="px-5 py-3"><T k="mtmfunded.escada.conta" /></th>
                    <th className="px-5 py-3"><T k="mtmfunded.escada.caminho" /></th>
                    <th className="px-5 py-3"><T k="mtmfunded.escada.objetivo" /></th>
                    <th className="px-5 py-3"><T k="mtmfunded.escada.perdaDiaria" /></th>
                    <th className="px-5 py-3"><T k="mtmfunded.escada.perdaMaxima" /></th>
                    <th className="px-5 py-3"><T k="mtmfunded.escada.diasMin" /></th>
                    <th className="px-5 py-3 text-right"><T k="mtmfunded.escada.preco" /></th>
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
                              <T k="mtmfunded.escada.comecar" />
                            </Link>
                          ) : (
                            <span className="text-xs text-zinc-600"><T k="mtmfunded.escada.brevemente" /></span>
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
          <h2 className="r text-3xl font-bold"><T k="mtmfunded.passos.titulo" /></h2>
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
        <h2 className="r text-3xl font-bold"><T k="mtmfunded.regras.titulo2" /></h2>
        <p className="r d1 mt-3 text-sm text-[#a9a49a]">
          Quatro regras. Iguais para todas as contas — e nunca mudam a meio da tua avaliação.
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
            <h2 className="r text-3xl font-bold"><T k="mtmfunded.regras.titulo" /></h2>
            <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
              Valem para todas as contas, na avaliação e depois de financiada. Estão aqui antes de
              comprares — não escondidas numa página que só se lê quando já é tarde.
            </p>
            <div className="mt-8">
              <RegrasDeNegociacao r={regrasNegociacao} />
            </div>
          </div>
        </section>
      )}

      {/* ── Certificados ───────────────────────────────────────────────────── */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="r text-3xl font-bold"><T k="mtmfunded.certificados.titulo" /></h2>
          <p className="r d1 mt-3 text-sm text-[#a9a49a]">
            Cada um tem um código que qualquer pessoa pode verificar, sem conta e sem pedir nada
            a ninguém. É isso que os faz valer alguma coisa fora daqui.
          </p>
          <div className="r d2 mt-8">
            <VitrineCertificados certificados={vitrine} />
          </div>
        </div>
      </section>

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
