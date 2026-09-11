import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { censurarEmail } from '@/lib/mtmfunded/acesso'

// Cache de 60s em vez de render por pedido: a classificação actualiza de hora a hora e os
// programas mudam raramente. Sem isto, cada visita esperava pela base de dados antes do
// primeiro pixel — e numa página de vendas isso são visitas perdidas.
export const revalidate = 60

export const metadata = {
  title: 'Trading Tournament · More Than Money',
  description: 'Torneio trimestral de trading da More Than Money. Trade · Evolve · Earn.',
}

/**
 * A página pública do torneio: as regras, os prémios e a classificação.
 *
 * A classificação é lida no SERVIDOR e o email sai censurado daqui — mandá-lo inteiro e
 * escondê-lo no CSS seria publicá-lo, porque qualquer pessoa abre as ferramentas do browser
 * e lê a lista completa.
 */
export default async function TradingTournamentPage() {
  const db = getSupabaseAdmin()

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, comeca_em, acaba_em, inscricoes_fecham_em, saldo_inicial, regras, premios')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: linhas } = torneio
    ? await db
        .from('mtm_tournament_participants')
        .select('nome_publico, email, estado, posicao, resultado_pct, metricas, updated_at')
        .eq('tournament_id', torneio.id)
        .order('posicao', { ascending: true, nullsFirst: false })
        .limit(100)
    : { data: null }

  const regras = (torneio?.regras ?? {}) as Record<string, number | string>
  const premios = (torneio?.premios ?? []) as Array<{ posicao: number; premio: string }>
  const data = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
  const atualizado = (linhas ?? []).map((l) => l.updated_at as string).filter(Boolean).sort().pop()

  return (
    <main className="text-white">
      <section className="mx-auto max-w-5xl px-5 py-20 sm:py-24">
        <p className="kicker r">MoreThanMoney apresenta</p>
        <h1 className="r d1 mt-4 text-[clamp(38px,7vw,68px)] font-extrabold">
          Trading{' '}
          <span className="bg-gradient-to-r from-[#8fb6ff] to-[#4B8BFF] bg-clip-text text-transparent">
            Tournament
          </span>
        </h1>
        <p className="r d2 mt-3 text-sm uppercase tracking-[0.25em] text-[#7b756a]">Trade · Evolve · Earn</p>

        {torneio?.estado === 'inscricoes' && (
          <div className="r d3 mt-7 inline-flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            <span className="pulso h-2 w-2 rounded-full bg-emerald-400" />
            Inscrições abertas
            {torneio.inscricoes_fecham_em &&
              ` · fecham ${new Date(torneio.inscricoes_fecham_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}`}
          </div>
        )}

        {!torneio ? (
          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-lg font-semibold">O próximo torneio está a ser preparado</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Os torneios são trimestrais. Assim que as inscrições abrirem, aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Cartao titulo="Começa" valor={data(torneio.comeca_em)} />
              <Cartao titulo="Termina" valor={data(torneio.acaba_em)} />
              <Cartao
                titulo="Conta"
                valor={`${Number(torneio.saldo_inicial).toLocaleString('pt-PT')} USD`}
              />
            </div>

            {/* As regras ficam à vista, e não em letras pequenas: quem entra sabe ao que vai. */}
            <div className="vidro r mt-8 p-6 sm:p-7">
              <h2 className="text-lg font-semibold">Regras</h2>
              <ul className="mt-3 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                {regras.perda_diaria_pct != null && <li>Perda diária máxima: <b className="text-white">{regras.perda_diaria_pct}%</b></li>}
                {regras.perda_maxima_pct != null && <li>Perda máxima total: <b className="text-white">{regras.perda_maxima_pct}%</b></li>}
                {regras.dias_minimos != null && <li>Dias mínimos de negociação: <b className="text-white">{regras.dias_minimos}</b></li>}
                {regras.consistencia_pct != null && <li>Nenhum dia acima de <b className="text-white">{regras.consistencia_pct}%</b> do lucro</li>}
              </ul>
              <p className="mt-3 text-xs text-zinc-600">
                Tudo medido sobre equity — as posições abertas contam. Quebrar uma regra congela
                a conta na posição em que estava.
              </p>
            </div>

            {premios.length > 0 && (
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {premios.map((p) => (
                  <div key={p.posicao} className="vidro destaque r p-5">
                    <p className="text-xs uppercase tracking-widest text-[#D2A63C]">{p.posicao}.º lugar</p>
                    <p className="mt-2 font-semibold">{p.premio}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="r d1 mt-10 flex flex-wrap gap-3">
              <Link
                href="/mtmfunded/tradingtournament/dashboard"
                className="rounded-full bg-[#4B8BFF] px-7 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
              >
                {torneio.estado === 'inscricoes' ? 'Inscrever-me' : 'A minha área'}
              </Link>
              <Link
                href="/mtmfunded"
                className="btn g"
              >
                MTM Funded
              </Link>
            </div>

            {/* O que o participante recebe. Antes de olhar para a tabela, importa saber ao que vai. */}
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <Passo n={1} titulo="Inscreves-te" texto="Gratuito. Pedimos os dados que a corretora exige para emitir a conta." />
              <Passo n={2} titulo="Recebes a conta" texto="Por email, com um código QR que entra na app do MetaTrader com um toque." />
              <Passo n={3} titulo="Competes" texto="A classificação actualiza de hora a hora e diz sempre porque é que alguém não conta." />
            </div>

            <p className="vidro r mt-8 p-5 text-xs leading-relaxed text-[#a9a49a]">
              A conta é de <b className="text-zinc-300">demonstração</b>, com dinheiro virtual.
              Não depositas nada e não há execução em mercado real. O que se avalia é a forma
              como negoceias.
            </p>

            <div className="mt-12">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xl font-semibold">Classificação</h2>
                <p className="text-xs text-zinc-600">
                  {atualizado
                    ? `Actualizada às ${new Date(atualizado).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · de hora a hora`
                    : 'Actualiza de hora a hora'}
                </p>
              </div>

              {!(linhas ?? []).length ? (
                <p className="mt-4 text-sm text-zinc-500">Ainda não há participantes classificados.</p>
              ) : (
                <div className="vidro r mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/40 text-xs uppercase tracking-wider text-[#7b756a]">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Participante</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3 text-right">Resultado</th>
                        <th className="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {(linhas ?? []).map((l, i) => {
                        const m = (l.metricas ?? {}) as Record<string, unknown>
                        const r = l.resultado_pct == null ? null : Number(l.resultado_pct)
                        return (
                          <tr key={`${l.nome_publico}-${i}`} className={l.estado === 'quebrado' ? 'opacity-50' : ''}>
                            <td className="px-4 py-3 font-mono text-zinc-500">{l.posicao ?? '—'}</td>
                            <td className="px-4 py-3">{l.nome_publico}</td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-500">{censurarEmail(l.email)}</td>
                            <td className={`px-4 py-3 text-right font-mono ${r == null ? 'text-zinc-600' : r >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {r == null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}%`}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {l.estado === 'quebrado' ? (
                                <span className="text-red-400">conta quebrada</span>
                              ) : m.elegivel === true ? (
                                <span className="text-emerald-400">a contar</span>
                              ) : (
                                // Quem ainda não conta aparece com o motivo à vista. Escondê-lo
                                // faria a classificação parecer arbitrária.
                                <span className="text-zinc-500">{String(m.naoElegivelPorque ?? 'por classificar')}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function Passo({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className={`vidro r d${n} p-5`}>
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#4B8BFF]/40 bg-[#4B8BFF]/[0.07] font-bold text-[#4B8BFF]">
        {n}
      </span>
      <h3 className="mt-3 font-semibold">{titulo}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{texto}</p>
    </div>
  )
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="vidro r p-5">
      <p className="text-xs uppercase tracking-widest text-[#7b756a]">{titulo}</p>
      <p className="mt-1.5 text-xl font-semibold">{valor}</p>
    </div>
  )
}
