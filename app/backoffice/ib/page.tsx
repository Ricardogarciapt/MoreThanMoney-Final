import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { CORRETORA_NOME, type Corretora } from '@/lib/ib-importar'
import { Importar } from './importar'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rede de IBs · Backoffice MTM' }

/**
 * A REDE DE IBs — as contas de corretora, e o que falta fazer a cada uma.
 *
 * PARA QUE SERVE ESTA PÁGINA
 * O negócio de IB da MTM está em quatro corretoras e vivia em exportações de Excel que alguém
 * descarregava, olhava e fechava. Ninguém sabia que havia 228 lotes negociados numa corretora que
 * não é a nossa, nem que há comissão a ser paga a outra casa. O objectivo do dono é trazer esse
 * volume todo para a PU Prime e pôr essas pessoas dentro do ecossistema — e isso começa por se
 * conseguir ver.
 *
 * O QUE ESTA PÁGINA NÃO FAZ: não fala com clientes nem move contas. Mostra, ordena por onde vale a
 * pena começar, e deixa marcar o ponto em que cada conversa está.
 *
 * PORQUE É QUE OS DADOS SE LÊEM COM SERVICE ROLE
 * Isto traz nome, email, telefone e saldo de clientes de corretora. O acesso decide-se aqui, contra
 * `ib_membros` — não por um papel do backoffice, porque ser setter não dá direito a ver a carteira
 * de ninguém.
 */

const ESTADO_NOME: Record<string, string> = {
  na_casa: 'Na casa (PU Prime)',
  a_transitar: 'A transitar',
  a_fechar: 'A fechar',
  perdido: 'Perdido',
  por_avaliar: 'Por avaliar',
}

interface Linha {
  id: string
  corretora: Corretora
  conta: string
  cliente_nome: string | null
  cliente_email: string | null
  volume_lotes: number | null
  comissao_usd: number | null
  depositos_usd: number | null
  estado_migracao: string
  nota: string | null
}

function num(v: number | null | undefined, casas = 2): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export default async function IbPage() {
  const ctx = await contextoBackoffice()
  if (!ctx) return null

  const db = getSupabaseAdmin()

  const { data: souIb } = await db
    .from('ib_membros')
    .select('user_id, nivel, ib_externo')
    .eq('user_id', ctx.userId)
    .is('ate', null)
    .maybeSingle()

  if (!souIb && !ctx.admin) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h1 className="text-xl font-bold text-white">Esta área é da rede de IBs</h1>
        <p className="mt-2 text-sm text-gray-400">
          Aqui estão contas de clientes de corretora — nome, contacto e saldo. Só quem faz parte da
          rede de IBs tem acesso. Se devias ter, fala com o Ricardo.
        </p>
      </div>
    )
  }

  const [{ data: todasRaw }, { data: membrosRaw }] = await Promise.all([
    db
      .from('ib_contas')
      .select('id, corretora, conta, cliente_nome, cliente_email, volume_lotes, comissao_usd, depositos_usd, estado_migracao, nota')
      .limit(2000),
    db.from('ib_membros').select('user_id, nivel, ib_externo').is('ate', null),
  ])

  const todas = (todasRaw ?? []) as unknown as Linha[]
  const membros = (membrosRaw ?? []) as Array<{ user_id: string; nivel: string; ib_externo: string | null }>

  // ── O que está em jogo, por corretora ──────────────────────────────────────
  const porCorretora = new Map<string, { contas: number; lotes: number; comissao: number; aTransitar: number }>()
  for (const l of todas) {
    const a = porCorretora.get(l.corretora) ?? { contas: 0, lotes: 0, comissao: 0, aTransitar: 0 }
    a.contas++
    a.lotes += l.volume_lotes ?? 0
    a.comissao += l.comissao_usd ?? 0
    if (l.estado_migracao === 'a_transitar') a.aTransitar++
    porCorretora.set(l.corretora, a)
  }

  /**
   * A lista de trabalho: só o que vale a pena trazer, e pela ordem do volume.
   *
   * Sem esta ordem, a equipa trabalhava as contas pela ordem alfabética — que é a ordem de
   * ninguém. Uma conta com 228 lotes vale mais atenção do que vinte contas a zero, e é isso que
   * esta página tem de dizer sem ninguém ter de somar nada de cabeça.
   */
  const aTrabalhar = todas
    .filter((l) => l.estado_migracao === 'a_transitar')
    .sort(
      (a, b) =>
        (b.volume_lotes ?? 0) * 10 + (b.comissao_usd ?? 0) - ((a.volume_lotes ?? 0) * 10 + (a.comissao_usd ?? 0)),
    )
    .slice(0, 50)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Rede de IBs</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          As contas de corretora da rede, e o que falta trazer para casa. A PU Prime é a casa; o que
          está nas outras corretoras é volume que ainda paga comissão a terceiros.
        </p>
        <p className="mt-1 text-xs text-gray-600">
          {membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'} na rede ·{' '}
          {membros.filter((m) => m.nivel === 'master').length} master ·{' '}
          {membros.filter((m) => !m.ib_externo).length} ainda sem identificador próprio na corretora
        </p>
      </div>

      {todas.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="font-semibold text-white">Ainda não há contas importadas</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            Descarrega a exportação de cada corretora e cola-a na caixa em baixo — uma de cada vez,
            com a linha dos títulos. O formato é reconhecido sozinho.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Por corretora</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...porCorretora.entries()].map(([cor, a]) => (
              <div key={cor} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                <p className="text-sm font-semibold text-white">
                  {CORRETORA_NOME[cor as Corretora] ?? cor}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#D2A63C]">{a.contas}</p>
                <p className="text-xs text-gray-500">contas</p>
                <dl className="mt-3 space-y-1 text-xs text-gray-400">
                  <div className="flex justify-between gap-2">
                    <dt>Lotes</dt>
                    <dd className="tabular-nums">{num(a.lotes)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Comissão USD</dt>
                    <dd className="tabular-nums">{num(a.comissao)}</dd>
                  </div>
                  {a.aTransitar > 0 && (
                    <div className="flex justify-between gap-2 text-[#D2A63C]">
                      <dt>A transitar</dt>
                      <dd className="tabular-nums">{a.aTransitar}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {aTrabalhar.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Trazer para casa
            </h2>
            <span className="text-xs text-gray-600">pelos que mais volume têm</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-gray-900/60 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Corretora</th>
                  <th className="px-3 py-2 text-right font-medium">Lotes</th>
                  <th className="px-3 py-2 text-right font-medium">Comissão</th>
                  <th className="px-3 py-2 text-right font-medium">Depósitos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {aTrabalhar.map((l) => (
                  <tr key={l.id} className="text-gray-300">
                    <td className="px-3 py-2">
                      <span className="text-white">{l.cliente_nome ?? l.conta}</span>
                      {l.cliente_email && (
                        <span className="block text-xs text-gray-600">{l.cliente_email}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400">
                      {CORRETORA_NOME[l.corretora] ?? l.corretora}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.volume_lotes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.comissao_usd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.depositos_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600">
            Estado: {Object.entries(ESTADO_NOME).map(([k, v]) => `${v} (${todas.filter((l) => l.estado_migracao === k).length})`).join(' · ')}
          </p>
        </section>
      )}

      <Importar />
    </div>
  )
}
