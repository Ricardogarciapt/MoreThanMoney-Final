import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { GraficosAuditoria, type Aba } from '@/components/funded/graficos-auditoria'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerAuditoriaPorToken } from '@/lib/mtmfunded/auditoria-servidor'
import { nomeEstrategia, type MetricasAuditoria, type TradeAuditoria } from '@/lib/mtmfunded/auditoria'
import { LOCALE, textosAuditoria, type Lingua } from '@/lib/mtmfunded/auditoria-textos'

/**
 * AUDITORIA PÚBLICA DE UMA CONTA — o corpo da página, nas duas línguas.
 * /mtmfunded/auditoria/<token> (português) e /mtmfunded/auditoria/<token>/en (inglês): duas rotas
 * estáticas (ISR 5 min) em vez de ?lang=, para a página continuar em cache.
 *
 * O link que o dono partilha (WebTrader → A minha conta → Partilhar). Lê-se sem login, mostra o
 * mínimo que prova um histórico: métricas em R e pips, retorno ponderado no tempo, drawdown, risco de
 * ruína e TODAS as operações fechadas, cada uma com o sinal que a abriu. Sem nome, email ou passwords.
 * Revogado o link, a página deixa de existir. Fora dos motores de busca (noindex).
 *
 * Também serve contas REAIS ligadas (MT5 pela MetaApi, TradeLocker — migração 250): as operações
 * vêm da corretora, sem sinal nem risco inicial, por isso o R e a ligação ao sinal não aparecem; na
 * TradeLocker nem os dólares (a corretora não dá o lucro por ordem) — fica em pips.
 */

const cor = (x: number | null | undefined) => (x == null || x === 0 ? 'text-zinc-200' : x > 0 ? 'text-emerald-300' : 'text-rose-300')

