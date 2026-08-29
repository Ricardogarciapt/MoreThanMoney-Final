import { ImageResponse } from "next/og"
import fs from "node:fs"
import path from "node:path"

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
  /**
   * O formato. Um capa de reel é vertical; um post do feed é 4:5.
   *
   * Só muda a proporção — o estilo vem da conta, não do formato: a mesma voz em vertical e em
   * quadrado continua a ser a mesma voz.
   */
  formato?: 'post' | 'reel'
  /** Fotografia de fundo, quando a há. O estilo do Ricardo é construído sobre uma. */
  fundo?: string
}

/**
 * As duas vozes, tiradas dos templates reais do Canva (exportados e medidos, não estimados).
 *
 * @morethanmoney.pt — preto, dourado, centrado, simétrico. Fala como empresa.
 * @ricardogarciapt — fotografia dele, tipografia enorme em duas faixas (ciano em cima, branca
 * em baixo), texto cortado pela margem. Fala na primeira pessoa e ocupa o ecrã todo.
 *
 * Misturá-las era o que acontecia até aqui: saía o cartão da marca com o nome dele.
 */
const OURO = '#e4a84d'
const CIANO = '#0097b2'

const GOLD = OURO // medido no template real: era #D2A63C, mais escuro do que a marca usa
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

/**
 * Parte a frase em duas metades, para as duas faixas de cor.
 *
 * Corta por PALAVRAS e o mais perto possível do meio em caracteres — cortar a meio da contagem de
 * palavras dá "MUDA" / "O MINDSET", que desequilibra; cortar por caracteres dá duas faixas de
 * peso parecido, que é o que faz o efeito funcionar.
 */
function duasFaixas(texto: string): [string, string] {
  const p = texto.trim().split(/\s+/)
  if (p.length < 2) return [texto, '']
  const total = texto.length
  let melhor = 1
  let menorDif = Infinity
  for (let i = 1; i < p.length; i++) {
    const dif = Math.abs(p.slice(0, i).join(' ').length - total / 2)
    if (dif < menorDif) { menorDif = dif; melhor = i }
  }
  return [p.slice(0, melhor).join(' '), p.slice(melhor).join(' ')]
}

/**
 * O cartão do Ricardo Garcia.
 *
 * A identidade é a TIPOGRAFIA, não a fotografia: duas faixas enormes, itálicas, em maiúsculas,
 * cortadas pela margem — ciano em cima, branca em baixo. Por isso funciona sem foto, e com foto
 * fica igual ao template dele.
 */
function cartaoRicardo(params: SocialCardParams, alto: boolean) {
  const hook = (params.hook || 'Muda o mindset.').replace(/[.!?]+$/, '').toUpperCase().slice(0, 60)
  const [cima, baixo] = duasFaixas(hook)
  const cta = (params.cta || '').toUpperCase().slice(0, 16)
  const facto = typeof params.proof === 'string' ? params.proof.slice(0, 90) : null

  // O tamanho segue a faixa MAIS LONGA: dimensionar pela média fazia a longa transbordar.
  const maisLonga = Math.max(cima.length, baixo.length)
  const corpo = maisLonga > 22 ? 108 : maisLonga > 15 ? 140 : maisLonga > 9 ? 180 : 220

  /**
   * Com foto, as faixas afastam-se para as bordas — é a foto que preenche o meio, como no
   * template dele. Sem foto, encostam-se ao centro: o mesmo afastamento sem nada no meio deixa
   * um buraco morto, e um buraco morto lê-se como erro, não como espaço.
   */
  const temFoto = Boolean(params.fundo)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: temFoto ? 'space-between' : 'center',
        background: '#141414',
        // A foto entra como fundo quando existe; sem ela fica o degradê, e a tipografia aguenta.
        ...(params.fundo
          ? { backgroundImage: `url(${params.fundo})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { backgroundImage: 'radial-gradient(900px 700px at 70% 40%, #23282e, #0d0f11 70%)' }),
        padding: alto ? '96px 0 84px' : '72px 0 64px',
      }}
    >
      {/* Faixa de cima, ciano. Sai da margem esquerda de propósito — é o que dá a escala. */}
      <div
        style={{
          display: 'flex',
          color: CIANO,
          fontFamily: 'Anton',
          fontSize: corpo,
          fontWeight: 900,
          fontStyle: 'italic',
          letterSpacing: -4,
          lineHeight: 0.92,
          padding: '0 40px',
        }}
      >
        {cima}
      </div>

      {/* Faixa de baixo, branca. */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 40px', marginTop: temFoto ? 0 : 8 }}>
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontFamily: 'Anton',
            fontSize: corpo,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: -4,
            lineHeight: 0.92,
          }}
        >
          {baixo}
        </div>

        {facto && (
          <div style={{ display: 'flex', color: CIANO, fontSize: 34, fontWeight: 700, marginTop: 28 }}>{facto}</div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            // Sem foto o conteúdo está centrado, e o rodapé tem de descer sozinho — senão fica
            // a flutuar a meio do cartão, encostado ao texto.
            marginTop: temFoto ? 40 : 72,
          }}
        >
          <div style={{ display: 'flex', color: '#8b9199', fontSize: 30, fontWeight: 600 }}>@ricardogarciapt</div>
          {cta && (
            <div
              style={{
                display: 'flex',
                background: CIANO,
                color: '#06212a',
                fontSize: 34,
                fontWeight: 800,
                padding: '18px 34px',
                borderRadius: 999,
              }}
            >
              {'Comenta «' + cta + '»'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function socialCardElement(params: SocialCardParams) {
  /**
   * A conta decide o estilo.
   *
   * O `handle` já chegava aqui e só era escrito no canto. Passa a decidir o desenho inteiro —
   * que é o que separa as duas contas de verdade.
   */
  if ((params.handle || '').replace(/^@/, '').toLowerCase().includes('ricardo')) {
    return cartaoRicardo(params, params.formato === 'reel')
  }
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
/**
 * A fonte condensada pesada — a identidade tipográfica do Ricardo.
 *
 * Sem uma fonte carregada, o `fontWeight: 900` e o `fontStyle: italic` não fazem nada: o Satori
 * só tem o que lhe dão, e desenhava tudo num tipo fino qualquer. Era o que estava a acontecer.
 *
 * Lê-se do disco uma vez e fica em memória — ler o ficheiro a cada cartão seria trabalho a mais
 * para o mesmo resultado.
 */
let anton: Buffer | null = null
function fonteCondensada(): Buffer | null {
  if (anton) return anton
  try {
    anton = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Anton-Regular.ttf'))
    return anton
  } catch {
    // Sem a fonte, o cartão sai na tipografia por omissão em vez de rebentar. Feio é melhor
    // do que nada — e o Instagram não espera por nós.
    return null
  }
}

export async function renderSocialCardBuffer(params: SocialCardParams): Promise<Buffer> {
  // Reel é 9:16; o resto é 4:5, que é o que ocupa mais ecrã no feed sem ser cortado.
  const alto = params.formato === 'reel'
  const f = fonteCondensada()
  const res = new ImageResponse(socialCardElement(params), {
    width: 1080,
    height: alto ? 1920 : 1350,
    ...(f ? { fonts: [{ name: 'Anton', data: f as unknown as ArrayBuffer, weight: 400, style: 'normal' }] } : {}),
  })
  return Buffer.from(await res.arrayBuffer())
}
