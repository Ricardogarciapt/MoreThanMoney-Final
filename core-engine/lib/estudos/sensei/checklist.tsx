"use client"
/**
 * MTM Sensei — painéis do script em React (sobreposição ao gráfico).
 *
 * Reproduz as três table.new do Pine com as mesmas cores do tema:
 *  - «CONFIRMACOES SENSEI»  (position.top_right)
 *  - «📋 CHECKLIST SENSEI»  (position.bottom_left)
 *  - «SENSEI TRADE PANEL»   (position.bottom_right, só com trade ativa)
 *
 * O contentor do gráfico tem de ser `position: relative`. Alimentar com o resultado do adaptador:
 *   const [r, setR] = useState<ResultadoSensei | null>(null)
 *   anexarSensei(chart, serie, { aoCalcular: setR })
 *   <ChecklistSensei resultado={r} />
 */
import type { CSSProperties, ReactNode } from "react"
import { paletaSensei, PINE } from "./inputs"
import type { ResultadoSensei } from "./tipos"

const emoji = (s: number) => (s >= 18 ? "👑" : s >= 15 ? "💎" : s >= 12 ? "⚡" : s >= 9 ? "⚠️" : "🔴")
const ck = (v: boolean) => (v ? "✅" : "❌")
const pontos = (s: number) => "●●●●●".slice(0, s) + "○○○○○".slice(0, 5 - s)
const fmt = (x: number, casas = 1) => (Number.isFinite(x) ? String(Number(x.toFixed(casas))) : "—")

interface Props {
  resultado: ResultadoSensei | null
  /** Esconder painéis individualmente (por defeito seguem os inputs showConfPanel/showSetupRules/showTradePanel). */
  confirmacoes?: boolean
  checklist?: boolean
  tradePanel?: boolean
  /** Margem aos cantos do gráfico (px). */
  margem?: number
}

