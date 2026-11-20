'use client'

import { useCallback, useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import type { CampanhaViva, LeituraViva } from '@/lib/trafego/meta'

/**
 * AO VIVO — o estado das campanhas Meta relido de minuto a minuto, sem carregar em nada: revisão de
 * cada anúncio, gasto contra o orçamento, datas, e a conta (gasto do mês contra o teto de 150 €,
 * o que está por faturar). Lê de `/api/admin/trafego/ao-vivo`.
 */
const INTERVALO_MS = 60_000

const ROTULO: Record<string, { txt: string; cor: string }> = {
  ACTIVE: { txt: 'A correr', cor: 'border-emerald-500/40 text-emerald-300' },
  IN_PROCESS: { txt: 'Em revisão', cor: 'border-amber-500/40 text-amber-300' },
  PENDING_REVIEW: { txt: 'Em revisão', cor: 'border-amber-500/40 text-amber-300' },
  PREAPPROVED: { txt: 'Pré-aprovado', cor: 'border-amber-500/40 text-amber-300' },
  WITH_ISSUES: { txt: 'Com problemas', cor: 'border-rose-500/40 text-rose-300' },
  DISAPPROVED: { txt: 'Recusado', cor: 'border-rose-500/40 text-rose-300' },
  PENDING_BILLING_INFO: { txt: 'Falta pagamento', cor: 'border-rose-500/40 text-rose-300' },
  PAUSED: { txt: 'Em pausa', cor: 'border-zinc-600 text-zinc-400' },
  CAMPAIGN_PAUSED: { txt: 'Campanha em pausa', cor: 'border-zinc-600 text-zinc-400' },
  ADSET_PAUSED: { txt: 'Conjunto em pausa', cor: 'border-zinc-600 text-zinc-400' },
}
const Etiqueta = ({ e }: { e: string }) => {
  const r = ROTULO[e] ?? { txt: e, cor: 'border-zinc-700 text-zinc-400' }
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${r.cor}`}>{r.txt}</span>
}
const eur = (v: number, moeda = 'EUR') => v.toLocaleString('pt-PT', { style: 'currency', currency: moeda, maximumFractionDigits: 2 })
const n0 = (v: number) => v.toLocaleString('pt-PT')
const dia = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '—')

function Barra({ valor, max }: { valor: number; max: number }) {
  const p = max > 0 ? Math.min(100, (valor / max) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full rounded-full ${p >= 90 ? 'bg-rose-400' : 'bg-[#D2A63C]'}`} style={{ width: `${p}%` }} />
    </div>
  )
}

