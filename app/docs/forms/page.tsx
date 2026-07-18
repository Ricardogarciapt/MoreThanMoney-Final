"use client"

import { useState } from "react"
import Link from "next/link"
import { Globe, Clock, TrendingUp, Users, CheckCircle2, Loader2, GraduationCap } from "lucide-react"

/**
 * /docs/forms — página pública de candidatura ao programa de Trading Educators.
 * Campanha global (poster EN) → conteúdo em inglês com apontamentos PT.
 * Envia para POST /api/educator-applications (tabela educator_applications, service role).
 */

const LANGUAGE_OPTIONS = ["English", "Português", "Español", "Hindi", "Français", "Deutsch", "中文", "Other"]
const MARKET_OPTIONS = ["Forex", "Gold / XAUUSD", "Indices", "Crypto", "Stocks / ETFs", "Commodities", "Options", "Futures"]
const EXPERIENCE_OPTIONS = ["<1 year", "1-3 years", "3-5 years", "5-10 years", "10+ years"]

const SESSION_OPTIONS = [
  { value: "asia", label: "Asia Session — 7:00PM–3:00AM SGT (UTC+8)" },
  { value: "new_york", label: "New York Session — 1:00PM–9:00PM EST (UTC-5)" },
  { value: "both", label: "Both sessions" },
  { value: "flexible", label: "Flexible" },
]

const BENEFITS = [
  { icon: TrendingUp, label: "Live Trading Sessions" },
  { icon: Globe, label: "Market Analysis" },
  { icon: Users, label: "Community Support" },
  { icon: GraduationCap, label: "Global Opportunity" },
]

const inputClass =
  "w-full rounded-lg border border-gold-500/25 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"

export default function EducatorFormsPage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [country, setCountry] = useState("")
  const [languages, setLanguages] = useState<string[]>([])
  const [markets, setMarkets] = useState<string[]>([])
  const [experienceYears, setExperienceYears] = useState("")
  const [preferredSession, setPreferredSession] = useState("")
  const [links, setLinks] = useState("")
  const [teachingExperience, setTeachingExperience] = useState("")
  const [motivation, setMotivation] = useState("")
  const [consent, setConsent] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/educator-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          whatsapp,
          country,
          languages,
          markets,
          experience_years: experienceYears,
          preferred_session: preferredSession,
          links,
          teaching_experience: teachingExperience,
          motivation,
          consent,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || "Something went wrong. Please try again. / Algo correu mal, tenta novamente.")
        return
      }
      setSubmitted(true)
    } catch {
      setError("Network error. Please try again. / Erro de rede, tenta novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4 py-24">
        <div className="max-w-lg w-full text-center rounded-2xl border border-gold-500/30 bg-gradient-to-b from-gold-500/10 to-transparent p-10">
          <CheckCircle2 className="w-14 h-14 text-gold-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-white mb-3">Application received!</h1>
          <p className="text-gray-300 mb-2">
            Thank you for applying to become a MoreThanMoney Trading Educator. Our team will review your
            application and contact you by email or WhatsApp.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Candidatura recebida — a nossa equipa vai analisá-la e entrar em contacto contigo.
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gold-500/20">
        <div className="absolute inset-0 bg-gradient-to-b from-gold-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto px-4 pt-24 pb-14 text-center relative">
          <p className="text-gold-500 tracking-[0.3em] text-xs font-semibold uppercase mb-4">We are looking for</p>
          <h1 className="text-4xl md:text-6xl font-extrabold uppercase leading-tight mb-4">
            Trading <span className="text-gold-500">Educators</span>
          </h1>
          <p className="text-lg text-gray-300 mb-2">Inspire. Educate. Transform.</p>
          <p className="text-sm text-gray-500">
            Junta-te à equipa MoreThanMoney como educador de trading — candidatura aberta a nível global.
          </p>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-xl border border-gold-500/20 bg-black/50 px-3 py-4 flex flex-col items-center gap-2"
              >
                <Icon className="w-5 h-5 text-gold-500" />
                <span className="text-xs text-gray-300 text-center">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-3 text-left">
            <div className="rounded-xl border border-gold-500/20 bg-black/50 p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-gold-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">Asia Session</p>
                <p className="text-xs text-gray-400">7:00PM – 3:00AM SGT (UTC+8)</p>
              </div>
            </div>
            <div className="rounded-xl border border-gold-500/20 bg-black/50 p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-gold-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-white">New York Session</p>
                <p className="text-xs text-gray-400">1:00PM – 9:00PM EST (UTC-5)</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold mb-1">Application Form</h2>
        <p className="text-sm text-gray-500 mb-8">Formulário de candidatura — responde em inglês ou português.</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Dados pessoais */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Full name *</label>
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                maxLength={120}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Email *</label>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                maxLength={200}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">WhatsApp (with country code) *</label>
              <input
                className={inputClass}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+351 912 345 678"
                maxLength={60}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Country *</label>
              <input
                className={inputClass}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Portugal, India, Brazil…"
                maxLength={80}
                required
              />
            </div>
          </div>

          {/* Idiomas */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Languages you can teach in *</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggle(languages, setLanguages, lang)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    languages.includes(lang)
                      ? "border-gold-500 bg-gold-500/20 text-gold-400"
                      : "border-gray-700 bg-black/40 text-gray-400 hover:border-gold-500/50"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Mercados */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">Markets you trade / teach *</label>
            <div className="flex flex-wrap gap-2">
              {MARKET_OPTIONS.map((market) => (
                <button
                  key={market}
                  type="button"
                  onClick={() => toggle(markets, setMarkets, market)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    markets.includes(market)
                      ? "border-gold-500 bg-gold-500/20 text-gold-400"
                      : "border-gray-700 bg-black/40 text-gray-400 hover:border-gold-500/50"
                  }`}
                >
                  {market}
                </button>
              ))}
            </div>
          </div>

          {/* Experiência + sessão */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Trading experience *</label>
              <select
                className={inputClass}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Preferred session *</label>
              <select
                className={inputClass}
                value={preferredSession}
                onChange={(e) => setPreferredSession(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {SESSION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Links */}
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Links <span className="text-gray-500">(Myfxbook, social media, YouTube — optional)</span>
            </label>
            <textarea
              className={`${inputClass} min-h-[70px]`}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder="https://…"
              maxLength={1000}
            />
          </div>

          {/* Experiência de ensino */}
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">
              Teaching / mentoring experience <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              className={`${inputClass} min-h-[90px]`}
              value={teachingExperience}
              onChange={(e) => setTeachingExperience(e.target.value)}
              placeholder="Courses, mentorships, communities you've taught…"
              maxLength={1000}
            />
          </div>

          {/* Motivação */}
          <div>
            <label className="block text-sm text-gray-300 mb-1.5">Why do you want to join MoreThanMoney? *</label>
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Tell us about your trading journey and why you want to educate…"
              maxLength={2000}
              required
            />
          </div>

          {/* RGPD */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#D2A63C]"
              required
            />
            <span className="text-xs text-gray-400 leading-relaxed">
              I consent to MoreThanMoney processing my personal data to evaluate this application (GDPR). /
              Autorizo a MoreThanMoney a tratar os meus dados pessoais para avaliar esta candidatura (RGPD).
            </span>
          </label>

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
