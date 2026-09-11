'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * O DESEMPENHO DE UMA CONTA, num modal.
 *
 * Existe para responder a uma pergunta concreta: «porque é que esta conta passou / quebrou?».
 * Um número final — «−10,4%, conta quebrada» — é uma afirmação que a pessoa tem de aceitar. A
 * curva que lá chegou, com os limites desenhados por cima, é uma prova que ela pode ler.
 *
 * Quatro coisas, por esta ordem, que é a ordem em que a pergunta se responde:
 *
 * 1. Onde está a conta AGORA (equity, resultado, quanto falta para cada limite).
 * 2. A CURVA, com as linhas dos limites. É aqui que se vê a passagem ou a quebra.
 * 3. A MARGEM usada — que costuma avisar antes da equity: uma conta esticada ainda está verde.
 * 4. As POSIÇÕES abertas, que explicam o que a curva vai fazer a seguir.
 *
 * O gráfico é SVG desenhado à mão, sem biblioteca. São 240 pontos e quatro linhas: uma
 * biblioteca de gráficos aqui seriam centenas de KB para carregar num modal que a maior parte
 * das pessoas abre uma vez.
 */

interface Ponto { t: string; e: number; s: number; m?: number }

interface Dados {
  conta: {
    id: string
    login: string | null
    servidor: string | null
    tipo: string
    estado: string
    saldoInicial: number
    quebrouRegra: string | null
    quebradaEm: string | null
    programa: string | null
    fases: number | null
  }
  regras: Record<string, number>
  metricas: Record<string, unknown>
  historico: Ponto[]
  lidoEm: string | null
  aoVivo: Record<string, number | null> | null
  posicoes: Array<Record<string, unknown>>
  avisoVivo: string | null
}

