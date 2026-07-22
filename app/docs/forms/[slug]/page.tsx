"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import type { CustomFormField } from "@/lib/custom-forms"

/**
 * /docs/forms/[slug] — renderiza um formulário público a partir da definição
 * em `custom_forms` (gerida em /admin/forms) e submete para /api/forms/[slug].
 */

interface FormDef {
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  badge: string | null
  fields: CustomFormField[]
}

const inputClass =
  "w-full rounded-lg border border-gold-500/25 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"

export default function DynamicFormPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [form, setForm] = useState<FormDef | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/forms/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true)
          return
        }
        const d = await r.json()
        if (d?.form?.fields) setForm(d.form)
        else setNotFound(true)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  const setValue = (name: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [name]: value }))

  const toggleChip = (name: string, option: string) => {
    const current = Array.isArray(values[name]) ? (values[name] as string[]) : []
    setValue(name, current.includes(option) ? current.filter((v) => v !== option) : [...current, option])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/forms/${form.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again.")
        return
      }
      setSubmitted(true)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 text-center">
        <p className="text-gray-400 mb-6">Form not found.</p>
        <Link href="/docs/forms" className="text-gold-500 hover:text-gold-400 text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> See available forms
        </Link>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 py-24">
        <div className="max-w-lg w-full text-center rounded-2xl border border-gold-500/30 bg-gradient-to-b from-gold-500/10 to-transparent p-10">
          <CheckCircle2 className="w-14 h-14 text-gold-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-3">Application received!</h1>
          <p className="text-gray-300 mb-8">
            Thank you for applying. Our team will review your application and contact you by email or WhatsApp.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-black hover:bg-gold-400 transition-colors"
          >
            Back to MoreThanMoney
          </Link>
        </div>
      </div>
    )
  }

  // Agrupa campos por secção pela ordem em que aparecem
  const sections: { title: string | null; hint: string | null; fields: CustomFormField[] }[] = []
  for (const field of form.fields) {
    if (field.section || sections.length === 0) {
      sections.push({ title: field.section || null, hint: field.sectionHint || null, fields: [] })
    }
    sections[sections.length - 1].fields.push(field)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gold-500/20">
        <div className="absolute inset-0 bg-gradient-to-b from-gold-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto px-4 pt-20 pb-10 relative">
          <Link
            href="/docs/forms"
            className="inline-flex items-center gap-2 text-xs text-gray-500 hover:text-gold-500 transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All forms
          </Link>
          <p className="text-gold-500 tracking-[0.3em] text-xs font-semibold uppercase mb-3">We are looking for</p>
          <h1 className="text-3xl md:text-5xl font-extrabold uppercase leading-tight mb-3">{form.title}</h1>
          {form.subtitle && <p className="text-lg text-gray-300 mb-2">{form.subtitle}</p>}
          {form.description && <p className="text-sm text-gray-500 leading-relaxed">{form.description}</p>}
        </div>
      </section>

      {/* Formulário */}
      <section className="max-w-3xl mx-auto px-4 py-12">
        <form onSubmit={handleSubmit} className="space-y-10">
          {sections.map((section, si) => (
            <div key={si} className="space-y-4">
              {section.title && (
                <div className="border-b border-gold-500/15 pb-2">
                  <h3 className="text-base font-semibold text-gold-500 uppercase tracking-wide">{section.title}</h3>
                  {section.hint && <p className="text-xs text-gray-500 mt-1">{section.hint}</p>}
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                {section.fields.map((field) => {
                  const wrapperClass = field.half ? "" : "sm:col-span-2"
                  const label = (
                    <label className="block text-sm text-gray-300 mb-1.5">
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                  )
                  const hint = field.hint && (
                    <p className="text-xs text-gray-600 mt-1.5">{field.hint}</p>
                  )

                  if (field.type === "chips") {
                    const selected = Array.isArray(values[field.name]) ? (values[field.name] as string[]) : []
                    return (
                      <div key={field.name} className={wrapperClass}>
                        {label}
                        <div className="flex flex-wrap gap-2">
                          {(field.options || []).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => toggleChip(field.name, opt)}
                              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                                selected.includes(opt)
                                  ? "border-gold-500 bg-gold-500/20 text-gold-400"
                                  : "border-gray-700 bg-black/40 text-gray-400 hover:border-gold-500/50"
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        {hint}
                      </div>
                    )
                  }

                  if (field.type === "select") {
                    return (
                      <div key={field.name} className={wrapperClass}>
                        {label}
                        <select
                          className={inputClass}
                          value={String(values[field.name] ?? "")}
                          onChange={(e) => setValue(field.name, e.target.value)}
                          required={field.required}
                        >
                          <option value="" disabled>
                            Select…
                          </option>
                          {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {hint}
                      </div>
                    )
                  }

                  if (field.type === "textarea") {
                    return (
                      <div key={field.name} className={wrapperClass}>
                        {label}
                        <textarea
                          className={`${inputClass} min-h-[100px]`}
                          value={String(values[field.name] ?? "")}
                          onChange={(e) => setValue(field.name, e.target.value)}
                          placeholder={field.placeholder}
                          maxLength={field.maxLength || 2000}
                          required={field.required}
                        />
                        {hint}
                      </div>
                    )
                  }

                  if (field.type === "checkbox") {
                    return (
                      <label key={field.name} className={`${wrapperClass} flex items-start gap-3 cursor-pointer`}>
                        <input
                          type="checkbox"
                          checked={values[field.name] === true}
                          onChange={(e) => setValue(field.name, e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#D2A63C]"
                          required={field.required}
                        />
                        <span className="text-xs text-gray-400 leading-relaxed">{field.label}</span>
                      </label>
                    )
                  }

                  return (
                    <div key={field.name} className={wrapperClass}>
                      {label}
                      <input
                        className={inputClass}
                        type={field.type === "email" ? "email" : "text"}
                        value={String(values[field.name] ?? "")}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        maxLength={field.maxLength || 300}
                        required={field.required}
                      />
                      {hint}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gold-500 py-4 text-base font-bold text-black uppercase tracking-wide hover:bg-gold-400 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
            {submitting ? "Submitting…" : "Submit Application"}
          </button>

          <p className="text-center text-xs text-gray-600">
            Educational content — not financial advice. Results are not guaranteed. · morethanmoney.pt
          </p>
        </form>
      </section>
    </div>
  )
}
