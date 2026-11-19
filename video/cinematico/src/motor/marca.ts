// Perfil de marca do motor cinemático. Vem do motor de vídeo único (video/motor/marcas/*.json) e
// escolhe-se no render: npx remotion render src/index.ts Solucoes out.mp4 --props='{"marca":"ricardo-garcia"}'
import { getInputProps, staticFile } from 'remotion'
import morethanmoney from '../../../motor/marcas/morethanmoney.json'
import ricardoGarcia from '../../../motor/marcas/ricardo-garcia.json'
import modeloB2b from '../../../motor/marcas/modelo-b2b.json'
import formatos from '../../../motor/formatos.json'

type Perfil = typeof morethanmoney & { logo_video?: string | null }
const TODAS: Perfil[] = [morethanmoney, ricardoGarcia, modeloB2b] as Perfil[]

const props = getInputProps() as { marca?: string; formato?: string; cliente?: Partial<Perfil> }
const pedido = String(props.marca || 'morethanmoney').toLowerCase()
const base = TODAS.find((m) => m.id === pedido || (m.aliases as string[]).includes(pedido)) || morethanmoney
/** Perfil activo. Para um cliente B2B sem ficheiro próprio, --props '{"marca":"modelo-b2b","cliente":{…}}'. */
export const MARCA: Perfil = { ...base, ...(props.cliente || {}), cores: { ...base.cores, ...(props.cliente?.cores || {}) } } as Perfil

export const OURO = MARCA.cores.destaque
export const OURO_CLARO = MARCA.cores.destaque2
export const FUNDO = MARCA.cores.fundo
/** Logótipo do vídeo (relativo a public/); null = a marca não tem (clientes sem logo: nada da MTM aparece). */
export const LOGO: string | null = MARCA.logo_video ?? null
export const FPS = formatos.fps

const fmt = Object.entries(formatos.formatos).find(([id, f]) => id === props.formato || f.aliases.includes(String(props.formato)))
/** Formato pedido em --props (omissão: o do projecto). */
export const formatoPedido = (omissao: 'youtube' | 'reel' = 'youtube') => {
  const f = fmt ? fmt[1] : formatos.formatos[omissao]
  return { width: f.largura, height: f.altura }
}

/** @font-face das fontes da marca (public/fontes → video/motor/fontes). */
export const FONTES_CSS = Object.values(MARCA.fontes as Record<string, { familia: string; ficheiro: string | null }>)
  .filter((f) => f.ficheiro)
  .map((f) => `@font-face{font-family:'${f.familia}';src:url('${staticFile(f.ficheiro as string)}') format('truetype');}`)
  .join('')

/** Cor de destaque da marca com transparência (substitui os rgba(210,166,60,a) fixos das cenas). */
export const ouro = (a: number) => `color-mix(in srgb, ${OURO} ${Math.round(a * 100)}%, transparent)`
export const ouroClaro = (a: number) => `color-mix(in srgb, ${OURO_CLARO} ${Math.round(a * 100)}%, transparent)`
