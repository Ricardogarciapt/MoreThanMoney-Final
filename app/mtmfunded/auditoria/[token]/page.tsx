import type { Metadata } from 'next'
import { GraficosAuditoria } from '@/components/funded/graficos-auditoria'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerAuditoriaPorToken } from '@/lib/mtmfunded/auditoria-servidor'
import { nomeEstrategia, type MetricasAuditoria, type TradeAuditoria } from '@/lib/mtmfunded/auditoria'

/**
 * AUDITORIA PÚBLICA DE UMA CONTA MTM FUNDED — /mtmfunded/auditoria/<token>.
 *
 * O link que o dono partilha (WebTrader → A minha conta → Partilhar). Lê-se sem login, mostra o
 * mínimo que prova um histórico: métricas em R e pips, retorno ponderado no tempo, drawdown, risco de
 * ruína e TODAS as operações fechadas, cada uma com o sinal que a abriu. Sem nome, email ou passwords.
 * Revogado o link, a página deixa de existir. Fora dos motores de busca (noindex).
 */

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Auditoria de conta · MTM Funded',
  description: 'Histórico verificável de uma conta simulada MTM Funded: operações ligadas aos sinais, R, pips, drawdown e risco de ruína.',
  robots: { index: false, follow: false },
}

const fmt = (x: number | null | undefined, casas = 2) =>
  x == null ? '—' : x.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const sinal = (x: number | null | undefined, casas = 2) => (x == null ? '—' : `${x > 0 ? '+' : ''}${fmt(x, casas)}`)
const cor = (x: number | null | undefined) => (x == null || x === 0 ? 'text-zinc-200' : x > 0 ? 'text-emerald-300' : 'text-rose-300')
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-PT', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : '—')
const dia = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { timeZone: 'UTC' }) : '—')

