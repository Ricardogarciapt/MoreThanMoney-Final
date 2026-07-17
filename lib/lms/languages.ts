/**
 * Idiomas suportados no LMS (educadores/salas/horários) — espelham os 21 idiomas do
 * seletor do site (components/language-selector-enhanced.tsx). O idioma vive no EDUCADOR
 * (default 'pt'); as suas salas e horários herdam-no. Usado para separar o schedule por
 * idioma e para o seletor de idioma na criação/edição de educador.
 */
export interface LmsLanguage {
  code: string
  name: string
  flag: string
}

export const LMS_LANGUAGES: LmsLanguage[] = [
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
  { code: 'bs', name: 'Bosnian', flag: '🇧🇦' },
  { code: 'sq', name: 'Albanian', flag: '🇦🇱' },
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
]

export const LMS_LANGUAGE_CODES = LMS_LANGUAGES.map((l) => l.code)

export const DEFAULT_LMS_LANGUAGE = 'pt'

export function normalizeLmsLanguage(code: string | null | undefined): string {
  const c = String(code ?? '').trim()
  return LMS_LANGUAGE_CODES.includes(c) ? c : DEFAULT_LMS_LANGUAGE
}

export function lmsLanguageLabel(code: string | null | undefined): string {
  const l = LMS_LANGUAGES.find((x) => x.code === normalizeLmsLanguage(code))
  return l ? `${l.flag} ${l.name}` : '🇵🇹 Português'
}

export function lmsLanguageFlag(code: string | null | undefined): string {
  return LMS_LANGUAGES.find((x) => x.code === normalizeLmsLanguage(code))?.flag ?? '🇵🇹'
}
