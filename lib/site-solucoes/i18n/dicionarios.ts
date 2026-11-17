/**
 * Os dicionários do /solucoes, só do lado do servidor. A página passa ao browser apenas o do idioma
 * escolhido (ver components/solucoes/idioma.tsx).
 */
import en from './en.json'
import de from './de.json'
import fr from './fr.json'
import it from './it.json'
import type { Dicionario, Idioma } from './base'

export const DICIONARIOS: Record<Exclude<Idioma, 'pt'>, Dicionario> = { en, de, fr, it }

export function dicionario(idioma: Idioma): Dicionario {
  return idioma === 'pt' ? {} : DICIONARIOS[idioma]
}
