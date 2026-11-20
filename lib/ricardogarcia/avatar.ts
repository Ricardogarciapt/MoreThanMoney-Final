// Avatar da app do Ricardo: foto de perfil ou um avatar montado na app (emblema + fundo + moldura).
// O avatar montado é um SVG gerado aqui, só a partir de opções fechadas, e fica em profiles.avatar_url,
// por isso aparece também na app MTM, no chat e no RPG.
import { db } from '@/lib/ricardogarcia/app'

export const ROSTOS = ['🦁', '🐺', '🦅', '🐉', '🐻', '🦊', '🐯', '🦈', '🦉', '🐗', '🥷', '🧑‍🚀', '🧙', '🛡️', '⚔️', '🔥', '⚡', '🎯']
export const FUNDOS: Record<string, [string, string]> = {
  ouro: ['#E9C46A', '#7a5812'], ciano: ['#1EAAE6', '#0b2f57'], carvao: ['#2a3140', '#07080c'],
  azul: ['#1256BE', '#07080c'], verde: ['#3ccf8e', '#0b3b2a'], vinho: ['#b8485a', '#2a0b12'],
}
export const MOLDURAS: Record<string, string> = { ouro: '#E9C46A', ciano: '#1EAAE6', branco: '#f3f5f8', nenhuma: 'transparent' }

export function svgAvatar(rosto: string, fundo: string, moldura: string) {
  const r = ROSTOS.includes(rosto) ? rosto : ROSTOS[0]
  const [a, b] = FUNDOS[fundo] || FUNDOS.ouro
  const m = MOLDURAS[moldura] ?? MOLDURAS.ouro
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><radialGradient id="g" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><circle cx="128" cy="128" r="124" fill="url(#g)"/><circle cx="128" cy="128" r="118" fill="none" stroke="${m}" stroke-width="8"/><text x="128" y="128" font-size="128" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${r}</text></svg>`
}

async function subir(caminho: string, corpo: Buffer, tipo: string) {
  const { error } = await db().storage.from('uploads').upload(caminho, corpo, { contentType: tipo, upsert: true, cacheControl: '3600' })
  if (error) return null
  return db().storage.from('uploads').getPublicUrl(caminho).data.publicUrl
}

export async function guardarAvatar(membroId: string, b: any): Promise<{ url?: string; erro?: string }> {
  const quando = Date.now().toString(36)
  let url: string | null = null
  if (b?.tipo === 'foto') {
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.imagem || ''))
    if (!m) return { erro: 'A imagem não é válida. Usa JPG, PNG ou WebP.' }
    const buf = Buffer.from(m[3], 'base64')
    if (buf.length > 3 * 1024 * 1024) return { erro: 'A foto é grande demais (máx. 3 MB).' }
    url = await subir(`avatars/${membroId}/${quando}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`, buf, m[1])
  } else {
    url = await subir(`avatars/${membroId}/${quando}.svg`, Buffer.from(svgAvatar(String(b?.rosto || ''), String(b?.fundo || ''), String(b?.moldura || ''))), 'image/svg+xml')
    await db().from('rg_app_membros').update({ avatar: { rosto: b?.rosto, fundo: b?.fundo, moldura: b?.moldura } }).eq('id', membroId)
  }
  if (!url) return { erro: 'Não consegui guardar. Tenta outra vez.' }
  await db().from('profiles').update({ avatar_url: url }).eq('id', membroId)
  return { url }
}
