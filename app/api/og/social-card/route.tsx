import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

/**
 * Card de marca MTM para posts autónomos de Instagram (4:5, 1080×1350).
 * Renderiza o GANCHO sobre fundo escuro + dourado, prova social e pílula de CTA.
 * URL público estável por params → a máquina de vendas gera + re-hospeda + publica sem toque.
 *
 * Params: hook (obrigatório), cta (palavra-chave), handle (morethanmoney.pt|ricardogarciapt),
 *         proof (0/1), kicker (etiqueta pequena no topo).
 */
export const runtime = "edge"

const GOLD = "#D2A63C"
const INK = "#0b0d12"
const PAPER = "#f5f2ea"
const MUTED = "#9a9ea8"

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const hook = (p.get("hook") || "Disciplina cria liberdade.").slice(0, 160)
  const cta = (p.get("cta") || "").toUpperCase().slice(0, 16)
  const handle = (p.get("handle") || "morethanmoney.pt").replace(/^@/, "")
  const showProof = p.get("proof") !== "0"
  const kicker = (p.get("kicker") || "MORE THAN MONEY").toUpperCase().slice(0, 40)
  // Tamanho do gancho adaptativo ao comprimento.
  const hookSize = hook.length > 110 ? 62 : hook.length > 70 ? 74 : hook.length > 40 ? 88 : 104

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          backgroundImage: `radial-gradient(1200px 600px at 50% -10%, rgba(210,166,60,0.22), rgba(210,166,60,0) 60%)`,
          padding: "88px 84px",
        }}
      >
        {/* Topo: kicker + handle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: GOLD, display: "flex", marginRight: 18 }} />
            <div style={{ color: GOLD, fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>{kicker}</div>
          </div>
          <div style={{ color: MUTED, fontSize: 28, fontWeight: 600 }}>@{handle}</div>
        </div>

        {/* Centro: gancho */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ width: 96, height: 8, background: GOLD, borderRadius: 4, display: "flex", marginBottom: 40 }} />
          <div style={{ color: PAPER, fontSize: hookSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>
            {hook}
          </div>
        </div>

        {/* Fundo: prova + CTA */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {showProof && (
            <div style={{ display: "flex", alignItems: "center", color: MUTED, fontSize: 30, fontWeight: 600, marginBottom: 34 }}>
              <span style={{ color: GOLD }}>675 trades</span>
              <span style={{ margin: "0 14px" }}>·</span>
              <span style={{ color: GOLD }}>63% win rate</span>
              <span style={{ margin: "0 14px" }}>·</span>
              <span style={{ color: GOLD }}>+7.060€</span>
            </div>
          )}
          {cta ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-start",
                background: GOLD,
                color: INK,
                fontSize: 40,
                fontWeight: 800,
                padding: "22px 40px",
                borderRadius: 999,
              }}
            >
              Comenta «{cta}» ↓
            </div>
          ) : (
            <div style={{ display: "flex", color: PAPER, fontSize: 36, fontWeight: 700 }}>morethanmoney.pt</div>
          )}
        </div>
      </div>
    ),
    { width: 1080, height: 1350 },
  )
}
