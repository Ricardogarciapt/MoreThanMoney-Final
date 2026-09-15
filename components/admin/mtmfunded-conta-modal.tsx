'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Loader2, X, RefreshCw, ExternalLink, Download, Pause, Play, Ban, Undo2, ChevronsRight, RotateCcw,
  Wallet, CalendarPlus, KeyRound, Bell, Lock, FlaskConical, Radio, GitBranch,
} from 'lucide-react'
import { COR_DO_ESTADO, type EstadoCurto } from '@/lib/mtmfunded/etiquetas'

/**
 * O MODAL DE UMA CONTA MTM FUNDED — o que o admin abre ao clicar na linha da lista de Contas.
 *
 * Sete separadores: Resumo, Métricas, Posições & Ordens, Histórico, Gestão, Levantamentos,
 * Auditoria. Tudo passa por /api/admin/mtmfunded/conta/[id]; nenhuma escrita sai daqui sem
 * motivo, e as que mexem em dinheiro ou fecham posições levam uma chave de idempotência gerada
 * quando a confirmação abre (um duplo clique não fecha a mesma posição duas vezes).
 *
 * A base recuperou de uma sobrecarga: só o separador Posições relê sozinho, de 20 em 20 s, e só
 * com o separador à vista. O resto relê quando se abre o separador ou se carrega em actualizar.
 */

type Aba = 'resumo' | 'metricas' | 'posicoes' | 'historico' | 'gestao' | 'levantamentos' | 'auditoria'

const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: 'resumo', nome: 'Resumo' },
  { id: 'metricas', nome: 'Métricas' },
  { id: 'posicoes', nome: 'Posições & Ordens' },
  { id: 'historico', nome: 'Histórico' },
  { id: 'gestao', nome: 'Gestão' },
  { id: 'levantamentos', nome: 'Levantamentos' },
  { id: 'auditoria', nome: 'Auditoria' },
]

