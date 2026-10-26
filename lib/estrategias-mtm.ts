/**
 * ESTRATÉGIAS MTM — a sala com os vídeos e os guias de cada estratégia dos scanners.
 *
 * Vive no canal do educador MTM (/live/9739ae1a…), ao lado das salas da XTB. Antes, a playlist
 * desta sala entrava no card de cursos do educador misturada com os cursos da XTB, e os doze
 * materiais (seis guias e seis playlists) apareciam numa lista corrida. Agora a sala tem a sua
 * própria secção, com capa, e um cartão por estratégia.
 *
 * Os nomes das estratégias não se traduzem. As playlists EN ficam a null até existirem: o cartão
 * mostra só a versão PT enquanto isso.
 */

export type Lingua = "pt" | "en"

export type EstrategiaMtm = {
  slug: string
  nome: string
  resumo: Record<Lingua, string>
  /** Playlist pública com os três vídeos (o que é, confirmações, na prática). */
  playlist: Record<Lingua, string | null>
  /** Guia em PDF, servido pelo próprio site. */
  guia: Record<Lingua, string>
}

/** A sala (lms_streams) cujos vídeos e materiais esta secção substitui no card de cursos. */
export const SALA_ESTRATEGIAS_ID = "4516fcc0-aea3-4dc3-b1bf-67116e91cfcd"

const BASE = "/educador/estrategias"

export const capaEstrategia = (slug: string, lingua: Lingua) => `${BASE}/capas/${slug}-${lingua}.jpg`
export const capaSala = (lingua: Lingua) => `${BASE}/capas/sala-${lingua}.jpg`

const guias = (slug: string): Record<Lingua, string> => ({
  pt: `${BASE}/${slug}-guia.pdf`,
  en: `${BASE}/${slug}-guide-en.pdf`,
})

export const ESTRATEGIAS_MTM: EstrategiaMtm[] = [
  {
    slug: "golden-zone",
    nome: "Golden Zone",
    resumo: { pt: "Scalping de ouro em 5 minutos, com entrada no reteste da zona.", en: "Gold scalping on 5 minutes, entering on the zone retest." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLV0hwsHYlTJI", en: null },
    guia: guias("golden-zone"),
  },
  {
    slug: "momentum",
    nome: "Momentum",
    resumo: { pt: "Seguimento de direção por cores, com cinco confirmações.", en: "Direction-following by colour, with five confirmations." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLN4Z40YVHXW0", en: null },
    guia: guias("momentum"),
  },
  {
    slug: "trendshot",
    nome: "TrendShot",
    resumo: { pt: "Scalping a favor da tendência: médias, estrelas e risco 1:2.", en: "Scalping with the trend: averages, stars and 1:2 risk." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLS4JA-NSNXVA", en: null },
    guia: guias("trendshot"),
  },
  {
    slug: "supernova",
    nome: "Supernova",
    resumo: { pt: "Reversões impulsivas: estrela, três velas e rompimento.", en: "Impulsive reversals: star, three candles and a break." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLI8Wz5hgwPPM", en: null },
    guia: guias("supernova"),
  },
  {
    slug: "sniper-pro",
    nome: "Sniper Pro",
    resumo: { pt: "Intradiário em 15 minutos, com a tendência das 4 horas a decidir.", en: "Intraday on 15 minutes, with the 4 hour trend deciding." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLCTmB_PinI90", en: null },
    guia: guias("sniper-pro"),
  },
  {
    slug: "quantum",
    nome: "Quantum",
    resumo: { pt: "Tendência e recuos, com o painel de força por timeframe.", en: "Trend and pullbacks, with the strength panel per timeframe." },
    playlist: { pt: "https://www.youtube.com/playlist?list=PLC18FgHeGfwU", en: null },
    guia: guias("quantum"),
  },
]
