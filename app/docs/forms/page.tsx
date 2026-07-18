"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Globe, Clock, TrendingUp, Users, CheckCircle2, Loader2, GraduationCap,
  LineChart, Smartphone, ShoppingBag, Monitor, BadgeCheck,
} from "lucide-react"

/**
 * /docs/forms — página pública de candidatura aos programas de Educadores MTM.
 * Duas vagas (posters de recrutamento): Trading Educators e UGC Social Media /
 * Small Products Sales Educators. Campanha global (EN) com apontamentos PT.
 * Envia para POST /api/educator-applications.
 */

type FormKind = "trading" | "ugc_sales"

const LANGUAGE_OPTIONS = ["English", "Português", "Español", "Hindi", "Français", "Deutsch", "中文", "Other"]
const MARKET_OPTIONS = ["Forex", "Gold / XAUUSD", "Indices", "Crypto", "Stocks / ETFs", "Commodities", "Options", "Futures"]
const PLATFORM_OPTIONS = ["Instagram", "TikTok", "YouTube", "X / Twitter", "Facebook", "LinkedIn", "Telegram", "Other"]
const EXPERIENCE_OPTIONS = ["<1 year", "1-3 years", "3-5 years", "5-10 years", "10+ years"]
const COMMUNITY_SIZE_OPTIONS = ["<100", "100-500", "500-2 000", "2 000-10 000", "10 000-50 000", "50 000+"]
const FOLLOWERS_OPTIONS = ["<1 000", "1 000-5 000", "5 000-20 000", "20 000-100 000", "100 000+"]
const TRADING_STYLE_OPTIONS = ["Scalping", "Day trading", "Swing trading", "Position trading", "Algorithmic / Automated"]

const SESSION_OPTIONS = [
  { value: "asia", label: "Asia Session — 7:00PM–3:00AM SGT (UTC+8)" },
  { value: "new_york", label: "New York Session — 1:00PM–9:00PM EST (UTC-5)" },
  { value: "both", label: "Both sessions" },
  { value: "flexible", label: "Flexible" },
]

const ROLE_FOCUS_OPTIONS = [
  { value: "ugc", label: "Social Media UGC Educator" },
  { value: "sales", label: "Small Products Sales Educator" },
  { value: "both", label: "Both — UGC + Sales" },
]

const PERKS = [
  { icon: Globe, label: "Global Community" },
  { icon: Monitor, label: "Flexible & Remote" },
  { icon: Users, label: "Training & Support" },
  { icon: TrendingUp, label: "Grow. Impact. Prosper." },
]

const inputClass =
  "w-full rounded-lg border border-gold-500/25 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/50 transition-colors"

function Chips({
  options, selected, onToggle,
}: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onToggle(opt)}
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
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="border-b border-gold-500/15 pb-2">
      <h3 className="text-base font-semibold text-gold-500 uppercase tracking-wide">{children}</h3>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

