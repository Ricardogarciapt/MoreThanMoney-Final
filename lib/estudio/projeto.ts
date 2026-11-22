/**
 * PROJECTO DO EDITOR DE VÍDEO do /estudio — o contrato partilhado por três sítios:
 *   · o browser (app/estudio/editor.tsx), que desenha a timeline e pré-visualiza;
 *   · a API (`/api/estudio/projeto`), que guarda em `estudio_projetos.projeto`;
 *   · o motor no Mac (services/estudio-editor/editor.mjs → renderProjeto), que monta o MP4 com ffmpeg.
 * Tudo o que entra passa por `normalizarProjeto`, por isso um campo estranho nunca chega ao ffmpeg.
 */
import type { Corte, Palavra } from './texto'
import { reelCurto, type Comando } from './comando'

export const FORMATOS_VIDEO = {
  '9:16': { w: 1080, h: 1920, nome: 'Reel / Story (9:16)' },
  '1:1': { w: 1080, h: 1080, nome: 'Feed quadrado (1:1)' },
  '4:5': { w: 1080, h: 1350, nome: 'Feed vertical (4:5)' },
  '16:9': { w: 1920, h: 1080, nome: 'YouTube (16:9)' },
} as const
export type FormatoVideo = keyof typeof FORMATOS_VIDEO

/** Filtros de cor: `css` para a pré-visualização, `ff` para o ffmpeg (o mesmo aspecto, aproximado). */
export const FILTROS = {
  nenhum: { nome: 'Original', css: 'none', ff: '' },
  ouro: { nome: 'Ouro MTM', css: 'sepia(.35) saturate(1.25) contrast(1.08) brightness(1.02)', ff: 'colorchannelmixer=rr=1.05:gg=0.97:bb=0.82,eq=contrast=1.08:saturation=1.2' },
  teal: { nome: 'Teal Ricardo', css: 'hue-rotate(-12deg) saturate(1.15) contrast(1.06)', ff: 'colorchannelmixer=rr=0.9:gg=1.02:bb=1.08,eq=contrast=1.06:saturation=1.1' },
  quente: { nome: 'Quente', css: 'sepia(.2) saturate(1.2)', ff: 'colorbalance=rs=.08:gs=.02:bs=-.08,eq=saturation=1.15' },
  frio: { nome: 'Frio', css: 'hue-rotate(10deg) saturate(.95)', ff: 'colorbalance=rs=-.06:bs=.08' },
  pb: { nome: 'Preto e branco', css: 'grayscale(1) contrast(1.1)', ff: 'hue=s=0,eq=contrast=1.1' },
  cinema: { nome: 'Cinema', css: 'contrast(1.18) saturate(.85) brightness(.95)', ff: 'eq=contrast=1.18:saturation=0.85:brightness=-0.03' },
  vivo: { nome: 'Vivo', css: 'saturate(1.45) contrast(1.05)', ff: 'eq=saturation=1.45:contrast=1.05' },
  suave: { nome: 'Suave', css: 'contrast(.9) brightness(1.06) saturate(.9)', ff: 'eq=contrast=0.9:brightness=0.04:saturation=0.9' },
} as const
export type Filtro = keyof typeof FILTROS

/** Transição À ENTRADA do clip (o primeiro ignora-a). Nomes do xfade do ffmpeg. */
export const TRANSICOES = {
  corte: 'Corte seco',
  fade: 'Esbater',
  fadeblack: 'Pelo preto',
  slideleft: 'Deslizar ←',
  slideup: 'Deslizar ↑',
  zoomin: 'Zoom',
  circleopen: 'Círculo',
  wipeleft: 'Cortina',
  dissolve: 'Dissolver',
} as const
export type Transicao = keyof typeof TRANSICOES

export const ANIMACOES_IMAGEM = ['zoom_in', 'zoom_out', 'pan_esq', 'pan_dir', 'sobe', 'sem'] as const
export type AnimacaoImagem = (typeof ANIMACOES_IMAGEM)[number]

