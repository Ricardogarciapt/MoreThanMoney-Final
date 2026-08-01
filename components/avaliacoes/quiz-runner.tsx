"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import CertificatePreview from "@/components/avaliacoes/certificate-preview"
import type { CertTemplate } from "@/lib/avaliacoes/config"
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Download,
  Mail,
  RotateCcw,
  AlertTriangle,
} from "lucide-react"

type PublicQuestion = { id: string; order_index: number; prompt: string; options: string[]; points: number }
type AssessmentMeta = {
  slug: string
  title: string
  subtitle: string | null
  intro: string | null
  kind: string
  pass_mark: number
  grade_display: "none" | "percent" | "valores20"
  total: number
}
type SubmitResult = {
  passed: boolean
  percent: number
  scoreRaw: number
  scoreMax: number
  gradeValue: number | null
  gradeText: string | null
  certCode: string | null
  certUrl: string | null
}

export default function QuizRunner({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<AssessmentMeta | null>(null)
  const [questions, setQuestions] = useState<PublicQuestion[]>([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [opinion, setOpinion] = useState("")
  const [favorite, setFavorite] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUnanswered, setShowUnanswered] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(`/api/avaliacoes/${slug}`, { credentials: "same-origin" })
        const j = await r.json()
        if (!alive) return
        if (!r.ok) {
          setError(j?.error || "Avaliação não encontrada")
        } else {
          setMeta(j.assessment)
          setQuestions(j.questions || [])
          if (j.prefill?.name) setName(j.prefill.name)
          if (j.prefill?.email) setEmail(j.prefill.email)
        }
      } catch {
        if (alive) setError("Erro de rede")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [slug])

  const answeredCount = Object.keys(answers).length
  const allAnswered = answeredCount >= questions.length
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0
  const unanswered = useMemo(
    () => questions.filter((q) => typeof answers[q.id] !== "number").map((q) => q.order_index),
    [questions, answers],
  )

  async function submit() {
    setError(null)
    if (name.trim().length < 2) return setError("Indica o teu nome completo.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Indica um email válido.")
    if (!allAnswered) {
      setShowUnanswered(true)
      return setError(`Responde a todas as perguntas (${unanswered.length} em falta).`)
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/avaliacoes/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          answers,
          feedback: { opinion: opinion.trim(), favorite: favorite.trim() },
        }),
      })
      const j = await r.json()
      if (!r.ok) setError(j?.error || "Erro ao submeter.")
      else {
        setResult(j.result)
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    } catch {
      setError("Erro de rede ao submeter.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }
  if (error && !meta) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-gray-300">{error}</p>
        <Link href="/avaliacoes" className="mt-4 inline-block text-[#D2A63C] hover:underline">
          ← Voltar às avaliações
        </Link>
      </div>
    )
  }

  // ----- Ecrã de resultado -----
  if (result) {
    const gradeUnit = meta?.grade_display === "valores20" ? " valores" : ""
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div
          className={`rounded-2xl border p-8 text-center ${
            result.passed ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
          }`}
        >
          {result.passed ? (
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
          ) : (
            <XCircle className="mx-auto h-14 w-14 text-red-400" />
          )}
          <h1 className="mt-4 text-2xl font-bold">
            {result.passed ? "Parabéns — aprovado!" : "Ainda não passaste"}
          </h1>
          <p className="mt-2 text-gray-300">
            Acertaste <strong>{result.scoreRaw}</strong> de <strong>{result.scoreMax}</strong> ({result.percent}%).
            {meta?.grade_display === "valores20" && result.gradeText && (
              <>
                {" "}
                Nota: <strong className="text-[#D2A63C]">{result.gradeText}{gradeUnit}</strong>.
              </>
            )}
          </p>

          {result.passed ? (
            <div className="mt-6 space-y-3">
              {/* Pré-visualização do certificado do aluno */}
              <div className="mx-auto max-w-md">
                <CertificatePreview template={slug as CertTemplate} name={name} gradeText={result.gradeText} />
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-300">
                <Mail className="h-4 w-4 text-[#D2A63C]" /> Enviámos uma cópia do certificado para <strong>{email}</strong>.
              </div>
              {result.certCode && (
                <a
                  href={`/api/avaliacoes/certificado/${result.certCode}?dl=1`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-5 py-3 font-semibold text-black"
                >
                  <Download className="h-4 w-4" /> Descarregar certificado
                </a>
              )}
              <p className="text-xs text-gray-500">Código de validação: {result.certCode}</p>
            </div>
          ) : (
            <div className="mt-6">
              <p className="text-sm text-gray-400">
                Precisas de ≥ {meta?.pass_mark}% para receber o certificado. Revê o conteúdo e tenta de novo.
              </p>
              <button
                onClick={() => {
                  setResult(null)
                  setAnswers({})
                  setShowUnanswered(false)
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/40 px-5 py-2.5 font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10"
              >
                <RotateCcw className="h-4 w-4" /> Tentar novamente
              </button>
            </div>
          )}

          <div className="mt-8">
            <Link href="/avaliacoes" className="text-sm text-gray-400 hover:text-white">
              ← Voltar às avaliações
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ----- Quiz -----
  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-8">
      <Link href="/avaliacoes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Avaliações
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold md:text-3xl">{meta?.title}</h1>
        {meta?.subtitle && <p className="mt-1 text-[#D2A63C]/80">{meta.subtitle}</p>}
        {meta?.intro && <p className="mt-3 text-sm leading-relaxed text-gray-400">{meta.intro}</p>}
      </header>

      {/* Identificação */}
      <div className="mb-8 grid gap-4 rounded-xl border border-[#D2A63C]/20 bg-gray-950/50 p-5 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Nome completo</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="O teu nome (aparece no certificado)"
            className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#D2A63C] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="para receber o certificado"
            className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-[#D2A63C] focus:outline-none"
          />
        </div>
      </div>

      {/* Perguntas */}
      <div className="space-y-5">
        {questions.map((q, qi) => {
          const chosen = answers[q.id]
          const missing = showUnanswered && typeof chosen !== "number"
          return (
            <div
              key={q.id}
              className={`rounded-xl border p-5 ${missing ? "border-red-500/50 bg-red-500/5" : "border-gray-800 bg-gray-950/40"}`}
            >
              <p className="mb-3 font-medium">
                <span className="mr-2 text-[#D2A63C]">{qi + 1}.</span>
                {q.prompt}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const active = chosen === oi
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        active
                          ? "border-[#D2A63C] bg-[#D2A63C]/15 text-white"
                          : "border-gray-800 bg-black/30 text-gray-300 hover:border-gray-600"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                          active ? "border-[#D2A63C] bg-[#D2A63C] text-black" : "border-gray-600 text-gray-500"
                        }`}
                      >
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Opinião sobre o teste (opcional) */}
      <div className="mt-6 rounded-xl border border-[#D2A63C]/20 bg-gray-950/40 p-5">
        <h3 className="text-sm font-semibold text-[#D2A63C]">A tua opinião (opcional)</h3>
        <p className="mt-0.5 text-xs text-gray-500">Ajuda-nos a melhorar a formação.</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">O que achaste deste teste?</label>
            <textarea
              value={opinion}
              onChange={(e) => setOpinion(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="A tua opinião sobre o teste…"
              className="w-full resize-y rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-[#D2A63C] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Qual foi a parte que mais gostaste?</label>
            <textarea
              value={favorite}
              onChange={(e) => setFavorite(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="A parte que mais gostaste…"
              className="w-full resize-y rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-[#D2A63C] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Barra de submissão fixa */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D2A63C]/20 bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-gray-400">
              <span>
                {answeredCount}/{questions.length} respondidas
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
              <div className="h-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submeter
          </button>
        </div>
      </div>
    </div>
  )
}
