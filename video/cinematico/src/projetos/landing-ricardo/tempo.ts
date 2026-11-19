import { FPS, OURO, OURO_CLARO, FUNDO as FUNDO_MARCA, MARCA } from '../../motor/marca'
import mtm from '../../../../motor/marcas/morethanmoney.json'
// Landing do Ricardo (/marca/ricardogarciapt). Render: bash video/cinematico/render.sh LandingRicardo ricardo-garcia --slug=landing
// Tempos em SEGUNDOS da voz (raw.mp4 da HeyGen). Afinados pelas legendas (sub2.srt, vídeo 58,48 s).
export const INTRO = 3.2          // s antes da voz
export const OUTRO = 4.5          // s depois da voz
export const VOZ = 58.48
export const T = {
  ola: [0.3, 1.9],
  farda: [2.09, 5.9],
  ocupado: [6.06, 9.5],
  nov: [9.6, 18.4],
  digital: [18.55, 20.3],
  barco: [20.42, 26.4],
  codigo: [26.55, 30.8],
  deixei: [30.95, 33.4],
  pilares: [33.58, 46.1],
  pilar1: 37.4, auto: 39.6, funded: 41.5, pilar2: 43.0,
  garantias: [46.28, 50.75],
  preco: [50.89, 53.9],
  cta: [53.99, 58.48],
} as const
export const f = (s: number) => Math.round((INTRO + s) * FPS)
export const TOTAL = Math.round((INTRO + VOZ + OUTRO) * FPS)
// Cores: destaque do perfil (ricardo-garcia = ciano) e o ouro da MoreThanMoney para o que é da MTM.
const C = MARCA.cores as Record<string, string>
export const CIANO = OURO, CIANO_CLARO = OURO_CLARO, AZUL = C.faixa ?? OURO, FUNDO = FUNDO_MARCA
export const MTM_OURO = mtm.cores.destaque, MTM_OURO_CLARO = mtm.cores.destaque2
export { FPS }