export const VELOCIDADES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const ESTILOS_TEXTO = {
  titulo: 'Título grande',
  legenda: 'Legenda',
  destaque: 'Destaque (caixa da marca)',
  cta: 'CTA (fim)',
} as const
export type EstiloTexto = keyof typeof ESTILOS_TEXTO
export const POSICOES_TEXTO = ['cima', 'meio', 'baixo'] as const
export type PosicaoTexto = (typeof POSICOES_TEXTO)[number]
export const ANIMACOES_TEXTO = { nenhuma: 'Sem', aparecer: 'Aparecer', subir: 'Subir', escrever: 'Máquina de escrever' } as const
export type AnimacaoTexto = keyof typeof ANIMACOES_TEXTO

/** De onde vem o material. `caminho` é do bucket privado `estudio`; `url` é público (renders). */
export type FonteClip = { tipo: 'take' | 'ativo' | 'url'; ref: string | null; caminho: string | null; url: string | null }

export type Clip = {
  id: string
  media: 'video' | 'imagem'
  fonte: FonteClip
  nome: string
  /** Duração do ficheiro original (s); nas imagens é a duração que o clip ocupa. */
  duracao_fonte: number
  de: number
  ate: number
  velocidade: number
  filtro: Filtro
  transicao: Transicao
  trans_dur: number
  volume: number
  /** Zoom fixo (1 = sem), para enquadrar o rosto. */
  zoom: number
  animacao: AnimacaoImagem
  espelhar: boolean
}

export type TextoSobreposto = {
  id: string
  texto: string
  inicio: number
  fim: number
  posicao: PosicaoTexto
  estilo: EstiloTexto
  animacao: AnimacaoTexto
}

export type Projeto = {
  formato: FormatoVideo
  clips: Clip[]
  textos: TextoSobreposto[]
  musica: { fonte: FonteClip; nome: string; volume: number; duck: boolean } | null
  /** Legendas automáticas a partir da transcrição dos takes (o Mac usa o Whisper se faltar). */
  legendas: 'nenhuma' | 'karaoke' | 'simples'
  marca_dagua: boolean
  /** Barras de cor da marca em vez de desfoque quando o material não enche o formato. */
  fundo: 'desfoque' | 'marca' | 'preto'
  volume_geral: number
  /**
   * Molde do render (20/11/2026). 'cinematico' = o molde AnuncioReel aprovado pelo Ricardo
   * (gémeo por baixo + gancho cinético, legendas palavra a palavra, PiP, chips, light leaks, música,
   * CTA): quem o monta é o robô video/cinematico/robo-cinematico.mjs, não o editor do Mac.
   * Sem molde = a timeline simples do editor (só para o que alguém monta à mão no /estudio).
   */
  molde?: 'cinematico'
  cinematico?: Cinematico | null
}

/** O que o robô cinemático precisa do guião (o resto sai do vídeo do gémeo + Whisper). */
export type Cinematico = {
  marca: 'morethanmoney' | 'ricardo-garcia'
  gancho: string
  palavra_chave: string
  nicho: string
  /** O texto que o gémeo diz (orienta o Whisper na ortografia). */
  texto: string
  /** Imagens/vídeos de apoio do guião (https), pela ordem dos segmentos; entram em PiP. */
  apoio: string[]
  cta_url: string
  /**
   * Molde de edição (21/11/2026, Ricardo: «deves ter 3 modelos»). O mesmo gémeo reaproveitado
   * noutra conta sai noutro molde, para não parecer repetido:
   *  cinema     — gémeo a ecrã inteiro que encolhe para janela sobre as imagens (o aprovado a 20/11)
   *  impacto    — ecrã dividido: imagens em cima, gémeo em baixo; legendas grandes ao centro
   *  documental — barras de cinema, imagens a ecrã inteiro em corte (a voz continua), legenda discreta
   */
  molde?: MoldeEdicao
  /**
   * Lista viva (22/11/2026, formatos virais): um painel que se vai preenchendo enquanto o gémeo
   * fala — «3 coisas», «5 erros» (contagem decrescente), «o caminho do zero». Cada item entra quando
   * a legenda diz as palavras dele (ou, sem correspondência, a intervalos iguais).
   */
  lista?: { titulo: string; itens: string[]; contagem?: boolean }
  /**
   * Reel narrado (22/11/2026, «5 reels por dia» por conta sem gastar HeyGen): sem gémeo; a voz é o
   * clone Fish do Ricardo (gerada pelo site) e o fundo são as fotos reais animadas + b-roll.
   */
  narrado?: boolean
  /**
   * Capa do reel (22/11/2026, Ricardo: todos os reels levam capa, cada uma diferente; RG no estilo
   * dele, MTM com o branding MTM). Linhas do título: w = branco, c = destaque (ciano/ouro), box = faixa, k = kicker dourado por cima (só MTM).
   * Sem linhas, o robô parte o gancho. capa_url é a imagem já desenhada (vai para media_urls[1]).
   */
  capa?: [('w' | 'c' | 'box' | 'k'), string][]
  capa_url?: string
  /** 22/11 (Ricardo): reel «para música trend» — sai só com a voz e fica em rascunho para ele juntar o áudio na app. */
  sem_musica?: boolean
  /** Áudio trend de referência (nome + link) que ele junta na app. */
  audio?: string
  /** Estilo de edição: classico · palavra · nativo · noir (sem ele o robô roda por reel). */
  estilo?: 'classico' | 'palavra' | 'nativo' | 'noir'
  /** Funil que o CTA alimenta: Educação · PU Prime IB · Ricardo · B2B. */
  funil?: string
}

