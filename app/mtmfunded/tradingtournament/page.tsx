import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { censurarEmail } from '@/lib/mtmfunded/acesso'

export const dynamic = 'force-dynamic'

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
    <main className="min-h-screen bg-[#050608] text-white">
      <section className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-[#4B8BFF]">MoreThanMoney apresenta</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
          Trading <span className="text-[#4B8BFF]">Tournament</span>
        </h1>
        <p className="mt-2 text-sm uppercase tracking-[0.25em] text-zinc-500">Trade · Evolve · Earn</p>

        {!torneio ? (
          <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
            <h2 className="text-lg font-semibold">O próximo torneio está a ser preparado</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Os torneios são trimestrais. Assim que as inscrições abrirem, aparecem aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Cartao titulo="Começa" valor={data(torneio.comeca_em)} />
              <Cartao titulo="Termina" valor={data(torneio.acaba_em)} />
              <Cartao
                titulo="Conta"
                valor={`${Number(torneio.saldo_inicial).toLocaleString('pt-PT')} USD`}
              />
            </div>

            {/* As regras ficam à vista, e não em letras pequenas: quem entra sabe ao que vai. */}
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
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
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {premios.map((p) => (
                  <div key={p.posicao} className="rounded-2xl border border-[#D2A63C]/25 bg-[#D2A63C]/[0.05] p-5">
                    <p className="text-xs uppercase tracking-widest text-[#D2A63C]">{p.posicao}.º lugar</p>
                    <p className="mt-2 font-semibold">{p.premio}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/mtmfunded/tradingtournament/dashboard"
                className="rounded-lg bg-[#4B8BFF] px-6 py-3 text-sm font-semibold text-white"
              >
                {torneio.estado === 'inscricoes' ? 'Inscrever-me' : 'A minha área'}
              </Link>
              <Link
                href="/mtmfunded"
                className="rounded-lg border border-zinc-700 px-6 py-3 text-sm text-zinc-300"
              >
                MTM Funded
              </Link>
            </div>

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
                <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Participante</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3 text-right">Resultado</th>
                        <th className="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
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

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold">{valor}</p>
    </div>
  )
}
