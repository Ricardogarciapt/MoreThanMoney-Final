/**
 * Lista CANÓNICA de idiomas — uma só, para todos os seletores.
 *
 * Andavam duas cópias: a do seletor da navbar e a implícita em `I18N_LANGS`. Bastava alguém
 * acrescentar um idioma ao dicionário para ele nunca aparecer na lista (ou o contrário), e o
 * cliente ficava com um seletor que não corresponde ao que o site sabe traduzir.
 *
 * A ordem é a que se mostra: primeiro os mercados onde vendemos, depois o resto por nome.
 */
import { I18N_LANGS, type Lang } from "./config"

export interface LanguageOption {
  code: Lang
  /** Nome no próprio idioma — é assim que uma pessoa encontra o dela numa lista. */
  nativeName: string
  /** Nome em inglês — serve de apoio quando o alfabeto não é familiar. */
  name: string
  flag: string
}

const NOMES: Record<Lang, { nativeName: string; name: string; flag: string }> = {
  pt: { nativeName: "Português", name: "Portuguese", flag: "🇵🇹" },
  en: { nativeName: "English", name: "English", flag: "🇬🇧" },
  es: { nativeName: "Español", name: "Spanish", flag: "🇪🇸" },
  de: { nativeName: "Deutsch", name: "German", flag: "🇩🇪" },
  fr: { nativeName: "Français", name: "French", flag: "🇫🇷" },
  it: { nativeName: "Italiano", name: "Italian", flag: "🇮🇹" },
  nl: { nativeName: "Nederlands", name: "Dutch", flag: "🇳🇱" },
  "zh-CN": { nativeName: "中文 (简体)", name: "Chinese (Simplified)", flag: "🇨🇳" },
  ja: { nativeName: "日本語", name: "Japanese", flag: "🇯🇵" },
  ar: { nativeName: "العربية", name: "Arabic", flag: "🇸🇦" },
  ru: { nativeName: "Русский", name: "Russian", flag: "🇷🇺" },
  hi: { nativeName: "हिंदी", name: "Hindi", flag: "🇮🇳" },
  sr: { nativeName: "Српски", name: "Serbian", flag: "🇷🇸" },
  hr: { nativeName: "Hrvatski", name: "Croatian", flag: "🇭🇷" },
  bs: { nativeName: "Bosanski", name: "Bosnian", flag: "🇧🇦" },
  sq: { nativeName: "Shqip", name: "Albanian", flag: "🇦🇱" },
  bg: { nativeName: "Български", name: "Bulgarian", flag: "🇧🇬" },
  ro: { nativeName: "Română", name: "Romanian", flag: "🇷🇴" },
  pl: { nativeName: "Polski", name: "Polish", flag: "🇵🇱" },
  uk: { nativeName: "Українська", name: "Ukrainian", flag: "🇺🇦" },
  tr: { nativeName: "Türkçe", name: "Turkish", flag: "🇹🇷" },
}

/** Mercados prioritários — os mesmos cinco do guia de onboarding, e por esta ordem. */
export const PRIORITY_LANGS: Lang[] = ["pt", "en", "es", "de", "fr"]

export const LANGUAGES: LanguageOption[] = I18N_LANGS.map((code) => ({
  code,
  ...NOMES[code],
}))

export const PRIORITY_LANGUAGES: LanguageOption[] = PRIORITY_LANGS.map(
  (c) => LANGUAGES.find((l) => l.code === c)!,
)
export const OTHER_LANGUAGES: LanguageOption[] = LANGUAGES.filter(
  (l) => !PRIORITY_LANGS.includes(l.code),
).sort((a, b) => a.nativeName.localeCompare(b.nativeName))

export function languageOption(code: string): LanguageOption | undefined {
  return LANGUAGES.find((l) => l.code === code)
}
