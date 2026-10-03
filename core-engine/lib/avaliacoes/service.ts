import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getSiteUrl } from "@/lib/mail-transport"
import {
  gradeAnswers,
  makeCertCode,
  type Assessment,
  type Question,
  type GradeResult,
} from "./config"
import { generateCertificatePdf } from "./certificate"
import { sendCertificateEmail } from "./email"

export async function getAssessmentBySlug(slug: string): Promise<Assessment | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("assessments").select("*").eq("slug", slug).maybeSingle()
  if (error || !data) return null
  return data as Assessment
}

export async function getQuestions(assessmentId: string, includeInactive = false): Promise<Question[]> {
  const supabase = getSupabaseAdmin()
  let q = supabase
    .from("assessment_questions")
    .select("id, order_index, prompt, options, correct_index, points, active")
    .eq("assessment_id", assessmentId)
    .order("order_index", { ascending: true })
  if (!includeInactive) q = q.eq("active", true)
  const { data, error } = await q
  if (error || !data) return []
  return data.map((r: any) => ({
    id: r.id,
    order_index: r.order_index,
    prompt: r.prompt,
    options: Array.isArray(r.options) ? r.options : [],
    correct_index: r.correct_index,
    points: Number(r.points) || 1,
  }))
}

/** Certificado (PDF) + linha de nota formatada para o email. */
async function buildCertificate(assessment: Assessment, name: string, grade: GradeResult, code: string) {
  const pdf = await generateCertificatePdf({
    template: assessment.cert_template,
    name,
    gradeText: grade.gradeText, // "17,2" (o template acrescenta " valores")
    code,
  })
  // texto de nota para o email (com unidade)
  let emailGrade: string | null = null
  if (assessment.grade_display === "valores20" && grade.gradeText) emailGrade = `${grade.gradeText} valores`
  else if (assessment.grade_display === "percent" && grade.gradeText) emailGrade = grade.gradeText
  return { pdf, emailGrade }
}

export type SubmitResult = {
  passed: boolean
  percent: number
  scoreRaw: number
  scoreMax: number
  gradeValue: number | null
  gradeText: string | null
  certCode: string | null
  certUrl: string | null
}

/**
 * Corrige uma submissão e, se aprovada, emite o certificado (guarda tentativa,
 * gera PDF, envia por email). Devolve o resultado ao cliente.
 */
export async function submitAttempt(params: {
  assessment: Assessment
  questions: Question[]
  name: string
  email: string
  answers: Record<string, number>
  userId?: string | null
  feedback?: { opinion?: string; favorite?: string } | null
}): Promise<SubmitResult> {
  const { assessment, questions, name, email, answers, userId, feedback } = params
  const grade = gradeAnswers(assessment, questions, answers)

  const answerLog = questions.map((q) => ({
    question_id: q.id,
    chosen_index: typeof answers[q.id] === "number" ? answers[q.id] : null,
    correct: answers[q.id] === q.correct_index,
  }))

  const supabase = getSupabaseAdmin()

  if (!grade.passed) {
    // regista a tentativa reprovada (sem certificado)
    await supabase.from("assessment_attempts").insert({
      assessment_id: assessment.id,
      assessment_slug: assessment.slug,
      user_id: userId || null,
      name,
      email,
      answers: answerLog,
      score_raw: grade.scoreRaw,
      score_max: grade.scoreMax,
      score_percent: grade.percent,
      grade_value: grade.gradeValue,
      passed: false,
      feedback: feedback || null,
    })
    return {
      passed: false,
      percent: grade.percent,
      scoreRaw: grade.scoreRaw,
      scoreMax: grade.scoreMax,
      gradeValue: grade.gradeValue,
      gradeText: grade.gradeText,
      certCode: null,
      certUrl: null,
    }
  }

  // aprovado → gerar código, PDF, guardar, enviar
  const code = makeCertCode(assessment.cert_template)
  const { pdf, emailGrade } = await buildCertificate(assessment, name, grade, code)
  const certUrl = `${getSiteUrl()}/api/avaliacoes/certificado/${code}`

  const { error: insErr } = await supabase.from("assessment_attempts").insert({
    assessment_id: assessment.id,
    assessment_slug: assessment.slug,
    user_id: userId || null,
    name,
    email,
    answers: answerLog,
    score_raw: grade.scoreRaw,
    score_max: grade.scoreMax,
    score_percent: grade.percent,
    grade_value: grade.gradeValue,
    passed: true,
    cert_code: code,
    cert_url: certUrl,
    feedback: feedback || null,
  })
  if (insErr) throw new Error(insErr.message)

  const mail = await sendCertificateEmail({
    to: email,
    name,
    assessmentTitle: assessment.title,
    pdfBuffer: pdf,
    code,
    gradeText: emailGrade,
  })
  if (mail.success) {
    await supabase.from("assessment_attempts").update({ emailed_at: new Date().toISOString() }).eq("cert_code", code)
  }

  return {
    passed: true,
    percent: grade.percent,
    scoreRaw: grade.scoreRaw,
    scoreMax: grade.scoreMax,
    gradeValue: grade.gradeValue,
    gradeText: grade.gradeText,
    certCode: code,
    certUrl,
  }
}

