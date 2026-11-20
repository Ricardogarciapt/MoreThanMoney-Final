import { FPS, OURO, OURO_CLARO, FUNDO as FUNDO_MARCA, MARCA } from '../../motor/marca'
import mtm from '../../../../motor/marcas/morethanmoney.json'
// Landing do Ricardo (/ricardogarcia). Render: bash video/cinematico/render.sh LandingRicardo ricardo-garcia --slug=landing
// Tempos em SEGUNDOS da voz: raw.mp4 = p1 (47,0 s) + p2 (28,65 s) da HeyGen, look horizontal, juntos sem pausa.
// Afinados pelas legendas p1.srt/p2.srt (os de p2 levam +47 s). v3 de 20/11/2026.
export const INTRO = 2.4          // s antes da voz
export const OUTRO = 5.0          // s depois da voz
export const VOZ = 75.65
export const J = 47.0             // junção p1 → p2
export const T = {
  ola: [0.26, 1.6],
  destrui: [1.79, 4.97],
  porto: [5.25, 8.53],
  dezasseis: [8.7, 13.11],
  militar: [13.39, 21.4],
  exercito: 14.88, fuzileiros: 16.46, gnr: 18.45, catorze: 20.16,
  sonho: [21.52, 25.21],
  liliana: [25.48, 28.98],
  constanca: [29.32, 30.96],
  casa: [31.24, 34.73],
  estado: [35.02, 36.55],
  transportes: [36.85, 38.64],
  liberdade: [38.85, 40.95],
  spt: [41.24, 44.04],
  destruir: [44.27, 45.45],
  construir: [45.68, 46.75],
  nasce: [J + 0.3, J + 4.04],
  missao: [J + 4.24, J + 10.81],
  preco: [J + 6.24, J + 10.81],
  caminhos: [J + 11.06, J + 19.45],
  aprender: J + 11.06, negocio: J + 13.22, trabalhar: J + 17.27,
  garantias: [J + 19.74, J + 24.38],
  cta: [J + 24.68, J + 28.51],
} as const
export const f = (s: number) => Math.round((INTRO + s) * FPS)
export const TOTAL = Math.round((INTRO + VOZ + OUTRO) * FPS)
// Cores: destaque do perfil (ricardo-garcia = ciano) e o ouro da MoreThanMoney para o que é da MTM.
const C = MARCA.cores as Record<string, string>
export const CIANO = OURO, CIANO_CLARO = OURO_CLARO, AZUL = C.faixa ?? OURO, FUNDO = FUNDO_MARCA
export const MTM_OURO = mtm.cores.destaque, MTM_OURO_CLARO = mtm.cores.destaque2
export { FPS }
