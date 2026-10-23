'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pause, Play, RefreshCw } from 'lucide-react'
import type { CampanhaMeta, LeituraMeta, PeriodoMeta } from '@/lib/trafego/meta'
import { diagnosticar, type Gravidade } from '@/lib/trafego/diagnostico'
import EstudioAnuncios from './trafego-estudio'

/**
 * GESTÃO DE TRÁFEGO — o que a Meta diz que se gastou e gerou, ao lado do que entrou de facto no CRM
 * e na agenda na mesma janela; o diagnóstico de cada campanha; pausar, reactivar e mudar o orçamento
 * (só o dono); e o estúdio de anúncios. Ver `lib/trafego/meta.ts` e `lib/trafego/diagnostico.ts`.
 */
type Dados = {
  periodo: PeriodoMeta
  meta: LeituraMeta
  crm: { novos: number; porOrigem: Record<string, number>; erro: string | null }
  agenda: { marcacoes: number; comUtmMeta: number }
  podeEscrever?: boolean
}

const TOM: Record<Gravidade, string> = {
  grave: 'border-rose-500/40 bg-rose-500/[0.06] text-rose-200',
  aviso: 'border-amber-500/40 bg-amber-500/[0.05] text-amber-200',
  bom: 'border-emerald-500/40 bg-emerald-500/[0.05] text-emerald-200',
}

const NOME_PERIODO: Record<PeriodoMeta, string> = {
  today: 'Hoje', yesterday: 'Ontem', last_7d: '7 dias', last_30d: '30 dias', this_month: 'Este mês', last_month: 'Mês passado',
}
const eur = (v: number, moeda = 'EUR') => v.toLocaleString('pt-PT', { style: 'currency', currency: moeda, maximumFractionDigits: 2 })
const n0 = (v: number) => v.toLocaleString('pt-PT')

function Azulejo({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-zinc-100">{valor}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-zinc-500">{sub}</p>}
    </div>
  )
}

