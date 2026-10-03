"use client"
/**
 * MTM GoldKiller — a linha de estado do estudo, em React (sobreposição ao gráfico).
 *
 * O Pine do GoldKiller não tem table.new (o Sensei tem três painéis; este não). O que o TradingView
 * mostra é a legenda do indicador: «MTM Gold Killer - HLCC4 -4 80 0 3 10 Disabled 75» e os valores dos
 * plots. Aqui fica essa linha e, por baixo, a perna atual com os níveis do alerta (entrada, SL, TP1-3)
 * — que é o que o trader lê no TradingView passando o rato pelas linhas.
 *
 * O contentor do gráfico tem de ser `position: relative`.
 */
import type { CSSProperties } from "react"
import { linhaDeEstadoGK, PINE5 } from "./inputs"
import type { ResultadoGoldKiller } from "./tipos"

interface Props {
  resultado: ResultadoGoldKiller | null
  /** Posição (px) no canto superior esquerdo. */
  topo?: number
  esquerda?: number
  compacto?: boolean
}

export default function LegendaGoldKiller({ resultado: r, topo = 8, esquerda = 8, compacto = false }: Props) {
  if (!r || !r.ultima) return null
  const u = r.ultima
  const casas = Math.max(0, Math.round(-Math.log10(r.mintick)))
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(casas) : "—")
  const s = u.sinal
  const caixa: CSSProperties = {
    position: "absolute", top: topo, left: esquerda, zIndex: 6, pointerEvents: "none",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
    fontSize: 11, lineHeight: "16px", color: "#B2B5BE", textShadow: "0 0 3px #131722, 0 0 3px #131722",
    whiteSpace: "nowrap",
  }
  const quando = s ? new Date(s.t * 1000).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null
  return (
    <div style={caixa} data-goldkiller-legenda>
      <div>
        <span style={{ color: "#D1D4DC" }}>{linhaDeEstadoGK(r.inputs)}</span>{" "}
        <span style={{ color: PINE5.gray }}>{f(u.entrada)}</span>
      </div>
      {!compacto && (
        <div>
          <b style={{ color: u.baixa ? PINE5.red : PINE5.green }}>{u.baixa ? "▼ Baixa" : "▲ Alta"}</b>
          {s && (
            <>
              {` desde ${quando} · entrada ${f(s.entry)} · `}
              <span style={{ color: PINE5.red, textDecoration: u.slTocado ? "line-through" : undefined }}>SL {f(s.sl)}</span>
              {" · "}
              {[s.tp1, s.tp2, s.tp3].map((tp, k) => (
                <span key={k} style={{ color: PINE5.green, textDecoration: u.tpTocado[k] ? "line-through" : undefined }}>
                  {k ? " / " : "TP "}{f(tp)}
                </span>
              ))}
            </>
          )}
          <span style={{ color: PINE5.gray }}>{` · ${u.pernasAlta}↑ ${u.pernasBaixa}↓ pernas`}{u.provisoria ? " · vela aberta" : ""}</span>
        </div>
      )}
    </div>
  )
}
