import { ALL_MESSAGES } from "./registry"
import type { MessageKey } from "./messages"
import { DEFAULT_LANG, type Lang } from "./config"

/** Traduz uma chave para o idioma dado. Chave/idioma em falta → cai para PT → a própria chave. */
export function translate(key: MessageKey, lang: Lang): string {
  return ALL_MESSAGES[lang]?.[key] ?? ALL_MESSAGES[DEFAULT_LANG]?.[key] ?? key
}