export default function TrafegoPainel() {
  const [periodo, setPeriodo] = useState<PeriodoMeta>('last_7d')
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const ler = useCallback(async (p: PeriodoMeta) => {
    setALer(true)
    setErro(null)
    try {
      const r = await fetch(`/api/admin/trafego?periodo=${p}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) setErro(d?.message ?? d?.error ?? 'Não consegui ler.')
      else setDados(d)
    } catch {
      setErro('Sem ligação.')
    } finally {
      setALer(false)
    }
  }, [])
  useEffect(() => { void ler(periodo) }, [ler, periodo])

  const [aMexer, setAMexer] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const mexer = async (c: CampanhaMeta, acao: 'pausar' | 'activar' | 'orcamento') => {
    let diario: number | undefined
    if (acao === 'orcamento') {
      const v = window.prompt(`Novo orçamento DIÁRIO para «${c.nome}» (actual: ${c.orcamentoDiario ?? '—'}):`, String(c.orcamentoDiario ?? ''))
      if (!v) return
      diario = Number(v.replace(',', '.'))
      if (!Number.isFinite(diario) || diario <= 0) return
    } else if (!window.confirm(`${acao === 'pausar' ? 'Pausar' : 'Reactivar'} a campanha «${c.nome}»?`)) return
    setAMexer(c.id)
    setAviso(null)
    const r = await fetch('/api/admin/trafego/acoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campanhaId: c.id, acao, diario }) })
    const d = await r.json().catch(() => ({}))
    setAMexer(null)
    setAviso(r.ok ? { ok: true, texto: `Feito: «${c.nome}» ${acao === 'pausar' ? 'pausada' : acao === 'activar' ? 'reactivada' : `com orçamento diário ${diario}`}.` } : { ok: false, texto: d.error ?? 'A Meta recusou.' })
    if (r.ok) void ler(periodo)
  }

  const meta = dados?.meta
  const campanhas: CampanhaMeta[] = meta?.configurado ? meta.campanhas : []
  const moeda = (meta?.configurado && meta.moeda) || 'EUR'
  const gasto = campanhas.reduce((s, c) => s + c.gasto, 0)
  const leadsMeta = campanhas.reduce((s, c) => s + c.leads, 0)
  const cliques = campanhas.reduce((s, c) => s + c.cliques, 0)
  const novosCrm = dados?.crm.novos ?? 0
  const achados = useMemo(() => diagnosticar(campanhas), [campanhas])
  const nomeDa = (id: string) => campanhas.find((c) => c.id === id)?.nome ?? id

  return (
    <div className="space-y-4 bg-black p-4 text-zinc-200">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(NOME_PERIODO) as PeriodoMeta[]).map((p) => (
          <button key={p} type="button" onClick={() => setPeriodo(p)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${p === periodo ? 'border-[#D2A63C]/60 bg-[#D2A63C]/10 text-[#E9C46A]' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
            {NOME_PERIODO[p]}
          </button>
        ))}
        <button type="button" onClick={() => void ler(periodo)} className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          {aLer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} reler
        </button>
      </div>

      {erro && <p className="text-sm text-rose-300">{erro}</p>}

      {meta && !meta.configurado && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-sm text-zinc-300">
          <p className="font-semibold text-amber-300">A ligação à Meta Ads ainda não está configurada</p>
          <p className="mt-1 text-xs text-zinc-400">
            Falta na Vercel: {meta.falta.join(', ')}. O token tem de ser de um utilizador de sistema com <code>ads_read</code> (sem prazo),
            e as contas vão sem <code>act_</code>, separadas por vírgula. Até lá, o lado do CRM em baixo já funciona.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Azulejo rotulo="Gasto Meta" valor={meta?.configurado ? eur(gasto, moeda) : '—'} sub={`${campanhas.length} campanhas com dados`} />
        <Azulejo rotulo="Cliques" valor={meta?.configurado ? n0(cliques) : '—'} sub={cliques && gasto ? `CPC médio ${eur(gasto / cliques, moeda)}` : undefined} />
        <Azulejo rotulo="Leads (Meta)" valor={meta?.configurado ? n0(leadsMeta) : '—'} sub={leadsMeta ? `${eur(gasto / leadsMeta, moeda)} por lead, segundo a Meta` : 'acções de lead atribuídas pela Meta'} />
        <Azulejo rotulo="Novos no CRM" valor={dados ? n0(novosCrm) : '—'} sub={novosCrm && gasto ? `${eur(gasto / novosCrm, moeda)} por negócio novo (todas as origens)` : 'negócios criados na janela'} />
        <Azulejo rotulo="Marcações" valor={dados ? n0(dados.agenda.marcacoes) : '—'} sub={dados ? `${dados.agenda.comUtmMeta} com UTM da Meta` : undefined} />
      </div>

      {dados && Object.keys(dados.crm.porOrigem).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(dados.crm.porOrigem).sort((a, b) => b[1] - a[1]).map(([o, q]) => (
            <span key={o} className="rounded-full border border-zinc-800 px-2.5 py-0.5 text-zinc-400">{o} <b className="text-zinc-200">{q}</b></span>
          ))}
        </div>
      )}

      {aviso && <p className={`rounded-lg border px-3 py-2 text-xs ${aviso.ok ? 'border-emerald-500/30 text-emerald-200' : 'border-rose-500/30 text-rose-200'}`}>{aviso.texto}</p>}

      {achados.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Diagnóstico · comparado com a média da própria conta neste período</p>
          <div className="grid gap-2 md:grid-cols-2">
            {achados.map((a, i) => (
              <div key={i} className={`rounded-xl border p-3 text-xs ${TOM[a.gravidade]}`}>
                <p className="font-semibold">{a.titulo} · <span className="font-normal opacity-80">{nomeDa(a.campanhaId)}</span></p>
                <p className="mt-1 text-zinc-300">{a.detalhe}</p>
                <p className="mt-1 text-zinc-400">→ {a.sugestao}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {meta?.configurado && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{['Campanha', 'Estado', 'Orçamento/dia', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Freq.', 'Leads', 'CPL', ''].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {campanhas.length === 0 && <tr><td colSpan={12} className="px-3 py-6 text-center text-zinc-500">Sem campanhas com entrega neste período.</td></tr>}
              {campanhas.map((c) => (
                <tr key={c.id} className="border-t border-zinc-900">
                  <td className="px-3 py-2"><p className="text-zinc-100">{c.nome}</p><p className="text-[10px] text-zinc-600">act_{c.conta}{c.objectivo ? ` · ${c.objectivo}` : ''}</p></td>
                  <td className="px-3 py-2 text-zinc-400">{c.estado ?? '—'}</td>
                  <td className="px-3 py-2 font-mono">{c.orcamentoDiario == null ? <span className="text-zinc-600" title="O orçamento está nos conjuntos de anúncios">conjuntos</span> : eur(c.orcamentoDiario, moeda)}</td>
                  <td className="px-3 py-2 font-mono">{eur(c.gasto, moeda)}</td>
                  <td className="px-3 py-2 font-mono">{n0(c.impressoes)}</td>
                  <td className="px-3 py-2 font-mono">{n0(c.cliques)}</td>
                  <td className="px-3 py-2 font-mono">{c.ctr == null ? '—' : `${c.ctr.toFixed(2)}%`}</td>
                  <td className="px-3 py-2 font-mono">{c.cpc == null ? '—' : eur(c.cpc, moeda)}</td>
                  <td className="px-3 py-2 font-mono">{c.frequencia == null ? '—' : c.frequencia.toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono">{n0(c.leads)}</td>
                  <td className="px-3 py-2 font-mono">{c.leads ? eur(c.gasto / c.leads, moeda) : '—'}</td>
                  <td className="px-3 py-2">
                    {dados?.podeEscrever && (
                      <div className="flex justify-end gap-1">
                        {aMexer === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E9C46A]" /> : (
                          <>
                            {c.estado === 'ACTIVE'
                              ? <button type="button" onClick={() => void mexer(c, 'pausar')} title="Pausar" className="rounded border border-zinc-700 p-1 text-zinc-300 hover:border-amber-400/60 hover:text-amber-300"><Pause className="h-3 w-3" /></button>
                              : <button type="button" onClick={() => void mexer(c, 'activar')} title="Reactivar" className="rounded border border-zinc-700 p-1 text-zinc-300 hover:border-emerald-400/60 hover:text-emerald-300"><Play className="h-3 w-3" /></button>}
                            {c.orcamentoDiario != null && <button type="button" onClick={() => void mexer(c, 'orcamento')} className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-[#D2A63C]/60 hover:text-[#E9C46A]">€/dia</button>}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta?.configurado && meta.erros.length > 0 && <p className="text-[11px] text-rose-300">{meta.erros.join(' · ')}</p>}
      <EstudioAnuncios />

      <p className="text-[10.5px] text-zinc-600">
        {dados?.podeEscrever ? 'Pausar, reactivar e mudar o orçamento diário escrevem na Meta (precisa de ads_management no token). ' : 'As acções sobre campanhas são só do dono. '}
        Criar campanhas e anúncios faz-se no Gestor de Anúncios. O custo por negócio do CRM divide o gasto por todos os negócios novos, e não só pelos que vieram de anúncios.
      </p>
    </div>
  )
}
