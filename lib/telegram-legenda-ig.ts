/**
 * LEGENDAS DE POSTS DO INSTAGRAM REPUBLICADOS NO TELEGRAM — sem menções que fogem para fora.
 *
 * O DEFEITO (06/11/2026, reportado pelo dono): os posts terminavam em «📸 @morethanmoney.pt». O
 * Telegram lê «@morethanmoney» como um utilizador DO TELEGRAM e liga-o — o «.pt» fica de fora. Quem
 * carregava ia parar à conta de um desconhecido. O mesmo com qualquer @handle vindo do Instagram.
 *
 * A REGRA: num texto que vem do Instagram, um @handle é do INSTAGRAM. Vira um link explícito para
 * instagram.com, sem «@» à vista, para o Telegram não o reinterpretar. Tudo o resto é escapado
 * (parse_mode HTML), e a legenda reescrita pela IA só passa se estiver em PT-PT.
 */
import { AVISO_EDUCATIVO, peneira } from '@/lib/marketing/regras'

export const escaparHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function linkInstagram(handle: string): string {
  const h = handle.replace(/^@/, '').replace(/[.]+$/, '')
  return `<a href="https://www.instagram.com/${encodeURIComponent(h)}/">instagram.com/${escaparHtml(h)}</a>`
}

/** Escapa o texto e troca cada @handle por um link para o Instagram. */
export function desarmarMencoes(texto: string): string {
  return escaparHtml(texto).replace(/(^|[^\w@/])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?)/g, (_, antes, h) => `${antes}${linkInstagram(h)}`)
}

/** Marcas de português do Brasil que a peneira da casa ainda não apanha. */
const PT_BR = /(^|[^\p{L}])(seus?|suas?|junte-se|voc[eê]s?|cadastr\w*|confira|baixe|clique aqui|time de)(?![\p{L}])/iu

export function legendaAceitavel(texto: string): boolean {
  if (!texto.trim()) return false
  if (PT_BR.test(texto)) return false
  // O aviso educativo acrescenta-se a seguir; tudo o resto que a peneira apanha deita a legenda fora.
  return peneira(texto).filter((m) => !m.startsWith('fala de trading')).length === 0
}

/**
 * A legenda final: a reescrita da IA se estiver limpa, senão uma legenda neutra. O handle de origem
 * sai sempre como link para o Instagram. Fala de trading → leva o aviso educativo.
 */
export function legendaDoPost(sugerida: string, username: string): string {
  const limpa = legendaAceitavel(sugerida) ? sugerida.trim() : 'Mais uma publicação no nosso Instagram. Vê o post completo no botão abaixo 👇'
  // Corta ANTES de escapar e ligar, para nunca partir uma etiqueta HTML (legenda de foto: 1024).
  const base = limpa.length > 700 ? limpa.slice(0, 700).replace(/\s+\S*$/, '') + '…' : limpa
  let corpo = desarmarMencoes(base)
  if (/\b(trading|trade|pips?|forex|ouro|sinais?|scanner|corretora|resultados?)\b/i.test(base) && !base.includes('consultoria')) {
    corpo += `\n\n<i>${AVISO_EDUCATIVO}</i>`
  }
  return `${corpo}\n\n📸 ${linkInstagram(username)}`
}
