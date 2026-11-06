import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { CORRETORA_NOME, type Corretora } from '@/lib/ib-importar'
import { estimarRebatesPuPrime, type LinhaRebate } from '@/lib/ib-rebates'
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
  cliente_telefone: string | null
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
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-6">
        <h1 className="text-xl font-bold text-white">Esta área é da rede de IBs</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Aqui estão contas de clientes de corretora — nome, contacto e saldo. Só quem faz parte da
          rede de IBs tem acesso. Se devias ter, fala com o Ricardo.
        </p>
      </div>
    )
  }

  const [{ data: todasRaw }, { data: membrosRaw }] = await Promise.all([
    db
      .from('ib_contas')
      .select('id, corretora, conta, cliente_nome, cliente_email, cliente_telefone, volume_lotes, comissao_usd, depositos_usd, estado_migracao, nota')
      .limit(2000),
    db.from('ib_membros').select('user_id, nivel, ib_externo').is('ate', null),
  ])

  /**
   * Quais destas contas já estão no pipeline.
   *
   * Sem isto, a mesma pessoa era abordada duas vezes: uma por quem olha para esta página e outra
   * por quem recebe a tarefa que o motor do dia preparou. Duas abordagens da mesma empresa no
   * mesmo dia é o género de coisa que não se desfaz com um pedido de desculpa.
   */
  const { data: noPipeline } = await db
    .from('vendas_negocios')
    .select('chave_origem, estado')
    .like('chave_origem', 'ib:%')
  const jaNoPipeline = new Map(
    (noPipeline ?? []).map((r) => {
      const n = r as { chave_origem: string; estado: string }
      return [n.chave_origem, n.estado]
    }),
  )

  const todas = (todasRaw ?? []) as unknown as Linha[]
  const membros = (membrosRaw ?? []) as Array<{ user_id: string; nivel: string; ib_externo: string | null }>

  /**
   * O que entra e sai na PU Prime, por mês, e o que a cópia lá gerou em rebate.
   *
   * Os movimentos vêm da folha «fund report» do IB report (ib_movimentos). O rebate é o MÍNIMO
   * estimado a partir das cópias do nosso sistema (lib/ib-rebates.ts) — as trades manuais dos
   * clientes não passam por aqui e o extracto do portal é que fecha o número.
   */
  const desdeMeses = new Date()
  desdeMeses.setUTCMonth(desdeMeses.getUTCMonth() - 5, 1)
  const desdeIso = desdeMeses.toISOString().slice(0, 10)
  const [{ data: movRaw }, rebates, { data: ligadasAuto }, { data: ligadasCopy }] = await Promise.all([
    db
      .from('ib_movimentos')
      .select('conta, data, depositos, levantamentos, net')
      .eq('corretora', 'pu_prime')
      .gte('data', desdeIso)
      .order('data', { ascending: false })
      .limit(5000),
    estimarRebatesPuPrime(db, `${desdeIso}T00:00:00Z`).catch(() => [] as LinhaRebate[]),
    db.from('mtmauto_accounts').select('login, metaapi_account_id').not('metaapi_account_id', 'is', null).limit(2000),
    db.from('mtmcopy_connections').select('mt5_login, metaapi_account_id').not('metaapi_account_id', 'is', null).limit(2000),
  ])

  type Mov = { conta: string; data: string; depositos: number | string; levantamentos: number | string; net: number | string }
  const porMes = new Map<string, { depositos: number; levantamentos: number; net: number; movimentos: number; contas: Set<string> }>()
  for (const m of (movRaw ?? []) as Mov[]) {
    const mes = m.data.slice(0, 7)
    const a = porMes.get(mes) ?? { depositos: 0, levantamentos: 0, net: 0, movimentos: 0, contas: new Set<string>() }
    a.depositos += Number(m.depositos ?? 0)
    a.levantamentos += Number(m.levantamentos ?? 0)
    a.net += Number(m.net ?? 0)
    a.movimentos++
    a.contas.add(m.conta)
    porMes.set(mes, a)
  }
  const rebatePorMes = new Map<string, { baixo: number; alto: number; lotes: number; contas: Set<string> }>()
  for (const r of rebates) {
    const a = rebatePorMes.get(r.mes) ?? { baixo: 0, alto: 0, lotes: 0, contas: new Set<string>() }
    a.baixo += r.rebateBaixo
    a.alto += r.rebateAlto
    a.lotes += r.lotes
    a.contas.add(r.conta)
    rebatePorMes.set(r.mes, a)
  }
  const meses = [...new Set([...porMes.keys(), ...rebatePorMes.keys()])].sort().reverse()

  /**
   * Saldo LIDO da MetaApi para as contas da rede que também estão ligadas ao MTM Auto / MTM Copy.
   * Vem de contas_saldo_lido (216), que o cron contas-saldos renova de hora a hora — nunca uma
   * chamada à MetaApi por linha desta página.
   */
  const metaPorLogin = new Map<string, string>()
  for (const a of (ligadasAuto ?? []) as Array<{ login: string | null; metaapi_account_id: string }>) if (a.login) metaPorLogin.set(String(a.login), a.metaapi_account_id)
  for (const c of (ligadasCopy ?? []) as Array<{ mt5_login: string | null; metaapi_account_id: string }>) if (c.mt5_login && !metaPorLogin.has(String(c.mt5_login))) metaPorLogin.set(String(c.mt5_login), c.metaapi_account_id)
  const chaves = [...new Set(metaPorLogin.values())]
  const { data: saldosRaw } = chaves.length
    ? await db.from('contas_saldo_lido').select('chave, saldo, equity, moeda, lido_em').in('chave', chaves)
    : { data: [] as unknown[] }
  const saldoPorChave = new Map(
    ((saldosRaw ?? []) as Array<{ chave: string; saldo: number | string | null; equity: number | string | null; moeda: string | null; lido_em: string }>).map((r) => [r.chave, r]),
  )
  const comSaldo = todas
    .map((l) => {
      const chave = metaPorLogin.get(l.conta)
      const s = chave ? saldoPorChave.get(chave) : undefined
      return s ? { l, saldo: s.saldo == null ? null : Number(s.saldo), equity: s.equity == null ? null : Number(s.equity), moeda: s.moeda, lidoEm: s.lido_em } : null
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => (b.equity ?? 0) - (a.equity ?? 0))

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
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          As contas de corretora da rede, e o que falta trazer para casa. A PU Prime é a casa; o que
          está nas outras corretoras é volume que ainda paga comissão a terceiros.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          {membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'} na rede ·{' '}
          {membros.filter((m) => m.nivel === 'master').length} master ·{' '}
          {membros.filter((m) => !m.ib_externo).length} ainda sem identificador próprio na corretora
        </p>
      </div>

      {todas.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-5">
          <h2 className="font-semibold text-white">Ainda não há contas importadas</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Descarrega a exportação de cada corretora e cola-a na caixa em baixo — uma de cada vez,
            com a linha dos títulos. O formato é reconhecido sozinho.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Por corretora</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...porCorretora.entries()].map(([cor, a]) => (
              <div key={cor} className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-4">
                <p className="text-sm font-semibold text-white">
                  {CORRETORA_NOME[cor as Corretora] ?? cor}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#D2A63C]">{a.contas}</p>
                <p className="text-xs text-zinc-500">contas</p>
                <dl className="mt-3 space-y-1 text-xs text-zinc-400">
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Trazer para casa
            </h2>
            <span className="text-xs text-zinc-600">pelos que mais volume têm</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Contacto</th>
                  <th className="px-3 py-2 font-medium">Corretora</th>
                  <th className="px-3 py-2 text-right font-medium">Lotes</th>
                  <th className="px-3 py-2 text-right font-medium">Comissão</th>
                  <th className="px-3 py-2 text-right font-medium">Depósitos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {aTrabalhar.map((l) => (
                  <tr key={l.id} className="text-zinc-300">
                    <td className="px-3 py-2">
                      <span className="text-white">{l.cliente_nome ?? l.conta}</span>
                      <span className="block text-xs text-zinc-600">conta {l.conta}</span>
                      {jaNoPipeline.has(`ib:${l.corretora}:${l.conta}`) && (
                        <span className="mt-1 inline-block rounded bg-[#D2A63C]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#D2A63C]">
                          no pipeline · {jaNoPipeline.get(`ib:${l.corretora}:${l.conta}`)}
                        </span>
                      )}
                    </td>
                    {/* O contacto é a razão de esta página existir para um setter: sem forma de
                        chegar à pessoa, a linha é uma estatística e não um lead. */}
                    <td className="px-3 py-2">
                      {l.cliente_email ? (
                        <a href={`mailto:${l.cliente_email}`} className="block text-xs text-[#D2A63C] hover:underline">
                          {l.cliente_email}
                        </a>
                      ) : null}
                      {l.cliente_telefone ? (
                        <a href={`tel:${l.cliente_telefone.replace(/\s/g, '')}`} className="block text-xs text-[#D2A63C] hover:underline">
                          {l.cliente_telefone}
                        </a>
                      ) : null}
                      {!l.cliente_email && !l.cliente_telefone && (
                        <span className="text-xs text-zinc-700">sem contacto</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
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
          <p className="text-xs text-zinc-600">
            Estado: {Object.entries(ESTADO_NOME).map(([k, v]) => `${v} (${todas.filter((l) => l.estado_migracao === k).length})`).join(' · ')}
          </p>
          <p className="text-xs leading-relaxed text-zinc-600">
            {aTrabalhar.filter((l) => l.cliente_email || l.cliente_telefone).length} destas têm
            contacto e entram sozinhas no pipeline de manhã, pelas que mais volume têm. As que não
            têm email nem telefone ficam de fora — um lead a que não se consegue chegar não é um
            lead, e enchia a lista de quem a trabalha.
          </p>
        </section>
      )}

      {meses.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              PU Prime · fundos e rebate por mês
            </h2>
            <span className="text-xs text-zinc-600">últimos 6 meses</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Mês</th>
                  <th className="px-3 py-2 text-right font-medium">Depósitos</th>
                  <th className="px-3 py-2 text-right font-medium">Levantamentos</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">Contas c/ mov.</th>
                  <th className="px-3 py-2 text-right font-medium">Lotes copiados</th>
                  <th className="px-3 py-2 text-right font-medium">Rebate est. (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {meses.map((mes) => {
                  const f = porMes.get(mes)
                  const r = rebatePorMes.get(mes)
                  return (
                    <tr key={mes} className="text-zinc-300">
                      <td className="px-3 py-2 font-medium text-white">{mes}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f ? num(f.depositos) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f ? num(f.levantamentos) : '—'}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${f && f.net < 0 ? 'text-red-400' : ''}`}>{f ? num(f.net) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{f ? f.contas.size : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r ? num(r.lotes) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[#D2A63C]">
                        {r ? (Math.abs(r.alto - r.baixo) < 0.005 ? num(r.baixo) : `${num(r.baixo)} a ${num(r.alto)}`) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-relaxed text-zinc-600">
            Fundos: folha «fund report» do IB report (cola-a na caixa em baixo todos os meses). Rebate: só o
            volume que a cópia MTM mandou para contas PU Prime, pelo acordo de 30/09/2026 (FX 2,6 pips/lote,
            ouro 3, petróleo 3, prata 2,6; cripto 65 $/M, índices 35 $/M). O intervalo no ouro é o valor
            do pip (0,01 $ ou 0,10 $) — o extracto de comissões do portal diz qual. Trades manuais dos
            clientes não entram, por isso é um mínimo.
          </p>
          {rebates.length > 0 && (
            <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Detalhe por conta e classe</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {rebates.map((r) => (
                  <li key={`${r.mes}-${r.conta}-${r.classe}`} className="flex justify-between gap-2 tabular-nums">
                    <span>{r.mes} · {r.conta} · {r.classe}</span>
                    <span>{num(r.lotes)} lotes · {r.ordens} ordens · {Math.abs(r.rebateAlto - r.rebateBaixo) < 0.005 ? num(r.rebateBaixo) : `${num(r.rebateBaixo)}–${num(r.rebateAlto)}`} $</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {comSaldo.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Saldos lidos (MetaApi) das contas da rede ligadas à MTM
            </h2>
            <span className="text-xs text-zinc-600">renovado de hora a hora</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Corretora</th>
                  <th className="px-3 py-2 font-medium">Conta</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Equity</th>
                  <th className="px-3 py-2 text-right font-medium">Lido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {comSaldo.map(({ l, saldo, equity, moeda, lidoEm }) => (
                  <tr key={l.id} className="text-zinc-300">
                    <td className="px-3 py-2">{CORRETORA_NOME[l.corretora] ?? l.corretora}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.conta}</td>
                    <td className="px-3 py-2">{l.cliente_nome ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(saldo)} {moeda ?? ''}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${saldo != null && equity != null && equity < saldo ? 'text-red-400' : ''}`}>{num(equity)} {moeda ?? ''}</td>
                    <td className="px-3 py-2 text-right text-xs text-zinc-500">{new Date(lidoEm).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Importar />
    </div>
  )
}
