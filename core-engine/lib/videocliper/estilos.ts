/**
 * OS ESTILOS DOS CLIPES — a fonte única do aspecto de um corte.
 *
 * O worker do VPS sabe correr ffmpeg; não tem de saber a cor da marca. Tudo o que decide como um
 * clipe PARECE — letra, cores, tamanho, efeitos ligados — vive aqui e viaja com o trabalho. Mudar
 * um estilo é uma linha neste ficheiro, não um deploy numa máquina a que quase ninguém acede.
 *
 * Os valores estão escritos para 1080×1920. `estiloParaWorker` escala-os para a resolução pedida
 * (a pré-visualização sai a 540×960), para a legenda ocupar a mesma proporção nas duas.
 *
 * ── porque é que o primeiro é o do @ricardogarciapt ─────────────────────────
 *
 * É o mesmo desenho do estúdio de cartões (`cartaoRicardo` em lib/social-card.tsx): Anton
 * condensada em itálico, maiúsculas, ciano #0097b2 e branco, a assinatura por baixo. Um Reel e
 * um cartão da mesma conta têm de parecer da mesma pessoa.
 */

export type EstiloId = 'ricardogarciapt' | 'morethanmoney'

export interface EfeitosVideo {
  /** Grupo de palavras entra com um «pop» de escala (80% → 106% → 100%). */
  pop: boolean
  /** Zoom digital no A-roll: enquadramento alternado a cada ~5s e «punch-in» nas palavras-chave. */
  punchIn: boolean
  /** B-roll entra e sai com fade de alfa + zoom/deslize, em vez de aparecer a seco. */
  transicoesBroll: boolean
  /** Cartão do gancho nos primeiros segundos, no terço de cima. */
  tituloGancho: boolean
  /** Barra fina de progresso no fundo, na cor de acento. */
  barraProgresso: boolean
  /** Correcção de cor leve (contraste/saturação). */
  grade: boolean
  /** «Whoosh» sintetizado no próprio ffmpeg nas entradas do B-roll, baixinho debaixo da voz. */
  whoosh: boolean
  /** Assinatura pequena (@conta) no topo. */
  assinatura: boolean
  /** Emoji por cima das palavras-chave. DESLIGADO: o VPS não tem fonte de emoji a cores e o libass desenha-os a preto e branco. */
  emojis: boolean
}

export interface EstiloVideo {
  id: EstiloId
  nome: string
  /** Nome da família dentro do ficheiro de fonte — é o que o libass procura no `fontsdir`. */
  fonte: string
  /** Ficheiro em deploy/vps-stream/videocliper/fonts/ (cópia de public/fonts). */
  fonteFicheiro: string
  italico: boolean
  maiusculas: boolean
  /** Largura média de um caractere em relação ao corpo — serve para a linha nunca passar dos 80%. */
  fatorLargura: number
  tamanho: number
  corBase: string
  /** A palavra que está a ser dita. */
  corDestaque: string
  /** As palavras-chave (ENFASE da análise). */
  corEnfase: string
  /** Caixa do gancho e barra de progresso. */
  corAcento: string
  /** Texto dentro da caixa do gancho. */
  corTextoGancho: string
  contorno: string
  contornoPx: number
  sombraPx: number
  escalaActiva: number
  escalaEnfase: number
  /** Centro vertical da legenda (fracção da altura). Acima dos ~20% de baixo, onde o Instagram desenha a interface. */
  posicaoY: number
  /** Centro vertical do cartão do gancho. */
  posicaoGanchoY: number
  ganchoDuracao: number
  palavrasPorEcra: number
  larguraMaxima: number
  assinatura: string
  grade: { contraste: number; saturacao: number; brilho: number }
  efeitos: EfeitosVideo
}

const EFEITOS_POR_OMISSAO: EfeitosVideo = {
  pop: true,
  punchIn: true,
  transicoesBroll: true,
  tituloGancho: true,
  barraProgresso: true,
  grade: true,
  whoosh: true,
  assinatura: true,
  emojis: false,
}