export default function ModalMetricas({
  contaId,
  aoFechar,
}: {
  contaId: string
  aoFechar: () => void
}) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const puxar = useCallback(async () => {
    setErro(null)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch('/api/mtmfunded/conta/metricas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ contaId }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Não foi possível ler as métricas')
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler as métricas')
    }
  }, [contaId])

  useEffect(() => { void puxar() }, [puxar])

  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => { if (ev.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', aoTeclar)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [aoFechar])

  const n = (v: unknown, casas = 2) =>
    typeof v === 'number' && Number.isFinite(v)
      ? v.toLocaleString('pt-PT', { minimumFractionDigits: casas, maximumFractionDigits: casas })
      : '—'

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm sm:items-center"
      onClick={(ev) => { if (ev.target === ev.currentTarget) aoFechar() }}
      role="dialog"
      aria-modal="true"
      aria-label="Desempenho da conta"
    >
      <div className="my-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-[#0b0b10] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-900 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {dados ? `Conta ${dados.conta.login ?? '—'}` : 'Desempenho'}
            </h2>
            {dados && (
              <p className="mt-0.5 text-xs text-zinc-500">
                {dados.conta.programa ?? dados.conta.tipo}
                {dados.conta.servidor ? ` · ${dados.conta.servidor}` : ''}
                {dados.lidoEm ? ` · lido ${new Date(dados.lidoEm).toLocaleString('pt-PT')}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          {!dados && !erro && <p className="text-sm text-zinc-500">A ler a conta…</p>}

          {dados && (
            <div className="space-y-6">
              {dados.conta.quebrouRegra && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
                  <p className="text-sm font-medium text-red-300">
                    Conta quebrada · {dados.conta.quebrouRegra}
                  </p>
                  {dados.conta.quebradaEm && (
                    <p className="mt-1 text-xs text-red-400/70">
                      {new Date(dados.conta.quebradaEm).toLocaleString('pt-PT')} — a partir daqui
                      as estatísticas deixaram de contar.
                    </p>
                  )}
                </div>
              )}

              {dados.avisoVivo && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-300">
                  {dados.avisoVivo}
                </p>
              )}

              {/* 1. onde está a conta agora */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Numero rotulo="Equity" valor={`${n(dados.aoVivo?.equity ?? dados.metricas.equity)} USD`} />
                <Numero rotulo="Saldo" valor={`${n(dados.aoVivo?.saldo ?? dados.metricas.saldo)} USD`} />
                <Numero
                  rotulo="Resultado"
                  valor={`${n(dados.metricas.resultadoPct)}%`}
                  cor={Number(dados.metricas.resultadoPct ?? 0) >= 0 ? 'verde' : 'vermelho'}
                />
                <Numero rotulo="Drawdown" valor={`${n(dados.metricas.drawdownPct)}%`} />
              </div>

              {/* quanto falta até cada limite */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Barra
                  rotulo="Margem até à perda diária"
                  restante={Number(dados.metricas.margemDiaria ?? 0)}
                  limite={Number(dados.regras.perda_diaria_pct ?? 0)}
                />
                <Barra
                  rotulo="Margem até à perda máxima"
                  restante={Number(dados.metricas.margemTotal ?? 0)}
                  limite={Number(dados.regras.perda_maxima_pct ?? 0)}
                />
              </div>

              {/* 2. a curva */}
              <Grafico
                pontos={dados.historico}
                saldoInicial={dados.conta.saldoInicial}
                objetivoPct={Number(dados.regras.objetivo_pct ?? 0)}
                perdaMaximaPct={Number(dados.regras.perda_maxima_pct ?? 0)}
              />

              {/* 3. a margem */}
              <div className="grid grid-cols-3 gap-3">
                <Numero rotulo="Margem usada" valor={`${n(dados.aoVivo?.margemUsada ?? dados.metricas.margemUsada)} USD`} />
                <Numero rotulo="Margem livre" valor={`${n(dados.aoVivo?.margemLivre ?? dados.metricas.margemLivre)} USD`} />
                <Numero rotulo="Nível de margem" valor={`${n(dados.aoVivo?.nivelMargem ?? dados.metricas.nivelMargem, 0)}%`} />
              </div>

              {/* 4. as posições */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-300">
                  Posições abertas{dados.posicoes.length ? ` (${dados.posicoes.length})` : ''}
                </h3>
                {!dados.posicoes.length ? (
                  <p className="text-sm text-zinc-600">Nenhuma posição aberta.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-zinc-900">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-black/50 uppercase tracking-wider text-zinc-600">
                        <tr>
                          <th className="px-3 py-2">Par</th>
                          <th className="px-3 py-2">Dir.</th>
                          <th className="px-3 py-2 text-right">Lote</th>
                          <th className="px-3 py-2 text-right">Abertura</th>
                          <th className="px-3 py-2 text-right">Actual</th>
                          <th className="px-3 py-2 text-right">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {dados.posicoes.map((p, i) => (
                          <tr key={String(p.id ?? i)}>
                            <td className="px-3 py-2 font-medium text-zinc-200">{String(p.simbolo ?? '—')}</td>
                            <td className="px-3 py-2">
                              <span className={String(p.tipo) === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                                {String(p.tipo ?? '—')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-400">{n(p.volume)}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-500">{n(p.abertura, 5)}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-500">{n(p.atual, 5)}</td>
                            <td
                              className={`px-3 py-2 text-right font-mono ${
                                Number(p.lucro ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {n(p.lucro)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: 'verde' | 'vermelho' }) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-black/30 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{rotulo}</p>
      <p
        className={`mt-1 font-mono text-sm font-semibold ${
          cor === 'verde' ? 'text-emerald-400' : cor === 'vermelho' ? 'text-red-400' : 'text-zinc-200'
        }`}
      >
        {valor}
      </p>
    </div>
  )
}

/**
 * Quanto falta até bater no limite, em barra.
 *
 * A barra enche à medida que a margem se esgota — e não ao contrário. Uma barra que esvazia
 * lê-se como «está a acabar-se-me alguma coisa boa»; esta lê-se como «estou a aproximar-me de
 * uma parede», que é o que efectivamente está a acontecer.
 */
function Barra({ rotulo, restante, limite }: { rotulo: string; restante: number; limite: number }) {
  if (!limite) return null
  const usada = Math.max(0, Math.min(100, ((limite - restante) / limite) * 100))
  const cor = usada > 80 ? 'bg-red-500' : usada > 55 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="rounded-xl border border-zinc-900 bg-black/30 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-600">{rotulo}</p>
        <p className="font-mono text-xs text-zinc-400">
          {restante.toFixed(2)}% de {limite}%
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900">
        <div className={`h-full ${cor} transition-all`} style={{ width: `${usada}%` }} />
      </div>
    </div>
  )
}

/**
 * A curva de equity, com as linhas dos limites.
 *
 * SVG à mão, sem biblioteca: são 240 pontos e quatro linhas. Uma biblioteca de gráficos aqui
 * seriam centenas de KB a carregar num modal que a maior parte das pessoas abre uma vez.
 *
 * As linhas do OBJECTIVO e da PERDA MÁXIMA são o ponto todo do gráfico — sem elas, a curva é
 * uma linha bonita que não diz se está perto de passar ou de quebrar.
 */
function Grafico({
  pontos,
  saldoInicial,
  objetivoPct,
  perdaMaximaPct,
}: {
  pontos: Ponto[]
  saldoInicial: number
  objetivoPct: number
  perdaMaximaPct: number
}) {
  if (pontos.length < 2) {
    return (
      <div className="rounded-xl border border-zinc-900 bg-black/30 px-4 py-8 text-center">
        <p className="text-sm text-zinc-600">
          Ainda não há histórico suficiente para desenhar a curva. A conta é lida de hora a hora.
        </p>
      </div>
    )
  }

  const L = 640
  const A = 190
  const alvo = objetivoPct ? saldoInicial * (1 + objetivoPct / 100) : null
  const chao = perdaMaximaPct ? saldoInicial * (1 - perdaMaximaPct / 100) : null

  // A escala inclui SEMPRE os limites: um gráfico que corta a linha do objectivo fora do
  // quadro esconde exactamente a distância que se quer ver.
  const valores = pontos.map((p) => p.e)
  const min = Math.min(...valores, chao ?? Infinity, saldoInicial)
  const max = Math.max(...valores, alvo ?? -Infinity, saldoInicial)
  const folga = (max - min) * 0.08 || 1
  const y = (v: number) => A - ((v - (min - folga)) / (max + folga - (min - folga))) * A
  const x = (i: number) => (i / (pontos.length - 1)) * L

  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.e).toFixed(1)}`).join(' ')
  const area = `${linha} L${L},${A} L0,${A} Z`
  const subiu = pontos[pontos.length - 1].e >= saldoInicial

  return (
    <div className="rounded-xl border border-zinc-900 bg-black/30 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1.5">
          <i className="h-px w-4 bg-zinc-600" /> saldo inicial
        </span>
        {alvo && (
          <span className="flex items-center gap-1.5 text-emerald-600">
            <i className="h-px w-4 bg-emerald-600" /> objectivo +{objetivoPct}%
          </span>
        )}
        {chao && (
          <span className="flex items-center gap-1.5 text-red-700">
            <i className="h-px w-4 bg-red-700" /> perda máxima −{perdaMaximaPct}%
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" preserveAspectRatio="none" style={{ height: 190 }}>
        <defs>
          <linearGradient id="mtmfEq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={subiu ? '#10b981' : '#ef4444'} stopOpacity="0.22" />
            <stop offset="100%" stopColor={subiu ? '#10b981' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1="0" y1={y(saldoInicial)} x2={L} y2={y(saldoInicial)} stroke="#52525b" strokeWidth="1" strokeDasharray="4 4" />
        {alvo && <line x1="0" y1={y(alvo)} x2={L} y2={y(alvo)} stroke="#059669" strokeWidth="1" strokeDasharray="6 3" />}
        {chao && <line x1="0" y1={y(chao)} x2={L} y2={y(chao)} stroke="#b91c1c" strokeWidth="1" strokeDasharray="6 3" />}

        <path d={area} fill="url(#mtmfEq)" />
        <path d={linha} fill="none" stroke={subiu ? '#10b981' : '#ef4444'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-zinc-700">
        <span>{new Date(pontos[0].t).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</span>
        <span>{new Date(pontos[pontos.length - 1].t).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  )
}
