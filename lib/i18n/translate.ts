import { MESSAGES, type MessageKey } from "./messages"
import { DEFAULT_LANG, type Lang } from "./config"

/** Traduz uma chave para o idioma dado. Chave/idioma em falta → cai para PT → a própria chave. */
export function translate(key: MessageKey, lang: Lang): string {
  return MESSAGES[lang]?.[key] ?? MESSAGES[DEFAULT_LANG][key] ?? key
}
