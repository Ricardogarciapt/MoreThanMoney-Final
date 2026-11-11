/**
 * Editar o take pelo texto (ideia do OpenCut-AI «Edit by text» + «Smart Cut», MIT).
 *
 * A transcrição vem do Mac (Whisper local) como palavras com tempos. No /estudio o Ricardo risca
 * palavras; aqui transformam-se as palavras riscadas, as bengalas e as pausas em ZONAS A CORTAR
 * (segundos do take original), que o editor aplica. Partilhado pelo ecrã e pelas APIs.
 */
export type Palavra = { w: string; ini: number; fim: number }
export type Corte = { ini: number; fim: number }
export type EstiloTake = {
  /** 'destaques' = só as palavras fortes, soltas junto à cara. */
  legenda: 'karaoke' | 'caixa' | 'classica' | 'destaques' | 'sem'
  musica_db: number
  duck: boolean
  /** Encolher as pausas entre frases (Smart Cut). */
  pausas: boolean
  /** Preto e branco automático nos momentos de erro/passado (o guião pode forçar por segmento). */
  pb_auto: boolean
  /** Pop-up «@conta + Seguir» a meio (vídeos com mais de 12 s). */
  pop_up: boolean
}

export const ESTILO_OMISSAO: EstiloTake = { legenda: 'karaoke', musica_db: -18, duck: true, pausas: true, pb_auto: true, pop_up: true }

/** Bengalas que se cortam sempre (sons sem significado). */
export const BENGALAS_SONS = ['ãh', 'ah', 'ahn', 'eh', 'éh', 'ehm', 'hum', 'hmm', 'hm', 'uhm', 'um', 'uh', 'mm', 'ã']
/** Bengalas de palavra: sugeridas, o Ricardo decide (às vezes fazem falta). */
export const BENGALAS_PALAVRAS = ['tipo', 'pronto', 'prontos', 'portanto', 'basicamente', 'ok', 'okay', 'né', 'sabes', 'percebes']

const limpa = (w: string) => w.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '')

export function ehBengala(w: string): 'som' | 'palavra' | null {
  const x = limpa(w)
  if (!x) return null
  if (BENGALAS_SONS.includes(x)) return 'som'
  if (BENGALAS_PALAVRAS.includes(x)) return 'palavra'
  return null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : NaN)

export function normalizarPalavras(v: unknown): Palavra[] {
  if (!Array.isArray(v)) return []
  const out: Palavra[] = []
  for (const p of v.slice(0, 5000)) {
    const o = (p ?? {}) as Record<string, unknown>
    const w = String(o.w ?? o.word ?? '').trim().slice(0, 60)
    const ini = num(o.ini ?? o.start)
    const fim = num(o.fim ?? o.end)
    if (!w || !(ini >= 0) || !(fim >= ini)) continue
    out.push({ w, ini, fim })
  }
  return out.sort((a, b) => a.ini - b.ini)
}

/** Junta zonas sobrepostas ou quase encostadas, e descarta as minúsculas. */
export function normalizarCortes(v: unknown, duracao = Infinity): Corte[] {
  if (!Array.isArray(v)) return []
  const zonas = v
    .map((c) => ({ ini: num((c as Corte)?.ini), fim: num((c as Corte)?.fim) }))
    .filter((c) => c.ini >= 0 && c.fim > c.ini && c.ini < duracao)
    .map((c) => ({ ini: c.ini, fim: Math.min(c.fim, duracao) }))
    .sort((a, b) => a.ini - b.ini)
  const out: Corte[] = []
  for (const c of zonas) {
    const u = out[out.length - 1]
    if (u && c.ini <= u.fim + 0.05) u.fim = Math.max(u.fim, c.fim)
    else out.push({ ...c })
  }
  return out.filter((c) => c.fim - c.ini >= 0.05).slice(0, 400)
}

/**
 * Zonas a cortar a partir das palavras riscadas (índices) e das opções automáticas.
 * - Uma palavra riscada corta do fim da anterior (+folga) ao início da seguinte (−folga).
 * - Pausas > `pausaMax` entre palavras encolhem para `folga*2`.
 * - Antes da 1.ª palavra e depois da última corta-se tudo menos a folga.
 */
export function zonasACortar(
  palavras: Palavra[],
  riscadas: Set<number>,
  opts: { pausas?: boolean; pausaMax?: number; folga?: number; duracao?: number } = {},
): Corte[] {
  const folga = opts.folga ?? 0.12
  const pausaMax = opts.pausaMax ?? 0.5
  const dur = opts.duracao ?? (palavras.length ? palavras[palavras.length - 1].fim + 1 : 0)
  const zonas: Corte[] = []
  // corridas de palavras riscadas
  let i = 0
  while (i < palavras.length) {
    if (!riscadas.has(i)) { i++; continue }
    let j = i
    while (j + 1 < palavras.length && riscadas.has(j + 1)) j++
    const antes = i > 0 ? palavras[i - 1].fim + folga : 0
    const depois = j + 1 < palavras.length ? palavras[j + 1].ini - folga : dur
    zonas.push({ ini: Math.max(0, Math.min(antes, palavras[i].ini)), fim: Math.max(depois, palavras[j].fim) })
    i = j + 1
  }
  if (opts.pausas && palavras.length) {
    const vivas = palavras.filter((_, k) => !riscadas.has(k))
    if (vivas.length) {
      if (vivas[0].ini > folga * 2) zonas.push({ ini: 0, fim: vivas[0].ini - folga })
      for (let k = 1; k < vivas.length; k++) {
        const gap = vivas[k].ini - vivas[k - 1].fim
        if (gap > pausaMax) zonas.push({ ini: vivas[k - 1].fim + folga, fim: vivas[k].ini - folga })
      }
      const ult = vivas[vivas.length - 1].fim
      if (dur - ult > folga * 2) zonas.push({ ini: ult + folga, fim: dur })
    }
  }
  return normalizarCortes(zonas, dur)
}

export const duracaoCortada = (cortes: Corte[]) => cortes.reduce((s, c) => s + (c.fim - c.ini), 0)

export function normalizarEstilo(v: unknown): EstiloTake {
  const o = (v ?? {}) as Record<string, unknown>
  const legenda = ['karaoke', 'caixa', 'classica', 'destaques', 'sem'].includes(o.legenda as string) ? (o.legenda as EstiloTake['legenda']) : ESTILO_OMISSAO.legenda
  const db = Number(o.musica_db)
  return {
    legenda,
    musica_db: Number.isFinite(db) ? Math.max(-40, Math.min(-6, Math.round(db))) : ESTILO_OMISSAO.musica_db,
    duck: typeof o.duck === 'boolean' ? o.duck : ESTILO_OMISSAO.duck,
    pausas: typeof o.pausas === 'boolean' ? o.pausas : ESTILO_OMISSAO.pausas,
    pb_auto: typeof o.pb_auto === 'boolean' ? o.pb_auto : ESTILO_OMISSAO.pb_auto,
    pop_up: typeof o.pop_up === 'boolean' ? o.pop_up : ESTILO_OMISSAO.pop_up,
  }
}

/** Ao reabrir: que palavras ficaram dentro das zonas cortadas (meio da palavra dentro do corte). */
export function riscadasDe(palavras: Palavra[], cortes: Corte[]): Set<number> {
  const out = new Set<number>()
  palavras.forEach((p, i) => {
    const m = (p.ini + p.fim) / 2
    if (cortes.some((c) => m > c.ini && m < c.fim)) out.add(i)
  })
  return out
}
