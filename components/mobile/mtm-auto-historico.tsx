"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useT } from "@/components/i18n-provider"
import { Loader2 } from "lucide-react"

/**
 * O histórico de TODAS as contas do cliente, com a curva — como na app MTM Auto.
 *
 * Quem tem conta no MTM Auto, uma de Tap to Trade e ainda uma ligação de MTM Copy tinha o mesmo
 * mês repartido por três sítios, e nenhum deles respondia a "como é que correu". Aqui as três
 * entram na mesma curva e na mesma lista, com a ORIGEM escrita ao lado de cada linha — somar sem
 * dizer de onde vem seria juntar coisas que se gerem de maneiras diferentes.
 */
type Linha = {
  quando: string
  origem: string
  conta: string | null
  symbol: string
  direction: string | null
  estado: string
  resultado: number | null
  pips: number | null
}
type Ponto = { quando: string; valor: number; pct?: number | null }
type Curva = {
  conta: string
  origem: string
  pontos: Ponto[]
  total: number
  /** O mesmo total em percentagem da conta. Nulo quando não se soube o saldo de partida. */
  totalPct?: number | null
}
type Dados = {
  linhas: Linha[]
  serie: { quando: string; valor: number }[]
  curvas: Curva[]
  resumo: {
    total: number
    fechadas: number
    resultado: number
    resultadoPct?: number | null
    winrate: number | null
    porOrigem: { origem: string; trades: number }[]
  }
}

/**
 * O estado vem gravado em inglês — é a língua base do sistema e é assim que fica na base de dados
 * para ser lido meses depois. Mostrá-lo cru punha "skipped" no meio de um ecrã noutra língua, e
 * "skipped" não diz a ninguém que a trade não chegou a abrir.
 *
 * O mapa dá a CHAVE, não o texto: era português fixo, e ficava português mesmo com a app em
 * alemão.
 */
const CHAVE_DO_ESTADO: Record<string, string> = {
  closed: "t2t.stClosed",
  fechada: "t2t.stClosed",
  open: "t2t.stOpen",
  aberta: "t2t.stOpen",
  pending: "t2t.stPending",
  skipped: "t2t.stSkipped",
  failed: "t2t.stFailed",
  error: "t2t.stFailed",
  cancelled: "t2t.stCancelled",
  canceled: "t2t.stCancelled",
  executed: "t2t.stExecuted",
  filled: "t2t.stExecuted",
  following: "t2t.stFollowing",
}

const CORES: Record<string, string> = {
  "MTM Auto": "#D2A63C",
  "Tap to Trade": "#28C878",
  "MTM Copy": "#7aa2f7",
}

