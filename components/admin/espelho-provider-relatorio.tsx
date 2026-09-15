'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Power, Plus, CheckCircle2, XCircle, Activity } from 'lucide-react'

/**
 * ESPELHO PROVIDER — a pergunta «a conta MTM Funded que espelha a estratégia pode ser o provider?»
 * respondida com números: por estratégia, a comparação trade a trade (mestre MetaApi × espelho com
 * gestão nossa), as latências (rede, entrada, SL, propagação para fora) e o veredicto.
 * Dados: GET /api/admin/mtmfunded/espelho-provider. Nada aqui mexe em dinheiro real.
 */

type Resumo = { n: number; p50: number | null; p95: number | null; max: number | null }
interface Trade {
  id: string; symbol: string; direcao: string; estado: string; created_at: string
  master_pips: number | null; espelho_pips: number | null; diferenca_pips: number | null
  latencia_entrada_ms: number | null; latencia_rede_ms: number | null; deslize_entrada_pips: number | null
  master_saidas: Array<{ motivo: string }>; espelho_sl_movimentos: unknown[]; master_sl_movimentos: unknown[]
}
interface Estrategia {
  slug: string; nome: string; mestre: string | null; ativo: boolean
  config: { seguirFechos?: string }
  conta: { id: string; mt5_login?: string; sim_equity?: number; saldo_inicial?: number } | null
  emCurso: number
  veredicto: { alinhado: boolean; razoes: string[]; medidas: { completas: number; perdidas: number; diferencaMedia: number | null; piorDiferenca: number | null; masterPipsTotal: number; espelhoPipsTotal: number; latenciaEntrada: Resumo; deslizeEntrada: Resumo; propagacao: Resumo } }
  vereditoSql: { alinhado?: boolean; motivos?: string[] } | null
  propagacao: { rotas: number; eventos: number; total: Resumo; tickOutbox: Resumo; porTipo: Record<string, Resumo> }
  trades: Trade[]
}
interface Dados { migracao: boolean; erro?: string; estrategias?: Estrategia[]; pulso?: { em: string; estado: Record<string, unknown> } | null }

