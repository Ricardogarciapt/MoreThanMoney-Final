// Idiomas de legenda das sessões ao vivo.
// Conjunto fixo pré-traduzido (server-side) + idioma de origem (transcrição crua),
// alinhado com o dicionário i18n do app (cookie mtm_lang).

/** Idiomas-alvo sempre traduzidos por sessão (além do idioma de origem). */
export const CAPTION_TARGET_LANGUAGES = ['pt', 'en', 'es', 'fr', 'de'] as const
export type CaptionLanguage = (typeof CAPTION_TARGET_LANGUAGES)[number] | string

/** Nome legível de cada idioma (para o seletor). */
export const CAPTION_LANGUAGE_LABELS: Record<string, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
}

/** Conjunto efetivo de idiomas de uma sessão = origem + alvos fixos (deduplicado). */
export function captionLanguagesFor(sourceLanguage: string): string[] {
  const src = (sourceLanguage || 'pt').toLowerCase().slice(0, 2)
  const out = [src, ...CAPTION_TARGET_LANGUAGES.filter((l) => l !== src)]
  return Array.from(new Set(out))
}

/** Idiomas-alvo a traduzir (exclui o idioma de origem — esse é o texto cru). */
export function translationTargetsFor(sourceLanguage: string): string[] {
  const src = (sourceLanguage || 'pt').toLowerCase().slice(0, 2)
  return CAPTION_TARGET_LANGUAGES.filter((l) => l !== src)
}
