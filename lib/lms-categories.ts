export const LMS_CATEGORY_VALUES = [
  "forex",
  "criptomoedas",
  "social-media",
  "imobiliario",
  "fitness",
  "mindset",
  "ia",
  "empreendedorismo",
] as const

export type LmsCategoryValue = (typeof LMS_CATEGORY_VALUES)[number]

export const LMS_CATEGORY_OPTIONS: { value: LmsCategoryValue; label: string }[] = [
  { value: "forex", label: "Forex" },
  { value: "criptomoedas", label: "Criptomoedas" },
  { value: "social-media", label: "Social Media" },
  { value: "imobiliario", label: "Imobiliário" },
  { value: "fitness", label: "Fitness" },
  { value: "mindset", label: "Mindset" },
  { value: "ia", label: "IA" },
  { value: "empreendedorismo", label: "Trading & Empreendedorismo" },
]

export function normalizeLmsCategory(input?: string | null): LmsCategoryValue | null {
  if (!input) return null
  const value = String(input).trim().toLowerCase()
  if (!value) return null
  if ((LMS_CATEGORY_VALUES as readonly string[]).includes(value)) return value as LmsCategoryValue
  return null
}

