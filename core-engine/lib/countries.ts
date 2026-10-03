import type { Lang } from "@/lib/i18n/config"

/**
 * Lista curada de países → idioma por defeito (um dos 21 idiomas do dicionário do site).
 * Usada no registo para capturar `country` (dados singulares) e derivar `preferred_language`,
 * que conduz a app, os emails e o suporte no idioma do membro.
 */
export interface Country {
  code: string // ISO 3166-1 alpha-2
  name: string // nome PT (o form é servido traduzido pelo dicionário via label)
  lang: Lang
}

export const COUNTRIES: Country[] = [
  // Português
  { code: "PT", name: "Portugal", lang: "pt" },
  { code: "BR", name: "Brasil", lang: "pt" },
  { code: "AO", name: "Angola", lang: "pt" },
  { code: "MZ", name: "Moçambique", lang: "pt" },
  { code: "CV", name: "Cabo Verde", lang: "pt" },
  // Español
  { code: "ES", name: "Espanha", lang: "es" },
  { code: "MX", name: "México", lang: "es" },
  { code: "AR", name: "Argentina", lang: "es" },
  { code: "CO", name: "Colômbia", lang: "es" },
  { code: "CL", name: "Chile", lang: "es" },
  { code: "PE", name: "Peru", lang: "es" },
  { code: "VE", name: "Venezuela", lang: "es" },
  { code: "UY", name: "Uruguai", lang: "es" },
  // English
  { code: "GB", name: "Reino Unido", lang: "en" },
  { code: "IE", name: "Irlanda", lang: "en" },
  { code: "US", name: "Estados Unidos", lang: "en" },
  { code: "CA", name: "Canadá", lang: "en" },
  { code: "AU", name: "Austrália", lang: "en" },
  { code: "ZA", name: "África do Sul", lang: "en" },
  // Français
  { code: "FR", name: "França", lang: "fr" },
  { code: "BE", name: "Bélgica", lang: "fr" },
  { code: "CH", name: "Suíça", lang: "fr" },
  { code: "LU", name: "Luxemburgo", lang: "fr" },
  // Deutsch
  { code: "DE", name: "Alemanha", lang: "de" },
  { code: "AT", name: "Áustria", lang: "de" },
  // Italiano
  { code: "IT", name: "Itália", lang: "it" },
  // Nederlands
  { code: "NL", name: "Países Baixos", lang: "nl" },
  // 中文
  { code: "CN", name: "China", lang: "zh-CN" },
  { code: "TW", name: "Taiwan", lang: "zh-CN" },
  // 日本語
  { code: "JP", name: "Japão", lang: "ja" },
  // العربية
  { code: "SA", name: "Arábia Saudita", lang: "ar" },
  { code: "AE", name: "Emirados Árabes Unidos", lang: "ar" },
  { code: "EG", name: "Egito", lang: "ar" },
  { code: "MA", name: "Marrocos", lang: "ar" },
  { code: "QA", name: "Catar", lang: "ar" },
  // Русский
  { code: "RU", name: "Rússia", lang: "ru" },
  { code: "KZ", name: "Cazaquistão", lang: "ru" },
  // हिन्दी
  { code: "IN", name: "Índia", lang: "hi" },
  // Balcãs
  { code: "RS", name: "Sérvia", lang: "sr" },
  { code: "HR", name: "Croácia", lang: "hr" },
  { code: "BA", name: "Bósnia e Herzegovina", lang: "bs" },
  { code: "AL", name: "Albânia", lang: "sq" },
  { code: "XK", name: "Kosovo", lang: "sq" },
  { code: "BG", name: "Bulgária", lang: "bg" },
  // Română
  { code: "RO", name: "Roménia", lang: "ro" },
  { code: "MD", name: "Moldávia", lang: "ro" },
  // Polski
  { code: "PL", name: "Polónia", lang: "pl" },
  // Українська
  { code: "UA", name: "Ucrânia", lang: "uk" },
  // Türkçe
  { code: "TR", name: "Turquia", lang: "tr" },
  // Fallback
  { code: "OTHER", name: "Outro", lang: "en" },
]

/** Idioma por defeito de um código de país (fallback en). */
export function langForCountry(code: string | null | undefined): Lang {
  const c = COUNTRIES.find((x) => x.code === code)
  return c?.lang ?? "en"
}