function formatos(l: Lingua) {
  const loc = LOCALE[l]
  const fmt = (x: number | null | undefined, casas = 2) =>
    x == null ? '—' : x.toLocaleString(loc, { minimumFractionDigits: casas, maximumFractionDigits: casas })
  return {
    fmt,
    sinal: (x: number | null | undefined, casas = 2) => (x == null ? '—' : `${x > 0 ? '+' : ''}${fmt(x, casas)}`),
    data: (iso: string | null) => (iso ? new Date(iso).toLocaleString(loc, { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) : '—'),
    dia: (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(loc, { timeZone: 'UTC' }) : '—'),
  }
}
type Formatos = ReturnType<typeof formatos>
type Textos = ReturnType<typeof textosAuditoria>

export function metadadosAuditoria(l: Lingua) {
  const t = textosAuditoria(l)
  return { title: t.tituloPagina, description: t.descricaoPagina, robots: { index: false, follow: false } }
}

export async function PaginaAuditoria({ token, lingua }: { token: string; lingua: Lingua }) {
  const db = getSupabaseAdmin()
  const a = await lerAuditoriaPorToken(db, token)
  if (!a) notFound()
  // Contador de visitas, sem bloquear a página (falha em silêncio).
  void db.rpc('incrementar_visita_auditoria', { p_token: a.token }).then(() => undefined, () => undefined)

  const t = textosAuditoria(lingua)
  const f = formatos(lingua)
  const { fmt, sinal, data, dia } = f
  const m = a.metricas
  const estrategia = nomeEstrategia(a.conta.estrategiaSeguida)
  const recentes = [...a.trades].reverse()
  const real = a.conta.fonte !== 'mtmfunded'
  const comR = m.tradesComR > 0
  const usd = a.conta.comValor
  const plataforma = a.conta.fonte === 'tradelocker' ? 'TradeLocker' : a.conta.versao === 'mt4' ? 'MT4' : 'MT5'
  const abas: Aba[] = [
    ...(usd ? ['crescimento' as const] : []), ...(comR ? ['r' as const] : []),
    ...(usd ? ['saldo' as const, 'dd' as const] : []), 'pips', ...(comR ? ['dia' as const] : []),
  ]
  const base = `/mtmfunded/auditoria/${a.token}`
  const seletor = (
    <nav aria-label={t.lingua} className="flex gap-1 text-xs">
      {(['pt', 'en'] as const).map((l) => (
        <Link key={l} href={l === 'pt' ? base : `${base}/en`} hrefLang={l} aria-current={l === lingua ? 'true' : undefined}
          className={`flex min-h-8 min-w-10 items-center justify-center rounded-md border px-2 font-medium ${l === lingua ? 'border-[#D2A63C] text-[#E9C46A]' : 'border-white/10 text-zinc-400 hover:text-zinc-200'}`}>
          {l.toUpperCase()}
        </Link>
      ))}
    </nav>
  )

  if (a.conta.indisponivel) {
    return (
      <main lang={lingua} className="px-4 py-16 text-zinc-200 sm:px-6">
        <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-white/10 bg-[#111] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#D2A63C]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t.auditoria} · {plataforma}
            </p>
            {seletor}
          </div>
          <p className="text-sm text-zinc-300">{t.indisponivel[a.conta.indisponivel] ?? t.indisponivel.erro_leitura}</p>
        </div>
      </main>
    )
  }

  const cab = t.cabecalhoFunded({ saldo: fmt(a.conta.saldoInicial, 0), ciclo: a.conta.cicloDesde ? dia(a.conta.cicloDesde) : null, estrategia })

  return (
    <main lang={lingua} className="px-4 py-8 text-zinc-200 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#D2A63C]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t.auditoria} · {real ? `${plataforma} · ${a.conta.demo ? t.contaDemo : t.contaReal}` : 'MTM Funded'}
            </p>
            {seletor}
          </div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            {a.conta.etiqueta || estrategia || (real ? `${t.conta(plataforma)}${a.conta.servidor ? ` · ${a.conta.servidor}` : ''}` : t.contaFunded)}
            {a.conta.login && <span className="ml-2 font-mono text-lg text-zinc-400">#{a.conta.login}</span>}
          </h1>
          {real ? (
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
              {t.cabecalhoReal({ demo: a.conta.demo, servidor: a.conta.servidor, plataforma })}
              {usd ? ` ${t.saldoAgora(fmt(a.conta.saldoAtual))}` : ''}
              {' '}{t.historicoReal(dia(m.primeiraTrade), dia(m.ultimaTrade), m.trades, m.diasNegociados, a.abertas)}
              {' '}{t.lidoCorretora(data(a.geradoEm))}
            </p>
          ) : (
            <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
              {lingua === 'en'
                ? <>{'A '}<strong className="text-zinc-200">{t.simulada}</strong>{cab.depoisSimulada}</>
                : <>{cab.antes}<strong className="text-zinc-200">{t.simulada}</strong>{cab.depoisSimulada}</>}
              {estrategia ? <>{cab.aSeguir}<strong className="text-zinc-200">{estrategia}</strong></> : null}.
              {' '}{t.historicoFunded(dia(m.primeiraTrade), dia(m.ultimaTrade), m.trades, m.diasNegociados, a.abertas)}
              {' '}{t.lidoBase(data(a.geradoEm))}
            </p>
          )}
        </header>

        {real ? (
          <section aria-label={t.indicadores} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Kpi rotulo={t.k.acerto} valor={m.taxaAcertoPct == null ? '—' : `${fmt(m.taxaAcertoPct, 1)} %`} nota={usd ? t.k.porResultado : t.k.porPips} />
            <Kpi rotulo={t.k.pips} valor={sinal(m.pips, 0)} cls={cor(m.pips)} nota={m.pontos ? t.k.ptsIndices(sinal(m.pontos, 0)) : undefined} />
            {usd && <Kpi rotulo={t.k.retorno} valor={`${sinal(m.retornoPonderadoPct)} %`} cls={cor(m.retornoPonderadoPct)} nota={t.k.depositosNaoContam} />}
            {usd && <Kpi rotulo={t.k.ddMax} valor={`${fmt(m.drawdownMaxPct)} %`} nota={t.k.noIndice} />}
            {usd && <Kpi rotulo={t.k.resultadoOps} valor={`${sinal(m.resultadoTrades)} USD`} cls={cor(m.resultadoTrades)} nota={t.k.comSwap} />}
            <Kpi rotulo={t.k.seguidas} valor={`${m.maxGanhasSeguidas} / ${m.maxPerdidasSeguidas}`} />
          </section>
        ) : (
          <section aria-label={t.indicadores} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <Kpi rotulo={t.k.resultadoR} valor={sinal(m.rTotal)} cls={cor(m.rTotal)} nota={t.k.comRisco(m.tradesComR)} />
            <Kpi rotulo={t.k.expectativa} valor={`${sinal(m.expectativaR, 3)} R`} cls={cor(m.expectativaR)} />
            <Kpi rotulo={t.k.acerto} valor={m.taxaAcertoPct == null ? '—' : `${fmt(m.taxaAcertoPct, 1)} %`} />
            <Kpi rotulo={t.k.fatorLucro} valor={fmt(m.fatorLucroR)} />
            <Kpi rotulo={t.k.ddMax} valor={`${fmt(m.drawdownMaxR)} R`} nota={t.k.pctNoIndice(fmt(m.drawdownMaxPct))} />
            <Kpi rotulo={t.k.pips} valor={sinal(m.pips, 0)} cls={cor(m.pips)} nota={m.pontos ? t.k.ptsIndices(sinal(m.pontos, 0)) : undefined} />
            <Kpi rotulo={t.k.retorno} valor={`${sinal(m.retornoPonderadoPct)} %`} cls={cor(m.retornoPonderadoPct)} nota={t.k.ajustesNaoContam} />
            <Kpi rotulo={t.k.mediaGP} valor={`${sinal(m.mediaGanhoR)} / ${sinal(m.mediaPerdaR)} R`} />
            <Kpi rotulo={t.k.seguidas} valor={`${m.maxGanhasSeguidas} / ${m.maxPerdidasSeguidas}`} />
            <Kpi rotulo={t.k.ligadas} valor={t.k.de(m.tradesComSinal, m.trades)} />
            <Kpi rotulo={t.k.latencia} valor={m.latenciaMedianaSeg == null ? '—' : `${fmt(m.latenciaMedianaSeg, 1)} s`} nota={t.k.latenciaNota} />
            <Kpi rotulo={t.k.desvio} valor={m.desvioMedianoEntrada == null ? '—' : `${sinal(m.desvioMedianoEntrada, 1)}`} nota={t.k.desvioNota} />
          </section>
        )}

        <Curva m={m} saldoInicial={a.conta.saldoInicial} abas={abas} t={t} f={f} lingua={lingua} />

        <div className="grid gap-4 lg:grid-cols-2">
          {comR ? (
            <Cartao titulo={t.ruina}>
              <p className="mb-2 text-xs leading-relaxed text-zinc-400">
                {t.ruinaTexto}
                {m.tradesComR < 100 && <strong className="text-amber-300">{t.amostraCurta(m.tradesComR)}</strong>}
              </p>
              <table className="w-full text-sm tabular-nums">
                <caption className="sr-only">{t.ruinaCaption}</caption>
                <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">{t.riscoPorTrade}</th><th className="py-1 text-right font-medium">{t.probRuina}</th></tr></thead>
                <tbody>
                  {m.ruina.map((x) => (
                    <tr key={x.riscoPct} className="border-t border-white/5">
                      <td className="py-1.5">{fmt(x.riscoPct, 1)} %</td>
                      <td className="py-1.5 text-right font-mono">{x.prob == null ? t.amostraInsuf : `${fmt(x.prob * 100, 1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Cartao>
          ) : (
            <Cartao titulo={t.semR}>
              <p className="text-xs leading-relaxed text-zinc-400">{t.semRTexto(usd)}</p>
            </Cartao>
          )}

          <Cartao titulo={t.porMes}>
            <table className="w-full text-sm tabular-nums">
              <caption className="sr-only">{t.mensalCaption}</caption>
              <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium">{t.mes}</th><th className="py-1 text-right font-medium">{t.trades}</th>{comR && <th className="py-1 text-right font-medium">R</th>}{usd && <th className="py-1 text-right font-medium">{t.retornoCol}</th>}</tr></thead>
              <tbody>
                {m.porMes.map((x) => (
                  <tr key={x.mes} className="border-t border-white/5">
                    <td className="py-1.5">{x.mes}</td><td className="py-1.5 text-right">{x.trades}</td>
                    {comR && <td className={`py-1.5 text-right font-mono ${cor(x.r)}`}>{sinal(x.r)}</td>}
                    {usd && <td className={`py-1.5 text-right font-mono ${cor(x.retornoPct)}`}>{sinal(x.retornoPct)} %</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>

          {!real && <Grupos titulo={t.porEstrategia} grupos={m.porEstrategia.map((g) => (g.chave === 'Manual' ? { ...g, chave: t.manual } : g))} comR={comR} t={t} f={f} />}
          <Grupos titulo={t.porSimbolo} grupos={m.porSimbolo.slice(0, 12)} comR={comR} t={t} f={f} />
        </div>

        <Cartao titulo={t.operacoes(a.trades.length)}>
          <p className="mb-2 text-xs text-zinc-400">{t.operacoesNota(real)}</p>
          <div className="-mx-3 overflow-x-auto px-3">
            <table className={`w-full ${real ? 'min-w-[520px]' : 'min-w-[860px]'} text-[12.5px] tabular-nums`}>
              <caption className="sr-only">{t.operacoesCaption}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 font-medium">{t.col.fecho}</th><th className="py-1.5 font-medium">{t.col.simbolo}</th><th className="py-1.5 font-medium">{t.col.dir}</th>
                  {!real && <><th className="py-1.5 font-medium">{t.col.origem}</th><th className="py-1.5 font-medium">{t.col.sinal}</th><th className="py-1.5 text-right font-medium">{t.col.latencia}</th></>}
                  <th className="py-1.5 text-right font-medium">{t.col.lote}</th><th className="py-1.5 text-right font-medium">{t.col.pips}</th>{comR && <th className="py-1.5 text-right font-medium">{t.col.r}</th>}{usd && <th className="py-1.5 text-right font-medium">{t.col.usd}</th>}
                </tr>
              </thead>
              <tbody>{recentes.map((x) => <LinhaTrade key={x.id} tr={x} real={real} comR={comR} usd={usd} t={t} f={f} />)}</tbody>
            </table>
          </div>
        </Cartao>

        <Cartao titulo={t.comoSeMede}>
          <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-zinc-400">
            {(real
              ? t.medeReal({ tl: a.conta.fonte === 'tradelocker', usd, ajustes: m.ajustes.quantidade, total: sinal(m.ajustes.total) })
              : t.medeFunded({ ajustes: m.ajustes.quantidade, total: sinal(m.ajustes.total) })
            ).map((linha) => <li key={linha}>{linha}</li>)}
          </ul>
        </Cartao>

        <footer className="border-t border-white/10 pt-4 text-[11px] leading-relaxed text-zinc-500">
          {real ? t.rodapeReal : t.rodapeFunded} {t.rodapeComum} · morethanmoney.pt
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

function Grupos({ titulo, grupos, comR, t, f }: { titulo: string; grupos: MetricasAuditoria['porSimbolo']; comR: boolean; t: Textos; f: Formatos }) {
  return (
    <Cartao titulo={titulo}>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{titulo}</caption>
        <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1 font-medium" /><th className="py-1 text-right font-medium">{t.trades}</th><th className="py-1 text-right font-medium">{t.acertoCol}</th>{comR && <th className="py-1 text-right font-medium">R</th>}</tr></thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.chave} className="border-t border-white/5">
              <td className="py-1.5">{g.chave}</td><td className="py-1.5 text-right">{g.trades}</td>
              <td className="py-1.5 text-right">{g.taxaAcertoPct == null ? '—' : `${f.fmt(g.taxaAcertoPct, 1)} %`}</td>
              {comR && <td className={`py-1.5 text-right font-mono ${cor(g.r)}`}>{f.sinal(g.r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Cartao>
  )
}

function LinhaTrade({ tr, real, comR, usd, t, f }: { tr: TradeAuditoria; real: boolean; comR: boolean; usd: boolean; t: Textos; f: Formatos }) {
  return (
    <tr className="border-t border-white/5">
      <td className="whitespace-nowrap py-1.5 text-zinc-400">{f.data(tr.fechadaEm)}</td>
      <td className="py-1.5 font-medium text-white">{tr.symbol}</td>
      <td className={`py-1.5 ${tr.direcao === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>{tr.direcao === 'buy' ? t.compra : t.venda}</td>
      {!real && <>
        <td className="py-1.5 text-zinc-300">{tr.sinalEm ? nomeEstrategia(tr.estrategia) ?? t.sinal : tr.origem === 'manual' ? t.manual : tr.origem}</td>
        <td className="whitespace-nowrap py-1.5 text-zinc-400">{tr.sinalEm ? f.data(tr.sinalEm) : '—'}</td>
        <td className="py-1.5 text-right text-zinc-400">{tr.ordemPendente ? t.pendente : tr.latenciaSeg == null ? '—' : `${f.fmt(tr.latenciaSeg, 1)} s`}</td>
      </>}
      <td className="py-1.5 text-right">{f.fmt(tr.volume)}</td>
      <td className={`py-1.5 text-right font-mono ${cor(tr.movimento)}`}>{tr.movimento == null ? '—' : f.sinal(tr.movimento, 1)}</td>
      {comR && <td className={`py-1.5 text-right font-mono ${cor(tr.r)}`}>{f.sinal(tr.r)}</td>}
      {usd && <td className={`py-1.5 text-right font-mono ${cor(tr.resultado)}`}>{f.sinal(tr.resultado)}</td>}
    </tr>
  )
}

/** Gráficos interactivos (arrastar, zoom, separadores). Resumo em texto para leitores de ecrã. */
function Curva({ m, saldoInicial, abas, t, f, lingua }: { m: MetricasAuditoria; saldoInicial: number; abas: Aba[]; t: Textos; f: Formatos; lingua: Lingua }) {
  const pts = m.curva
  if (pts.length < 2) return null
  const ys = pts.map((p) => p.r)
  return (
    <Cartao titulo={t.evolucao}>
      <p className="sr-only">
        {m.tradesComR === 0
          ? t.srCurvaPips(pts.length, f.sinal(pts.at(-1)!.pips, 0))
          : t.srCurvaR(f.sinal(m.rTotal), pts.length, f.dia(new Date(pts[0].t).toISOString()), f.dia(new Date(pts.at(-1)!.t).toISOString()),
            f.fmt(Math.max(0, ...ys)), f.fmt(Math.min(0, ...ys)), f.fmt(m.drawdownMaxR), f.fmt(m.drawdownMaxPct))}
      </p>
      <GraficosAuditoria curva={pts} saldoInicial={saldoInicial} abas={abas} textos={t.graficos} locale={LOCALE[lingua]} />
    </Cartao>
  )
}