export default function ChecklistSensei({ resultado: r, confirmacoes, checklist, tradePanel, margem = 8 }: Props) {
  if (!r || !r.ultima) return null
  const u = r.ultima
  const inp = r.inputs
  const th = paletaSensei(inp.themeMode)
  const casas = Math.max(0, Math.round(-Math.log10(r.mintick)))

  const tabela = (pos: CSSProperties, linhas: ReactNode) => (
    <table
      style={{
        position: "absolute", ...pos, zIndex: 5, borderCollapse: "collapse", background: th.bg,
        border: `1px solid ${th.accent}`, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        pointerEvents: "none", whiteSpace: "nowrap",
      }}
    >
      <tbody>{linhas}</tbody>
    </table>
  )
  const td = (conteudo: ReactNode, cor: string, fundo: string, tam: number, alinhar: "left" | "right" | "center", extra: CSSProperties = {}) => (
    <td style={{ color: cor, background: fundo, fontSize: tam, textAlign: alinhar, padding: "2px 6px", border: `1px solid ${th.accent}`, ...extra }}>{conteudo}</td>
  )
  const gc = (s: number) => (s >= 4 ? th.ok : s >= 3 ? th.gold : th.fail)

  // ── CONFIRMAÇÕES (top_right) ──
  const mostrarConf = confirmacoes ?? inp.showConfPanel
  let painelConf: ReactNode = null
  if (mostrarConf) {
    const hasPos = u.tradeAtiva
    const ib = hasPos && u.curPos === "BUY"
    const sc = hasPos ? (ib ? u.bullScore : u.bearScore) : Math.max(u.bullScore, u.bearScore)
    const g = ib ? u.grupos.bull : u.grupos.bear
    const bcol = sc >= 16 ? "rgba(20, 83, 45, 0.92)" : sc >= 12 ? "rgba(30, 58, 95, 0.92)" : "rgba(59, 15, 15, 0.92)"
    const dir = hasPos ? `${ib ? "🟢 BUY" : "🔴 SELL"}  ${sc}/20  ${emoji(sc)}  ${u.sigType === "REV" ? "⚡ REV" : "➜ CON"}` : "— A aguardar sinal —"
    const S = 11
    const pips = u.niveis ? `${u.niveis.slPips} pips` : "—"
    const rm = inp.riskMode === "ATR" ? `ATR×${fmt(u.actSlMult)}` : `%${fmt(inp.slPct)}`
    const wrCol = u.stWr >= 55 ? th.ok : u.stWr >= 45 ? th.gold : th.fail
    const nomes = ["TENDENCIA DEMA", "MOM / VOL / ORDER FLOW", "SMC / STRUCTURE", "SENSEI / FASE / VOLAT."]
    painelConf = tabela({ top: margem, right: margem + 60 }, (
      <>
        <tr>{td("CONFIRMACOES SENSEI", PINE.white, th.accent, S, "center")}{td(dir, PINE.white, bcol, S, "center")}</tr>
        {nomes.map((nome, k) => (
          <tr key={nome}>
            {td(nome, th.text, k % 2 ? th.bg2 : th.bg, S, "left")}
            {td(`${pontos(g[k])}  ${g[k]}/5`, gc(g[k]), k % 2 ? th.bg2 : th.bg, S, "right")}
          </tr>
        ))}
        <tr>{td("TOTAL", th.gold, th.bg, S, "left")}{td(`${sc} / 20  ${emoji(sc)}`, th.gold, th.bg, S, "right")}</tr>
        <tr>{td(`SL  (${rm})`, th.slLine, th.bg2, S, "left")}{td(pips, th.slLine, th.bg2, S, "right")}</tr>
        {inp.showStats && (
          <tr>{td("WR / R med / N", th.gold, th.bg, S, "left")}{td(`${fmt(u.stWr)}%  ${fmt(u.stAvgR, 2)}R  (${u.stTotal})`, wrCol, th.bg, S, "right")}</tr>
        )}
      </>
    ))
  }

  // ── CHECKLIST (bottom_left) ──
  const mostrarCk = checklist ?? inp.showSetupRules
  let painelCk: ReactNode = null
  if (mostrarCk) {
    const bias = u.bullScore >= u.bearScore
    const x = bias ? u.bull : u.bear
    const T = 10
    const trig = bias ? u.baseBuy : u.baseSell
    painelCk = tabela({ bottom: margem + 26, left: margem }, (
      <>
        <tr>
          {td("📋 CHECKLIST SENSEI", PINE.white, th.accent, T, "center")}
          {td(bias ? `🟢 BULL  ${u.bullScore}/20` : `🔴 BEAR  ${u.bearScore}/20`, bias ? th.ok : th.fail, th.bg2, T, "center")}
          {td(`${inp.tradeStyle} · ${u.phaseMode}`, th.text2, th.bg2, T, "center")}
        </tr>
        <tr>{td("TENDENCIA", th.gold, th.bg, T, "left")}{td(`${ck(x.A1)} DEMA15>50  ${ck(x.A2)} 50>238`, th.text, th.bg, T, "left")}{td(`${ck(x.A3)} Slope  ${ck(x.A5)} P>DEMA`, th.text, th.bg, T, "left")}</tr>
        <tr>{td("MOM/OF", th.gold, th.bg2, T, "left")}{td(`${ck(u.bull.B1)} Vol  ${ck(x.B5)} OF Δ`, th.text, th.bg2, T, "left")}{td(`${ck(u.bull.B3)} ADX>${u.effAdx}  ${ck(x.C5)} Imbal`, th.text, th.bg2, T, "left")}</tr>
        <tr>{td("ESTRUTURA", th.gold, th.bg, T, "left")}{td(`${ck(x.C1)} OS  ${ck(x.C2)} CHoCH`, th.text, th.bg, T, "left")}{td(`${ck(x.C3)} BOS  ${ck(x.C4)} POC`, th.text, th.bg, T, "left")}</tr>
        <tr>{td("FASE/VOLAT", th.gold, th.bg2, T, "left")}{td(`${ck(x.D1)} Cloud  ${ck(x.D3)} Fase`, th.text, th.bg2, T, "left")}{td(`${ck(u.bull.D5)} Vol safe  ${ck(x.D4)} Pressao`, th.text, th.bg2, T, "left")}</tr>
        <tr>{td("FILTROS", th.gold, th.bg, T, "left")}{td(`${ck(bias ? u.htfBuyOK : u.htfSellOK)} HTF  ${ck(u.inSess)} Sessao`, th.text, th.bg, T, "left")}{td(`${ck(u.chopOK)} Anti-chop  ${ck(u.ltfValid)} OF-LTF`, th.text, th.bg, T, "left")}</tr>
        <tr>
          {td("🎯 GATILHO", th.gold, th.bg2, T, "left")}
          {td(trig ? "✅ Gatilho ativo" : "— sem gatilho", trig ? th.ok : th.text2, th.bg2, T, "left")}
          {td(u.cooldown ? "✅ Cooldown ok" : `⏳ ${u.cooldownRestante} bars`, u.cooldown ? th.ok : th.text2, th.bg2, T, "left")}
        </tr>
        <tr>
          {td(`📡 ${inp.alert_watchlist ? "Watchlist ON" : "OFF"}`, inp.alert_watchlist ? th.ok : th.text2, th.bg, T, "left")}
          {td("SENSEI By MoreThanMoney", "rgba(139, 47, 201, 0.8)", th.bg, T, "center")}
          {td("morethanmoney.pt", th.text2, th.bg, T, "center")}
        </tr>
      </>
    ))
  }

  // ── TRADE PANEL (bottom_right) ──
  const mostrarTrade = (tradePanel ?? inp.showTradePanel) && u.tradeAtiva && u.niveis
  let painelTrade: ReactNode = null
  if (mostrarTrade && u.niveis) {
    const lv = u.niveis
    const ib = u.curPos === "BUY"
    const sc = ib ? u.bullScore : u.bearScore
    const T = 10
    const p = (x: number) => (Number.isFinite(x) ? String(Number(x.toFixed(casas))) : "—")
    const beC = u.beTrig ? th.beLine : th.slLine
    const ofTxt = u.ltfValid ? `${u.ofBull ? "🟢 +" : u.ofBear ? "🔴 -" : "•"}${Math.round(Math.abs(u.ltfDelta))}` : "proxy"
    const ofCol = u.ofBull ? th.ok : u.ofBear ? th.fail : th.text2
    const adxCol = u.adx > 25 ? th.ok : u.adx > 18 ? th.gold : th.fail
    const rsiOk = ib ? u.rsi > 38 && u.rsi < 72 : u.rsi > 28 && u.rsi < 62
    const coresE = ["#22C55E", "#16A34A", "#15803D", "#0F766E"]
    const tps = [lv.tp1, lv.tp2, lv.tp3, lv.tp4]
    painelTrade = tabela({ bottom: margem + 26, right: margem + 60 }, (
      <>
        <tr>{td("SENSEI TRADE PANEL", PINE.white, th.accent, 11, "center")}{td(`${inp.tradeStyle}  ${sc}/20 ${emoji(sc)}`, th.gold, th.accent, 11, "center")}</tr>
        <tr>{td("📌 ENTRY", "#C084FC", th.bg, T, "left")}{td(p(u.entry), th.text, th.bg, T, "right")}</tr>
        <tr>{td(u.beTrig ? "⭕ BE" : u.trailAtivo ? "❌ TRAIL" : "❌ SL", beC, th.bg, T, "left")}{td(p(u.effSl), beC, th.bg, T, "right")}</tr>
        <tr>{td("📍 SL em Pips", th.slLine, th.bg2, T, "left")}{td(`${lv.slPips} pips`, th.slLine, th.bg2, T, "right")}</tr>
        {tps.map((tp, k) => {
          const cor = u.tpHit[k] ? th.ok : coresE[k]
          return (
            <tr key={k}>
              {td(`${k === 3 ? "🏆" : "✅"} E${k + 1} 1:${fmt(u.rr[k])} (${u.pct[k]}%)`, cor, th.bg, T, "left")}
              {td(`${p(tp)}${u.tpHit[k] ? " ✔" : ""}`, cor, th.bg, T, "right")}
            </tr>
          )
        })}
        <tr>{td("💧 Order Flow Δ", th.text2, th.bg2, T, "left")}{td(ofTxt, ofCol, th.bg2, T, "right")}</tr>
        <tr>{td(`ADX  ${fmt(u.adx)}`, adxCol, th.bg, T, "left")}{td(`RSI  ${fmt(u.rsi)}`, rsiOk ? th.ok : th.fail, th.bg, T, "right")}</tr>
        <tr>{td("📊 WR / R med", th.text2, th.bg, T, "left")}{td(`${fmt(u.stWr)}%  ${fmt(u.stAvgR, 2)}R`, th.gold, th.bg, T, "right")}</tr>
        <tr>{td("⚡ Tipo", th.text2, th.bg, T, "left")}{td(u.sigType === "REV" ? "⚡ REVERSAO" : "➜ CONTINUACAO", th.text, th.bg, T, "right")}</tr>
      </>
    ))
  }

  return <>{painelConf}{painelCk}{painelTrade}</>
}