export default async function AuditoriaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = getSupabaseAdmin()
  const a = await lerAuditoriaPorToken(db, token)
  if (!a) notFound()
  // Contador de visitas, sem bloquear a página (falha em silêncio).
  void db.rpc('incrementar_visita_auditoria', { p_token: a.token }).then(() => undefined, () => undefined)

  const m = a.metricas
  const estrategia = nomeEstrategia(a.conta.estrategiaSeguida)
  const recentes = [...a.trades].reverse()

  return (
    <main className="px-4 py-8 text-zinc-200 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#D2A63C]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Auditoria de conta · MTM Funded
          </p>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            {a.conta.etiqueta || estrategia || 'Conta MTM Funded'}
            {a.conta.login && <span className="ml-2 font-mono text-lg text-zinc-400">#{a.conta.login}</span>}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            Conta <strong className="text-zinc-200">simulada</strong> no motor MTM Funded, saldo {a.conta.cicloDesde ? <>no início do ciclo actual ({dia(a.conta.cicloDesde)})</> : 'inicial'} {fmt(a.conta.saldoInicial, 0)} USD
            {estrategia ? <>, a seguir <strong className="text-zinc-200">{estrategia}</strong></> : null}.
            {' '}Histórico de {dia(m.primeiraTrade)} a {dia(m.ultimaTrade)} · {m.trades} operações fechadas em {m.diasNegociados} dias · {a.abertas} aberta(s) agora.
            {' '}Dados lidos da base de produção em {data(a.geradoEm)} UTC.
          </p>
        </header>

        <section aria-label="Indicadores principais" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Kpi rotulo="Resultado em R" valor={sinal(m.rTotal)} cls={cor(m.rTotal)} nota={`${m.tradesComR} trades com risco registado`} />
          <Kpi rotulo="Expectativa por trade" valor={`${sinal(m.expectativaR, 3)} R`} cls={cor(m.expectativaR)} />
          <Kpi rotulo="Taxa de acerto" valor={m.taxaAcertoPct == null ? '—' : `${fmt(m.taxaAcertoPct, 1)} %`} />
          <Kpi rotulo="Fator de lucro (R)" valor={fmt(m.fatorLucroR)} />
          <Kpi rotulo="Drawdown máx." valor={`${fmt(m.drawdownMaxR)} R`} nota={`${fmt(m.drawdownMaxPct)} % no índice`} />
          <Kpi rotulo="Pips (forex e metais)" valor={sinal(m.pips, 0)} cls={cor(m.pips)} nota={m.pontos ? `${sinal(m.pontos, 0)} pts em índices/cripto` : undefined} />
          <Kpi rotulo="Retorno ponderado no tempo" valor={`${sinal(m.retornoPonderadoPct)} %`} cls={cor(m.retornoPonderadoPct)} nota="ajustes de capital não contam" />
          <Kpi rotulo="Ganho médio / perda média" valor={`${sinal(m.mediaGanhoR)} / ${sinal(m.mediaPerdaR)} R`} />
          <Kpi rotulo="Seguidas (ganho / perda)" valor={`${m.maxGanhasSeguidas} / ${m.maxPerdidasSeguidas}`} />
          <Kpi rotulo="Ligadas a um sinal" valor={`${m.tradesComSinal} de ${m.trades}`} />
          <Kpi rotulo="Latência sinal → ordem" valor={m.latenciaMedianaSeg == null ? '—' : `${fmt(m.latenciaMedianaSeg, 1)} s`} nota="mediana, ordens a mercado" />
          <Kpi rotulo="Desvio da entrada" valor={m.desvioMedianoEntrada == null ? '—' : `${sinal(m.desvioMedianoEntrada, 1)}`} nota="mediana, em pips/pts vs. sinal" />
        </section>

        <Curva m={m} saldoInicial={a.conta.saldoInicial} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao titulo="Risco de ruína">
            <p className="mb-2 text-xs leading-relaxed text-zinc-400">
              Probabilidade de perder 30 % do capital em 250 trades, arriscando uma fracção fixa do saldo por trade.
              Reamostragem ({'4 000'} simulações, semente fixa) das próprias trades desta conta em R.
              {m.tradesComR < 100 && <strong className="text-amber-300"> Amostra curta ({m.tradesComR} trades): ler como indicação, não como medida.</strong>}
            </p>
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Risco de ruína por risco por trade</caption>
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">Risco por trade</th><th className="py-1 text-right font-medium">Prob. de ruína</th></tr></thead>
              <tbody>
                {m.ruina.map((x) => (
                  <tr key={x.riscoPct} className="border-t border-white/5">
                    <td className="py-1.5">{fmt(x.riscoPct, 1)} %</td>
                    <td className="py-1.5 text-right font-mono">{x.prob == null ? 'amostra insuficiente' : `${fmt(x.prob * 100, 1)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          <Cartao titulo="Por mês">
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">Resultado mensal</caption>
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">Mês</th><th className="py-1 text-right font-medium">Trades</th><th className="py-1 text-right font-medium">R</th><th className="py-1 text-right font-medium">Retorno</th></tr></thead>
              <tbody>
                {m.porMes.map((x) => (
                  <tr key={x.mes} className="border-t border-white/5">
                    <td className="py-1.5">{x.mes}</td><td className="py-1.5 text-right">{x.trades}</td>
                    <td className={`py-1.5 text-right font-mono ${cor(x.r)}`}>{sinal(x.r)}</td>
                    <td className={`py-1.5 text-right font-mono ${cor(x.retornoPct)}`}>{sinal(x.retornoPct)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          <Grupos titulo="Por estratégia (origem do sinal)" grupos={m.porEstrategia} />
          <Grupos titulo="Por símbolo" grupos={m.porSimbolo.slice(0, 12)} />
        </div>

        <Cartao titulo={`Operações fechadas (${a.trades.length})`}>
          <p className="mb-2 text-xs text-zinc-400">Mais recentes primeiro. Horas em UTC. Parciais somadas na operação-mãe. «Sinal» é a hora a que o sinal chegou ao motor.</p>
          <div className="-mx-3 overflow-x-auto px-3">
            <table className="w-full min-w-[860px] text-[12.5px] tabular-nums">
              <caption className="sr-only">Lista de operações fechadas com o sinal de origem</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 font-medium">Fecho</th><th className="py-1.5 font-medium">Símbolo</th><th className="py-1.5 font-medium">Dir.</th>
                  <th className="py-1.5 font-medium">Origem / estratégia</th><th className="py-1.5 font-medium">Sinal</th><th className="py-1.5 text-right font-medium">Latência</th>
                  <th className="py-1.5 text-right font-medium">Lote</th><th className="py-1.5 text-right font-medium">Pips/pts</th><th className="py-1.5 text-right font-medium">R</th><th className="py-1.5 text-right font-medium">USD</th>
                </tr>
              </thead>
              <tbody>{recentes.map((t) => <LinhaTrade key={t.id} t={t} />)}</tbody>
            </table>
          </div>
        </Cartao>

        <Cartao titulo="Como se mede">
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-400">
            <li><strong className="text-zinc-300">R</strong> = resultado líquido da operação (com parciais, swap e comissão) a dividir pelo risco inicial registado na abertura (distância ao stop × lote). Operações sem risco registado não entram no R.</li>
            <li><strong className="text-zinc-300">Pips</strong>: 0,0001 no forex, 0,01 nos pares JPY, 0,1 no ouro, 0,01 na prata; índices e cripto em pontos. Média ponderada pelo lote de cada parte.</li>
            <li><strong className="text-zinc-300">Retorno ponderado no tempo</strong>: cada operação conta sobre o saldo que havia nesse momento. {m.ajustes.quantidade ? `Esta conta teve ${m.ajustes.quantidade} ajuste(s) de capital (${sinal(m.ajustes.total)} USD), que não contam como ganho nem como drawdown.` : 'Esta conta não teve ajustes de capital.'}</li>
            <li><strong className="text-zinc-300">Ligação ao sinal</strong>: cada ordem aberta por um sinal fica registada no motor com a estratégia, a hora e o preço do sinal — daí a latência e o desvio da entrada. Sinais com entrada por ordem pendente (limite) só abrem quando o preço chega: aí não se conta latência.</li>
            <li>Operações de teste interno marcadas na base são excluídas. Nada é editado à mão nesta página: é lida da base de produção.</li>
          </ul>
        </Cartao>

        <footer className="border-t border-white/10 pt-4 text-[11px] leading-relaxed text-zinc-500">
          Conta simulada. MTM Funded não é uma corretora nem uma prop firm e não executa ordens reais por clientes.
          Conteúdo educativo, não constitui consultoria financeira. Resultados passados, simulados ou não, não garantem resultados futuros;
          o trading envolve risco de perda de capital. · morethanmoney.pt
        </footer>
      </div>
    </main>
  )
}

function Kpi({ rotulo, valor, cls, nota }: { rotulo: string; valor: string; cls?: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{rotulo}</p>
      <p className={`mt-0.5 font-mono text-lg tabular-nums ${cls ?? 'text-white'}`}>{valor}</p>
      {nota && <p className="text-[11px] text-zinc-500">{nota}</p>}
    </div>
  )
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#111] p-3 sm:p-4">
      <h2 className="mb-2 text-sm font-semibold text-white">{titulo}</h2>
      {children}
    </section>
  )
}

function Grupos({ titulo, grupos }: { titulo: string; grupos: MetricasAuditoria['porSimbolo'] }) {
  return (
    <Cartao titulo={titulo}>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{titulo}</caption>
        <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium" /><th className="py-1 text-right font-medium">Trades</th><th className="py-1 text-right font-medium">Acerto</th><th className="py-1 text-right font-medium">R</th></tr></thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.chave} className="border-t border-white/5">
              <td className="py-1.5">{g.chave}</td><td className="py-1.5 text-right">{g.trades}</td>
              <td className="py-1.5 text-right">{g.taxaAcertoPct == null ? '—' : `${fmt(g.taxaAcertoPct, 1)} %`}</td>
              <td className={`py-1.5 text-right font-mono ${cor(g.r)}`}>{sinal(g.r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  )
}

function LinhaTrade({ t }: { t: TradeAuditoria }) {
  return (
    <tr className="border-t border-white/5">
      <td className="whitespace-nowrap py-1.5 text-zinc-400">{data(t.fechadaEm)}</td>
      <td className="py-1.5 font-medium text-white">{t.symbol}</td>
      <td className={`py-1.5 ${t.direcao === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>{t.direcao === 'buy' ? 'Compra' : 'Venda'}</td>
      <td className="py-1.5 text-zinc-300">{t.sinalEm ? nomeEstrategia(t.estrategia) ?? 'sinal' : t.origem === 'manual' ? 'Manual' : t.origem}</td>
      <td className="whitespace-nowrap py-1.5 text-zinc-400">{t.sinalEm ? data(t.sinalEm) : '—'}</td>
      <td className="py-1.5 text-right text-zinc-400">{t.ordemPendente ? 'pendente' : t.latenciaSeg == null ? '—' : `${fmt(t.latenciaSeg, 1)} s`}</td>
      <td className="py-1.5 text-right">{fmt(t.volume)}</td>
      <td className={`py-1.5 text-right font-mono ${cor(t.movimento)}`}>{t.movimento == null ? '—' : sinal(t.movimento, 1)}</td>
      <td className={`py-1.5 text-right font-mono ${cor(t.r)}`}>{sinal(t.r)}</td>
      <td className={`py-1.5 text-right font-mono ${cor(t.resultado)}`}>{sinal(t.resultado)}</td>
    </tr>
  )
}

/** Gráficos interactivos (arrastar, zoom, separadores). Resumo em texto para leitores de ecrã. */
function Curva({ m, saldoInicial }: { m: MetricasAuditoria; saldoInicial: number }) {
  const pts = m.curva
  if (pts.length < 2) return null
  const ys = pts.map((p) => p.r)
  return (
    <Cartao titulo="Evolução da conta">
      <p className="sr-only">
        {`Resultado acumulado de ${sinal(m.rTotal)} R em ${pts.length} operações, de ${dia(new Date(pts[0].t).toISOString())} a ${dia(new Date(pts.at(-1)!.t).toISOString())}; máximo ${fmt(Math.max(0, ...ys))} R, mínimo ${fmt(Math.min(0, ...ys))} R, drawdown máximo ${fmt(m.drawdownMaxR)} R e ${fmt(m.drawdownMaxPct)} % no índice.`}
      </p>
      <GraficosAuditoria curva={pts} saldoInicial={saldoInicial} />
    </Cartao>
  )
}
