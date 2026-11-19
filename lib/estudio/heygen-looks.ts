/**
 * O CLONE DO RICARDO NA HEYGEN (19/11/2026): IDs dos looks e da voz, e que look entra em cada plano
 * do guião. Não são segredos (só a chave da API é, e essa fica em HEYGEN_API_KEY na Vercel).
 * As variáveis HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID, se existirem, mandam sobre estes valores.
 *
 * Twin = vídeo real dele (lábios mais naturais) → planos em que fala para a câmara.
 * Looks de foto = outros cenários → planos de apoio, para o reel não ficar sempre no mesmo sítio.
 */
export type TipoLook = 'twin' | 'foto'
export type Look = { id: string; tipo: TipoLook; nome: string; papel: string }

export const VOZ_RICARDO = 'd04d18d2a4ad473b82b6ce4bfa20f0f9' // «Ricardo Garcia PT-PT», clonada da amostra real

export const LOOKS = {
  twin: { id: '3d43ebba9ad248e1984401c6997a6d1e', tipo: 'twin', nome: 'Ricardo Garcia (Digital Twin)', papel: 'Fala para a câmara' },
  mentor: { id: 'e3b7d1109fad41ed8b03a768cb288744', tipo: 'foto', nome: 'Professional financial analyst in office', papel: 'O Mentor' },
  trader: { id: '9e6c76cd63024df880c51db41908b72f', tipo: 'foto', nome: 'Focused trader at his desk', papel: 'O Trader na secretária' },
  casual: { id: '64393d619ecb4af283d79d37e93a0944', tipo: 'foto', nome: 'Professional in white linen shirt', papel: 'O Casual' },
  podcast: { id: '03fbd5fc42a4466190f59f17a0da8906', tipo: 'foto', nome: 'Podcast host in studio', papel: 'Podcast' },
} as const satisfies Record<string, Look>
export type NomeLook = keyof typeof LOOKS

/**
 * Plano do guião → look, seguindo a intenção de cada plano (lib/conteudo-magnetico/guiao.ts → PLANOS):
 *  fechado  (cara e ombros, a frase forte)        → Twin em close-up
 *  medio    (da cintura para cima, explicar)      → Twin normal
 *  aberto   (corpo e espaço, situa quem vê)       → Casual (terraço, mais espaço)
 *  de_baixo (autoridade e prova)                  → Mentor (escritório)
 *  de_cima  (a dor, vulnerabilidade)              → Podcast (estúdio, mais íntimo)
 *  detalhe  (mãos, ecrã com o gráfico)            → Trader na secretária com os gráficos
 *  mao      (íntimo, bastidores)                  → Podcast
 * Planos desconhecidos caem no Twin.
 */
export const PLANO_LOOK: Record<string, { look: NomeLook; estilo: 'normal' | 'closeUp' }> = {
  fechado: { look: 'twin', estilo: 'closeUp' },
  medio: { look: 'twin', estilo: 'normal' },
  aberto: { look: 'casual', estilo: 'normal' },
  de_baixo: { look: 'mentor', estilo: 'normal' },
  de_cima: { look: 'podcast', estilo: 'normal' },
  detalhe: { look: 'trader', estilo: 'normal' },
  mao: { look: 'podcast', estilo: 'normal' },
}

export function lookDoPlano(plano: string | null | undefined, avatarEnv?: string | null): Look & { estilo: 'normal' | 'closeUp' | 'circle' } {
  const p = PLANO_LOOK[String(plano || '')] ?? { look: 'twin' as NomeLook, estilo: 'normal' as const }
  const look: Look = LOOKS[p.look]
  // Um Twin novo posto na Vercel substitui o de origem; os looks de foto ficam.
  return { ...(look.tipo === 'twin' && avatarEnv ? { ...look, id: avatarEnv } : look), estilo: p.estilo }
}

/** Personagem no formato da API v2 (/v2/video/generate). */
export function personagem(look: Look & { estilo?: 'normal' | 'closeUp' | 'circle' }) {
  const estilo = look.estilo || 'normal'
  if (look.tipo === 'twin') return { type: 'avatar', avatar_id: look.id, avatar_style: estilo }
  return estilo === 'circle'
    ? { type: 'talking_photo', talking_photo_id: look.id, talking_photo_style: 'circle', scale: 0.45, offset: { x: 0.28, y: 0.32 } }
    : { type: 'talking_photo', talking_photo_id: look.id }
}

/**
 * Uma cena = um segmento do guião. `visual` manda: «apresentador» é o clone no look do plano;
 * «b_roll»/«cartao» com media_url é essa imagem/vídeo a ecrã inteiro com o clone numa bolha a falar
 * (o mesmo look do plano); sem media_url fica o look do plano. `audio_url` é a voz da Fish.
 */
export type Cena = {
  texto: string
  plano?: string | null
  visual?: string | null
  media_url?: string | null
  audio_url?: string | null
}

const VIDEO = /\.(mp4|mov|webm)(\?|$)/i

/** Segmentos do guião (reel.segmentos[]) → cenas com fala. Os segmentos sem fala saem. */
export function cenasDoGuiao(guiao: any): Cena[] {
  const segs = Array.isArray(guiao?.reel?.segmentos) ? guiao.reel.segmentos : []
  return segs
    .map((s: any): Cena => ({
      texto: String(s?.fala ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500),
      plano: s?.plano ?? null,
      visual: s?.visual ?? 'apresentador',
      media_url: typeof s?.media_url === 'string' && /^https:\/\//.test(s.media_url) ? s.media_url : null,
    }))
    .filter((c: Cena) => c.texto)
}

/** Uma cena no formato da API v2: personagem, voz (áudio da Fish ou texto) e fundo. */
export function entradaDaCena(c: Cena, voz: string, avatarEnv?: string | null) {
  const look = lookDoPlano(c.plano, avatarEnv)
  const sobreMedia = c.visual !== 'apresentador' && !!c.media_url
  // A bolha só existe nos looks de foto; o Twin sobre media passa para o look de detalhe.
  const quem = sobreMedia ? { ...(look.tipo === 'twin' ? { ...LOOKS.trader } : look), estilo: 'circle' as const } : look
  return {
    character: personagem(quem),
    voice: c.audio_url
      ? { type: 'audio', audio_url: c.audio_url }
      : { type: 'text', input_text: c.texto.slice(0, 1500), voice_id: voz },
    ...(sobreMedia
      ? { background: VIDEO.test(c.media_url!) ? { type: 'video', url: c.media_url, play_style: 'loop' } : { type: 'image', url: c.media_url } }
      : {}),
  }
}
