/**
 * i18n nativo (dicionário) — substitui o Google Translate por traduções embutidas.
 * Cobre o frontend do site (cliente) + /app-mobile (carregado pelas apps iOS/Android).
 * O idioma vem da preferência do utilizador (cookie `mtm_lang`, gravado pelos seletores
 * web e nativo), com fallback a localStorage/perfil/browser.
 */

export const I18N_LANGS = [
  "pt", "en", "es", "fr", "de", "it", "nl", "zh-CN", "ja", "ar",
  "ru", "hi", "sr", "hr", "bs", "sq", "bg", "ro", "pl", "uk", "tr",
] as const

export type Lang = (typeof I18N_LANGS)[number]

export const DEFAULT_LANG: Lang = "pt"

/** Cookie único lido pelo i18n (web + apps nativas escrevem-no). */
export const I18N_COOKIE = "mtm_lang"
/** Chave de compatibilidade com o seletor web existente. */
export const I18N_LOCAL_STORAGE_KEY = "mtm_preferred_language"

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (I18N_LANGS as readonly string[]).includes(v)
}

export function normalizeLang(v: string | null | undefined): Lang {
  if (!v) return DEFAULT_LANG
  const raw = String(v).trim()
  if (isLang(raw)) return raw
  // tolera variantes (ex.: "en-US" → "en", "zh" → "zh-CN")
  const base = raw.split(/[-_]/)[0].toLowerCase()
  if (base === "zh") return "zh-CN"
  if (isLang(base)) return base as Lang
  return DEFAULT_LANG
}

export const RTL_LANGS: Lang[] = ["ar"]
export function isRtl(lang: Lang): boolean {
  return RTL_LANGS.includes(lang)
}