export const ESTILOS: Record<EstiloId, EstiloVideo> = {
  ricardogarciapt: {
    id: 'ricardogarciapt',
    nome: '@ricardogarciapt (ciano)',
    fonte: 'Anton',
    fonteFicheiro: 'Anton-Regular.ttf',
    italico: true,
    maiusculas: true,
    fatorLargura: 0.26,
    tamanho: 180,
    corBase: '#FFFFFF',
    corDestaque: '#0097B2',
    corEnfase: '#0097B2',
    corAcento: '#0097B2',
    corTextoGancho: '#FFFFFF',
    contorno: '#000000',
    contornoPx: 10,
    sombraPx: 5,
    escalaActiva: 1.1,
    escalaEnfase: 1.35,
    posicaoY: 0.66,
    posicaoGanchoY: 0.23,
    ganchoDuracao: 2.6,
    palavrasPorEcra: 3,
    larguraMaxima: 0.8,
    assinatura: '@ricardogarciapt',
    grade: { contraste: 1.06, saturacao: 1.12, brilho: 0.01 },
    efeitos: { ...EFEITOS_POR_OMISSAO },
  },
  morethanmoney: {
    id: 'morethanmoney',
    nome: '@morethanmoney.pt (dourado)',
    fonte: 'Anton',
    fonteFicheiro: 'Anton-Regular.ttf',
    italico: true,
    maiusculas: true,
    fatorLargura: 0.26,
    tamanho: 180,
    corBase: '#FFFFFF',
    corDestaque: '#D2A63C',
    corEnfase: '#D2A63C',
    corAcento: '#D2A63C',
    corTextoGancho: '#0B0D12',
    contorno: '#000000',
    contornoPx: 10,
    sombraPx: 5,
    escalaActiva: 1.1,
    escalaEnfase: 1.35,
    posicaoY: 0.66,
    posicaoGanchoY: 0.23,
    ganchoDuracao: 2.6,
    palavrasPorEcra: 3,
    larguraMaxima: 0.8,
    assinatura: '@morethanmoney.pt',
    grade: { contraste: 1.05, saturacao: 1.08, brilho: 0.01 },
    efeitos: { ...EFEITOS_POR_OMISSAO },
  },
}

export const ESTILO_POR_OMISSAO: EstiloId = 'ricardogarciapt'

export const LISTA_ESTILOS = Object.values(ESTILOS).map((e) => ({ id: e.id, nome: e.nome, cor: e.corAcento }))

export function estiloValido(id: unknown): id is EstiloId {
  return typeof id === 'string' && id in ESTILOS
}

/**
 * O estilo pronto a mandar ao worker, já na resolução do trabalho.
 *
 * Os campos antigos (`fonte`, `tamanho`, `corBase`, `corDestaque`, `contorno`, `contornoPx`,
 * `posicaoY`, `palavrasPorEcra`, `largura`, `altura`) mantêm o nome: um worker antigo que apanhe
 * este estilo continua a desenhar legendas, só sem os efeitos novos.
 */
export function estiloParaWorker(id: unknown, largura: number, altura: number) {
  const e = ESTILOS[estiloValido(id) ? id : ESTILO_POR_OMISSAO]
  const k = largura / 1080
  const px = (v: number) => Math.max(1, Math.round(v * k))
  return {
    ...e,
    largura,
    altura,
    tamanho: px(e.tamanho),
    contornoPx: px(e.contornoPx),
    sombraPx: px(e.sombraPx),
  }
}

/**
 * As palavras-chave de um clipe, como a análise as devolve.
 *
 * Emoji só da lista: nada de notas, sacos de dinheiro ou gráficos a subir — um emoji de dinheiro
 * em cima de uma aula de trading lê-se como promessa de lucro, que é a regra mais dura da marca.
 */
export const EMOJIS_PERMITIDOS = ['🔥', '🎯', '⚠️', '🧠', '💡', '👀', '✅', '❌', '⛔', '⏱️', '🤯', '🚨'] as const

export interface Enfase {
  palavra: string
  emoji?: string
}

export function lerEnfase(bruto: string): Enfase[] {
  const saida: Enfase[] = []
  for (const parte of String(bruto || '').split(/[,;]/)) {
    const emoji = EMOJIS_PERMITIDOS.find((x) => parte.includes(x) || parte.includes(x.replace('\uFE0F', '')))
    // A palavra é o que sobra sem emoji nem pontuação. Uma só: uma frase inteira a piscar a
    // grande deixava de ser ênfase.
    const palavra = parte
      .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
      .replace(/[«»"'“”.!?:()]/g, '')
      .trim()
      .split(/\s+/)[0]
    if (!palavra || palavra.length < 2) continue
    if (saida.some((s) => s.palavra.toLowerCase() === palavra.toLowerCase())) continue
    saida.push(emoji ? { palavra, emoji } : { palavra })
  }
  return saida.slice(0, 3)
}

const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'que', 'para', 'com', 'em', 'no', 'na',
  'nos', 'nas', 'um', 'uma', 'por', 'se', 'mas', 'ou', 'é', 'porque', 'quando', 'como', 'onde', 'mais', 'muito', 'isso', 'este', 'esta', 'the', 'to', 'of', 'and', 'in', 'on', 'for', 'is',
])

/**
 * O gancho em ≤7 palavras, para o cartão do topo.
 *
 * O HOOK da análise é a frase literal do clipe — longa de mais para um título. Corta-se às sete
 * palavras e tiram-se as vazias do fim: um título que acaba em «de» parece partido.
 */
export function ganchoParaEcra(hook: string | null | undefined, maxPalavras = 7): string {
  const palavras = String(hook || '')
    .replace(/[«»"“”]/g, '')
    .replace(/[.!?…]+$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!palavras.length) return ''
  const corte = palavras.slice(0, maxPalavras)
  if (palavras.length > maxPalavras) {
    while (corte.length > 2 && VAZIAS.has(corte[corte.length - 1].toLowerCase().replace(/[,;:]/g, ''))) corte.pop()
  }
  return corte.join(' ').replace(/[,;:]+$/, '')
}