function Cartao({ c, moeda }: { c: CampanhaViva; moeda: string }) {
  const orc = c.orcamentoVitalicio ?? null
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-100">{c.nome}</p>
        <Etiqueta e={c.estado} />
      </div>
      <p className="mt-0.5 text-[10.5px] text-zinc-500">
        {dia(c.inicio)} → {dia(c.fim)} · {orc != null ? `vitalício ${eur(orc, moeda)}` : c.orcamentoDiario != null ? `${eur(c.orcamentoDiario, moeda)}/dia` : 'orçamento nos conjuntos'}
      </p>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-[11px]"><span className="text-zinc-400">Gasto</span><span className="font-mono text-zinc-200">{eur(c.gasto, moeda)}{orc != null ? ` de ${eur(orc, moeda)}` : ''}</span></div>
        {orc != null && <Barra valor={c.gasto} max={orc} />}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] text-zinc-500">
        <div><p className="font-mono text-xs text-zinc-200">{n0(c.impressoes)}</p>impressões</div>
        <div><p className="font-mono text-xs text-zinc-200">{n0(c.alcance)}</p>alcance</div>
        <div><p className="font-mono text-xs text-zinc-200">{n0(c.cliques)}</p>cliques</div>
        <div><p className="font-mono text-xs text-zinc-200">{n0(c.resultados)}</p>resultados</div>
      </div>
      {c.anuncios.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-zinc-900 pt-2">
          {c.anuncios.map((a) => (
            <li key={a.id} className="text-[11px]">
              <div className="flex items-center justify-between gap-2"><span className="truncate text-zinc-300">{a.nome}</span><Etiqueta e={a.estado} /></div>
              {a.motivo && <p className="mt-0.5 text-[10.5px] text-rose-300">{a.motivo}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TrafegoAoVivo() {
  const [vivo, setVivo] = useState<LeituraViva | null>(null)
  const [teto, setTeto] = useState(150)
  const [erro, setErro] = useState<string | null>(null)

  const ler = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/trafego/ao-vivo', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) { setErro(d?.message ?? d?.error ?? 'Não consegui ler.'); return }
      setErro(null)
      setVivo(d.vivo)
      setTeto(d.tetoMensal ?? 150)
    } catch {
      setErro('Sem ligação.')
    }
  }, [])
  useEffect(() => {
    void ler()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void ler() }, INTERVALO_MS)
    return () => clearInterval(t)
  }, [ler])

  if (!vivo) return <p className="text-xs text-zinc-500">{erro ?? 'A ligar ao feed ao vivo…'}</p>
  if (!vivo.configurado) return null

  const moeda = vivo.contas.find((c) => c.moeda)?.moeda ?? 'EUR'
  const gastoMes = vivo.contas.reduce((s, c) => s + c.gastoMes, 0)
  const porFaturar = vivo.contas.reduce((s, c) => s + c.porFaturar, 0)
  const ativas = vivo.campanhas.filter((c) => c.estado === 'ACTIVE').length
  const emRevisao = vivo.campanhas.filter((c) => ['IN_PROCESS', 'PENDING_REVIEW', 'PREAPPROVED'].includes(c.estado)).length
  const comProblemas = vivo.campanhas.filter((c) => ['WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO'].includes(c.estado)).length
  const comprometido = vivo.campanhas.filter((c) => !c.estado.includes('PAUSED')).reduce((s, c) => s + (c.orcamentoVitalicio ?? 0), 0)

  return (
    <section className="space-y-3 rounded-2xl border border-[#D2A63C]/25 bg-[#D2A63C]/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Radio className="h-4 w-4 animate-pulse text-[#E9C46A]" />
        <p className="text-sm font-semibold text-[#E9C46A]">Ao vivo · campanhas Meta</p>
        <span className="text-[10.5px] text-zinc-500">
          {ativas} a correr · {emRevisao} em revisão{comProblemas ? ` · ${comProblemas} com problemas` : ''} · lido às {new Date(vivo.lidoEm).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}, relê a cada minuto
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Gasto este mês</p>
          <p className="mt-1 text-xl font-bold text-zinc-100">{eur(gastoMes, moeda)}</p>
          <div className="mt-1.5"><Barra valor={gastoMes} max={teto} /></div>
          <p className="mt-1 text-[10.5px] text-zinc-500">teto mensal {eur(teto, moeda)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Orçamento comprometido</p>
          <p className="mt-1 text-xl font-bold text-zinc-100">{eur(comprometido, moeda)}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-500">soma dos orçamentos vitalícios não pausados: é o máximo que a Meta pode gastar</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Por faturar</p>
          <p className="mt-1 text-xl font-bold text-zinc-100">{eur(porFaturar, moeda)}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-500">gasto que a Meta ainda vai cobrar ao método de pagamento da conta</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Gasto total da conta</p>
          <p className="mt-1 text-xl font-bold text-zinc-100">{eur(vivo.contas.reduce((s, c) => s + c.gastoTotal, 0), moeda)}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-500">{vivo.contas.some((c) => c.limite) ? `limite da conta ${eur(vivo.contas.reduce((s, c) => s + (c.limite ?? 0), 0), moeda)}` : 'desde sempre, todas as contas'}</p>
        </div>
      </div>

      {vivo.campanhas.length === 0
        ? <p className="text-xs text-zinc-500">Nenhuma campanha ativa, em revisão ou em pausa.</p>
        : <div className="grid gap-2 md:grid-cols-2">{vivo.campanhas.map((c) => <Cartao key={c.id} c={c} moeda={moeda} />)}</div>}

      {(erro || vivo.erros.length > 0) && <p className="text-[11px] text-rose-300">{[erro, ...vivo.erros].filter(Boolean).join(' · ')}</p>}
    </section>
  )
}
