'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Loader2, X } from 'lucide-react'
import { COR_DO_ESTADO, type EstadoCurto } from '@/lib/mtmfunded/etiquetas'

/**
 * TODAS AS CONTAS DE UM UTILIZADOR — o «dados» do admin, com os mesmos números que o dono vê.
 *
 * MTM Funded (clientes, seguidoras de estratégia, da casa) vêm de `numerosDaConta` (a fonte única do
 * WebTrader); as ligadas (MT5/MT4 pela MetaApi, TradeLocker, MTM Auto) de `listarContasUnificadas`,
 * a função de «As minhas contas». Clicar numa conta MTM Funded abre o modal de gestão (métricas,
 * histórico, diário, levantamentos). Uma leitura ao abrir; «Actualizar» relê — sem sondagem.
 */

export interface NumerosLinha {
  etiqueta: string
  estadoCurto: EstadoCurto
  motor: 'sim' | 'mt5'
  saldoInicial: number
  saldo: number
  equity: number
  flutuante: number
  resultadoPct: number | null
  analise: boolean
  pausada: boolean
  segueEstrategia: string | null
  contaCasa: boolean
  contaReal?: boolean
}

interface Resposta {
  perfil: { full_name?: string; email?: string; username?: string | null } | null
  funded: Array<{ id: string; login: string | null; servidor: string | null; numeros: NumerosLinha; entradasDiario: number | null; tradesFechadas: number | null }>
  ligadas: Array<{ chave: string; plataforma: string; rotulo: string | null; login: string | null; servidor: string | null; estado: string; demo: boolean; usos: string[]; saldo: number | null; erro: string | null }> | null
  erroLigadas: boolean
}

const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export default function ContasDoUtilizador({ userId, nome, aoFechar, aoAbrirConta }: {
  userId: string
  nome: string
  aoFechar: () => void
  aoAbrirConta: (contaId: string) => void
}) {
  const [d, setD] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const ler = async () => {
    setALer(true)
    try {
      const r = await fetch(`/api/admin/mtmfunded?vista=contas_utilizador&userId=${userId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `erro ${r.status}`)
      setD(j); setErro(null)
    } catch (e) { setErro(e instanceof Error ? e.message : 'erro') } finally { setALer(false) }
  }
  useEffect(() => { void ler() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={`Contas de ${nome}`} onClick={aoFechar}>
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0b0c10] p-4 text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white">{d?.perfil?.full_name ?? nome}</p>
            <p className="font-mono text-xs text-gray-500">{d?.perfil?.username ? `@${d.perfil.username} · ` : ''}{d?.perfil?.email ?? ''}</p>
          </div>
          <button onClick={() => void ler()} className="ml-auto text-xs text-[#D2A63C]">{aLer ? 'A ler…' : 'Actualizar'}</button>
          <button onClick={aoFechar} aria-label="fechar" className="text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        {erro && <p className="mb-2 text-sm text-red-400">{erro}</p>}
        {!d ? <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /> : (
          <div className="space-y-5">
            <section>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">MTM Funded · {d.funded.length}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="text-left text-gray-500"><tr>
                    <th className="px-2 py-1">Conta</th><th className="px-2 py-1">Estado</th><th className="px-2 py-1 text-right">Saldo</th>
                    <th className="px-2 py-1 text-right">Equity</th><th className="px-2 py-1 text-right">Resultado</th><th className="px-2 py-1 text-right">Trades</th><th className="px-2 py-1 text-right">Diário</th>
                  </tr></thead>
                  <tbody>
                    {d.funded.map((c) => {
                      const n = c.numeros
                      return (
                        <tr key={c.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => aoAbrirConta(c.id)}>
                          <td className="px-2 py-1.5">
                            <span className="rounded bg-[#D2A63C] px-1 text-[10px] font-bold text-black">{n.etiqueta}</span>{' '}
                            <span className="font-mono">{c.login ?? '—'}</span>
                            <span className="ml-1 text-gray-500">{n.motor === 'sim' ? 'MTM' : c.servidor ?? 'MT5'}</span>
                            {n.contaCasa && <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">casa</span>}
                            {n.segueEstrategia && <span className="ml-1 text-[10px] text-[#D2A63C]">segue {n.segueEstrategia}</span>}
                            {n.contaReal
                              ? <span className="ml-1 rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-300">auditoria</span>
                              : n.analise && <span className="ml-1 text-[10px] text-gray-500">análise</span>}
                          </td>
                          <td className="px-2 py-1.5"><span style={{ color: COR_DO_ESTADO[n.estadoCurto] }}>{n.estadoCurto}</span></td>
                          <td className="px-2 py-1.5 text-right font-mono">{f2(n.saldo)}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{f2(n.equity)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${n.resultadoPct == null ? '' : n.resultadoPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{n.resultadoPct == null ? '—' : `${n.resultadoPct > 0 ? '+' : ''}${n.resultadoPct.toFixed(2)}%`}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{c.tradesFechadas ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{c.entradasDiario == null ? '—' : <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3 text-gray-500" />{c.entradasDiario}</span>}</td>
                        </tr>
                      )
                    })}
                    {!d.funded.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-500">Sem contas MTM Funded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Contas ligadas (MT5/MT4 · TradeLocker · MTM Auto) · {d.ligadas?.length ?? '—'}</p>
              {d.erroLigadas && <p className="text-xs text-red-400">Não foi possível ler as contas ligadas agora.</p>}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(d.ligadas ?? []).map((l) => (
                  <div key={l.chave} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-white/10 px-1 text-[10px] font-bold uppercase">{l.plataforma}</span>
                      <span className="font-mono">{l.login ?? '—'}</span>
                      <span className={l.demo ? 'text-sky-300' : 'text-rose-300'}>{l.demo ? 'demo' : 'real'}</span>
                      <span className="ml-auto text-gray-400">{l.estado}</span>
                    </div>
                    <p className="mt-0.5 truncate text-gray-500">{l.rotulo ?? l.servidor ?? ''}{l.usos.length ? ` · ${l.usos.join(', ')}` : ''}</p>
                    {l.saldo != null && <p className="font-mono text-gray-300">saldo {f2(l.saldo)}</p>}
                    {l.erro && <p className="truncate text-red-400">{l.erro}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