const ms = (r: Resumo | undefined) => (r && r.n ? `${r.p50 ?? '—'} / ${r.p95 ?? '—'} ms` : '—')
const num = (v: number | null | undefined, suf = '') => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}${suf}`)

export default function EspelhoProviderRelatorio() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setACarregar(true)
    setErro(null)
    try {
      const r = await fetch('/api/admin/mtmfunded/espelho-provider?dias=30', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const accao = async (corpo: Record<string, unknown>, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return
    const r = await fetch('/api/admin/mtmfunded/espelho-provider', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setErro(j.error ?? `HTTP ${r.status}`)
    await carregar()
  }

  const pulso = dados?.pulso
  const provPulso = (pulso?.estado?.espelhoProvider ?? null) as { latencias?: Record<string, Resumo>; provedores?: Array<{ slug: string; sincronizada: boolean; abertas: number }> } | null
  const pulsoIdadeS = pulso?.em ? Math.round((Date.now() - new Date(pulso.em).getTime()) / 1000) : null

  return (
    <section className="border-t border-[#D2A63C]/15 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[#D2A63C]">Espelho provider — gestão nossa vs MetaApi</h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-400">
            Uma conta simulada da casa por estratégia copia a entrada da conta-mestre e gere-a no nosso motor (break-even,
            trailing, parciais da estratégia). Cada trade fechada compara as duas. «Alinhado» = ≥30 trades, diferença média
            ≤ ±3 pips, latência p95 ≤ 1,5 s (entrada e propagação), nenhuma trade perdida.
          </p>
        </div>
        <button onClick={() => void carregar()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5">
          {aCarregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
        </button>
      </div>

      {erro && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{erro}</p>}
      {dados && !dados.migracao && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">Migração 082 por aplicar — nada para mostrar ainda.</p>}

      {pulso && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1.5"><Activity className={`h-3.5 w-3.5 ${pulsoIdadeS != null && pulsoIdadeS < 150 ? 'text-emerald-400' : 'text-red-400'}`} /> motor VPS há {pulsoIdadeS}s</span>
          <span>rede (mestre→VPS) p50/p95: {ms(provPulso?.latencias?.rede)}</span>
          <span>evento→entrada: {ms(provPulso?.latencias?.entrada)}</span>
          <span>tick→SL: {ms(provPulso?.latencias?.tickSl)}</span>
          <span>tick→parcial: {ms(provPulso?.latencias?.tickParcial)}</span>
          {!provPulso && <span className="text-amber-300">espelho provider desligado no VPS (ESPELHO_PROVIDER≠1)</span>}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="py-2 pr-3">Estratégia</th><th className="pr-3">Conta espelho</th><th className="pr-3">Trades</th>
              <th className="pr-3">Pips mestre / espelho</th><th className="pr-3">Dif. média (pior)</th><th className="pr-3">Entrada p50/p95</th>
              <th className="pr-3">Propagação p50/p95</th><th className="pr-3">Veredicto</th><th />
            </tr>
          </thead>
          <tbody>
            {(dados?.estrategias ?? []).map((e) => {
              const m = e.veredicto.medidas
              const sinc = provPulso?.provedores?.find((p) => p.slug === e.slug)
              return (
                <tr key={e.slug} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-3">
                    <button className="text-left font-medium text-gray-100 hover:text-[#D2A63C]" onClick={() => setAberta(aberta === e.slug ? null : e.slug)}>{e.nome}</button>
                    <div className="text-xs text-gray-500">{e.slug} · fechos: {e.config.seguirFechos ?? 'humanos'}{sinc ? ` · ${sinc.sincronizada ? 'sincronizada' : 'a sincronizar'}` : ''}</div>
                  </td>
                  <td className="pr-3 text-xs text-gray-400">
                    {e.conta ? <>#{e.conta.mt5_login ?? e.conta.id.slice(0, 8)}<br />equity {e.conta.sim_equity ?? '—'}</> : (
                      <button onClick={() => void accao({ accao: 'criar_conta', slug: e.slug }, `Criar a conta simulada da casa (100 000 USD) para ${e.nome}?`)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-gray-300 hover:bg-white/5"><Plus className="h-3 w-3" /> criar</button>
                    )}
                  </td>
                  <td className="pr-3 text-gray-300">{m.completas}{e.emCurso ? <span className="text-gray-500"> +{e.emCurso} abertas</span> : null}{m.perdidas ? <span className="text-red-400"> · {m.perdidas} perdidas</span> : null}</td>
                  <td className="pr-3 text-gray-300">{num(m.masterPipsTotal)} / {num(m.espelhoPipsTotal)}</td>
                  <td className="pr-3 text-gray-300">{num(m.diferencaMedia)} ({num(m.piorDiferenca)})</td>
                  <td className="pr-3 text-gray-300">{ms(m.latenciaEntrada)}</td>
                  <td className="pr-3 text-gray-300">{ms(e.propagacao.total)}<div className="text-xs text-gray-500">{e.propagacao.rotas} rota(s) · {e.propagacao.eventos} eventos</div></td>
                  <td className="pr-3">
                    {e.veredicto.alinhado
                      ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> alinhado</span>
                      : <span className="inline-flex items-center gap-1 text-gray-400" title={e.veredicto.razoes.join('\n')}><XCircle className="h-4 w-4" /> ainda não</span>}
                    {e.vereditoSql && e.vereditoSql.alinhado !== e.veredicto.alinhado && <div className="text-xs text-amber-300">vista SQL: {String(e.vereditoSql.alinhado)}</div>}
                  </td>
                  <td>
                    {e.conta && (
                      <button onClick={() => void accao({ accao: 'ligar', slug: e.slug, ativo: !e.ativo }, e.ativo ? undefined : `Ligar o espelho provider de ${e.nome}? (só conta simulada)`)} className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${e.ativo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-gray-400'}`}>
                        <Power className="h-3 w-3" /> {e.ativo ? 'ligado' : 'desligado'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(dados?.estrategias ?? []).filter((e) => e.slug === aberta).map((e) => (
        <div key={e.slug} className="mt-4 rounded-xl border border-white/5 bg-black/30 p-4">
          <p className="text-sm text-gray-300">{e.nome}: {e.veredicto.razoes.length ? e.veredicto.razoes.join(' · ') : 'todos os critérios passam'}</p>
          <p className="mt-1 text-xs text-gray-500">tick→outbox (aberturas) {ms(e.propagacao.tickOutbox)} · por tipo: {Object.entries(e.propagacao.porTipo).map(([t, r]) => `${t} ${ms(r)}`).join(' · ')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="text-left text-gray-500"><tr><th className="py-1 pr-3">Quando</th><th className="pr-3">Símbolo</th><th className="pr-3">Mestre</th><th className="pr-3">Espelho</th><th className="pr-3">Dif.</th><th className="pr-3">Deslize</th><th className="pr-3">Entrada / rede</th><th className="pr-3">SL mestre/espelho</th><th>Estado</th></tr></thead>
              <tbody>
                {e.trades.map((t) => (
                  <tr key={t.id} className="border-t border-white/5 text-gray-300">
                    <td className="py-1 pr-3">{new Date(t.created_at).toLocaleString('pt-PT')}</td>
                    <td className="pr-3">{t.direcao} {t.symbol}</td>
                    <td className="pr-3">{num(t.master_pips)} <span className="text-gray-500">{t.master_saidas?.map((s) => s.motivo).join(',')}</span></td>
                    <td className="pr-3">{num(t.espelho_pips)}</td>
                    <td className={`pr-3 ${(t.diferenca_pips ?? 0) < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{num(t.diferenca_pips)}</td>
                    <td className="pr-3">{num(t.deslize_entrada_pips)}</td>
                    <td className="pr-3">{t.latencia_entrada_ms ?? '—'} / {t.latencia_rede_ms ?? '—'} ms</td>
                    <td className="pr-3">{t.master_sl_movimentos?.length ?? 0} / {t.espelho_sl_movimentos?.length ?? 0}</td>
                    <td>{t.estado}</td>
                  </tr>
                ))}
                {!e.trades.length && <tr><td colSpan={9} className="py-2 text-gray-500">Sem trades nos últimos 30 dias.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}
