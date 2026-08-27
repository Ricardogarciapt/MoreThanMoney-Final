import { ImageResponse } from "next/og"

/**
 * Card de marca MTM (4:5, 1080×1350) renderizado EM PROCESSO — sem round-trip HTTP,
 * para a máquina de vendas gerar a imagem sem passar pela firewall/challenge da Vercel.
 * Usado tanto pela rota /api/og/social-card (preview) como pelos crons (content-draft).
 */
export interface SocialCardParams {
  hook: string
  cta?: string
  handle?: string
  /** `false` esconde a linha de prova. Uma string escreve ESSE facto. */
  proof?: boolean | string
  kicker?: string
}

const GOLD = "#D2A63C"
const INK = "#0b0d12"
const PAPER = "#f5f2ea"
const MUTED = "#9a9ea8"

/** Eyebrow + acento por tipo de CTA (dá variedade aos posts sem sair da marca). */
function variantFor(cta: string): { eyebrow: string; accent: string } {
  if (/SINAIS|SINAL|COPY|GRUPO/.test(cta)) return { eyebrow: "COPYTRADING", accent: "#D2A63C" }
  if (/PREMIUM/.test(cta)) return { eyebrow: "MTM PREMIUM", accent: "#E4B94A" }
  if (/APP|QUERO|MUNDO|COMEC|COMEÇ|TRIAL|GR[AÁ]TIS/.test(cta)) return { eyebrow: "COMEÇA GRÁTIS", accent: "#C9922E" }
  return { eyebrow: "MORE THAN MONEY", accent: "#D2A63C" }
}

export function socialCardElement(params: SocialCardParams) {
  const hook = (params.hook || "Disciplina cria liberdade.").slice(0, 160)
  const cta = (params.cta || "").toUpperCase().slice(0, 16)
  const handle = (params.handle || "morethanmoney.pt").replace(/^@/, "")
  /**
   * A linha de prova.
   *
   * Era fixa: "675 trades · 63% win rate · +7.060€". Estava congelada na auditoria de 30/06,
   * falava em euros — que não são comparáveis, porque o mesmo sinal vale ~8 $ a quem opera 0,01
   * lote e ~800 $ a quem opera 1 — e, de tanto se repetir, tinha deixado de ser prova para
   * passar a ser decoração. Agora vem de fora, viva, e roda: `factoDoDia()` em pips-proof.
   */
  const factoProva = typeof params.proof === 'string' ? params.proof.slice(0, 90) : null
  const showProof = params.proof !== false && Boolean(factoProva)
  const v = variantFor(cta)
  const GOLD = params.handle && params.handle.includes("ricardo") ? "#D2A63C" : v.accent
  const kicker = (params.kicker || v.eyebrow).toUpperCase().slice(0, 40)
  const hookSize = hook.length > 110 ? 62 : hook.length > 70 ? 74 : hook.length > 40 ? 88 : 104

  return (
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: GOLD, display: "flex", marginRight: 18 }} />
          <div style={{ color: GOLD, fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>{kicker}</div>
        </div>
        <div style={{ color: MUTED, fontSize: 28, fontWeight: 600 }}>{"@" + handle}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ width: 96, height: 8, background: GOLD, borderRadius: 4, display: "flex", marginBottom: 40 }} />
        <div style={{ color: PAPER, fontSize: hookSize, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>{hook}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {showProof && factoProva && (
          <div style={{ display: "flex", alignItems: "center", color: GOLD, fontSize: 30, fontWeight: 600, marginBottom: 34 }}>
            {factoProva}
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
            {"Comenta «" + cta + "» ↓"}
          </div>
        ) : (
          <div style={{ display: "flex", color: PAPER, fontSize: 36, fontWeight: 700 }}>morethanmoney.pt</div>
        )}
      </div>
    </div>
  )
}

/** Renderiza o card e devolve os bytes PNG (para upload direto no bucket). */
export async function renderSocialCardBuffer(params: SocialCardParams): Promise<Buffer> {
  const res = new ImageResponse(socialCardElement(params), { width: 1080, height: 1350 })
  return Buffer.from(await res.arrayBuffer())
}
