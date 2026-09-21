// Motor de Avaliações / Certificados MTM — tipos e helpers partilhados.

export type AssessmentKind = "fast_start" | "bootcamp" | "teste_final" | "ib"
export type GradeDisplay = "none" | "percent" | "valores20"
export type CertTemplate = "fast-start" | "bootcamp" | "teste-final" | "academia-ib"

export type Assessment = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  kind: AssessmentKind
  intro: string | null
  pass_mark: number // percentagem (0-100)
  grade_display: GradeDisplay
  cert_template: CertTemplate
  active: boolean
  sort: number
  material_url?: string | null // material de apoio (ex.: aula na Skool)
}

export type Question = {
  id: string
  order_index: number
  prompt: string
  options: string[]
  correct_index: number
  points: number
}

// Questão como enviada ao cliente (sem a resposta correta).
export type PublicQuestion = {
  id: string
  order_index: number
  prompt: string
  options: string[]
  points: number
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return {
    id: q.id,
    order_index: q.order_index,
    prompt: q.prompt,
    options: q.options,
    points: q.points,
  }
}

// ---- Cálculo de nota ----

export type GradeResult = {
  scoreRaw: number
  scoreMax: number
  percent: number // 0-100 arredondado a 1 casa
  passed: boolean
  gradeValue: number | null // nota apresentada (ex.: /20) quando aplicável
  gradeText: string | null // texto formatado para o certificado (ex.: "17,2")
}

/** Corrige as respostas e devolve a nota. `answers` = mapa questionId -> índice escolhido. */
export function gradeAnswers(
  assessment: Pick<Assessment, "pass_mark" | "grade_display">,
  questions: Question[],
  answers: Record<string, number>,
): GradeResult {
  let scoreRaw = 0
  let scoreMax = 0
  for (const q of questions) {
    scoreMax += q.points
    const chosen = answers[q.id]
    if (typeof chosen === "number" && chosen === q.correct_index) {
      scoreRaw += q.points
    }
  }
  const percent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 1000) / 10 : 0
  const passed = percent >= assessment.pass_mark

  let gradeValue: number | null = null
  let gradeText: string | null = null
  if (assessment.grade_display === "valores20") {
    gradeValue = Math.round((percent / 100) * 20 * 10) / 10 // /20 com 1 casa
    gradeText = gradeValue.toFixed(1).replace(".", ",")
  } else if (assessment.grade_display === "percent") {
    gradeValue = percent
    gradeText = `${percent.toFixed(0)}%`
  }

  return { scoreRaw, scoreMax, percent, passed, gradeValue, gradeText }
}

// ---- Código de validação do certificado ----

const CODE_PREFIX: Record<CertTemplate, string> = {
  "fast-start": "FS",
  bootcamp: "BC",
  "teste-final": "JT",
  "academia-ib": "IB",
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // sem I,O,0,1

export function makeCertCode(template: CertTemplate): string {
  let rand = ""
  for (let i = 0; i < 8; i++) {
    rand += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return `MTM-${CODE_PREFIX[template]}-${rand}`
}

/** Primeiro + último nome (para o certificado). "Maria M. de Vasconcelos" → "Maria Vasconcelos". */
export function firstLastName(full: string): string {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length <= 1) return parts[0] || ""
  return `${parts[0]} ${parts[parts.length - 1]}`
}

export function formatPtDate(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}