type Dados = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const usd = (v: unknown, casas = 2) =>
  v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v).toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })} $`
const data = (v: unknown) => (v ? new Date(String(v)).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const novaChave = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')

async function pedirJson(url: string, init?: RequestInit): Promise<Dados> {
  const r = await fetch(url, { cache: 'no-store', ...init })
  const j = await r.json().catch(() => ({}))
  // Com `respondeu`: o servidor recusou (a acção não correu) — distingue de uma rede que caiu a meio.
  if (!r.ok) throw Object.assign(new Error(j?.error ?? `falhou (${r.status})`), { respondeu: true })
  return j
}

// ── o modal ──────────────────────────────────────────────────────────────────

export default function ContaModal({ contaId, aoFechar, aoMudar }: {
  contaId: string
  aoFechar: () => void
  /** A lista de contas relê quando alguma coisa mudou. */
  aoMudar?: () => void
}) {
  const [aba, setAba] = useState<Aba>('resumo')
  const [resumo, setResumo] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  const base = `/api/admin/mtmfunded/conta/${contaId}`

  const carregarResumo = useCallback(async () => {
    try { setResumo(await pedirJson(`${base}?vista=resumo`)); setErro(null) } catch (e) { setErro((e as Error).message) }
  }, [base])
  useEffect(() => { void carregarResumo() }, [carregarResumo, versao])

  // Esc fecha; o foco entra no modal ao abrir e volta à linha ao fechar. Uma vez só (ref), mesmo
  // que o pai passe um `aoFechar` novo a cada render.
  const fecharRef = useRef(aoFechar)
  fecharRef.current = aoFechar
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    caixa.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharRef.current() }
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; antes?.focus?.() }
  }, [])

  /** Uma acção POST. Devolve a resposta, ou null (e mostra o erro). */
  const accao = useCallback(async (corpo: Record<string, unknown>, chave: string) => {
    setErro(null); setAviso(null)
    try {
      const j = await pedirJson(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, chave }) })
      setVersao((v) => v + 1)
      aoMudar?.()
      return j
    } catch (e) {
      setErro((e as Error).message)
      // false = recusada pelo servidor (a confirmação pode gerar chave nova e repetir);
      // null = sem resposta (mantém-se a chave: se afinal correu, repetir devolve o mesmo).
      return (e as { respondeu?: boolean }).respondeu ? false : null
    }
  }, [base, aoMudar])

  const c = resumo?.conta
  const estado = (c?.estadoCurto ?? 'Pending') as EstadoCurto

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div
        ref={caixa}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conta-modal-titulo"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden border border-gray-800 bg-[#0b0b0d] outline-none sm:h-[92vh] sm:rounded-2xl"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-5 py-3">
          <h2 id="conta-modal-titulo" className="text-lg font-semibold text-gray-100">
            Conta <span className="font-mono">{c?.mt5_login ?? '…'}</span>
          </h2>
          {c && (
            <>
              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[11px] font-semibold text-gray-200">{c.etiqueta}</span>
              <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ color: COR_DO_ESTADO[estado], background: `${COR_DO_ESTADO[estado]}1f` }}>{estado}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.motor === 'sim' ? 'bg-[#D2A63C]/15 text-[#D2A63C]' : 'bg-blue-500/15 text-blue-300'}`}>{c.motor === 'sim' ? 'MTM (sim)' : 'MT5'}</span>
              {c.analise && <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-300">análise</span>}
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setVersao((v) => v + 1)} className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Actualizar">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button type="button" onClick={aoFechar} className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-gray-800 px-3" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id} type="button" role="tab" aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-[#D2A63C] text-[#D2A63C]' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              {a.nome}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Por cima de tudo (incluindo a confirmação aberta): um erro escondido atrás do diálogo não se lê. */}
          {erro && (
            <div role="alert" className="fixed left-1/2 top-4 z-[95] flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-lg border border-red-500/40 bg-[#1a0d0d] px-4 py-2 text-sm text-red-300 shadow-xl">
              <span className="flex-1">{erro}</span>
              <button type="button" onClick={() => setErro(null)} aria-label="Fechar erro" className="text-red-400 hover:text-red-200"><X className="h-4 w-4" /></button>
            </div>
          )}
          {aviso && <p className="mb-4 whitespace-pre-wrap rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-300">{aviso}</p>}
          {c && c.migracao079 === false && (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
              Migração 079 por aplicar: dá para ver tudo, mas as acções ficam bloqueadas (sem auditoria não se age).
            </p>
          )}
          {!resumo ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" /></div>
          ) : (
            <>
              {aba === 'resumo' && <SeparadorResumo r={resumo} />}
              {aba === 'metricas' && <SeparadorMetricas base={base} versao={versao} />}
              {aba === 'posicoes' && <SeparadorPosicoes base={base} versao={versao} conta={c} accao={accao} setAviso={setAviso} />}
              {aba === 'historico' && <SeparadorHistorico base={base} versao={versao} />}
              {aba === 'gestao' && <SeparadorGestao r={resumo} accao={accao} setAviso={setAviso} />}
              {aba === 'levantamentos' && <SeparadorLevantamentos base={base} versao={versao} accao={accao} setAviso={setAviso} />}
              {aba === 'auditoria' && <SeparadorAuditoria base={base} versao={versao} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type Accao = (corpo: Record<string, unknown>, chave: string) => Promise<Dados | false | null>
type Confirmar = (corpo: Record<string, unknown>, chave: string) => Promise<unknown>

// ── Resumo ───────────────────────────────────────────────────────────────────

function SeparadorResumo({ r }: { r: Dados }) {
  const c = r.conta
  const f = r.financeiro
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Bloco titulo="Dono">
          {r.dono ? (
            <>
              <p className="text-gray-100">{r.dono.full_name ?? '—'}</p>
              <p className="font-mono text-xs text-gray-500">{r.dono.email}</p>
              <a href={`/admin?tab=users&userId=${r.dono.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#D2A63C] hover:underline">
                Abrir no admin de utilizadores <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : <p className="text-gray-500">sem dono</p>}
        </Bloco>
        <Bloco titulo="Programa">
          <p className="text-gray-100">{r.programa?.nome ?? r.torneio?.nome ?? '—'}</p>
          <p className="text-xs text-gray-500">
            {c.tipo} · fase {c.fase}{r.programa?.fases ? ` de ${r.programa.fases}` : ''} · {Number(c.saldo_inicial ?? 0).toLocaleString('pt-PT')} USD · 1:{c.alavancagem ?? 100}
          </p>
        </Bloco>
        <Bloco titulo="Servidor">
          <p className="font-mono text-gray-100">{c.servidor ?? '—'}</p>
          <p className="text-xs text-gray-500">motor {c.motor} · criada {data(c.created_at)}</p>
          {c.quebrou_regra && <p className="mt-1 text-xs text-red-400">{c.quebrou_regra} · {data(c.quebrada_em)}</p>}
          {c.pausada_em && <p className="mt-1 text-xs text-amber-300">Pausa desde {data(c.pausada_em)} — {c.pausa_motivo}</p>}
          {Number(c.prazo_extra_dias ?? 0) > 0 && <p className="mt-1 text-xs text-gray-400">prazo +{c.prazo_extra_dias} dias</p>}
        </Bloco>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Numero nome="Saldo" valor={usd(f.saldo)} />
        <Numero nome="Equity" valor={usd(f.equity)} />
        <Numero nome="Flutuante" valor={usd(f.flutuante)} cor={f.flutuante >= 0 ? 'text-emerald-300' : 'text-red-300'} />
        <Numero nome="Margem" valor={usd(f.margem)} />
        <Numero nome="Abertas / pendentes" valor={r.contagem ? `${r.contagem.abertas} / ${r.contagem.pendentes}` : '—'} />
      </div>
      <p className="-mt-3 text-[11px] text-gray-600">USD simulados · última escrita do motor {data(f.atualizadoEm)}</p>

      <Bloco titulo="Regras">
        {!r.barras?.length && <p className="text-sm text-gray-500">Sem regras conhecidas para esta conta.</p>}
        <div className="space-y-3">
          {(r.barras ?? []).map((b: Dados) => (
            <div key={b.chave}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-gray-300">{b.nome}</span>
                <span className={b.perigo ? 'text-red-300' : 'text-gray-500'}>{b.texto}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-800" role="progressbar" aria-valuenow={b.pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={b.nome}>
                <div className={`h-full ${b.perigo ? 'bg-red-500' : b.chave === 'objetivo' || b.chave === 'dias' ? 'bg-emerald-500' : 'bg-[#D2A63C]'}`} style={{ width: `${b.pct ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Bloco>

      <div className="grid gap-3 md:grid-cols-3">
        <Bloco titulo="Segue estratégia"><p className="text-gray-100">{c.segue_estrategia ?? '—'}</p></Bloco>
        <Bloco titulo="Aceita T2T"><p className="text-gray-100">{c.aceita_t2t ? 'Sim' : 'Não'}</p></Bloco>
        <Bloco titulo="Conta de análise"><p className="text-gray-100">{c.analise ? 'Sim — as regras não quebram' : 'Não'}</p></Bloco>
      </div>

      <Bloco titulo="Destinos ligados">
        <Tabela cabecalhos={['Onde', 'Id', 'Estado', 'Detalhe', 'Criado']}>
          {(r.destinos?.mtmAuto ?? []).map((d: Dados) => (
            <tr key={`a${d.id}`} className="border-t border-gray-900">
              <Td>MTM Auto</Td><Td mono>{String(d.id).slice(0, 8)}</Td><Td>{d.estado ?? '—'}</Td>
              <Td>{[d.rotulo, d.copia_ativa ? 'cópia activa' : 'cópia parada', d.funded_somente_leitura ? 'só leitura' : null].filter(Boolean).join(' · ')}</Td>
              <Td>{data(d.created_at)}</Td>
            </tr>
          ))}
          {(r.destinos?.t2t ?? []).map((d: Dados) => (
            <tr key={`t${d.id}`} className="border-t border-gray-900">
              <Td>T2T / MTM Copy</Td><Td mono>{String(d.id).slice(0, 8)}</Td><Td>{d.mt5_status ?? d.status ?? '—'}</Td>
              <Td>{[d.mt5_login, d.funded_somente_leitura ? 'só leitura' : null].filter(Boolean).join(' · ')}</Td>
              <Td>{data(d.created_at)}</Td>
            </tr>
          ))}
          {!(r.destinos?.mtmAuto?.length || r.destinos?.t2t?.length) && <Vazio colunas={5} texto="Nenhum destino ligado." />}
        </Tabela>
      </Bloco>
    </div>
  )
}

// ── Métricas ─────────────────────────────────────────────────────────────────

function SeparadorMetricas({ base, versao }: { base: string; versao: number }) {
  const [e, setE] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [grupo, setGrupo] = useState<'porSimbolo' | 'porEstrategia' | 'porOrigem' | 'porDirecao'>('porSimbolo')
  useEffect(() => {
    let vivo = true
    setE(null)
    pedirJson(`${base}?vista=metricas`).then((j) => vivo && setE(j)).catch((x) => vivo && setErro((x as Error).message))
    return () => { vivo = false }
  }, [base, versao])
  const curva = useMemo(() => (e?.curva ?? []).map((p: Dados) => ({ ...p, rotulo: new Date(p.t).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) })), [e])

  if (erro) return <p className="text-sm text-red-400">{erro}</p>
  if (!e) return <Carregar />
  const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}%`)
  const kpis: Array<[string, string]> = [
    ['Trades', String(e.trades)],
    ['Taxa de acerto', e.taxaAcertoPct == null ? '—' : `${pct(e.taxaAcertoPct)} (${e.ganhas}/${e.trades})`],
    ['Fator de lucro', e.fatorLucro == null ? (e.lucroBruto > 0 ? '∞' : '—') : Number(e.fatorLucro).toFixed(2)],
    ['Expectativa', usd(e.expectativaUsd)],
    ['Expectativa em R', e.expectativaR == null ? '—' : `${e.expectativaR}R (${e.tradesComR} c/ SL)`],
    ['Trades por dia', e.tradesPorDia == null ? '—' : String(e.tradesPorDia)],
    ['Resultado líquido', usd(e.resultadoLiquido)],
    ['Drawdown máximo', `${pct(e.drawdownMaxPct)} · ${usd(e.drawdownMaxUsd)}`],
    ['Retorno', pct(e.retornoPct)],
    ['Ganho / perda média', `${usd(e.mediaGanho)} / ${usd(e.mediaPerda)}`],
  ]
  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(([n, v]) => <Numero key={n} nome={n} valor={v} />)}
      </div>
      <Bloco titulo="Saldo e equity (USD)">
        {curva.length < 2 ? <p className="text-sm text-gray-500">Ainda sem pontos suficientes.</p> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curva}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="rotulo" tick={{ fill: '#6b7280', fontSize: 11 }} minTickGap={30} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={['auto', 'auto']} width={70} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 12 }} />
                <Area type="monotone" dataKey="equity" stroke="#D2A63C" fill="#D2A63C22" name="Equity" />
                <Area type="monotone" dataKey="saldo" stroke="#26A69A" fill="transparent" name="Saldo" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Bloco>
      {curva.length >= 2 && (
        <Bloco titulo="Drawdown (%)">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curva}>
                <XAxis dataKey="rotulo" hide />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} width={50} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', fontSize: 12 }} />
                <Area type="monotone" dataKey="ddPct" stroke="#EF5350" fill="#EF535033" name="Drawdown %" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Bloco>
      )}
      <Bloco titulo="Agrupado">
        <div className="mb-2 flex flex-wrap gap-1">
          {([['porSimbolo', 'Símbolo'], ['porEstrategia', 'Estratégia'], ['porOrigem', 'Origem'], ['porDirecao', 'Direcção']] as const).map(([k, n]) => (
            <button key={k} type="button" onClick={() => setGrupo(k)} className={`rounded px-2 py-1 text-xs ${grupo === k ? 'bg-[#D2A63C] text-black' : 'border border-gray-700 text-gray-300'}`}>{n}</button>
          ))}
        </div>
        <Tabela cabecalhos={['', 'Trades', 'Acerto', 'Resultado']}>
          {(e[grupo] ?? []).map((g: Dados) => (
            <tr key={g.chave} className="border-t border-gray-900">
              <Td>{g.chave}</Td><Td>{g.trades}</Td><Td>{pct(g.taxaAcertoPct)}</Td>
              <Td><span className={g.resultado >= 0 ? 'text-emerald-300' : 'text-red-300'}>{usd(g.resultado)}</span></Td>
            </tr>
          ))}
          {!(e[grupo] ?? []).length && <Vazio colunas={4} texto="Sem trades terminadas." />}
        </Tabela>
      </Bloco>
    </div>
  )
}

// ── Posições & Ordens ────────────────────────────────────────────────────────

function SeparadorPosicoes({ base, versao, conta, accao, setAviso }: {
  base: string; versao: number; conta: Dados; accao: Accao; setAviso: (s: string | null) => void
}) {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<null | { tipo: 'fechar' | 'parcial' | 'modificar' | 'cancelar' | 'tudo'; linha?: Dados }>(null)

  const puxar = useCallback(async () => {
    try { setD(await pedirJson(`${base}?vista=posicoes`)); setErro(null) } catch (e) { setErro((e as Error).message) }
  }, [base])
  useEffect(() => {
    void puxar()
    // 20 s e só com a página à vista: a base não aguenta mais do que isto por modal aberto.
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void puxar() }, 20_000)
    return () => clearInterval(iv)
  }, [puxar, versao])

  if (erro) return <p className="text-sm text-red-400">{erro}</p>
  if (!d) return <Carregar />
  if (d.motor !== 'sim') return <p className="text-sm text-gray-400">Conta da corretora (MT5): as posições vivem na MetaApi e não se gerem daqui.</p>
  const dig = (s: string) => d.digitos?.[s] ?? 5
  const fx = (v: unknown, s: string) => (v == null ? '—' : Number(v).toFixed(dig(s)))

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-4">
        <Numero nome="Equity" valor={usd(d.estado.equity)} />
        <Numero nome="Flutuante" valor={usd(d.estado.flutuante)} cor={d.estado.flutuante >= 0 ? 'text-emerald-300' : 'text-red-300'} />
        <Numero nome="Margem livre" valor={usd(d.estado.margemLivre)} />
        <Numero nome="Nível de margem" valor={d.estado.nivelMargemPct == null ? '—' : `${d.estado.nivelMargemPct}%`} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Posições abertas ({d.posicoes.length})</h3>
        <button type="button" disabled={!d.posicoes.length && !d.ordens.length} onClick={() => setConfirmar({ tipo: 'tudo' })}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:border-red-500 disabled:opacity-40">
          Fechar tudo
        </button>
      </div>
      <Tabela cabecalhos={['Símbolo', 'Lado', 'Lotes', 'Entrada', 'Actual', 'SL', 'TP', 'P&L', 'Origem', 'Aberta', '']}>
        {d.posicoes.map((p: Dados) => (
          <tr key={p.id} className="border-t border-gray-900">
            <Td mono>{p.symbol}</Td>
            <Td><span className={p.direcao === 'buy' ? 'text-emerald-300' : 'text-red-300'}>{p.direcao}</span></Td>
            <Td>{p.volume}</Td><Td mono>{fx(p.preco_entrada, p.symbol)}</Td><Td mono>{fx(p.precoAtual, p.symbol)}</Td>
            <Td mono>{fx(p.sl, p.symbol)}</Td><Td mono>{fx(p.tp, p.symbol)}</Td>
            <Td><span className={Number(p.pnlFlutuante) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{usd(p.pnlFlutuante)}</span></Td>
            <Td>{p.origem}{p.comentario ? ` · ${p.comentario}` : ''}</Td>
            <Td>{data(p.aberta_em)}</Td>
            <Td>
              <div className="flex gap-1">
                <MiniBotao onClick={() => setConfirmar({ tipo: 'fechar', linha: p })}>Fechar</MiniBotao>
                <MiniBotao onClick={() => setConfirmar({ tipo: 'parcial', linha: p })}>Parcial</MiniBotao>
                <MiniBotao onClick={() => setConfirmar({ tipo: 'modificar', linha: p })}>SL/TP</MiniBotao>
              </div>
            </Td>
          </tr>
        ))}
        {!d.posicoes.length && <Vazio colunas={11} texto="Sem posições abertas." />}
      </Tabela>

      <h3 className="text-sm font-semibold text-gray-200">Ordens pendentes ({d.ordens.length})</h3>
      <Tabela cabecalhos={['Símbolo', 'Tipo', 'Lotes', 'Preço', 'SL', 'TP', 'Expira', 'Criada', '']}>
        {d.ordens.map((o: Dados) => (
          <tr key={o.id} className="border-t border-gray-900">
            <Td mono>{o.symbol}</Td><Td>{o.direcao} {o.tipo}</Td><Td>{o.volume}</Td>
            <Td mono>{fx(o.preco, o.symbol)}</Td><Td mono>{fx(o.sl, o.symbol)}</Td><Td mono>{fx(o.tp, o.symbol)}</Td>
            <Td>{data(o.expira_em)}</Td><Td>{data(o.criada_em)}</Td>
            <Td><MiniBotao perigo onClick={() => setConfirmar({ tipo: 'cancelar', linha: o })}>Cancelar</MiniBotao></Td>
          </tr>
        ))}
        {!d.ordens.length && <Vazio colunas={9} texto="Sem ordens pendentes." />}
      </Tabela>
      <p className="text-[11px] text-gray-600">Relê sozinho de 20 em 20 s. Fechos a mercado ao último preço do motor (≤5 s) — com o mercado fechado, recusam.</p>

      {confirmar && (
        <ConfirmarPosicao
          pedido={confirmar} conta={conta} dig={dig}
          aoFechar={() => setConfirmar(null)}
          aoConfirmar={async (corpo, chave) => {
            const j = await accao(corpo, chave)
            if (j) {
              setConfirmar(null)
              if (corpo.accao === 'fechar_tudo') setAviso(`Fechadas ${j.fechadas} de ${j.pedidas}${j.falhas?.length ? ` · ${j.falhas.length} falharam` : ''} · ${j.canceladas} ordens canceladas.`)
              else setAviso(j.repetido ? 'Já tinha sido feito (mesma chave).' : 'Feito.')
              void puxar()
            }
            return j
          }}
        />
      )}
    </div>
  )
}

function ConfirmarPosicao({ pedido, conta, dig, aoFechar, aoConfirmar }: {
  pedido: { tipo: 'fechar' | 'parcial' | 'modificar' | 'cancelar' | 'tudo'; linha?: Dados }
  conta: Dados; dig: (s: string) => number
  aoFechar: () => void; aoConfirmar: Confirmar
}) {
  const [chave, setChave] = useState(novaChave)
  const l = pedido.linha
  const [volume, setVolume] = useState(l ? String(Math.round(Number(l.volume) / 2 * 100) / 100) : '')
  const [sl, setSl] = useState(l?.sl == null ? '' : String(l.sl))
  const [tp, setTp] = useState(l?.tp == null ? '' : String(l.tp))
  const [motivo, setMotivo] = useState('')
  const [frase, setFrase] = useState('')
  const [pendentes, setPendentes] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const nivel = (v: string) => (v.trim() === '' ? null : Number(v))

  const titulo = { fechar: 'Fechar posição', parcial: 'Fecho parcial', modificar: 'Modificar SL/TP', cancelar: 'Cancelar ordem', tudo: 'Fechar tudo' }[pedido.tipo]
  const valido = pedido.tipo === 'tudo'
    ? frase.trim() === String(conta.mt5_login) && motivo.trim().length >= 3
    : pedido.tipo === 'parcial' ? Number(volume) > 0 && Number(volume) < Number(l?.volume) : true

  const corpo = (): Record<string, unknown> => {
    const m = motivo.trim() ? { motivo: motivo.trim() } : {}
    switch (pedido.tipo) {
      case 'fechar': return { accao: 'fechar_posicao', positionId: l!.id, ...m }
      case 'parcial': return { accao: 'fechar_posicao', positionId: l!.id, volume: Number(volume), ...m }
      case 'modificar': return { accao: 'modificar_posicao', positionId: l!.id, sl: nivel(sl), tp: nivel(tp), ...m }
      case 'cancelar': return { accao: 'cancelar_ordem', orderId: l!.id, ...m }
      case 'tudo': return { accao: 'fechar_tudo', confirmacao: frase.trim(), cancelarPendentes: pendentes, motivo: motivo.trim() }
    }
  }

  return (
    <Dialogo titulo={titulo} aoFechar={aoFechar}>
      {l && <p className="text-sm text-gray-300"><span className="font-mono">{l.symbol}</span> · {l.direcao} {l.tipo ?? ''} · {l.volume} lotes · entrada {Number(l.preco_entrada ?? l.preco).toFixed(dig(l.symbol))}</p>}
      {pedido.tipo === 'parcial' && <Campo rotulo={`Lotes a fechar (de ${l?.volume})`}><input type="number" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} className={INPUT} /></Campo>}
      {pedido.tipo === 'modificar' && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Stop loss (vazio limpa)"><input type="number" step="any" value={sl} onChange={(e) => setSl(e.target.value)} className={INPUT} /></Campo>
          <Campo rotulo="Take profit (vazio limpa)"><input type="number" step="any" value={tp} onChange={(e) => setTp(e.target.value)} className={INPUT} /></Campo>
        </div>
      )}
      {pedido.tipo === 'tudo' && (
        <>
          <p className="text-sm text-red-300">Fecha TODAS as posições a mercado. Não se desfaz.</p>
          <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={pendentes} onChange={(e) => setPendentes(e.target.checked)} className="accent-[#D2A63C]" /> Cancelar também as ordens pendentes</label>
          <Campo rotulo={`Escreve o login ${conta.mt5_login} para confirmar`}><input value={frase} onChange={(e) => setFrase(e.target.value)} className={INPUT} autoComplete="off" /></Campo>
        </>
      )}
      <Campo rotulo={pedido.tipo === 'tudo' ? 'Motivo (obrigatório)' : 'Motivo (opcional, fica na auditoria)'}>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} maxLength={400} />
      </Campo>
      <BotoesDialogo
        ocupado={ocupado} valido={valido} perigo={pedido.tipo !== 'modificar'} aoFechar={aoFechar}
        aoConfirmar={async () => { setOcupado(true); if ((await aoConfirmar(corpo(), chave)) === false) setChave(novaChave()); setOcupado(false) }}
      />
    </Dialogo>
  )
}

// ── Histórico ────────────────────────────────────────────────────────────────

function SeparadorHistorico({ base, versao }: { base: string; versao: number }) {
  const [filtros, setFiltros] = useState({ desde: '', ate: '', symbol: '', origem: '', direcao: '' })
  const [aplicados, setAplicados] = useState(filtros)
  const [linhas, setLinhas] = useState<Dados[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const query = useMemo(() => new URLSearchParams(Object.entries(aplicados).filter(([, v]) => v)).toString(), [aplicados])

  useEffect(() => {
    let vivo = true
    setLinhas(null)
    pedirJson(`${base}?vista=historico${query ? `&${query}` : ''}`).then((j) => vivo && setLinhas(j.trades)).catch((x) => vivo && setErro((x as Error).message))
    return () => { vivo = false }
  }, [base, query, versao])

  const total = (linhas ?? []).reduce((t, x) => t + Number(x.pnl ?? 0) + Number(x.swap ?? 0) - Number(x.comissao ?? 0), 0)
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setAplicados(filtros) }}>
        <Campo rotulo="Desde"><input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className={INPUT} /></Campo>
        <Campo rotulo="Até"><input type="date" value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} className={INPUT} /></Campo>
        <Campo rotulo="Símbolo"><input value={filtros.symbol} onChange={(e) => setFiltros({ ...filtros, symbol: e.target.value })} className={`${INPUT} w-28`} placeholder="XAUUSD" /></Campo>
        <Campo rotulo="Origem">
          <select value={filtros.origem} onChange={(e) => setFiltros({ ...filtros, origem: e.target.value })} className={INPUT}>
            <option value="">todas</option>{['manual', 'ideia_mtm', 'scanner', 'copia', 'estrategia'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Lado">
          <select value={filtros.direcao} onChange={(e) => setFiltros({ ...filtros, direcao: e.target.value })} className={INPUT}>
            <option value="">ambos</option><option value="buy">buy</option><option value="sell">sell</option>
          </select>
        </Campo>
        <button type="submit" className="rounded-lg bg-[#D2A63C] px-3 py-2 text-xs font-semibold text-black">Filtrar</button>
        <a href={`${base}?vista=historico&formato=csv${query ? `&${query}` : ''}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300 hover:border-gray-500">
          <Download className="h-3.5 w-3.5" /> CSV
        </a>
      </form>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {!linhas ? <Carregar /> : (
        <>
          <p className="text-xs text-gray-500">{linhas.length} fechos{linhas.length === 300 ? ' (últimos 300 — o CSV leva até 10.000)' : ''} · líquido {usd(total)}</p>
          <Tabela cabecalhos={['Fechada', 'Símbolo', 'Lado', 'Lotes', 'Entrada', 'Fecho', 'P&L', 'Motivo', 'Origem']}>
            {linhas.map((t) => (
              <tr key={t.id} className="border-t border-gray-900">
                <Td>{data(t.fechada_em)}</Td><Td mono>{t.symbol}{t.mae_id ? ' ·parcial' : ''}</Td><Td>{t.direcao}</Td><Td>{t.volume}</Td>
                <Td mono>{t.preco_entrada}</Td><Td mono>{t.preco_fecho}</Td>
                <Td><span className={Number(t.pnl) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{usd(t.pnl)}</span></Td>
                <Td>{t.motivo_fecho ?? '—'}</Td><Td>{t.origem}</Td>
              </tr>
            ))}
            {!linhas.length && <Vazio colunas={9} texto="Sem fechos com estes filtros." />}
          </Tabela>
        </>
      )}
    </div>
  )
}

// ── Gestão ───────────────────────────────────────────────────────────────────

interface DefAccao {
  id: string
  nome: string
  nota: string
  icone: typeof Pause
  perigo?: boolean
  visivel: boolean
  /** Campos extra do diálogo. */
  campos?: 'saldo' | 'dias' | 'reset' | 'estrategia' | 'booleano' | 'credenciais' | 'notificar' | 'fase' | 'pausa'
  corpo: (extra: Dados) => Record<string, unknown>
  /** Pede o login escrito à mão. */
  confirmacaoEscrita?: boolean
}

function SeparadorGestao({ r, accao, setAviso }: { r: Dados; accao: Accao; setAviso: (s: string | null) => void }) {
  const c = r.conta
  const sim = c.motor === 'sim'
  const [aberta, setAberta] = useState<DefAccao | null>(null)
  const [credenciais, setCredenciais] = useState<Dados | null>(null)

  const defs: DefAccao[] = [
    { id: 'pausar', nome: 'Pausar conta', icone: Pause, visivel: sim && c.estado === 'ativa' && !c.pausada_em, campos: 'pausa',
      nota: 'Deixa de aceitar ordens novas (WebTrader, webhook, T2T, cópia). As posições mantêm SL/TP no motor.',
      corpo: (x) => ({ accao: 'pausar', cancelarPendentes: Boolean(x.cancelarPendentes) }) },
    { id: 'retomar', nome: 'Retomar conta', icone: Play, visivel: Boolean(c.pausada_em), nota: 'Volta a aceitar ordens.', corpo: () => ({ accao: 'retomar' }) },
    { id: 'fechar_conta', nome: 'Fechar conta (Closed)', icone: Lock, perigo: true, visivel: ['ativa', 'aprovada'].includes(c.estado),
      nota: 'Fim da conta, sem incumprimento. Nas simuladas exige zero posições e ordens.', corpo: () => ({ accao: 'fechar_conta' }) },
    { id: 'marcar_breach', nome: 'Marcar Breached', icone: Ban, perigo: true, visivel: c.estado !== 'quebrada',
      nota: 'Incumprimento decidido pelo admin. O motivo fica visível ao trader. Nas simuladas exige a conta sem posições.', corpo: () => ({ accao: 'marcar_breach' }) },
    { id: 'reverter_breach', nome: 'Reverter breach', icone: Undo2, visivel: c.estado === 'quebrada',
      nota: 'Volta a Active. Atenção: se a equity continuar abaixo do limite, o motor volta a quebrá-la — ajusta o saldo, faz reset ou marca como análise antes.', corpo: () => ({ accao: 'reverter_breach' }) },
    { id: 'avancar_fase', nome: c.fase >= (r.programa?.fases ?? 1) ? 'Concluir desafio' : `Avançar para F${Number(c.fase) + 1}`, icone: ChevronsRight, visivel: c.tipo === 'desafio' && c.estado === 'ativa', campos: 'fase',
      nota: 'Emite o certificado e a conta da fase seguinte (credenciais novas, igual ao fluxo automático). Na última fase a Funded nasce com o contrato — ou já, se marcares.',
      corpo: (x) => ({ accao: 'avancar_fase', emitirFinanciada: Boolean(x.emitirFinanciada) }) },
    { id: 'reset', nome: 'Reset da conta', icone: RotateCcw, perigo: true, visivel: sim, campos: 'reset', confirmacaoEscrita: true,
      nota: 'Fecha as posições a zero, cancela as pendentes e repõe o saldo (e o saldo inicial). Numa só transacção.',
      corpo: (x) => ({ accao: 'reset', ...(Number(x.saldo) > 0 ? { saldo: Number(x.saldo) } : {}), confirmacao: x.confirmacao }) },
    { id: 'ajustar_saldo', nome: 'Ajustar saldo', icone: Wallet, visivel: sim, campos: 'saldo',
      nota: 'Crédito (+) ou débito (−) pela função atómica funded_somar_saldo.', corpo: (x) => ({ accao: 'ajustar_saldo', delta: Number(x.delta) }) },
    { id: 'estender_prazo', nome: 'Estender prazo', icone: CalendarPlus, visivel: true, campos: 'dias',
      nota: 'Soma dias ao limite de duração desta conta (o motor do VPS ainda tem de passar a ler este valor).', corpo: (x) => ({ accao: 'estender_prazo', dias: Number(x.dias) }) },
    { id: 'definir_analise', nome: c.analise ? 'Desligar modo análise' : 'Ligar modo análise', icone: FlaskConical, visivel: true,
      nota: 'Em análise as regras do programa não quebram a conta (o stop-out por margem continua).', corpo: () => ({ accao: 'definir_analise', valor: !c.analise }) },
    { id: 'definir_aceita_t2t', nome: c.aceita_t2t ? 'Não aceitar T2T' : 'Aceitar T2T', icone: Radio, visivel: sim,
      nota: 'Se esta conta recebe as ideias confirmadas no Tap to Trade.', corpo: () => ({ accao: 'definir_aceita_t2t', valor: !c.aceita_t2t }) },
    { id: 'definir_estrategia', nome: 'Estratégia seguida', icone: GitBranch, visivel: sim, campos: 'estrategia',
      nota: `Hoje: ${c.segue_estrategia ?? 'nenhuma'}. O motor espelha as posições da estratégia escolhida.`, corpo: (x) => ({ accao: 'definir_estrategia', slug: x.slug || null }) },
    { id: 'regenerar_credenciais', nome: 'Regenerar credenciais', icone: KeyRound, perigo: true, visivel: sim, campos: 'credenciais',
      nota: 'Passwords novas (master e investor), mostradas aqui UMA vez. Nunca por email.', corpo: (x) => ({ accao: 'regenerar_credenciais', novoLogin: Boolean(x.novoLogin) }) },
    { id: 'notificar', nome: 'Notificar o dono', icone: Bell, visivel: Boolean(c.user_id), campos: 'notificar',
      nota: 'Email e/ou push com um modelo (sem passwords).', corpo: (x) => ({ accao: 'notificar', modelo: x.modelo ?? 'conta_revista', texto: x.texto || undefined, email: x.email !== false, push: x.push !== false }) },
  ]

  return (
    <div className="space-y-4">
      {credenciais && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-semibold text-amber-300">Credenciais novas — copia agora, não voltam a aparecer</p>
          <dl className="mt-2 grid gap-1 font-mono text-sm text-gray-100 sm:grid-cols-2">
            <div>Login: <b>{credenciais.login}</b></div><div>Servidor: {credenciais.servidor}</div>
            <div>Master: <b>{credenciais.password}</b></div><div>Investor: <b>{credenciais.investor}</b></div>
          </dl>
          <button type="button" onClick={() => setCredenciais(null)} className="mt-3 text-xs text-gray-400 hover:text-gray-200">Já copiei — esconder</button>
        </div>
      )}
      {!sim && <p className="text-xs text-gray-500">Conta da corretora (MT5): pausa, reset, saldo, T2T, estratégia e credenciais só existem nas simuladas.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {defs.filter((d) => d.visivel).map((d) => {
          const Icone = d.icone
          return (
            <button key={d.id} type="button" onClick={() => setAberta(d)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${d.perigo ? 'border-red-500/25 hover:border-red-500/60' : 'border-gray-800 hover:border-[#D2A63C]/50'}`}>
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${d.perigo ? 'text-red-400' : 'text-[#D2A63C]'}`} />
              <span>
                <span className="block text-sm font-medium text-gray-100">{d.nome}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{d.nota}</span>
              </span>
            </button>
          )
        })}
      </div>
      {aberta && (
        <DialogoGestao
          def={aberta} r={r}
          aoFechar={() => setAberta(null)}
          aoConfirmar={async (corpo, chave) => {
            const j = await accao(corpo, chave)
            if (!j) return j
            setAberta(null)
            if (corpo.accao === 'regenerar_credenciais' && j.password) setCredenciais(j)
            else if (j.repetido) setAviso('Já tinha sido feito (mesma chave).')
            else if (corpo.accao === 'avancar_fase') setAviso(`Fase concluída · certificado ${j.certificado}${j.novaConta ? ` · conta nova ${j.novaConta.mt5_login ?? j.novaConta.id}` : ''}${j.financiada && !j.financiada.ok ? ` · Funded não emitida: ${j.financiada.motivo}` : ''}`)
            else if (corpo.accao === 'ajustar_saldo') setAviso(`Saldo agora: ${usd(j.saldo)}`)
            else if (corpo.accao === 'notificar') setAviso(`Email: ${j.email} · push: ${j.push}`)
            else if (corpo.accao === 'reset') setAviso(`Reset feito · ${j.reset?.posicoesFechadas ?? 0} posições fechadas, ${j.reset?.ordensCanceladas ?? 0} ordens canceladas.`)
            else setAviso(`${aberta.nome}: feito.`)
            return j
          }}
        />
      )}
    </div>
  )
}

function DialogoGestao({ def, r, aoFechar, aoConfirmar }: {
  def: DefAccao; r: Dados; aoFechar: () => void; aoConfirmar: Confirmar
}) {
  const [chave, setChave] = useState(novaChave)
  const [motivo, setMotivo] = useState('')
  const [x, setX] = useState<Dados>({ email: true, push: true, modelo: 'conta_revista', slug: r.conta.segue_estrategia ?? '' })
  const [ocupado, setOcupado] = useState(false)
  const c = r.conta
  const precisaMotivo = def.id !== 'notificar'
  const valido =
    (!precisaMotivo || motivo.trim().length >= 3) &&
    (def.campos !== 'saldo' || (Number(x.delta) !== 0 && Number.isFinite(Number(x.delta)))) &&
    (def.campos !== 'dias' || Number(x.dias) >= 1) &&
    (!def.confirmacaoEscrita || String(x.confirmacao ?? '').trim() === String(c.mt5_login)) &&
    (def.campos !== 'notificar' || x.modelo !== 'livre' || String(x.texto ?? '').trim().length > 0)

  return (
    <Dialogo titulo={def.nome} aoFechar={aoFechar}>
      <p className="text-sm text-gray-400">{def.nota}</p>
      {def.campos === 'pausa' && (
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={Boolean(x.cancelarPendentes)} onChange={(e) => setX({ ...x, cancelarPendentes: e.target.checked })} className="accent-[#D2A63C]" /> Cancelar também as ordens pendentes (o motor ainda executa pendentes de contas em pausa)</label>
      )}
      {def.campos === 'fase' && (
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={Boolean(x.emitirFinanciada)} onChange={(e) => setX({ ...x, emitirFinanciada: e.target.checked })} className="accent-[#D2A63C]" /> Se for a última fase, emitir já a Funded (sem esperar pelo contrato — os levantamentos continuam a pedi-lo)</label>
      )}
      {def.campos === 'saldo' && (
        <Campo rotulo={`Valor em USD (saldo actual ${usd(r.financeiro.saldo)}) — negativo debita`}>
          <input type="number" step="0.01" value={x.delta ?? ''} onChange={(e) => setX({ ...x, delta: e.target.value })} className={INPUT} />
        </Campo>
      )}
      {def.campos === 'dias' && <Campo rotulo="Dias a somar"><input type="number" min={1} max={365} value={x.dias ?? ''} onChange={(e) => setX({ ...x, dias: e.target.value })} className={INPUT} /></Campo>}
      {def.campos === 'reset' && (
        <>
          <Campo rotulo={`Saldo novo (vazio = ${Number(c.saldo_inicial ?? 0).toLocaleString('pt-PT')} USD)`}>
            <input type="number" step="100" value={x.saldo ?? ''} onChange={(e) => setX({ ...x, saldo: e.target.value })} className={INPUT} />
          </Campo>
          <Campo rotulo={`Escreve o login ${c.mt5_login} para confirmar`}>
            <input value={x.confirmacao ?? ''} onChange={(e) => setX({ ...x, confirmacao: e.target.value })} className={INPUT} autoComplete="off" />
          </Campo>
        </>
      )}
      {def.campos === 'estrategia' && (
        <Campo rotulo="Estratégia (MTM Auto)">
          <select value={x.slug} onChange={(e) => setX({ ...x, slug: e.target.value })} className={INPUT}>
            <option value="">— nenhuma —</option>
            {(r.estrategias ?? []).map((p: Dados) => <option key={p.slug} value={p.slug}>{p.nome ?? p.slug}{p.ativo === false ? ' (inactiva)' : ''}</option>)}
          </select>
        </Campo>
      )}
      {def.campos === 'credenciais' && (
        <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={Boolean(x.novoLogin)} onChange={(e) => setX({ ...x, novoLogin: e.target.checked })} className="accent-[#D2A63C]" /> Gerar também um login novo (quebra ligações T2T/MTM Auto feitas pelo login)</label>
      )}
      {def.campos === 'notificar' && (
        <>
          <Campo rotulo="Modelo">
            <select value={x.modelo} onChange={(e) => setX({ ...x, modelo: e.target.value })} className={INPUT}>
              <option value="pausa">Conta em pausa</option><option value="retoma">Pausa terminada</option>
              <option value="aviso_regras">Aviso de regras</option><option value="conta_revista">Conta revista</option><option value="livre">Texto livre</option>
            </select>
          </Campo>
          <Campo rotulo="Texto adicional (sem passwords)"><textarea value={x.texto ?? ''} onChange={(e) => setX({ ...x, texto: e.target.value })} maxLength={800} rows={3} className={INPUT} /></Campo>
          <div className="flex gap-4 text-xs text-gray-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={x.email} onChange={(e) => setX({ ...x, email: e.target.checked })} className="accent-[#D2A63C]" /> Email</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={x.push} onChange={(e) => setX({ ...x, push: e.target.checked })} className="accent-[#D2A63C]" /> Push</label>
          </div>
        </>
      )}
      {precisaMotivo && (
        <Campo rotulo="Motivo (obrigatório, fica na auditoria)">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} maxLength={400} autoFocus />
        </Campo>
      )}
      <BotoesDialogo
        ocupado={ocupado} valido={valido} perigo={def.perigo} aoFechar={aoFechar}
        aoConfirmar={async () => {
          setOcupado(true)
          if ((await aoConfirmar({ ...def.corpo(x), ...(precisaMotivo ? { motivo: motivo.trim() } : {}) }, chave)) === false) setChave(novaChave())
          setOcupado(false)
        }}
      />
    </Dialogo>
  )
}

// ── Levantamentos ────────────────────────────────────────────────────────────

function SeparadorLevantamentos({ base, versao, accao, setAviso }: { base: string; versao: number; accao: Accao; setAviso: (s: string | null) => void }) {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [decidir, setDecidir] = useState<null | { pedido: Dados; estado: 'em_analise' | 'aprovado' | 'pago' | 'recusado' }>(null)
  useEffect(() => {
    let vivo = true
    setD(null)
    pedirJson(`${base}?vista=levantamentos`).then((j) => vivo && setD(j)).catch((x) => vivo && setErro((x as Error).message))
    return () => { vivo = false }
  }, [base, versao])
  if (erro) return <p className="text-sm text-red-400">{erro}</p>
  if (!d) return <Carregar />
  const g = d.regras
  const Regra = ({ ok, texto }: { ok: boolean | null; texto: string }) => (
    <li className={ok == null ? 'text-gray-500' : ok ? 'text-emerald-400' : 'text-amber-400'}>{ok == null ? '·' : ok ? '✓' : '✗'} {texto}</li>
  )
  return (
    <div className="space-y-4">
      <Bloco titulo="Regras de levantamento (verificadas outra vez ao aprovar e ao pagar)">
        <ul className="space-y-1 text-sm">
          <Regra ok={g.funded} texto="Conta Funded" />
          <Regra ok={g.ativa} texto="Activa" />
          <Regra ok={g.abertas == null ? null : g.abertas === 0 && g.pendentes === 0} texto={g.abertas == null ? 'Posições: conta da corretora (confirma-se na MetaApi ao aprovar)' : `Sem posições (${g.abertas}) nem pendentes (${g.pendentes})`} />
          <li className="text-gray-300">Saldo exacto {g.saldoExacto == null ? '—' : usd(g.saldoExacto)} · almofada {usd(g.almofada)} · já pago/aprovado {usd(g.jaPago)} · levantável agora {usd(g.levantavel)}</li>
        </ul>
      </Bloco>
      <Tabela cabecalhos={['Pedido', 'Valor', 'UID', 'Estado', 'Motivo', '']}>
        {d.pedidos.map((p: Dados) => (
          <tr key={p.id} className="border-t border-gray-900">
            <Td>{data(p.criado_em)}</Td><Td>{usd(p.valor_usd)}</Td><Td mono>{p.uid_broker}</Td><Td>{p.estado}{p.pago_em ? ` · ${data(p.pago_em)}` : ''}</Td>
            <Td>{p.motivo ?? '—'}</Td>
            <Td>
              {!['pago', 'recusado'].includes(p.estado) && (
                <div className="flex flex-wrap gap-1">
                  {p.estado === 'pedido' && <MiniBotao onClick={() => setDecidir({ pedido: p, estado: 'em_analise' })}>Em análise</MiniBotao>}
                  {p.estado !== 'aprovado' && <MiniBotao onClick={() => setDecidir({ pedido: p, estado: 'aprovado' })}>Aprovar</MiniBotao>}
                  {p.estado === 'aprovado' && <MiniBotao onClick={() => setDecidir({ pedido: p, estado: 'pago' })}>Pago</MiniBotao>}
                  <MiniBotao perigo onClick={() => setDecidir({ pedido: p, estado: 'recusado' })}>Recusar</MiniBotao>
                </div>
              )}
            </Td>
          </tr>
        ))}
        {!d.pedidos.length && <Vazio colunas={6} texto="Sem pedidos de levantamento nesta conta." />}
      </Tabela>
      {decidir && (
        <DialogoLevantamento
          pedido={decidir.pedido} estado={decidir.estado} aoFechar={() => setDecidir(null)}
          aoConfirmar={async (corpo, chave) => {
            const j = await accao(corpo, chave)
            if (j) {
              setDecidir(null)
              setAviso(`Pedido ${decidir.estado}${j.renovacao?.contaNova ? ' · Funded renovada' : j.renovacao?.motivo ? ` · renovação falhou: ${j.renovacao.motivo}` : ''}.`)
            }
            return j
          }}
        />
      )}
    </div>
  )
}

function DialogoLevantamento({ pedido, estado, aoFechar, aoConfirmar }: {
  pedido: Dados; estado: string; aoFechar: () => void; aoConfirmar: Confirmar
}) {
  const [chave, setChave] = useState(novaChave)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const valido = estado !== 'recusado' || motivo.trim().length >= 3
  return (
    <Dialogo titulo={`Levantamento de ${usd(pedido.valor_usd)} → ${estado}`} aoFechar={aoFechar}>
      {estado === 'pago' && <p className="text-sm text-amber-300">Marcar pago fecha o ciclo: a Funded é substituída por uma igual e o trader recebe email.</p>}
      <Campo rotulo={estado === 'recusado' ? 'Motivo da recusa (o trader vê)' : 'Motivo (opcional)'}>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} maxLength={400} autoFocus />
      </Campo>
      <BotoesDialogo
        ocupado={ocupado} valido={valido} perigo={estado === 'recusado' || estado === 'pago'} aoFechar={aoFechar}
        aoConfirmar={async () => { setOcupado(true); if ((await aoConfirmar({ accao: 'levantamento', levantamentoId: pedido.id, estado, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }, chave)) === false) setChave(novaChave()); setOcupado(false) }}
      />
    </Dialogo>
  )
}

// ── Auditoria ────────────────────────────────────────────────────────────────

function SeparadorAuditoria({ base, versao }: { base: string; versao: number }) {
  const [d, setD] = useState<Dados | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  useEffect(() => {
    let vivo = true
    pedirJson(`${base}?vista=auditoria`).then((j) => vivo && setD(j)).catch(() => vivo && setD({ registos: [], aviso: 'falhou a ler' }))
    return () => { vivo = false }
  }, [base, versao])
  if (!d) return <Carregar />
  return (
    <div className="space-y-3">
      {d.aviso && <p className="text-xs text-amber-300">{d.aviso}</p>}
      <Tabela cabecalhos={['Quando', 'Quem', 'Acção', 'Motivo', 'Resultado', '']}>
        {d.registos.map((a: Dados) => (
          <FragmentoAuditoria key={a.id} a={a} aberto={aberto === a.id} alternar={() => setAberto(aberto === a.id ? null : a.id)} />
        ))}
        {!d.registos.length && <Vazio colunas={6} texto="Sem acções de admin nesta conta." />}
      </Tabela>
    </div>
  )
}

function FragmentoAuditoria({ a, aberto, alternar }: { a: Dados; aberto: boolean; alternar: () => void }) {
  return (
    <>
      <tr className="border-t border-gray-900">
        <Td>{data(a.criado_em)}</Td><Td mono>{a.admin_email ?? String(a.admin_id).slice(0, 8)}</Td><Td>{a.accao}</Td>
        <Td>{a.motivo ?? '—'}</Td>
        <Td><span className={a.estado === 'ok' ? 'text-emerald-400' : a.estado === 'falhou' ? 'text-red-400' : 'text-amber-300'}>{a.estado}</span></Td>
        <Td><button type="button" onClick={alternar} aria-expanded={aberto} className="text-xs text-[#D2A63C] hover:underline">{aberto ? 'esconder' : 'antes/depois'}</button></Td>
      </tr>
      {aberto && (
        <tr className="bg-black/40">
          <td colSpan={6} className="px-3 py-2">
            <div className="grid gap-2 text-[11px] md:grid-cols-3">
              {(['antes', 'depois', 'resultado'] as const).map((k) => (
                <div key={k}><p className="mb-1 text-gray-500">{k}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/60 p-2 text-gray-300">{JSON.stringify(a[k], null, 1)}</pre></div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── peças ────────────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white'

function Dialogo({ titulo, children, aoFechar }: { titulo: string; children: React.ReactNode; aoFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Uma vez só: o pai relê (Posições, de 20 em 20 s) e passa um `aoFechar` novo — sem a ref o foco
  // saltava para o primeiro campo a meio de se escrever.
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); fechar.current() } }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [])
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-label={titulo} className="w-full max-w-md space-y-3 rounded-xl border border-gray-700 bg-[#111114] p-5">
        <h3 className="text-base font-semibold text-gray-100">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

function BotoesDialogo({ ocupado, valido, perigo, aoFechar, aoConfirmar }: { ocupado: boolean; valido: boolean; perigo?: boolean; aoFechar: () => void; aoConfirmar: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={aoFechar} className="rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-gray-200">Cancelar</button>
      <button type="button" disabled={!valido || ocupado} onClick={aoConfirmar}
        className={`rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40 ${perigo ? 'bg-red-500 text-white' : 'bg-[#D2A63C] text-black'}`}>
        {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar'}
      </button>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block text-xs text-gray-400"><span className="mb-1 block">{rotulo}</span>{children}</label>
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 bg-black/30 p-4">
      <h3 className="mb-2 text-xs uppercase tracking-wider text-gray-500">{titulo}</h3>
      {children}
    </section>
  )
}

function Numero({ nome, valor, cor }: { nome: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
      <p className="text-[11px] text-gray-500">{nome}</p>
      <p className={`mt-0.5 font-mono text-sm ${cor ?? 'text-gray-100'}`}>{valor}</p>
    </div>
  )
}

function Tabela({ cabecalhos, children }: { cabecalhos: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-black/40 uppercase tracking-wider text-gray-500"><tr>{cabecalhos.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return <td className={`whitespace-nowrap px-3 py-2 text-gray-300 ${mono ? 'font-mono' : ''}`}>{children}</td>
}

function Vazio({ colunas, texto }: { colunas: number; texto: string }) {
  return <tr><td colSpan={colunas} className="px-3 py-6 text-center text-gray-500">{texto}</td></tr>
}

function MiniBotao({ children, onClick, perigo }: { children: React.ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[11px] ${perigo ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
      {children}
    </button>
  )
}

function Carregar() {
  return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
}