export default function MtmAutoHistorico({ dias = 30 }: { dias?: number }) {
  const t = useT()
  const [d, setD] = useState<Dados | null>(null)
  const [aLer, setALer] = useState(true)
  /**
   * Valor ou percentagem.
   *
   * "+91,20" não diz nada sem o tamanho da conta: numa de 300 € é um mês muito bom, numa de
   * 30 000 € é ruído. As duas leituras respondem a perguntas diferentes e nenhuma chega sozinha.
   */
  const [emPct, setEmPct] = useState(false)
  /** Onde o dedo está sobre o gráfico, em índice de ponto. Nulo quando ninguém lhe toca. */
  const [lido, setLido] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const tok = (await supabase.auth.getSession()).data.session?.access_token
      if (!tok) return
      const r = await fetch(`/api/mtm-auto/historico?dias=${dias}`, {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      if (j.ok) setD(j)
    } catch {
      /* sem histórico, o resto do separador continua a funcionar */
    } finally {
      setALer(false)
    }
  }, [dias])

  useEffect(() => { carregar() }, [carregar])

  if (aLer && !d) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[13px] texto-fraco">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--destaque)" }} /> {t("t2t.histSumming")}
      </p>
    )
  }
  if (!d || !d.linhas.length) {
    return <p className="py-10 text-center text-[13px] texto-fraco">{t("t2t.histEmpty")}</p>
  }

  const { serie, resumo } = d
  const temPct = (d.curvas ?? []).some((c) => c.pontos.some((p) => p.pct != null))
  const totalMostrado = emPct ? (resumo.resultadoPct ?? null) : resumo.resultado
  const positivo = (totalMostrado ?? 0) >= 0

  /** O valor de uma curva no ponto que o dedo está — ou o total, quando não está. */
  const valorDaCurva = (c: Curva): number | null => {
    if (lido == null) return emPct ? (c.totalPct ?? null) : c.total
    const i = Math.max(0, Math.min(c.pontos.length - 1, lido))
    const p = c.pontos[i]
    if (!p) return null
    return emPct ? (p.pct ?? null) : p.valor
  }
  const fmt = (v: number | null) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}${emPct ? "%" : ""}`

  return (
    <div className="space-y-3">
      <div className="cartao p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="etiqueta">{t("t2t.histResult")} · {dias} {t("t2t.histDays")}</span>
          <div className="flex items-center gap-2">
            <span
              className="text-[19px] font-bold tabular-nums"
              style={{ color: totalMostrado == null ? "var(--texto-fraco)" : positivo ? "var(--sucesso)" : "var(--perigo)" }}
            >
              {fmt(totalMostrado)}
            </span>
            {/* Sem percentagem em conta nenhuma, o botão só serviria para não fazer nada. */}
            {temPct && (
              <div className="flex overflow-hidden rounded-full" style={{ border: "1px solid var(--borda)" }}>
                {[
                  { id: false, r: "valor" },
                  { id: true, r: "%" },
                ].map((o) => (
                  <button
                    key={String(o.id)}
                    type="button"
                    onClick={() => setEmPct(o.id)}
                    className="px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: emPct === o.id ? "var(--destaque)" : "transparent",
                      color: emPct === o.id ? "#000" : "var(--texto-fraco)",
                    }}
                  >
                    {o.r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* UMA LINHA POR CONTA, cores diferentes.
            Uma linha só, com tudo somado, esconde o que interessa: duas contas podem estar a
            puxar em sentidos opostos e a soma dá quase zero, como se nada tivesse acontecido. */}
        {(d.curvas?.length ?? 0) > 0 ? (
          <>
            <Curvas curvas={d.curvas} emPct={emPct} lido={lido} aoLer={setLido} />
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {d.curvas.map((c, i) => {
                const v = valorDaCurva(c)
                return (
                  <span key={c.conta} className="flex items-center gap-1.5 text-[11.5px] texto-fraco">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
                    {c.conta}
                    <span style={{ color: v == null ? "var(--texto-fraco)" : v >= 0 ? "var(--sucesso)" : "var(--perigo)" }}>
                      {fmt(v)}
                    </span>
                  </span>
                )
              })}
            </div>
          </>
        ) : serie.length > 1 ? (
          <Curva pontos={serie.map((p) => p.valor)} positivo={positivo} />
        ) : null}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] texto-fraco">
          <span>{resumo.total} trades</span>
          <span>{resumo.fechadas} {t("t2t.histClosed")}</span>
          {resumo.winrate != null && <span>{resumo.winrate}% {t("t2t.histWinrate")}</span>}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {resumo.porOrigem
            .filter((o) => o.trades > 0)
            .map((o) => (
              <span
                key={o.origem}
                className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ border: `1px solid ${CORES[o.origem] ?? "var(--borda)"}55`, color: CORES[o.origem] ?? "var(--texto)" }}
              >
                {o.origem} · {o.trades}
              </span>
            ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {d.linhas.slice(0, 60).map((l, i) => (
          <div key={i} className="cartao flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold">
                {l.symbol}{" "}
                {l.direction && (
                  <span style={{ color: l.direction === "buy" ? "var(--sucesso)" : "var(--perigo)" }}>
                    {l.direction === "buy" ? t("t2t.buy") : t("t2t.sell")}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[11.5px] texto-mais-fraco">
                {new Date(l.quando).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {l.conta && ` · ${l.conta}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span
                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                style={{ border: `1px solid ${CORES[l.origem] ?? "var(--borda)"}55`, color: CORES[l.origem] ?? "var(--texto)" }}
              >
                {l.origem}
              </span>
              {l.resultado != null && (
                <p
                  className="mt-0.5 text-[13px] font-bold tabular-nums"
                  style={{ color: l.resultado >= 0 ? "var(--sucesso)" : "var(--perigo)" }}
                >
                  {l.resultado >= 0 ? "+" : ""}{l.resultado.toFixed(2)}
                  {/* Os pips levam a COR DELES: pintá-los pelo dinheiro dava um "+108p" a
                      vermelho sempre que a comissão comia um ganho pequeno — parecia erro. */}
                  {l.pips != null && (
                    <span
                      className="ml-1 text-[11px] font-normal"
                      style={{ color: l.pips >= 0 ? "var(--sucesso)" : "var(--perigo)" }}
                    >
                      {l.pips >= 0 ? "+" : ""}{l.pips}p
                    </span>
                  )}
                </p>
              )}
              {l.resultado == null && <p className="mt-0.5 text-[11.5px] texto-mais-fraco">{CHAVE_DO_ESTADO[l.estado?.toLowerCase()] ? t(CHAVE_DO_ESTADO[l.estado.toLowerCase()]) : (l.estado || "—")}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Curva simples em SVG — sem biblioteca: são pontos e uma linha. */
function Curva({ pontos, positivo }: { pontos: number[]; positivo: boolean }) {
  const min = Math.min(...pontos, 0)
  const max = Math.max(...pontos, 0)
  const amplitude = max - min || 1
  const largura = 100
  const altura = 34
  const caminho = pontos
    .map((v, i) => {
      const x = (i / (pontos.length - 1)) * largura
      const y = altura - ((v - min) / amplitude) * altura
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
  const cor = positivo ? "var(--sucesso)" : "var(--perigo)"
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-2 h-16 w-full">
      {/* A linha do zero: sem ela, uma curva inteiramente negativa parece uma subida. */}
      <line
        x1="0" x2={largura}
        y1={altura - ((0 - min) / amplitude) * altura}
        y2={altura - ((0 - min) / amplitude) * altura}
        stroke="var(--borda)" strokeWidth="0.4" strokeDasharray="2 2"
      />
      <path d={caminho} fill="none" stroke={cor} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}


/** Cores das linhas — distintas entre si e legíveis sobre o fundo escuro. */
const PALETA = ["#D2A63C", "#28C878", "#7aa2f7", "#e879f9", "#fb923c", "#22d3ee"]

/**
 * Várias curvas no mesmo eixo, uma por conta.
 *
 * Partilham a escala de propósito: é a comparação que responde a "qual está a puxar o mês".
 * Cada uma com a sua própria escala pareceriam todas iguais, e uma conta que ganhou 5 € teria a
 * mesma subida de outra que ganhou 500.
 */
function Curvas({
  curvas,
  emPct,
  lido,
  aoLer,
}: {
  curvas: Curva[]
  emPct: boolean
  lido: number | null
  aoLer: (i: number | null) => void
}) {
  const serie = (c: Curva) => c.pontos.map((p) => (emPct ? p.pct : p.valor)).filter((v): v is number => v != null)
  const todos = curvas.flatMap(serie)
  const min = Math.min(...todos, 0)
  const max = Math.max(...todos, 0)
  const amplitude = max - min || 1
  const largura = 100
  const altura = 34
  const zero = altura - ((0 - min) / amplitude) * altura
  const maxPontos = Math.max(...curvas.map((c) => serie(c).length), 1)

  /* Arrastar o dedo lê o gráfico. A posição converte-se em índice de ponto, e é esse índice que
     a legenda usa — assim as várias contas mostram todas o MESMO instante, e não o ponto mais
     próximo de cada uma, que seriam instantes diferentes lado a lado. */
  const ler = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    aoLer(Math.round(f * (maxPontos - 1)))
  }

  const x0 = lido != null && maxPontos > 1 ? (lido / (maxPontos - 1)) * largura : null

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      className="mt-2 h-20 w-full touch-none"
      onPointerDown={ler}
      onPointerMove={(e) => e.buttons !== 0 && ler(e)}
      onPointerUp={() => aoLer(null)}
      onPointerLeave={() => aoLer(null)}
    >
      {/* A linha do zero: sem ela, um conjunto inteiramente negativo parece uma subida. */}
      <line x1="0" x2={largura} y1={zero} y2={zero} stroke="var(--borda)" strokeWidth="0.4" strokeDasharray="2 2" />
      {curvas.map((c, i) => {
        const pontos = serie(c)
        if (pontos.length < 2) return null
        const caminho = pontos
          .map((v, j) => {
            const x = (j / (pontos.length - 1)) * largura
            const y = altura - ((v - min) / amplitude) * altura
            return `${j === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
          })
          .join(" ")
        return (
          <path
            key={c.conta}
            d={caminho}
            fill="none"
            stroke={PALETA[i % PALETA.length]}
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
      {x0 != null && (
        <>
          <line x1={x0} x2={x0} y1="0" y2={altura} stroke="var(--texto)" strokeWidth="0.5" opacity="0.35" />
          {curvas.map((c, i) => {
            const pontos = serie(c)
            if (pontos.length < 2) return null
            const j = Math.max(0, Math.min(pontos.length - 1, lido!))
            const y = altura - ((pontos[j] - min) / amplitude) * altura
            return (
              <circle
                key={c.conta}
                cx={(j / (pontos.length - 1)) * largura}
                cy={y}
                r="1.6"
                fill={PALETA[i % PALETA.length]}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
        </>
      )}
    </svg>
  )
}
