// Linha de tempo única: o vídeo (Remotion) e o som (gerar-som.py) lêem daqui.
export const FPS = 30
export const CENAS = {
  relogio: { de: 0, dur: 180 },
  caos: { de: 180, dur: 240 },
  transforma: { de: 420, dur: 330 },
  automacao: { de: 750, dur: 420 },
  formacao: { de: 1170, dur: 360 },
  liberdade: { de: 1530, dur: 210 },
  cta: { de: 1740, dur: 210 },
} as const
export const TOTAL = 1950
// Cores: vêm do perfil de marca escolhido no render (--props '{"marca":"…"}'), não daqui.
export { OURO, OURO_CLARO, FUNDO } from '../../motor/marca'
