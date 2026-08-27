"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
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
type Curva = { conta: string; origem: string; pontos: { quando: string; valor: number }[]; total: number }
type Dados = {
  linhas: Linha[]
  serie: { quando: string; valor: number }[]
  curvas: Curva[]
  resumo: {
    total: number
    fechadas: number
    resultado: number
    winrate: number | null
    porOrigem: { origem: string; trades: number }[]
  }
}

/**
 * O estado vem gravado em inglês — é a língua base do sistema e é assim que fica na base de dados
 * para ser lido meses depois. Mostrá-lo cru punha "skipped" no meio de um ecrã em português, e
 * "skipped" não diz a ninguém que a trade não chegou a abrir.
 */
function estadoEmPortugues(e: string): string {
  const m: Record<string, string> = {
    closed: "Fechada",
    fechada: "Fechada",
    open: "Aberta",
    aberta: "Aberta",
    pending: "Por abrir",
    skipped: "Não abriu",
    failed: "Falhou",
    error: "Falhou",
    cancelled: "Cancelada",
    canceled: "Cancelada",
    executed: "Executada",
    filled: "Executada",
    following: "A seguir",
  }
  return m[e.toLowerCase()] ?? (e || "—")
}

const CORES: Record<string, string> = {
  "MTM Auto": "#D2A63C",
  "Tap to Trade": "#28C878",
  "MTM Copy": "#7aa2f7",
}

export default function MtmAutoHistorico({ dias = 30 }: { dias?: number }) {
  const [d, setD] = useState<Dados | null>(null)
  const [aLer, setALer] = useState(true)

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
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--destaque)" }} /> A somar as tuas contas…
      </p>
    )
  }
  if (!d || !d.linhas.length) {
    return <p className="py-10 text-center text-[13px] texto-fraco">Ainda não há trades nas tuas contas nesta janela.</p>
  }

  const { serie, resumo } = d
  const positivo = resumo.resultado >= 0

  return (
    <div className="space-y-3">
      <div className="cartao p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="etiqueta">Resultado · {dias} dias</span>
          <span
            className="text-[19px] font-bold tabular-nums"
            style={{ color: positivo ? "var(--sucesso)" : "var(--perigo)" }}
          >
            {positivo ? "+" : ""}{resumo.resultado.toFixed(2)}
          </span>
        </div>

        {/* UMA LINHA POR CONTA, cores diferentes.
            Uma linha só, com tudo somado, esconde o que interessa: duas contas podem estar a
            puxar em sentidos opostos e a soma dá quase zero, como se nada tivesse acontecido. */}
        {(d.curvas?.length ?? 0) > 0 ? (
          <>
            <Curvas curvas={d.curvas} />
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {d.curvas.map((c, i) => (
                <span key={c.conta} className="flex items-center gap-1.5 text-[11.5px] texto-fraco">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
                  {c.conta}
                  <span style={{ color: c.total >= 0 ? "var(--sucesso)" : "var(--perigo)" }}>
                    {c.total >= 0 ? "+" : ""}{c.total.toFixed(2)}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : serie.length > 1 ? (
          <Curva pontos={serie.map((p) => p.valor)} positivo={positivo} />
        ) : null}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] texto-fraco">
          <span>{resumo.total} trades</span>
          <span>{resumo.fechadas} fechadas</span>
          {resumo.winrate != null && <span>{resumo.winrate}% de acerto</span>}
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
                    {l.direction === "buy" ? "COMPRA" : "VENDA"}
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
              {l.resultado == null && <p className="mt-0.5 text-[11.5px] texto-mais-fraco">{estadoEmPortugues(l.estado)}</p>}
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
function Curvas({ curvas }: { curvas: Curva[] }) {
  const todos = curvas.flatMap((c) => c.pontos.map((p) => p.valor))
  const min = Math.min(...todos, 0)
  const max = Math.max(...todos, 0)
  const amplitude = max - min || 1
  const largura = 100
  const altura = 34
  const zero = altura - ((0 - min) / amplitude) * altura

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" className="mt-2 h-20 w-full">
      {/* A linha do zero: sem ela, um conjunto inteiramente negativo parece uma subida. */}
      <line x1="0" x2={largura} y1={zero} y2={zero} stroke="var(--borda)" strokeWidth="0.4" strokeDasharray="2 2" />
      {curvas.map((c, i) => {
        const caminho = c.pontos
          .map((p, j) => {
            const x = c.pontos.length > 1 ? (j / (c.pontos.length - 1)) * largura : 0
            const y = altura - ((p.valor - min) / amplitude) * altura
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
    </svg>
  )
}
