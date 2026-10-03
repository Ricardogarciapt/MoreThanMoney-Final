// Idiomas de legenda das sessões ao vivo — alinhado com os 21 idiomas do app (mtm_lang).
// Transcrição no idioma de origem + tradução (pré-traduz um conjunto núcleo no ingest;
// os restantes idiomas são traduzidos ON-DEMAND e cacheados quando um espetador os pede).

/** Todos os idiomas oferecidos no seletor de legendas (= idiomas do site). */
export const CAPTION_LANGUAGES = [
  'pt', 'en', 'es', 'fr', 'de', 'it', 'nl', 'zh-CN', 'ja', 'ar',
  'ru', 'hi', 'sr', 'hr', 'bs', 'sq', 'bg', 'ro', 'pl', 'uk', 'tr',
] as const
export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number] | string

/** Núcleo pré-traduzido já no ingest (idiomas mais comuns → aparecem instantâneos). */
export const CAPTION_TARGET_LANGUAGES = ['pt', 'en', 'es', 'fr', 'de'] as const

/** Nome legível de cada idioma (para o seletor). */
export const CAPTION_LANGUAGE_LABELS: Record<string, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  'zh-CN': '中文',
  ja: '日本語',
  ar: 'العربية',
  ru: 'Русский',
  hi: 'हिन्दी',
  sr: 'Српски',
  hr: 'Hrvatski',
  bs: 'Bosanski',
  sq: 'Shqip',
  bg: 'Български',
  ro: 'Română',
  pl: 'Polski',
  uk: 'Українська',
  tr: 'Türkçe',
}

/** Normaliza um código para a forma canónica (ex.: en-US → en, zh → zh-CN). */
export function normalizeCaptionLang(l: string): string {
  const s = (l || '').trim()
  if (s.toLowerCase().startsWith('zh')) return 'zh-CN'
  return s.slice(0, 2).toLowerCase()
}

/** Conjunto do seletor: origem primeiro, depois todos os idiomas (deduplicado). */
export function captionLanguagesFor(sourceLanguage: string): string[] {
  const src = normalizeCaptionLang(sourceLanguage || 'pt')
  return Array.from(new Set([src, ...CAPTION_LANGUAGES]))
}

/** Idiomas-alvo pré-traduzidos no ingest (exclui o de origem — esse é o texto cru). */
export function translationTargetsFor(sourceLanguage: string): string[] {
  const src = normalizeCaptionLang(sourceLanguage || 'pt')
  return CAPTION_TARGET_LANGUAGES.filter((l) => l !== src)
}
