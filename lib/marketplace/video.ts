/**
 * O VÍDEO DE APRESENTAÇÃO de um produto (211) — `marketplace_produtos.video_url`.
 *
 * É PÚBLICO: aparece na ficha a quem ainda está a decidir. Não confundir com `conteudo_url`, que é
 * o que se compra e nunca sai na montra.
 *
 * Duas formas, e só duas: um ficheiro (mp4) servido por https, que vai para um `<video>`; ou um
 * vídeo do YouTube, que vai para um embed. Tudo o resto recusa-se ao gravar — um link que a ficha
 * não sabe desenhar é um buraco na página, não um vídeo.
 */
import { youtubeId } from '@/lib/social/youtube'

/** Valida o que vem do formulário. Vazio = sem vídeo (apaga). */
export function videoParaGravar(v: unknown): { ok: true; url: string | null } | { ok: false; erro: string } {
  const url = String(v ?? '').trim()
  if (!url) return { ok: true, url: null }
  let u: URL
  try { u = new URL(url) } catch { return { ok: false, erro: 'O link do vídeo não é um endereço válido.' } }
  if (u.protocol !== 'https:') return { ok: false, erro: 'O link do vídeo tem de começar por https://' }
  return { ok: true, url }
}

export type VideoNaFicha = { tipo: 'youtube'; embed: string } | { tipo: 'ficheiro'; url: string }

/** Como a ficha desenha o vídeo. `null` = não desenha nada. */
export function comoMostrarVideo(url: string | null | undefined): VideoNaFicha | null {
  const v = videoParaGravar(url)
  if (!v.ok || !v.url) return null
  const id = youtubeId(v.url)
  if (id) return { tipo: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` }
  return { tipo: 'ficheiro', url: v.url }
}
