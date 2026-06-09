/**
 * Academias oficiais MTM (seed em supabase/migrations/008_live_sessions_lms.sql).
 * Usado para ordenação consistente em lobby, admin e APIs.
 */
export const LMS_OFFICIAL_ACADEMY_SLUGS = [
  "forex",
  "criptomoedas",
  "social-media",
  "imobiliario",
  "fitness",
  "mindset",
  "ia",
  "academia",
] as const

export type LmsAcademySlug = (typeof LMS_OFFICIAL_ACADEMY_SLUGS)[number]

export const LMS_OFFICIAL_ACADEMIES_COPY: { slug: string; name: string; description: string }[] = [
  { slug: "forex", name: "Forex", description: "Sessões ao vivo de Forex" },
  { slug: "criptomoedas", name: "Criptomoedas", description: "Aulas e análise de cripto ativos" },
  { slug: "social-media", name: "Social Media", description: "Crescimento e marca pessoal" },
  { slug: "imobiliario", name: "Imobiliário", description: "Educação imobiliária e estratégias" },
  { slug: "fitness", name: "Fitness", description: "Performance e hábitos" },
  { slug: "mindset", name: "Mindset", description: "Mentalidade e disciplina" },
  { slug: "ia", name: "IA", description: "Ferramentas de Inteligência Artificial aplicadas ao negócio" },
  { slug: "academia", name: "Academia", description: "Aulas gerais de academia MTM" },
]

const slugOrder = new Map(LMS_OFFICIAL_ACADEMY_SLUGS.map((s, i) => [s, i]))

export function sortLmsAcademiesByOfficialOrder<T extends { slug?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sa = a.slug || ""
    const sb = b.slug || ""
    const ia = slugOrder.has(sa as LmsAcademySlug) ? slugOrder.get(sa as LmsAcademySlug)! : 999
    const ib = slugOrder.has(sb as LmsAcademySlug) ? slugOrder.get(sb as LmsAcademySlug)! : 999
    if (ia !== ib) return ia - ib
    return sa.localeCompare(sb)
  })
}
