import { ALL_MESSAGES } from "./registry"
import type { MessageKey } from "./messages"
import { DEFAULT_LANG, type Lang } from "./config"
import { textoAuto } from "./auto-cliente"

/**
 * Traduz uma chave para o idioma dado.
 * Ordem: dicionário à mão → tradução automática (IA, ver auto-cliente) → inglês → PT → a chave.
 * O inglês vem antes do PT para quem não fala português: um alemão percebe melhor «Save» do que «Guardar».
 */
export function translate(key: MessageKey, lang: Lang): string {
  const dict = ALL_MESSAGES[lang]?.[key]
  if (dict !== undefined) return dict
  if (lang === DEFAULT_LANG) return key
  return textoAuto(lang, key) ?? ALL_MESSAGES.en?.[key] ?? ALL_MESSAGES[DEFAULT_LANG]?.[key] ?? key
}