/**
 * Emissão direta (admin / backfill): emite certificado a alguém que já concluiu,
 * sem quiz. `gradeValue` opcional (/20) para bootcamp/teste-final.
 */
export async function issueCertificateDirect(params: {
  assessment: Assessment
  name: string
  email: string
  gradeValue?: number | null
  userId?: string | null
  sendEmail?: boolean
}): Promise<{ certCode: string; certUrl: string; emailed: boolean }> {
  const { assessment, name, email, gradeValue, userId, sendEmail = true } = params
  const supabase = getSupabaseAdmin()

  let gradeText: string | null = null
  if (assessment.grade_display === "valores20" && typeof gradeValue === "number") {
    gradeText = gradeValue.toFixed(1).replace(".", ",")
  } else if (assessment.grade_display === "percent" && typeof gradeValue === "number") {
    gradeText = `${Math.round(gradeValue)}%`
  }

  const code = makeCertCode(assessment.cert_template)
  const pdf = await generateCertificatePdf({ template: assessment.cert_template, name, gradeText, code })
  const certUrl = `${getSiteUrl()}/api/avaliacoes/certificado/${code}`

  const { error } = await supabase.from("assessment_attempts").insert({
    assessment_id: assessment.id,
    assessment_slug: assessment.slug,
    user_id: userId || null,
    name,
    email,
    answers: [],
    score_percent: assessment.grade_display === "percent" ? gradeValue ?? null : null,
    grade_value: gradeValue ?? null,
    passed: true,
    cert_code: code,
    cert_url: certUrl,
  })
  if (error) throw new Error(error.message)

  let emailed = false
  if (sendEmail) {
    const emailGrade = assessment.grade_display === "valores20" && gradeText ? `${gradeText} valores` : gradeText
    const mail = await sendCertificateEmail({ to: email, name, assessmentTitle: assessment.title, pdfBuffer: pdf, code, gradeText: emailGrade })
    emailed = mail.success
    if (emailed) await supabase.from("assessment_attempts").update({ emailed_at: new Date().toISOString() }).eq("cert_code", code)
  }

  return { certCode: code, certUrl, emailed }
}

/** Regenera o PDF a partir de uma tentativa guardada (para download). */
export async function regenerateCertificatePdfByCode(code: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const supabase = getSupabaseAdmin()
  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("name, grade_value, assessment_slug, cert_code, passed")
    .eq("cert_code", code)
    .maybeSingle()
  if (!attempt || !attempt.passed) return null
  const assessment = await getAssessmentBySlug(attempt.assessment_slug)
  if (!assessment) return null

  let gradeText: string | null = null
  if (assessment.grade_display === "valores20" && typeof attempt.grade_value === "number") {
    gradeText = Number(attempt.grade_value).toFixed(1).replace(".", ",")
  } else if (assessment.grade_display === "percent" && typeof attempt.grade_value === "number") {
    gradeText = `${Math.round(Number(attempt.grade_value))}%`
  }
  const pdf = await generateCertificatePdf({ template: assessment.cert_template, name: attempt.name, gradeText, code })
  return { pdf, filename: `certificado-${code}.pdf` }
}
