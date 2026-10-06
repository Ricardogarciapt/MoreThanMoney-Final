import Link from 'next/link'
import QueroQueMeLiguem from '@/components/captacao/quero-que-me-liguem'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { RegrasDeNegociacao, type RegrasNegociacao } from '@/components/mtmfunded/regras-negociacao'
import VitrineCertificados, { type CertificadoVitrine } from '@/components/mtmfunded/vitrine-certificados'
import T from '@/components/mtmfunded/t'
import SplashPromos from '@/components/mtmfunded/splash-promos'
import { promosAtivas } from '@/lib/mtmfunded/promos'
import { inscricoesAbertas } from '@/lib/mtmfunded/inscricoes'
import { comTecto, TECTO_PAGINA_MS } from '@/lib/com-tecto'

// Cache de 60s em vez de render por pedido: a classificação actualiza de hora a hora e os
// programas mudam raramente. Sem isto, cada visita esperava pela base de dados antes do
// primeiro pixel — e numa página de vendas isso são visitas perdidas.
/**
 * FORA DA PRÉ-GERAÇÃO, de propósito.
 *
 * Estas páginas lêem a base de dados, e uma compilação não pode depender de a base estar boa —
 * a 25/09 dois deploys seguidos abortaram por isso, e a correcção do 504 ficou retida enquanto
 * membros com conta eram mandados registar-se.
 *
 * Aqui não se usa o truque das outras páginas (construir com valores de recuo e deixar a
 * revalidação preencher): a /mtmfunded decide um REDIRECCIONAMENTO a partir da configuração, e
 * construí-la sem poder lê-la deixaria esse redireccionamento cozido no ficheiro gerado. Uma
 * página que redirecciona para o torneio porque a base estava lenta durante o build é pior do
 * que uma página que demora um pouco mais a abrir.
 *
 * As leituras têm tecto (ver `comTecto`), por isso uma base lenta atrasa-as — não as pendura.
 */
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

  /**
   * As três leituras vão JUNTAS.
   *
   * Em série, a página esperava por cada uma antes de pedir a seguinte — três idas ao
   * servidor somadas antes de o primeiro pixel aparecer. Não dependem umas das outras; não
   * há razão para esperarem umas pelas outras.
   */
  // TECTO: sem resposta a página desenha-se com as listas vazias — o mesmo que já fazia quando
  // uma destas leituras falhava. Sem ele, a geração estática estoirava aos 60s e levava o deploy
  // do site inteiro atrás (foi o que aconteceu a 25/09 na /new-landing).
  const [{ data: programas }, { data: torneio }, { data: emitidos }, promos] = await comTecto(
    Promise.all([
    db
      .from('mtm_funded_programs')
      .select('slug, nome, descricao, fases, saldo, preco_cents, preco_cents_mtmfunded, moeda, regras')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .then((r) => ({ data: r.data })),
    db
      .from('mtm_tournaments')
      .select('nome, estado, comeca_em, saldo_inicial')
      .eq('publicado', true)
      .order('comeca_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => ({ data: r.data })),
    db
      .from('mtm_certificates')
      .select('codigo, tipo, nome, emitido_em')
      .order('emitido_em', { ascending: false })
      .limit(6)
      .then((r) => ({ data: r.data })),
    promosAtivas(),
    ]),
    [{ data: null }, { data: null }, { data: null }, []],
    TECTO_PAGINA_MS,
  )

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
  /**
   * DOIS PREÇOS, lado a lado: a plataforma MTM Funded é mais barata do que a conta na corretora.
   * Sem preço próprio (ou antes do lançamento), mostra-se só o do MT5 — nunca um preço que o
   * checkout depois não pratica.
   */
  const precoMtmFunded = (p: { preco_cents_mtmfunded?: number | null }) =>
    config.sim_lancado_em && p.preco_cents_mtmfunded != null ? Number(p.preco_cents_mtmfunded) : null

  return (
    <main className="text-white">
      <SplashPromos promos={promos} />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-20 pb-12 sm:pt-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mtmfunded/logo-mtm-funded-v2.webp"
            srcSet="/mtmfunded/logo-mtm-funded-v2.webp 1x, /mtmfunded/logo-mtm-funded-v2@2x.webp 2x"
            loading="eager"
            decoding="async"
          alt="MTM Funded"
          className="r mb-8 h-24 w-auto sm:h-32"
        />
        <p className="kicker r d1"><T k="mtmfunded.hero.kicker" /></p>
        <h1 className="r d2 mt-4 max-w-4xl text-[clamp(38px,7vw,74px)] font-extrabold">
          <T k="mtmfunded.hero.tituloA" />{' '}
          <span className="bg-gradient-to-r from-[#eccb78] to-[#d2a63c] bg-clip-text text-transparent">
            <T k="mtmfunded.hero.tituloB" />
          </span>
          .
        </h1>
        <p className="r d3 mt-6 max-w-2xl text-lg leading-relaxed text-[#a9a49a]">
          <T k="mtmfunded.hero.sub" />
        </p>

        <div className="r d4 mt-9 flex flex-wrap gap-3">
          <a href="#programas" className="btn"><T k="mtmfunded.hero.ver" /></a>
          <Link href="/mtmfunded/tradingtournament" className="btn g">
            <T k="mtmfunded.hero.torneio" />
          </Link>
        </div>

        {/* Factos, não estatísticas de marketing. Cada um destes é verificável nesta página. */}
        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <Facto titulo="mtmfunded.facto.simuladas" nota="mtmfunded.facto.simuladasNota" />
          <Facto titulo="mtmfunded.facto.regras" nota="mtmfunded.facto.regrasNota" />
          <Facto titulo="mtmfunded.facto.classificacao" nota="mtmfunded.facto.classificacaoNota" />
        </div>
      </section>

      {/* ── Os programas ───────────────────────────────────────────────────── */}
      <section id="programas" className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="r text-3xl font-bold"><T k="mtmfunded.escada.titulo" /></h2>
        <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
          <T k="mtmfunded.escada.sub1" /> <b className="text-zinc-300"><T k="mtmfunded.escada.umaFaseB" /></b>{' '}
          <T k="mtmfunded.escada.sub2" />{' '}
          <b className="text-zinc-300"><T k="mtmfunded.escada.duasFasesB" /></b> <T k="mtmfunded.escada.sub3" />
        </p>

        {!config.vendas_abertas && (
          <div className="mt-6 rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4 text-sm text-[#D2A63C]">
            <T k="mtmfunded.escada.fechadas" />
          </div>
        )}

        {!lista.length ? (
          <p className="mt-8 text-sm text-zinc-500"><T k="mtmfunded.escada.aPreparar" /></p>
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
                            <T k={p.fases === 1 ? 'mtmfunded.escada.umaFase' : 'mtmfunded.escada.duasFases'} />
                          </span>
                        </td>
                        <td className="px-5 py-4 text-zinc-400">{r.objetivo_pct != null ? `+${r.objetivo_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.perda_diaria_pct != null ? `${r.perda_diaria_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.perda_maxima_pct != null ? `${r.perda_maxima_pct}%` : '—'}</td>
                        <td className="px-5 py-4 text-zinc-400">{r.dias_minimos ?? '—'}</td>
                        <td className="px-5 py-4 text-right">
                          <span className="block text-lg font-bold text-[#D2A63C]">
                            {euros(precoMtmFunded(p) ?? p.preco_cents)}
                          </span>
                          {precoMtmFunded(p) != null && (
                            <span className="mt-0.5 block text-[11px] text-zinc-500">
                              MTM Funded · MT5 {euros(p.preco_cents)}
                            </span>
                          )}
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
                      <span className="text-right">
                        <span className="block text-2xl font-bold text-[#D2A63C]">
                          {euros(precoMtmFunded(p) ?? p.preco_cents)}
                        </span>
                        {precoMtmFunded(p) != null && (
                          <span className="block text-[11px] text-zinc-500">MTM Funded · MT5 {euros(p.preco_cents)}</span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">
                      {p.fases}{' '}
                      <T k={p.fases === 1 ? 'mtmfunded.escada.fase' : 'mtmfunded.escada.fases'} />
                    </p>
                    <ul className="mt-4 space-y-1.5 text-sm text-zinc-400">
                      {r.objetivo_pct != null && <li><T k="mtmfunded.escada.objetivo" />: +{r.objetivo_pct}%</li>}
                      {r.perda_diaria_pct != null && <li><T k="mtmfunded.escada.perdaDiaria" />: {r.perda_diaria_pct}%</li>}
                      {r.perda_maxima_pct != null && <li><T k="mtmfunded.escada.perdaMaxima" />: {r.perda_maxima_pct}%</li>}
                      {r.dias_minimos != null && <li><T k="mtmfunded.escada.diasMin" /> {r.dias_minimos}</li>}
                      {r.consistencia_pct != null && <li><T k="mtmfunded.escada.consistencia" /> {r.consistencia_pct}%/dia</li>}
                    </ul>
                    {config.vendas_abertas ? (
                      <Link
                        href={`/mtmfunded/checkout?programa=${p.slug}`}
                        className="btn mt-5 w-full justify-center"
                      >
                        <T k="mtmfunded.escada.comecar" />
                      </Link>
                    ) : (
                      <span className="mt-5 block rounded-lg border border-zinc-800 py-2.5 text-center text-sm text-zinc-600">
                        <T k="mtmfunded.escada.brevemente" />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* ── As duas plataformas ─────────────────────────────────────────────── */}
      {/* Escolhe-se no checkout. Copy honesta: simulada nas duas, sem promessas, resultados em %/pips. */}
      <section id="plataformas" className="mx-auto max-w-6xl px-5 pb-14">
        <h2 className="r text-3xl font-bold"><T k="mtmfunded.plataforma.secTitulo" /></h2>
        <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]"><T k="mtmfunded.plataforma.secSub" /></p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Plataforma
            titulo="mtmfunded.plataforma.simT"
            itens={['mtmfunded.plataforma.simX1', 'mtmfunded.plataforma.simX2', 'mtmfunded.plataforma.simX3']}
            destaque
            etiqueta={config.sim_lancado_em ? 'mtmfunded.plataforma.recomendada' : 'mtmfunded.plataforma.brevemente'}
          />
          <Plataforma
            titulo="mtmfunded.plataforma.mt5T"
            itens={['mtmfunded.plataforma.mt5X1', 'mtmfunded.plataforma.mt5X2', 'mtmfunded.plataforma.mt5X3']}
            etiqueta={config.mt5_a_venda ? null : 'mtmfunded.plataforma.brevemente'}
          />
        </div>
      </section>

      {/* ── Como funciona ──────────────────────────────────────────────────── */}
      <section className="border-y border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="r text-3xl font-bold"><T k="mtmfunded.passos.titulo" /></h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <Passo n={1} titulo="mtmfunded.passos.p1t" texto="mtmfunded.passos.p1x" />
            <Passo n={2} titulo="mtmfunded.passos.p2t" texto="mtmfunded.passos.p2x" />
            <Passo n={3} titulo="mtmfunded.passos.p3t" texto="mtmfunded.passos.p3x" />
          </div>
        </div>
      </section>

      {/* ── As regras, explicadas ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="r text-3xl font-bold"><T k="mtmfunded.regras.titulo2" /></h2>
        <p className="r d1 mt-3 text-sm text-[#a9a49a]">
          <T k="mtmfunded.regras.sub" />
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Regra titulo="mtmfunded.regras.r1t" texto="mtmfunded.regras.r1x" />
          <Regra titulo="mtmfunded.regras.r2t" texto="mtmfunded.regras.r2x" />
          <Regra titulo="mtmfunded.regras.r3t" texto="mtmfunded.regras.r3x" />
          <Regra titulo="mtmfunded.regras.r4t" texto="mtmfunded.regras.r4x" />
        </div>
      </section>

      {/* ── Regras de negociação ───────────────────────────────────────────── */}
      {regrasNegociacao && (
        <section className="border-t border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="r text-3xl font-bold"><T k="mtmfunded.regras.titulo" /></h2>
            <p className="r d1 mt-3 max-w-2xl text-sm text-[#a9a49a]">
              <T k="mtmfunded.regras.negSub" />
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
            <T k="mtmfunded.certificados.sub" />
          </p>
          <div className="r d2 mt-8">
            <VitrineCertificados certificados={vitrine} />
          </div>
        </div>
      </section>

      {/* ── Torneio ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="vidro destaque r bg-gradient-to-b from-[#D2A63C]/[0.07] to-transparent p-8 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-[#D2A63C]"><T k="mtmfunded.torneio.gratuito" /></p>
          <h2 className="mt-2 text-2xl font-bold">
            {torneio?.nome ?? 'Trading Tournament'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            <T k="mtmfunded.torneio.subA" />{' '}
            {Number(torneio?.saldo_inicial ?? 10000).toLocaleString('pt-PT')}{' '}
            <T k="mtmfunded.torneio.subB" />
          </p>
          <Link
            href="/mtmfunded/tradingtournament"
            className="btn mt-7"
          >
            <T k={inscricoesAbertas(torneio) ? 'mtmfunded.torneio.abertas' : 'mtmfunded.torneio.ver'} />
          </Link>
        </div>
      </section>

      <QueroQueMeLiguem origem="produto:/mtmfunded" interesseInicial="mtm_funded" titulo="Dúvidas sobre o MTM Funded?" />
    </main>
  )
}

/**
 * Os três ajudantes recebem CHAVES do dicionário, não texto.
 *
 * A página é um Server Component e `useT()` só corre no cliente — por isso o texto entra pelo
 * `<T>`, que é a única peça cliente. Passar as chaves em vez das frases mantém a página
 * legível (vê-se logo de onde vem cada texto) e impede o caso em que alguém escreve aqui uma
 * frase à mão e ela fica por traduzir sem que nada avise.
 */
function Facto({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="vidro r p-5">
      <p className="font-semibold text-white"><T k={titulo} /></p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#a9a49a]"><T k={nota} /></p>
    </div>
  )
}

function Plataforma({
  titulo, itens, etiqueta, destaque = false,
}: { titulo: string; itens: string[]; etiqueta: string | null; destaque?: boolean }) {
  return (
    <div className={`vidro r p-6 ${destaque ? 'destaque' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white"><T k={titulo} /></h3>
        {etiqueta && (
          <span className="rounded-full bg-[#D2A63C]/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[#D2A63C]">
            <T k={etiqueta} />
          </span>
        )}
      </div>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-zinc-400">
        {itens.map((k) => (
          <li key={k} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#D2A63C]" />
            <span><T k={k} /></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Passo({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className={`r d${n}`}>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/[0.06] font-bold text-[#D2A63C]">
        {n}
      </span>
      <h3 className="mt-5 text-lg font-semibold"><T k={titulo} /></h3>
      <p className="mt-2 text-sm leading-relaxed text-[#a9a49a]"><T k={texto} /></p>
    </div>
  )
}

function Regra({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="vidro r p-6">
      <h3 className="font-semibold text-[#D2A63C]"><T k={titulo} /></h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400"><T k={texto} /></p>
    </div>
  )
}