export default function EducatorFormsPage() {
  const [kind, setKind] = useState<FormKind>("trading")

  // — Campos comuns —
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [country, setCountry] = useState("")
  const [languages, setLanguages] = useState<string[]>([])
  const [experienceYears, setExperienceYears] = useState("")
  const [links, setLinks] = useState("")
  const [teachingExperience, setTeachingExperience] = useState("")
  const [motivation, setMotivation] = useState("")
  const [communitySize, setCommunitySize] = useState("")
  const [proof, setProof] = useState("")
  const [consent, setConsent] = useState(false)

  // — Trading —
  const [markets, setMarkets] = useState<string[]>([])
  const [preferredSession, setPreferredSession] = useState("")
  const [tradingStyle, setTradingStyle] = useState("")
  const [avgMonthlyReturn, setAvgMonthlyReturn] = useState("")
  const [maxDrawdown, setMaxDrawdown] = useState("")
  const [winRate, setWinRate] = useState("")
  const [trackRecordUrl, setTrackRecordUrl] = useState("")
  const [accountSizeRange, setAccountSizeRange] = useState("")

  // — UGC / Sales —
  const [roleFocus, setRoleFocus] = useState("")
  const [platforms, setPlatforms] = useState<string[]>([])
  const [followersTotal, setFollowersTotal] = useState("")
  const [engagementRate, setEngagementRate] = useState("")
  const [portfolioLinks, setPortfolioLinks] = useState("")
  const [salesResults, setSalesResults] = useState("")
  const [productsTypes, setProductsTypes] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type")
    if (t === "ugc" || t === "sales" || t === "ugc_sales") setKind("ugc_sales")
    if (t === "trading") setKind("trading")
  }, [])

  const toggle = (list: string[], setList: (v: string[]) => void) => (value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  const isTrading = kind === "trading"
  const showUgcFields = roleFocus === "ugc" || roleFocus === "both"
  const showSalesFields = roleFocus === "sales" || roleFocus === "both"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        application_type: isTrading ? "trading" : roleFocus || "ugc",
        full_name: fullName,
        email,
        whatsapp,
        country,
        languages,
        markets: isTrading ? markets : platforms,
        experience_years: experienceYears,
        preferred_session: isTrading ? preferredSession : "flexible",
        links,
        teaching_experience: teachingExperience,
        motivation,
        community_size: communitySize,
        proof,
        consent,
        metrics: isTrading
          ? {
              trading_style: tradingStyle,
              avg_monthly_return: avgMonthlyReturn,
              max_drawdown: maxDrawdown,
              win_rate: winRate,
              track_record_url: trackRecordUrl,
              account_size_range: accountSizeRange,
            }
          : {
              role_focus: roleFocus,
              followers_total: followersTotal,
              engagement_rate: engagementRate,
              portfolio_links: portfolioLinks,
              sales_results: salesResults,
              products_types: productsTypes,
            },
      }

      const res = await fetch("/api/educator-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            Thank you for applying to become a MoreThanMoney Educator. Our team will review your
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
        <div className="max-w-3xl mx-auto px-4 pt-24 pb-12 text-center relative">
          <p className="text-gold-500 tracking-[0.3em] text-xs font-semibold uppercase mb-4">We are looking for</p>
          <h1 className="text-4xl md:text-6xl font-extrabold uppercase leading-tight mb-4">
            <span className="text-gold-500">Educators</span>
          </h1>
          <p className="text-lg text-gray-300 mb-2">Inspire. Educate. Transform.</p>
          <p className="text-sm text-gray-500 mb-10">
            Junta-te à equipa MoreThanMoney — escolhe a vaga e candidata-te. Global, flexível e remoto.
          </p>

          {/* Seletor de vaga */}
          <div className="grid sm:grid-cols-2 gap-4 text-left">
            <button
              type="button"
              onClick={() => setKind("trading")}
              className={`rounded-2xl border p-5 transition-colors ${
                isTrading ? "border-gold-500 bg-gold-500/10" : "border-gray-800 bg-black/50 hover:border-gold-500/40"
              }`}
            >
              <LineChart className="w-6 h-6 text-gold-500 mb-3" />
              <p className="font-bold text-white uppercase">Trading Educators</p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                Live trading sessions · market analysis · Asia & New York sessions · verified track record required.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setKind("ugc_sales")}
              className={`rounded-2xl border p-5 transition-colors ${
                !isTrading ? "border-gold-500 bg-gold-500/10" : "border-gray-800 bg-black/50 hover:border-gold-500/40"
              }`}
            >
              <div className="flex gap-2 mb-3">
                <Smartphone className="w-6 h-6 text-gold-500" />
                <ShoppingBag className="w-6 h-6 text-gold-500" />
              </div>
              <p className="font-bold text-white uppercase">UGC & Small Products Sales</p>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                Create engaging content · teach UGC strategies · small products sales · grow and build community.
              </p>
            </button>
          </div>

          {/* Sessões (só trading) */}
          {isTrading && (
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-left">
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
          )}

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PERKS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="rounded-xl border border-gold-500/20 bg-black/50 px-3 py-4 flex flex-col items-center gap-2"
              >
                <Icon className="w-5 h-5 text-gold-500" />
                <span className="text-xs text-gray-300 text-center">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formulário */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold mb-1">
          {isTrading ? "Trading Educator — Application Form" : "UGC & Sales Educator — Application Form"}
        </h2>
        <p className="text-sm text-gray-500 mb-8">
          Formulário de candidatura — responde em inglês ou português. Os dados pedidos servem para avaliar a tua
          candidatura: métricas de performance e comprovativo de alunos/comunidade são obrigatórios.
        </p>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* ——— Dados pessoais ——— */}
          <div className="space-y-4">
            <SectionTitle hint="Personal details / Dados pessoais">1 · About you</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Full name *</label>
                <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" maxLength={120} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Email *</label>
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" maxLength={200} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">WhatsApp (with country code) *</label>
                <input className={inputClass} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+351 912 345 678" maxLength={60} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Country *</label>
                <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Portugal, India, Brazil…" maxLength={80} required />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-2">Languages you can teach in *</label>
              <Chips options={LANGUAGE_OPTIONS} selected={languages} onToggle={toggle(languages, setLanguages)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">
                  {isTrading ? "Trading experience *" : "Experience in the area *"}
                </label>
                <select className={inputClass} value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {EXPERIENCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              {isTrading && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Preferred session *</label>
                  <select className={inputClass} value={preferredSession} onChange={(e) => setPreferredSession(e.target.value)} required>
                    <option value="" disabled>Select…</option>
                    {SESSION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              )}
              {!isTrading && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Role focus *</label>
                  <select className={inputClass} value={roleFocus} onChange={(e) => setRoleFocus(e.target.value)} required>
                    <option value="" disabled>Select…</option>
                    {ROLE_FOCUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ——— Área específica ——— */}
          {isTrading ? (
            <div className="space-y-4">
              <SectionTitle hint="Performance metrics / Métricas de performance — usadas para avaliar a candidatura">
                2 · Trading performance
              </SectionTitle>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Markets you trade / teach *</label>
                <Chips options={MARKET_OPTIONS} selected={markets} onToggle={toggle(markets, setMarkets)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Trading style *</label>
                  <select className={inputClass} value={tradingStyle} onChange={(e) => setTradingStyle(e.target.value)} required>
                    <option value="" disabled>Select…</option>
                    {TRADING_STYLE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Account size you manage <span className="text-gray-500">(optional)</span></label>
                  <input className={inputClass} value={accountSizeRange} onChange={(e) => setAccountSizeRange(e.target.value)} placeholder="$5k, $10k-50k…" maxLength={40} />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Average monthly return (%) *</label>
                  <input className={inputClass} value={avgMonthlyReturn} onChange={(e) => setAvgMonthlyReturn(e.target.value)} placeholder="e.g. 4-6%" maxLength={40} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Max drawdown (%) *</label>
                  <input className={inputClass} value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} placeholder="e.g. 12%" maxLength={40} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Win rate (%) *</label>
                  <input className={inputClass} value={winRate} onChange={(e) => setWinRate(e.target.value)} placeholder="e.g. 58%" maxLength={40} required />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Verified track record link *</label>
                  <input className={inputClass} value={trackRecordUrl} onChange={(e) => setTrackRecordUrl(e.target.value)} placeholder="Myfxbook, FXBlue, investor link…" maxLength={200} required />
                </div>
              </div>
              <p className="text-xs text-gray-600">
                A verified track record (Myfxbook, FXBlue or an investor/read-only link) is required — unverified
                screenshots are not enough. / É obrigatório um track record verificável; capturas de ecrã soltas não chegam.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <SectionTitle hint="Audience & results / Audiência e resultados — usados para avaliar a candidatura">
                2 · Audience & results
              </SectionTitle>
              {(showUgcFields || !roleFocus) && (
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Platforms where you create content {showUgcFields ? "*" : ""}</label>
                  <Chips options={PLATFORM_OPTIONS} selected={platforms} onToggle={toggle(platforms, setPlatforms)} />
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                {(showUgcFields || !roleFocus) && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1.5">Total followers (all platforms) {showUgcFields ? "*" : ""}</label>
                      <select className={inputClass} value={followersTotal} onChange={(e) => setFollowersTotal(e.target.value)} required={showUgcFields}>
                        <option value="" disabled>Select…</option>
                        {FOLLOWERS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1.5">Average engagement / views <span className="text-gray-500">(optional)</span></label>
                      <input className={inputClass} value={engagementRate} onChange={(e) => setEngagementRate(e.target.value)} placeholder="e.g. 5% eng. · 10k avg views" maxLength={80} />
                    </div>
                  </>
                )}
                {showSalesFields && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm text-gray-300 mb-1.5">What small products have you sold? *</label>
                    <input className={inputClass} value={productsTypes} onChange={(e) => setProductsTypes(e.target.value)} placeholder="Ebooks, templates, presets, courses, print-on-demand…" maxLength={200} required />
                  </div>
                )}
              </div>
              {showSalesFields && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1.5">Sales results *</label>
                  <textarea
                    className={`${inputClass} min-h-[80px]`}
                    value={salesResults}
                    onChange={(e) => setSalesResults(e.target.value)}
                    placeholder="Monthly revenue range, units sold, best launch… (e.g. $500-1 500/month, 300+ units in 2025)"
                    maxLength={200}
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Links to your best content / portfolio *</label>
                <textarea
                  className={`${inputClass} min-h-[80px]`}
                  value={portfolioLinks}
                  onChange={(e) => setPortfolioLinks(e.target.value)}
                  placeholder="Profile links, best posts/reels, sales pages, store…"
                  maxLength={1000}
                  required
                />
              </div>
            </div>
          )}

          {/* ——— Comprovativo de alunos/comunidade ——— */}
          <div className="space-y-4">
            <SectionTitle hint="Proof of students or community / Comprovativo de alunos ou comunidade — obrigatório">
              3 · Students & community
            </SectionTitle>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">Students / community size *</label>
                <select className={inputClass} value={communitySize} onChange={(e) => setCommunitySize(e.target.value)} required>
                  <option value="" disabled>Select…</option>
                  {COMMUNITY_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1.5">
                  Other links <span className="text-gray-500">(website, socials — optional)</span>
                </label>
                <input className={inputClass} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" maxLength={1000} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Proof of having had students or a community *
              </label>
              <textarea
                className={`${inputClass} min-h-[100px]`}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                placeholder="Links to your community/group, course page, testimonials, reviews, screenshots folder (Drive)…"
                maxLength={2000}
                required
              />
              <p className="text-xs text-gray-600 mt-1.5 flex items-start gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gold-500/70" />
                Share verifiable proof: community links, testimonials, reviews or a Drive folder with evidence. /
                Partilha comprovativos verificáveis: links da comunidade, testemunhos ou pasta Drive com evidências.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">
                Teaching / mentoring experience <span className="text-gray-500">(optional)</span>
              </label>
              <textarea
                className={`${inputClass} min-h-[80px]`}
                value={teachingExperience}
                onChange={(e) => setTeachingExperience(e.target.value)}
                placeholder="Courses, mentorships, communities you've taught…"
                maxLength={1000}
              />
            </div>
          </div>

          {/* ——— Motivação ——— */}
          <div className="space-y-4">
            <SectionTitle hint="Motivation / Motivação">4 · Why MoreThanMoney?</SectionTitle>
            <div>
              <label className="block text-sm text-gray-300 mb-1.5">Why do you want to join MoreThanMoney? *</label>
              <textarea
                className={`${inputClass} min-h-[120px]`}
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                placeholder="Tell us about your journey and why you want to educate…"
                maxLength={2000}
                required
              />
            </div>
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

          <p className="text-center text-xs text-gray-600 flex items-center justify-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" />
            Educational content — not financial advice. Results are not guaranteed. · morethanmoney.pt
          </p>
        </form>
      </section>
    </div>
  )
}
