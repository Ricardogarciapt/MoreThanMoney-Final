"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Globe, Monitor, Users, TrendingUp, ArrowRight, Loader2, LineChart, Smartphone, ShoppingBag, FileText, Dumbbell, Headphones } from "lucide-react"

/**
 * /docs/forms — hub público de formulários MTM (um formulário por tema).
 * Lista os formulários ativos definidos em `custom_forms` (geridos em /admin/forms).
 */

interface FormSummary {
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  badge: string | null
}

const PERKS = [
  { icon: Globe, label: "Global Community" },
  { icon: Monitor, label: "Flexible & Remote" },
  { icon: Users, label: "Training & Support" },
  { icon: TrendingUp, label: "Grow. Impact. Prosper." },
]

const BADGE_ICONS: Record<string, typeof LineChart> = {
  trading: LineChart,
  ugc: Smartphone,
  sales: ShoppingBag,
  fitness: Dumbbell,
  work: Headphones,
}

export default function FormsHubPage() {
  const [forms, setForms] = useState<FormSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => r.json())
      .then((d) => setForms(Array.isArray(d?.forms) ? d.forms : []))
      .catch(() => setForms([]))
      .finally(() => setLoading(false))
  }, [])

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
          <p className="text-sm text-gray-500">
            Choose your role and apply below — one application form per position.
          </p>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      {/* Lista de formulários */}
      <section className="max-w-3xl mx-auto px-4 py-14">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading forms…
          </div>
        ) : forms.length === 0 ? (
          <p className="text-center text-gray-500 py-20">
            No application forms available right now.
          </p>
        ) : (
          <div className="space-y-4">
            {forms.map((form) => {
              const Icon = BADGE_ICONS[(form.badge || "").toLowerCase()] || FileText
              return (
                <Link
                  key={form.slug}
                  href={`/docs/forms/${form.slug}`}
                  className="group block rounded-2xl border border-gray-800 bg-black/50 p-6 hover:border-gold-500/60 hover:bg-gold-500/5 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl border border-gold-500/25 bg-gold-500/10 p-3 shrink-0">
                      <Icon className="w-6 h-6 text-gold-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-white uppercase">{form.title}</h2>
                        {form.badge && (
                          <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-400">
                            {form.badge}
                          </span>
                        )}
                      </div>
                      {form.subtitle && <p className="text-sm text-gold-500/80 mt-1">{form.subtitle}</p>}
                      {form.description && (
                        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{form.description}</p>
                      )}
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-gold-500 transition-colors shrink-0 mt-1" />
                  </div>
                  <div className="mt-4 text-right">
                    <span className="inline-block rounded-lg bg-gold-500 px-5 py-2 text-xs font-bold text-black uppercase tracking-wide group-hover:bg-gold-400 transition-colors">
                      Apply now
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-12">
          Educational content — not financial advice. Results are not guaranteed. · morethanmoney.pt
        </p>
      </section>
    </div>
  )
}
