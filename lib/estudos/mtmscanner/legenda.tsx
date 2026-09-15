"use client"
/**
 * MTM Scanner — a linha de estado do estudo, em React (sobreposição ao gráfico).
 *
 * O Pine não tem table.new: o que o TradingView mostra é a legenda do indicador com os valores
 * dos plots (DEMA 15/50/238, POC). Aqui fica essa linha e, por baixo, o último sinal B/S com os
 * níveis do alerta (entrada, SL, TP1-3) riscados quando já foram tocados.
 *
 * O contentor do gráfico tem de ser `position: relative`.
 */
import type { CSSProperties } from "react"
import { PINE5_MS } from "./inputs"
import type { ResultadoMTMScanner } from "./tipos"

interface Props {
  resultado: ResultadoMTMScanner | null
  topo?: number
  esquerda?: number
  compacto?: boolean
}

export default function LegendaMTMScanner({ resultado: r, topo = 8, esquerda = 8, compacto = false }: Props) {
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
    <div style={caixa} data-mtmscanner-legenda>
      <div>
        <span style={{ color: "#D1D4DC" }}>MoreThanMoney - Scanner V3.5</span>{" "}
        <span style={{ color: PINE5_MS.blue }}>{f(u.dema15)}</span>{" "}
        <span style={{ color: PINE5_MS.green }}>{f(u.dema50)}</span>{" "}
        <span style={{ color: PINE5_MS.dema238 }}>{f(u.dema238)}</span>{" "}
        <span style={{ color: PINE5_MS.orange }}>POC {f(u.poc)}</span>
      </div>
      {!compacto && (
        <div>
          {s ? (
            <>
              <b style={{ color: s.lado === "BUY" ? PINE5_MS.green : PINE5_MS.red }}>{s.lado === "BUY" ? "B · compra" : "S · venda"}</b>
              {` ${quando} · entrada ${f(s.entry)} · `}
              <span style={{ color: PINE5_MS.red, textDecoration: u.slTocado ? "line-through" : undefined }}>SL {f(s.sl)}</span>
              {" · "}
              {[s.tp1, s.tp2, s.tp3].map((tp, k) => (
                <span key={k} style={{ color: PINE5_MS.green, textDecoration: u.tpTocado[k] ? "line-through" : undefined }}>
                  {k ? " / " : "TP "}{f(tp)}
                </span>
              ))}
            </>
          ) : <span>sem sinal B/S no histórico</span>}
          <span style={{ color: PINE5_MS.gray }}>{` · estrutura ${u.os === 1 ? "alta" : "baixa"}`}{u.provisoria ? " · vela aberta" : ""}</span>
        </div>
      )}
    </div>
  )
}
