/**
 * O CLONE DO RICARDO NA HEYGEN (19/11/2026): IDs dos looks e da voz, e que look entra em cada plano
 * do guião. Não são segredos (só a chave da API é, e essa fica em HEYGEN_API_KEY na Vercel).
 * As variáveis HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID, se existirem, mandam sobre estes valores.
 *
 * Twin = vídeo real dele (lábios mais naturais) → planos em que fala para a câmara.
 * Looks de foto = outros cenários → planos de apoio, para o reel não ficar sempre no mesmo sítio.
 */
export type TipoLook = 'twin' | 'foto'
export type Look = { id: string; tipo: TipoLook; nome: string; estilo: string }

export const VOZ_RICARDO = 'd04d18d2a4ad473b82b6ce4bfa20f0f9' // «Ricardo Garcia PT-PT», clonada da amostra real

export const LOOKS = {
  twin: { id: '3d43ebba9ad248e1984401c6997a6d1e', tipo: 'twin', nome: 'Ricardo Garcia (Digital Twin)', estilo: 'Fala para a câmara' },
  mentor: { id: 'e3b7d1109fad41ed8b03a768cb288744', tipo: 'foto', nome: 'Professional financial analyst in office', estilo: 'O Mentor' },
  trader: { id: '9e6c76cd63024df880c51db41908b72f', tipo: 'foto', nome: 'Focused trader at his desk', estilo: 'O Trader na secretária' },
  casual: { id: '64393d619ecb4af283d79d37e93a0944', tipo: 'foto', nome: 'Professional in white linen shirt', estilo: 'O Casual' },
  podcast: { id: '03fbd5fc42a4466190f59f17a0da8906', tipo: 'foto', nome: 'Podcast host in studio', estilo: 'Podcast' },
} as const satisfies Record<string, Look>
export type NomeLook = keyof typeof LOOKS

/**
 * Plano do guião → look. Os planos «de câmara» (fechado, médio) ficam no Twin; os outros alternam
 * cenários. Planos desconhecidos caem no Twin.
 */
export const PLANO_LOOK: Record<string, NomeLook> = {
  fechado: 'twin',
  medio: 'twin',
  aberto: 'casual',
  de_cima: 'trader',
  detalhe: 'trader',
  mao: 'trader',
  de_baixo: 'mentor',
}

export function lookDoPlano(plano: string | null | undefined, avatarEnv?: string | null): Look {
  const nome = PLANO_LOOK[String(plano || '')] ?? 'twin'
  const look: Look = LOOKS[nome]
  // Um Twin novo posto na Vercel substitui o de origem; os looks de foto ficam.
  return look.tipo === 'twin' && avatarEnv ? { ...look, id: avatarEnv } : look
}

/** Personagem no formato da API v2 (/v2/video/generate). */
export function personagem(look: Look) {
  return look.tipo === 'twin'
    ? { type: 'avatar', avatar_id: look.id, avatar_style: 'normal' }
    : { type: 'talking_photo', talking_photo_id: look.id }
}

export type Cena = { texto: string; plano?: string | null }

/** Segmentos do guião (reel.segmentos[]) → cenas com fala. Os segmentos sem fala saem. */
export function cenasDoGuiao(guiao: any): Cena[] {
  const segs = Array.isArray(guiao?.reel?.segmentos) ? guiao.reel.segmentos : []
  return segs
    .map((s: any) => ({ texto: String(s?.fala ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500), plano: s?.plano ?? null }))
    .filter((c: Cena) => c.texto)
}
