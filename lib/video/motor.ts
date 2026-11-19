/**
 * MOTOR DE VÍDEO ÚNICO — lado do site (Next.js). Mesmos dados que video/motor/motor.mjs e motor.py:
 * formatos, codificação, volume e PERFIS DE MARCA. O site não renderiza; usa isto para escolher a
 * marca/formato nos pedidos ao motor (estúdio, HeyGen, Conteúdo Magnético) e para dar nomes de
 * saída coerentes.
 */
import CFG from '../../video/motor/formatos.json'
import morethanmoney from '../../video/motor/marcas/morethanmoney.json'
import ricardoGarcia from '../../video/motor/marcas/ricardo-garcia.json'
import modeloB2b from '../../video/motor/marcas/modelo-b2b.json'

export type PerfilMarca = {
  id: string
  aliases: string[]
  nome: string
  arroba: string
  daCasa: boolean
  cores: { fundo: string; fundo2: string; texto: string; destaque: string; destaque2: string; [k: string]: string }
  fontes: Record<string, { familia: string; ficheiro: string | null; maiusculas?: boolean; italico?: boolean }>
  logo: string | null
  grade: string
  legendas: { estilo: string; cor: string; destaque: string }
  disclaimer: string | null
  cta: { texto: string; url: string }
  regras: string[]
}

export const MARCAS_VIDEO: Record<string, PerfilMarca> = Object.fromEntries(
  [morethanmoney, ricardoGarcia, modeloB2b].map((m) => [m.id, m as unknown as PerfilMarca]),
)

/** Perfil por id ou alias; desconhecida → morethanmoney. */
export function perfilMarca(id?: string | null): PerfilMarca {
  const k = String(id || '').trim().toLowerCase()
  if (MARCAS_VIDEO[k]) return MARCAS_VIDEO[k]
  return Object.values(MARCAS_VIDEO).find((m) => m.aliases.includes(k)) || MARCAS_VIDEO.morethanmoney
}

export const FPS_VIDEO: number = CFG.fps
export const LUFS_VIDEO: number = CFG.volume.lufs

/** Formato por nome ou alias ('9:16', 'reel', 'youtube'…). */
export function formatoVideo(nome = 'reel'): { nome: string; largura: number; altura: number } {
  const k = String(nome).toLowerCase()
  for (const [id, f] of Object.entries(CFG.formatos) as [string, { largura: number; altura: number; aliases: string[] }][]) {
    if (id === k || f.aliases.includes(k)) return { nome: id, largura: f.largura, altura: f.altura }
  }
  return { nome: 'reel', largura: CFG.formatos.reel.largura, altura: CFG.formatos.reel.altura }
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'video'

/** Chave no Storage: renders/<marca>/<produto>/<ficheiro> (mesma regra do motor). */
export function chaveRender(marca: string, produto: string, ficheiro: string): string {
  return [CFG.saida.prefixo_storage, perfilMarca(marca).id, slug(produto), ficheiro.split('/').pop()].join('/')
}
