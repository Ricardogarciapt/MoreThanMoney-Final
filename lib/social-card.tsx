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
  /**
   * O DESTAQUE — a pessoa recortada, sem fundo, por cima da fotografia.
   *
   * São três camadas, e a ordem é o efeito todo: fundo escurecido, a pessoa por cima dele, e o
   * texto a atravessar a pessoa. A primeira faixa fica ATRÁS dela e a segunda À FRENTE — é isso
   * que dá profundidade e faz o cartão parecer montado e não sobreposto.
   *
   * Tem de ser um PNG com transparência. Uma fotografia normal aqui tapa o fundo inteiro e o
   * efeito desaparece sem que nada se queixe.
   */
  destaque?: string
  /** Onde a pessoa assenta. O recorte costuma ficar melhor encostado a um lado. */
  destaquePos?: 'esquerda' | 'centro' | 'direita'
  /** Quanto ocupa da altura do cartão, de 0.4 a 1.1. Por omissão enche. */
  destaqueEscala?: number
  /**
   * A MARCA DE QUEM ASSINA, quando não é uma das duas da casa.
   *
   * O estúdio do admin desenha para duas contas escritas no código. O MTM Social desenha para a
   * marca de cada membro — nome, arroba, cor e logótipo dele. Sem isto, cada peça de um membro
   * saía assinada «@morethanmoney.pt», que é pôr a marca da casa em conteúdo que não é da casa.
   *
   * Quando vem preenchida, ganha ao `handle`.
   */
  marca?: {
    nome: string
    arroba?: string | null
    /** A cor de acento. O resto do desenho é o da casa — é o que faz a peça parecer feita. */
    cor?: string | null
    /** Endereço do logótipo a carimbar no canto, se houver. */
    logoUrl?: string | null
  } | null
  /**
   * ONDE CADA COISA FICA, quando alguém a arrastou.
   *
   * Por omissão é tudo `undefined` e o desenho usa as posições da casa — as que fazem o cartão
   * parecer feito sem ninguém lhe tocar. Quando o editor devolve uma posição, ela ganha.
   *
   * As coordenadas são FRACÇÕES do lado, de 0 a 1, e não píxeis. O editor arrasta sobre uma
   * pré-visualização de 360px de largura e o cartão sai a 1080: guardar píxeis fazia tudo
   * aterrar no canto superior esquerdo, a um terço do sítio certo.
   *
   * `y` é o topo do elemento e `x` o seu lado esquerdo — o mesmo que o CSS entende, para não
   * haver conversão nenhuma pelo meio onde se possa errar.
   */
  posicoes?: {
    /** As duas faixas de texto movem-se juntas: são uma frase partida, não dois objectos. */
    texto?: { x: number; y: number } | null
    destaque?: { x: number; y: number } | null
    logo?: { x: number; y: number } | null
  } | null
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
  /**
   * Quem assina esta peça.
   *
   * Sem marca, é o Ricardo — é o estilo de onde isto nasceu. Com marca, muda a cor de acento, a
   * assinatura e o logótipo; o desenho fica igual, porque é ele que faz a peça parecer feita por
   * alguém e não montada num gerador.
   */
  const ACENTO = params.marca?.cor?.trim() || CIANO
  const ASSINATURA = params.marca
    ? (params.marca.arroba ? `@${params.marca.arroba.replace(/^@/, '')}` : params.marca.nome)
    : '@ricardogarciapt'
  const LOGO = params.marca?.logoUrl?.trim() || null

  const hook = (params.hook || 'Muda o mindset.').replace(/[.!?]+$/, '').toUpperCase().slice(0, 60)
  const [cima, baixo] = duasFaixas(hook)
  const cta = (params.cta || '').toUpperCase().slice(0, 16)
  const facto = typeof params.proof === 'string' ? params.proof.slice(0, 90) : null

  /**
   * O tamanho sai da LARGURA que há, não do número de caracteres.
   *
   * Os escalões por contagem de letras partiam-se com frases reais: «A TUA CABEÇA SABOTA» tem
   * 19 caracteres e caía no escalão dos 140px, onde não cabe em 1000px de largura. Partia em
   * duas linhas, e como as duas faixas têm `lineHeight` apertado, a segunda linha da faixa de
   * cima aterrava por cima da faixa de baixo — foi o que se viu na capa do carrossel do
   * «mindset»: duas frases sobrepostas, ilegíveis.
   *
   * Uma faixa TEM de caber numa linha: é isso que faz o efeito. Por isso mede-se.
   *
   * O 0.46 é a largura média de um caractere da Anton itálica em relação à altura da fonte,
   * medido nos cartões que saíram bem. Não é exacto — não há como medir texto dentro do Satori
   * antes de desenhar — mas erra para o lado seguro, que é o de a letra ficar um pouco menor do
   * que caberia. Pequena de mais lê-se; sobreposta não.
   */
  const LARGURA_UTIL = 1000
  const maisLonga = Math.max(cima.length, baixo.length, 1)
  const corpo = Math.max(64, Math.min(220, Math.floor(LARGURA_UTIL / (maisLonga * 0.46))))

  /**
   * Com foto, as faixas afastam-se para as bordas — é a foto que preenche o meio, como no
   * template dele. Sem foto, encostam-se ao centro: o mesmo afastamento sem nada no meio deixa
   * um buraco morto, e um buraco morto lê-se como erro, não como espaço.
   */
  const temFoto = Boolean(params.fundo)

  /**
   * As posições arrastadas, traduzidas para píxeis deste cartão.
   *
   * Vêm em fracções de 0 a 1 porque o editor arrasta sobre uma pré-visualização pequena e o
   * cartão sai a 1080 de largura. Aqui multiplicam-se pelo lado real.
   */
  const L = 1080
  const A = alto ? 1920 : 1350
  const posTexto = params.posicoes?.texto
  const posDestaque = params.posicoes?.destaque
  const posLogo = params.posicoes?.logo

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // Com o texto arrastado, o alinhamento automático deixa de mandar: as faixas passam a
        // ser posicionadas à mão e o `justifyContent` só estorvaria.
        justifyContent: posTexto ? 'flex-start' : temFoto ? 'space-between' : 'center',
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
            /*
             * Medidas em PÍXEIS e não em percentagem.
             * O Satori calcula `width: '100%'` numa imagem posicionada como zero — a foto
             * desaparecia sem erro nenhum, que é a pior forma de falhar.
             */
            style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: alto ? 1920 : 1350, objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 1080,
              height: alto ? 1920 : 1350,
              display: 'flex',
              // Escurece o meio menos do que as pontas: é onde está a cara, e é onde o texto não está.
              backgroundImage:
                'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.2) 62%, rgba(0,0,0,0.72) 100%)',
            }}
          />
        </>
      )}
      {/*
        A PESSOA, entre os dois textos.

        Vem DEPOIS da faixa de cima e ANTES da de baixo, e é só isso que constrói a profundidade:
        a primeira palavra fica atrás dela, a segunda à frente. Trocar a ordem destas três coisas
        dá um cartão com um autocolante colado por cima — que é o que se vê quando alguém monta
        isto à pressa.

        As medidas vão em píxeis porque o Satori calcula percentagens numa imagem absoluta como
        zero: a pessoa desaparecia sem erro nenhum.
      */}
      {params.destaque && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={params.destaque}
          alt=""
          style={{
            position: 'absolute',
            // Arrastado, manda a posição. Sem isso, o encosto por omissão.
            ...(posDestaque
              ? { left: Math.round(posDestaque.x * L), top: Math.round(posDestaque.y * A) }
              : {
                  bottom: 0,
                  ...(params.destaquePos === 'esquerda'
                    ? { left: -60 }
                    : params.destaquePos === 'centro'
                      ? { left: 140 }
                      : { right: -60 }),
                }),
            height: Math.round((alto ? 1920 : 1350) * Math.min(1.1, Math.max(0.4, params.destaqueEscala ?? 0.92))),
            // `contain` e não `cover`: um recorte esticado deforma a pessoa, e a cara é a
            // primeira coisa que denuncia.
            objectFit: 'contain',
          }}
        />
      )}

      {/*
        O LOGÓTIPO de quem assina, no canto de baixo.

        Fica por CIMA da pessoa e do fundo mas ABAIXO do texto: é uma assinatura, não um
        elemento de composição. Pequeno e a 85% de opacidade, porque um logótipo que compete com
        a frase rouba-lhe a frase — e a frase é a razão de o cartão existir.
      */}
      {LOGO && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO}
          alt=""
          style={{
            position: 'absolute',
            ...(posLogo
              ? { left: Math.round(posLogo.x * L), top: Math.round(posLogo.y * A) }
              : { right: 44, bottom: 40 }),
            height: 96,
            objectFit: 'contain',
            opacity: 0.85,
          }}
        />
      )}

      {/* Faixa de cima, ciano. Sai da margem esquerda de propósito — é o que dá a escala. */}
      <div
        style={{
          display: 'flex',
          // Arrastado: as duas faixas movem-se JUNTAS, porque são uma frase partida e não dois
          // objectos. A de cima leva a posição; a de baixo segue-a por ser a irmã seguinte.
          ...(posTexto
            ? { position: 'absolute' as const, left: Math.round(posTexto.x * L), top: Math.round(posTexto.y * A) }
            : {}),
          color: ACENTO,
          fontFamily: 'Anton',
          fontSize: corpo,
          fontWeight: 900,
          fontStyle: 'italic',
          letterSpacing: -4,
          // 1.0 e não 0.92: a cedilha do «Ç» e o til desciam para dentro da faixa de baixo.
          // Português tem descendentes nas MAIÚSCULAS, ao contrário do inglês onde estes
          // estilos nascem — e foi por isso que passou despercebido até haver um «CABEÇA».
          lineHeight: 1.0,
          padding: '0 40px',
        }}
      >
        {cima}
      </div>

      {/* Faixa de baixo, branca. */}
      {/*
        O afastamento entre as faixas é PROPORCIONAL à letra.
        Era fixo (8px) e a cedilha do «Ç» descia para dentro da faixa de baixo — visível no
        cartão do «A TUA CABEÇA SABOTA». Português tem descendentes nas MAIÚSCULAS (Ç, Q, J),
        ao contrário do inglês de onde estes estilos vêm; por isso passou despercebido até
        aparecer uma frase com cedilha. A 12% do corpo, a cauda cabe em qualquer tamanho.
      */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 40px',
          /**
           * Arrastado, esta faixa segue a de cima.
           *
           * São uma frase partida em duas cores, não dois objectos: mover uma e deixar a outra
           * onde estava parte a frase ao meio. Como a de cima passa a absoluta, esta tem de ir
           * atrás — e a distância calcula-se, porque depende do corpo da letra, que por sua vez
           * depende do comprimento da frase.
           */
          ...(posTexto
            ? {
                position: 'absolute' as const,
                left: Math.round(posTexto.x * L),
                top: Math.round(posTexto.y * A + corpo * 1.22),
              }
            : { marginTop: Math.round(corpo * 0.22) }),
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontFamily: 'Anton',
            fontSize: corpo,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: -4,
            lineHeight: 1.0,
          }}
        >
          {baixo}
        </div>

        {facto && (
          <div style={{ display: 'flex', color: ACENTO, fontSize: 34, fontWeight: 700, marginTop: 28 }}>{facto}</div>
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
          <div style={{ display: 'flex', color: '#8b9199', fontSize: 30, fontWeight: 600 }}>{ASSINATURA}</div>
          {cta && (
            <div
              style={{
                display: 'flex',
                background: ACENTO,
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
  /**
   * A MARCA DO MEMBRO ganha ao `handle`.
   *
   * O estilo tipográfico (duas faixas, texto enorme) é o mesmo do cartão pessoal — funciona para
   * qualquer marca e é o que distingue uma peça feita de uma peça gerada. O que muda é a cor de
   * acento, a assinatura e o logótipo, que vêm de quem assina.
   */
  if (params.marca?.nome) {
    return cartaoRicardo(params, params.formato === 'reel')
  }
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
  /** O recorte da pessoa, por cima do fundo e debaixo do texto. Ver `SocialCardParams`. */
  destaque?: string
  destaquePos?: 'esquerda' | 'centro' | 'direita'
  destaqueEscala?: number
  /** A marca de quem assina, quando não é uma das da casa. Ver `SocialCardParams`. */
  marca?: SocialCardParams['marca']
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
      destaque: l.destaque,
      destaquePos: l.destaquePos,
      destaqueEscala: l.destaqueEscala,
      marca: l.marca,
      formato: 'post',
    })
  }

  const t = l.texto.slice(0, 220)
  const corpo = t.length > 150 ? 56 : t.length > 90 ? 68 : t.length > 50 ? 82 : 96

  /**
   * A LÂMINA DO MEIO TAMBÉM TEM DONO.
   *
   * Só a capa e o fecho passavam pelo `socialCardElement`, que é onde a conta escolhe o estilo.
   * As do meio caíam sempre neste bloco, escrito com o ciano do Ricardo — e um carrossel da
   * MARCA saía com a capa preta e dourada e cinco lâminas azuis pelo meio. Metade de um
   * carrossel a falar por outra conta é pior do que não ter estilo nenhum: parece um erro de
   * montagem, porque é.
   *
   * O acento e a assinatura passam a vir da conta, como em todo o resto.
   */
  const daMarca = handle === 'morethanmoney.pt'
  // A marca do membro ganha às duas da casa — ver `SocialCardParams.marca`.
  const acento = l.marca?.cor?.trim() || (daMarca ? GOLD : CIANO)
  const assinatura = l.marca
    ? (l.marca.arroba ? `@${l.marca.arroba.replace(/^@/, '')}` : l.marca.nome)
    : daMarca ? '@morethanmoney.pt' : '@ricardogarciapt'
  const fundoLiso = daMarca
    ? 'radial-gradient(900px 700px at 30% 20%, #1b1a17, #0b0d12 70%)'
    : 'radial-gradient(900px 700px at 30% 20%, #23282e, #0d0f11 70%)'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#141414',
        ...(l.fundo ? {} : { backgroundImage: fundoLiso }),
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
            style={{ position: 'absolute', top: 0, left: 0, width: 1080, height: 1350, objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'absolute', top: 0, left: 0, width: 1080, height: 1350, display: 'flex',
              backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.75))',
            }}
          />
        </>
      )}
      {l.destaque && (
        // A mesma ordem do cartão: fundo, pessoa, texto. Ver o comentário lá.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={l.destaque}
          alt=""
          style={{
            position: 'absolute',
            bottom: 0,
            ...(l.destaquePos === 'esquerda' ? { left: -60 } : l.destaquePos === 'centro' ? { left: 140 } : { right: -60 }),
            height: Math.round(1350 * Math.min(1.1, Math.max(0.4, l.destaqueEscala ?? 0.9))),
            objectFit: 'contain',
          }}
        />
      )}
      {/* O número é a promessa de que há mais — é ele que faz deslizar. */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', color: acento, fontFamily: 'Anton', fontSize: 72 }}>
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
        <div style={{ display: 'flex', width: 70, height: 7, background: acento, borderRadius: 4 }} />
        <div style={{ display: 'flex', color: '#8b9199', fontSize: 28, fontWeight: 600, marginLeft: 20 }}>
          {assinatura}
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
/**
 * Desenha UM elemento em PNG, com a fonte da casa carregada.
 *
 * Existe à parte para se poder refazer uma lâmina sozinha. Mudar uma palavra na terceira
 * obrigava a gerar o carrossel inteiro — seis renderizações e, pior, um fundo NOVO pedido à IA,
 * o que fazia a capa mudar por causa de uma correcção no meio.
 */
export async function renderElemento(
  elemento: React.ReactElement,
  largura = 1080,
  altura = 1350,
): Promise<Buffer> {
  const f = fonteCondensada()
  const res = new ImageResponse(elemento, {
    width: largura,
    height: altura,
    ...(f
      ? { fonts: [{ name: 'Anton', data: f as unknown as ArrayBuffer, weight: 400 as const, style: 'normal' as const }] }
      : {}),
  })
  return Buffer.from(await res.arrayBuffer())
}

export async function renderCarrossel(laminas: Lamina[], handle: string): Promise<Buffer[]> {
  const saida: Buffer[] = []
  for (let i = 0; i < laminas.length; i++) {
    saida.push(await renderElemento(laminaElement(laminas[i], i, laminas.length, handle)))
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
  /**
   * A fonte segue o ESTILO, não o nome da conta.
   *
   * Era `handle.includes('ricardo')`. Funcionava enquanto só havia duas contas — e partiu-se no
   * dia em que um membro trouxe a marca dele: o cartão usava o estilo tipográfico (duas faixas,
   * texto enorme) e saía numa fonte genérica, larga, que partia as faixas em duas linhas. Feio,
   * e sem nada a dizer porquê.
   *
   * A condição passa a ser a mesma que o `socialCardElement` usa para escolher o desenho.
   */
  const estiloTipografico =
    Boolean(params.marca?.nome) ||
    (params.handle || '').replace(/^@/, '').toLowerCase().includes('ricardo')
  const f = estiloTipografico ? fonteCondensada() : null
  const res = new ImageResponse(socialCardElement(params), {
    width: 1080,
    height: alto ? 1920 : 1350,
    ...(f ? { fonts: [{ name: 'Anton', data: f as unknown as ArrayBuffer, weight: 400, style: 'normal' }] } : {}),
  })
  return Buffer.from(await res.arrayBuffer())
}