export const MOLDES_EDICAO = ['cinema', 'impacto', 'documental'] as const
export type MoldeEdicao = (typeof MOLDES_EDICAO)[number]

/** Molde do dia: roda pelos três; desvio 1 dá o molde seguinte (versão reaproveitada na outra conta). */
export function moldeDoDia(d: Date = new Date(), desvio = 0): MoldeEdicao {
  const n = Math.floor(d.getTime() / 86_400_000) + desvio
  return MOLDES_EDICAO[((n % 3) + 3) % 3]
}

export function normalizarCinematico(v: any): Cinematico | null {
  if (!v || typeof v !== 'object') return null
  return {
    marca: v.marca === 'ricardo-garcia' ? 'ricardo-garcia' : 'morethanmoney',
    gancho: txt(v.gancho, 90).trim(),
    palavra_chave: txt(v.palavra_chave, 30).replace(/[^\p{L}\p{N} ]/gu, '').trim().toUpperCase(),
    nicho: txt(v.nicho, 80).trim(),
    texto: txt(v.texto, 1500).trim(),
    apoio: (Array.isArray(v.apoio) ? v.apoio : []).filter((u: unknown) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4),
    cta_url: txt(v.cta_url, 80).trim(),
    ...((MOLDES_EDICAO as readonly string[]).includes(v.molde) ? { molde: v.molde as MoldeEdicao } : {}),
    ...normalizarLista(v.lista),
    ...(v.narrado === true ? { narrado: true } : {}),
    ...normalizarCapa(v.capa),
    ...(typeof v.capa_url === 'string' && /^https:\/\//.test(v.capa_url) ? { capa_url: v.capa_url.slice(0, 400) } : {}),
    ...(['classico', 'palavra', 'nativo', 'noir'].includes(v.estilo) ? { estilo: v.estilo } : {}),
    ...(v.sem_musica === true ? { sem_musica: true } : {}),
    ...(typeof v.audio === 'string' && v.audio.trim() ? { audio: txt(v.audio, 200).trim() } : {}),
    ...(typeof v.funil === 'string' && v.funil.trim() ? { funil: txt(v.funil, 30).trim() } : {}),
  }
}

function normalizarCapa(c: any): { capa?: Cinematico['capa'] } {
  if (!Array.isArray(c)) return {}
  const linhas = c
    .filter((l: any) => Array.isArray(l) && ['w', 'c', 'box', 'k'].includes(l[0]) && typeof l[1] === 'string' && l[1].trim())
    .map((l: any) => [l[0], txt(l[1], 40).trim()] as [('w' | 'c' | 'box' | 'k'), string])
    .slice(0, 4)
  return linhas.length ? { capa: linhas } : {}
}

function normalizarLista(l: any): { lista?: Cinematico['lista'] } {
  if (!l || typeof l !== 'object' || !Array.isArray(l.itens)) return {}
  const itens = l.itens.filter((i: unknown) => typeof i === 'string' && i.trim()).map((i: string) => txt(i, 60).trim()).slice(0, 7)
  if (itens.length < 2) return {}
  return { lista: { titulo: txt(l.titulo, 40).trim(), itens, ...(l.contagem ? { contagem: true } : {}) } }
}

export const PROJETO_VAZIO: Projeto = {
  formato: '9:16',
  clips: [],
  textos: [],
  musica: null,
  legendas: 'karaoke',
  marca_dagua: true,
  fundo: 'desfoque',
  volume_geral: 1,
}

const n = (v: unknown, def: number, min: number, max: number) => {
  const x = Number(v)
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def
}
const de = <T extends string>(v: unknown, lista: readonly T[], def: T): T => (lista.includes(v as T) ? (v as T) : def)
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
export const novoId = () => Math.random().toString(36).slice(2, 10)

function normalizarFonte(v: any): FonteClip {
  const tipo = de(v?.tipo, ['take', 'ativo', 'url'] as const, 'url')
  const caminho = typeof v?.caminho === 'string' && !v.caminho.includes('..') ? v.caminho.slice(0, 300) : null
  const url = typeof v?.url === 'string' && /^https:\/\//.test(v.url) ? v.url.slice(0, 1000) : null
  return { tipo, ref: typeof v?.ref === 'string' ? v.ref.slice(0, 64) : null, caminho, url }
}

export function normalizarClip(v: any): Clip | null {
  const fonte = normalizarFonte(v?.fonte)
  if (!fonte.caminho && !fonte.url) return null
  const media = v?.media === 'imagem' ? 'imagem' : 'video'
  const duracao_fonte = n(v?.duracao_fonte, media === 'imagem' ? 3 : 10, 0.2, 3600)
  const deS = n(v?.de, 0, 0, duracao_fonte - 0.1)
  const ate = n(v?.ate, duracao_fonte, deS + 0.1, media === 'imagem' ? 60 : duracao_fonte)
  return {
    id: typeof v?.id === 'string' ? v.id.slice(0, 16) : novoId(),
    media,
    fonte,
    nome: txt(v?.nome, 80) || (media === 'imagem' ? 'Imagem' : 'Vídeo'),
    duracao_fonte,
    de: media === 'imagem' ? 0 : deS,
    ate,
    velocidade: (VELOCIDADES as readonly number[]).includes(Number(v?.velocidade)) ? Number(v.velocidade) : 1,
    filtro: de(v?.filtro, Object.keys(FILTROS) as Filtro[], 'nenhum'),
    transicao: de(v?.transicao, Object.keys(TRANSICOES) as Transicao[], 'corte'),
    trans_dur: n(v?.trans_dur, 0.4, 0.15, 1.5),
    volume: n(v?.volume, 1, 0, 2),
    zoom: n(v?.zoom, 1, 1, 2),
    animacao: de(v?.animacao, ANIMACOES_IMAGEM, 'zoom_in'),
    espelhar: v?.espelhar === true,
  }
}

export function normalizarProjeto(v: any): Projeto {
  const clips = (Array.isArray(v?.clips) ? v.clips : []).map(normalizarClip).filter(Boolean).slice(0, 80) as Clip[]
  const total = duracaoProjeto({ ...PROJETO_VAZIO, clips })
  const textos = (Array.isArray(v?.textos) ? v.textos : [])
    .map((t: any): TextoSobreposto | null => {
      const texto = txt(t?.texto, 220).trim()
      if (!texto) return null
      const inicio = n(t?.inicio, 0, 0, Math.max(0, total))
      return {
        id: typeof t?.id === 'string' ? t.id.slice(0, 16) : novoId(),
        texto,
        inicio,
        fim: n(t?.fim, inicio + 3, inicio + 0.2, Math.max(inicio + 0.2, total || inicio + 3)),
        posicao: de(t?.posicao, POSICOES_TEXTO, 'meio'),
        estilo: de(t?.estilo, Object.keys(ESTILOS_TEXTO) as EstiloTexto[], 'titulo'),
        animacao: de(t?.animacao, Object.keys(ANIMACOES_TEXTO) as AnimacaoTexto[], 'aparecer'),
      }
    })
    .filter(Boolean)
    .slice(0, 60) as TextoSobreposto[]
  const m = v?.musica
  const fm = m ? normalizarFonte(m.fonte) : null
  return {
    formato: de(v?.formato, Object.keys(FORMATOS_VIDEO) as FormatoVideo[], '9:16'),
    clips,
    textos,
    musica: fm && (fm.caminho || fm.url) ? { fonte: fm, nome: txt(m.nome, 80) || 'Música', volume: n(m.volume, 0.25, 0, 1), duck: m.duck !== false } : null,
    legendas: de(v?.legendas, ['nenhuma', 'karaoke', 'simples'] as const, 'karaoke'),
    marca_dagua: v?.marca_dagua !== false,
    fundo: de(v?.fundo, ['desfoque', 'marca', 'preto'] as const, 'desfoque'),
    volume_geral: n(v?.volume_geral, 1, 0, 2),
    ...(v?.molde === 'cinematico' ? { molde: 'cinematico' as const, cinematico: normalizarCinematico(v?.cinematico) } : {}),
  }
}

/** Quanto dura um clip na timeline (já com a velocidade). */
export const duracaoClip = (c: Clip) => (c.ate - c.de) / c.velocidade

/** Duração total: as transições sobrepõem o fim de um clip ao início do seguinte. */
export function duracaoProjeto(p: Pick<Projeto, 'clips'>): number {
  return p.clips.reduce((s, c, i) => s + duracaoClip(c) - (i > 0 && c.transicao !== 'corte' ? Math.min(c.trans_dur, duracaoClip(c) / 2) : 0), 0)
}

/** Onde cada clip começa na timeline (s). */
export function iniciosDosClips(p: Pick<Projeto, 'clips'>): number[] {
  const out: number[] = []
  let t = 0
  p.clips.forEach((c, i) => {
    const sobre = i > 0 && c.transicao !== 'corte' ? Math.min(c.trans_dur, duracaoClip(c) / 2) : 0
    t -= sobre
    out.push(Math.max(0, t))
    t += duracaoClip(c)
  })
  return out
}

/** Dividir um clip no instante `t` da timeline. Devolve a lista nova (ou a mesma se não der). */
export function dividirClip(p: Projeto, id: string, t: number): Clip[] {
  const inicios = iniciosDosClips(p)
  const i = p.clips.findIndex((c) => c.id === id)
  if (i < 0) return p.clips
  const c = p.clips[i]
  const local = c.de + (t - inicios[i]) * c.velocidade
  if (local <= c.de + 0.15 || local >= c.ate - 0.15) return p.clips
  const a: Clip = { ...c, ate: local }
  const b: Clip = { ...c, id: novoId(), de: c.media === 'imagem' ? 0 : local, ate: c.media === 'imagem' ? c.ate - (local - c.de) : c.ate, transicao: 'corte' }
  if (c.media === 'imagem') a.ate = local - c.de
  return [...p.clips.slice(0, i), a, b, ...p.clips.slice(i + 1)]
}

/**
 * «Montar com IA» a partir de um take: as zonas MANTIDAS (o inverso dos cortes feitos pelo texto)
 * passam a clips, com um corte de enquadramento alternado (zoom 1 / 1,15) para dar ritmo de
 * «dois planos», o gancho em título nos primeiros 3 s, o CTA no fim e os ativos da peça
 * intercalados como b-roll. Não inventa números nem texto: usa só o guião e o take.
 */
export function montarDeTake(args: {
  take: { id: string; caminho: string; duracao_s: number; cortes: Corte[]; nome?: string }
  gancho?: string | null
  cta?: string | null
  ativos?: { id: string; caminho: string; tipo: string; nome: string; animacao?: string | null; segmento?: number | null }[]
  musica?: { id: string; caminho: string; nome: string } | null
  formato?: FormatoVideo
  /** Palavras da transcrição do take e o pedido escrito («3 planos, 15 s»): reel curto plano a plano. */
  palavras?: Palavra[]
  comando?: Comando | null
}): Projeto {
  const dur = Math.max(1, Number(args.take.duracao_s) || 30)
  const mantidas: { ini: number; fim: number }[] = []
  let cursor = 0
  for (const c of [...args.take.cortes].sort((a, b) => a.ini - b.ini)) {
    if (c.ini - cursor >= 0.3) mantidas.push({ ini: cursor, fim: c.ini })
    cursor = Math.max(cursor, c.fim)
  }
  if (dur - cursor >= 0.3) mantidas.push({ ini: cursor, fim: dur })
  // Zonas longas partem-se em pedaços de ~6 s para alternar o plano.
  const pedacos: { ini: number; fim: number }[] = []
  for (const z of mantidas) {
    let i = z.ini
    while (z.fim - i > 8) { pedacos.push({ ini: i, fim: i + 6 }); i += 6 }
    pedacos.push({ ini: i, fim: z.fim })
  }
  const fonteTake: FonteClip = { tipo: 'take', ref: args.take.id, caminho: args.take.caminho, url: null }
  const cmd = args.comando
  if (cmd && args.palavras?.length) {
    // Reel curto: frases sem pausas até à duração pedida, repartidas pelos planos pedidos.
    const zonas = reelCurto(args.palavras, mantidas, cmd)
    if (zonas.length) {
      const clipsC: Clip[] = zonas.map((z, k) => normalizarClip({
        id: novoId(), media: 'video', fonte: fonteTake, nome: `${args.take.nome ?? 'Take'} · ${k + 1}`,
        duracao_fonte: dur, de: z.ini, ate: z.fim, zoom: z.zoom,
        transicao: k > 0 && z.entraPlano ? 'zoomin' : 'corte', trans_dur: 0.2,
      })!)
      const pc = normalizarProjeto({ ...PROJETO_VAZIO, formato: args.formato ?? '9:16', clips: clipsC })
      const tot = duracaoProjeto(pc)
      const gancho = cmd.gancho || args.gancho
      const tx: TextoSobreposto[] = []
      if (gancho) tx.push({ id: novoId(), texto: gancho, inicio: 0, fim: Math.min(2.2, tot), posicao: 'cima', estilo: 'titulo', animacao: 'subir' })
      if (args.cta && tot > 4) tx.push({ id: novoId(), texto: args.cta, inicio: Math.max(0, tot - 2.5), fim: tot, posicao: 'baixo', estilo: 'cta', animacao: 'aparecer' })
      return normalizarProjeto({
        ...pc, textos: tx,
        musica: args.musica ? { fonte: { tipo: 'ativo', ref: args.musica.id, caminho: args.musica.caminho, url: null }, nome: args.musica.nome, volume: 0.15, duck: true } : null,
      })
    }
  }
  const imagens = (args.ativos ?? []).filter((a) => a.tipo === 'imagem' || a.tipo === 'video')
  const clips: Clip[] = []
  pedacos.forEach((z, k) => {
    clips.push(normalizarClip({
      id: novoId(), media: 'video', fonte: fonteTake, nome: `${args.take.nome ?? 'Take'} · ${k + 1}`,
      duracao_fonte: dur, de: z.ini, ate: z.fim, zoom: k % 2 ? 1.15 : 1, transicao: 'corte',
    })!)
    // Depois de cada 2 pedaços de fala, um ativo como b-roll curto (2,5 s) com transição suave.
    const a = imagens[Math.floor(k / 2)]
    if (k % 2 === 1 && a) {
      clips.push(normalizarClip({
        id: novoId(), media: a.tipo === 'imagem' ? 'imagem' : 'video',
        fonte: { tipo: 'ativo', ref: a.id, caminho: a.caminho, url: null }, nome: a.nome,
        duracao_fonte: a.tipo === 'imagem' ? 2.5 : 2.5, de: 0, ate: 2.5, transicao: 'fade', trans_dur: 0.3,
        animacao: ANIMACOES_IMAGEM.includes(a.animacao as AnimacaoImagem) ? a.animacao : 'zoom_in', volume: 0,
      })!)
    }
  })
  const proj = normalizarProjeto({ ...PROJETO_VAZIO, formato: args.formato ?? '9:16', clips })
  const total = duracaoProjeto(proj)
  const textos: TextoSobreposto[] = []
  if (args.gancho) textos.push({ id: novoId(), texto: args.gancho, inicio: 0, fim: Math.min(3, total), posicao: 'cima', estilo: 'titulo', animacao: 'subir' })
  if (args.cta && total > 4) textos.push({ id: novoId(), texto: args.cta, inicio: Math.max(0, total - 3.5), fim: total, posicao: 'baixo', estilo: 'cta', animacao: 'aparecer' })
  return normalizarProjeto({
    ...proj,
    textos,
    musica: args.musica ? { fonte: { tipo: 'ativo', ref: args.musica.id, caminho: args.musica.caminho, url: null }, nome: args.musica.nome, volume: 0.2, duck: true } : null,
  })
}
