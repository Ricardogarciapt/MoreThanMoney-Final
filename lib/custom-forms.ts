/**
 * Sistema de formulários dinâmicos MTM.
 * Definições em `custom_forms` (editáveis em /admin/forms), públicas em
 * /docs/forms/[slug]; submissões em `form_submissions` + email para o admin.
 */

export type CustomFormFieldType = 'text' | 'email' | 'textarea' | 'select' | 'chips' | 'checkbox'

export interface CustomFormField {
  name: string
  label: string
  type: CustomFormFieldType
  options?: string[]
  required?: boolean
  placeholder?: string
  hint?: string
  /** Inicia uma nova secção no formulário (título mostrado antes deste campo) */
  section?: string
  sectionHint?: string
  /** Meia largura (grid de 2 colunas em ecrãs maiores) */
  half?: boolean
  maxLength?: number
}

export interface CustomFormDef {
  id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  badge: string | null
  active: boolean
  fields: CustomFormField[]
  created_at?: string
  updated_at?: string
}

const FIELD_TYPES: CustomFormFieldType[] = ['text', 'email', 'textarea', 'select', 'chips', 'checkbox']
const NAME_RE = /^[a-z0-9_]{1,60}$/
export const SLUG_RE = /^[a-z0-9-]{3,60}$/

const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

/** Valida/normaliza a estrutura `fields` vinda do editor admin. Devolve null se inválida. */
export function sanitizeFields(raw: unknown): CustomFormField[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) return null
  const out: CustomFormField[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const f = item as Record<string, unknown>
    const name = str(f.name, 60)
    const label = str(f.label, 500)
    const type = str(f.type, 20) as CustomFormFieldType
    if (!NAME_RE.test(name) || seen.has(name) || !label || !FIELD_TYPES.includes(type)) return null
    seen.add(name)
    const field: CustomFormField = { name, label, type }
    if (Array.isArray(f.options)) {
      field.options = f.options.map((o) => str(o, 80)).filter(Boolean).slice(0, 30)
    }
    if ((type === 'select' || type === 'chips') && !field.options?.length) return null
    if (f.required === true) field.required = true
    if (f.half === true) field.half = true
    const placeholder = str(f.placeholder, 200)
    if (placeholder) field.placeholder = placeholder
    const hint = str(f.hint, 400)
    if (hint) field.hint = hint
    const section = str(f.section, 120)
    if (section) field.section = section
    const sectionHint = str(f.sectionHint, 300)
    if (sectionHint) field.sectionHint = sectionHint
    const maxLength = Number(f.maxLength)
    if (Number.isFinite(maxLength) && maxLength > 0) field.maxLength = Math.min(maxLength, 5000)
    out.push(field)
  }
  return out
}

export interface SubmissionResult {
  ok: boolean
  error?: string
  clean: Record<string, unknown>
  email: string
}

/** Valida uma submissão contra a definição do formulário; devolve dados limpos. */
export function validateSubmission(fields: CustomFormField[], data: unknown): SubmissionResult {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const clean: Record<string, unknown> = {}
  let email = ''

  for (const field of fields) {
    const raw = body[field.name]
    const cap = field.maxLength || (field.type === 'textarea' ? 2000 : 300)

    if (field.type === 'chips') {
      const arr = Array.isArray(raw) ? raw.map((v) => str(v, 80)).filter(Boolean).slice(0, 30) : []
      // chips só aceitam valores da lista de opções
      const valid = arr.filter((v) => field.options?.includes(v))
      if (field.required && !valid.length) {
        return { ok: false, error: `Preenche: ${field.label} / Please fill in: ${field.label}`, clean, email }
      }
      if (valid.length) clean[field.name] = valid
      continue
    }

    if (field.type === 'checkbox') {
      const checked = raw === true
      if (field.required && !checked) {
        return { ok: false, error: 'É necessário aceitar o tratamento de dados (RGPD). / Consent is required.', clean, email }
      }
      clean[field.name] = checked
      continue
    }

    const value = str(raw, cap)
    if (field.type === 'select' && value && !field.options?.includes(value)) {
      return { ok: false, error: `Opção inválida em: ${field.label} / Invalid option in: ${field.label}`, clean, email }
    }
    if (field.required && !value) {
      return { ok: false, error: `Preenche: ${field.label} / Please fill in: ${field.label}`, clean, email }
    }
    if (field.type === 'email' && value) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { ok: false, error: 'Email inválido. / Invalid email.', clean, email }
      }
      if (!email) email = value.toLowerCase()
    }
    if (value) clean[field.name] = value
  }

  return { ok: true, clean, email }
}
