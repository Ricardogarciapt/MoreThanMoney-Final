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
        // Sem foto, o degradê. A tipografia aguenta sozinha.
        ...(temFoto ? {} : { backgroundImage: 'radial-gradient(900px 700px at 70% 40%, #23282e, #0d0f11 70%)' }),
        padding: alto ? '96px 0 84px' : '72px 0 64px',
        position: 'relative',
      }}
    >
      {/*
        A foto entra como CAMADA e não como `backgroundImage`.
        O Satori ignora o `background-size: cover` e repete a imagem em mosaico — via-se uma
        segunda cabeça a nascer no rodapé. Uma `<img>` esticada ao quadro resolve, e ainda deixa
        escurecê-la por cima, que é o que faz o texto branco continuar a ler-se.
      */}
      {params.fundo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={params.fundo}
            alt=""
            width={1080}
            height={alto ? 1920 : 1350}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              // Escurece o meio menos do que as pontas: é onde está a cara, e é onde o texto não está.
              backgroundImage:
                'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.2) 62%, rgba(0,0,0,0.72) 100%)',
            }}
          />
        </>
      )}
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
              {/* Sem as « »: a Anton não as tem e saem como << >>. */}
              {'Comenta ' + cta}
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

/**
 * Uma lâmina do carrossel.
 *
 * O carrossel do Ricardo tem três papéis, e são diferentes de propósito: a CAPA tem de parar o
 * dedo, o MEIO tem de valer a pena deslizar, e o FIM tem de pedir alguma coisa. Um carrossel de
 * seis lâminas iguais é seis vezes a mesma lâmina.
 */
export type PapelLamina = 'capa' | 'meio' | 'fim'

export interface Lamina {
  papel: PapelLamina
  texto: string
  /** Só no fim: a palavra a comentar. */
  cta?: string
  /** Fotografia por trás desta lâmina. */
  fundo?: string
}

/**
 * Uma lâmina do carrossel, no estilo do Ricardo.
 *
 * A capa usa as duas faixas (ciano/branca) — é a assinatura dele. As do meio são texto grande
 * numerado, sem as faixas: repetir a assinatura em todas cansa e rouba espaço ao que interessa,
 * que é o argumento. A do fim volta à assinatura, para fechar como abriu.
 */
export function laminaElement(l: Lamina, indice: number, total: number, handle: string) {
  if (l.papel !== 'meio') {
    return socialCardElement({
      hook: l.texto,
      cta: l.cta,
      handle,
      proof: false,
      fundo: l.fundo,
      formato: 'post',
    })
  }

  const t = l.texto.slice(0, 220)
  const corpo = t.length > 150 ? 56 : t.length > 90 ? 68 : t.length > 50 ? 82 : 96

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#141414',
        ...(l.fundo ? {} : { backgroundImage: 'radial-gradient(900px 700px at 30% 20%, #23282e, #0d0f11 70%)' }),
        padding: '84px 72px',
        position: 'relative',
      }}
    >
      {l.fundo && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={l.fundo}
            alt=""
            width={1080}
            height={1350}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex',
              backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.75))',
            }}
          />
        </>
      )}
      {/* O número é a promessa de que há mais — é ele que faz deslizar. */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', color: CIANO, fontFamily: 'Anton', fontSize: 72 }}>
          {String(indice).padStart(2, '0')}
        </div>
        <div style={{ display: 'flex', color: '#5b6167', fontSize: 30, fontWeight: 700, marginLeft: 16 }}>
          {'/ ' + String(total - 1).padStart(2, '0')}
        </div>
      </div>

      <div style={{ display: 'flex', color: '#ffffff', fontFamily: 'Anton', fontSize: corpo, lineHeight: 1.06, letterSpacing: -1 }}>
        {t}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', width: 70, height: 7, background: CIANO, borderRadius: 4 }} />
        <div style={{ display: 'flex', color: '#8b9199', fontSize: 28, fontWeight: 600, marginLeft: 20 }}>
          {'@' + handle.replace(/^@/, '')}
        </div>
      </div>
    </div>
  )
}

/**
 * O carrossel inteiro, em PNG.
 *
 * Mínimo de seis lâminas: um carrossel de duas não é carrossel, e o Instagram premeia quem faz
 * deslizar. Se vierem menos, as que faltam ficam por conta de quem chama — aqui não se inventa
 * conteúdo para encher, porque texto de encher lê-se como texto de encher.
 */
export async function renderCarrossel(laminas: Lamina[], handle: string): Promise<Buffer[]> {
  const f = fonteCondensada()
  const fontes = f
    ? [{ name: 'Anton', data: f as unknown as ArrayBuffer, weight: 400 as const, style: 'normal' as const }]
    : undefined

  const saida: Buffer[] = []
  for (let i = 0; i < laminas.length; i++) {
    const res = new ImageResponse(laminaElement(laminas[i], i, laminas.length, handle), {
      width: 1080,
      height: 1350,
      ...(fontes ? { fonts: fontes } : {}),
    })
    saida.push(Buffer.from(await res.arrayBuffer()))
  }
  return saida
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
  /**
   * A fonte só entra no cartão do Ricardo.
   *
   * Dar uma fonte ao Satori não a acrescenta às que já tem — SUBSTITUI-AS. Ao carregá-la para
   * todos os cartões, o da marca passou a sair inteiro em Anton, que não é o desenho dele.
   * A fonte segue o estilo, como tudo o resto.
   */
  const doRicardo = (params.handle || '').replace(/^@/, '').toLowerCase().includes('ricardo')
  const f = doRicardo ? fonteCondensada() : null
  const res = new ImageResponse(socialCardElement(params), {
    width: 1080,
    height: alto ? 1920 : 1350,
    ...(f ? { fonts: [{ name: 'Anton', data: f as unknown as ArrayBuffer, weight: 400, style: 'normal' }] } : {}),
  })
  return Buffer.from(await res.arrayBuffer())
}
