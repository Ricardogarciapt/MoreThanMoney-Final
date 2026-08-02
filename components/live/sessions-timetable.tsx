"use client"

import { useMemo, useState } from "react"
import { LMS_LANGUAGES, lmsLanguageFlag } from "@/lib/lms/languages"

/**
 * Horário de sessões (estilo calendário escolar) — partilhado entre a app-mobile
 * ("Próximas Sessões") e a /live ("Próximas lives"). Agrupa as sessões por dia.
 * A fonte é sempre lms_streams (scheduled_start_at), por isso fica interligado com
 * o LMS/admin e o /live automaticamente. Separa/filtra por IDIOMA do educador.
 */

export interface TimetableSession {
  id: string
  title: string
  educatorName?: string | null
  /** idioma do educador (pt/en/...) — usado para separar o horário */
  language?: string | null
  scheduledAt: string
  /** 'all' | 'app_member' | 'premium' */
  tier?: string | null
  onSelect?: () => void
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function tierLabel(tier?: string | null): { label: string; className: string } | null {
  if (!tier || tier === "all") return null
  if (tier === "free") return { label: "Gratuito", className: "bg-emerald-600 text-white" }
  if (tier === "vip") return { label: "VIP", className: "bg-[#D2A63C] text-black" }
  if (tier === "premium") return { label: "Premium", className: "bg-purple-700 text-white" }
  return { label: "Membro", className: "bg-amber-600/90 text-black" }
}

export function SessionsTimetable({
  sessions,
  emptyText = "Sem sessões agendadas.",
}: {
  sessions: TimetableSession[]
  emptyText?: string
}) {
  const [langFilter, setLangFilter] = useState<string>("all")

  const sorted = useMemo(
    () =>
      sessions
        .filter((s) => s.scheduledAt && !Number.isNaN(new Date(s.scheduledAt).getTime()))
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [sessions],
  )

  // Idiomas presentes (ordenados pela ordem oficial dos 21) — para separar o horário.
  const languagesPresent = useMemo(() => {
    const set = new Set(sorted.map((s) => (s.language || "pt")))
    return LMS_LANGUAGES.map((l) => l.code).filter((c) => set.has(c))
  }, [sorted])

  const valid = useMemo(
    () => (langFilter === "all" ? sorted : sorted.filter((s) => (s.language || "pt") === langFilter)),
    [sorted, langFilter],
  )

  if (!sorted.length) {
    return <p className="text-xs text-gray-500 px-1 py-3">{emptyText}</p>
  }

  const showLangTabs = languagesPresent.length > 1

  // Agrupar por dia
  const groups: { key: string; date: Date; items: TimetableSession[] }[] = []
  for (const s of valid) {
    const d = new Date(s.scheduledAt)
    const k = dayKey(d)
    let g = groups.find((x) => x.key === k)
    if (!g) {
      g = { key: k, date: d, items: [] }
      groups.push(g)
    }
    g.items.push(s)
  }

  const today = dayKey(new Date())
  const tomorrow = dayKey(new Date(Date.now() + 86400000))

  return (
    <div className="space-y-2">
      {showLangTabs && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLangFilter("all")}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              langFilter === "all" ? "bg-[#D2A63C] text-black" : "bg-gray-800 text-gray-300"
            }`}
          >
            Todos
          </button>
          {languagesPresent.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLangFilter(code)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                langFilter === code ? "bg-[#D2A63C] text-black" : "bg-gray-800 text-gray-300"
              }`}
            >
              {lmsLanguageFlag(code)} {code.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {!valid.length ? (
        <p className="text-xs text-gray-500 px-1 py-3">Sem sessões neste idioma.</p>
      ) : (
        <TimetableGroups groups={groups} today={today} tomorrow={tomorrow} />
      )}
    </div>
  )
}

function TimetableGroups({
  groups,
  today,
  tomorrow,
}: {
  groups: { key: string; date: Date; items: TimetableSession[] }[]
  today: string
  tomorrow: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950/80">
      {groups.map((g) => {
        const dayTag = g.key === today ? "Hoje" : g.key === tomorrow ? "Amanhã" : null
        return (
          <div key={g.key} className="border-b border-gray-800/70 last:border-b-0">
            {/* Cabeçalho do dia (coluna do horário) */}
            <div className="flex items-center gap-2 bg-gray-900/70 px-3 py-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#D2A63C]">
                {g.date.toLocaleDateString("pt-PT", { weekday: "long" })}
              </span>
              <span className="text-[11px] text-gray-400">
                {g.date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
              </span>
              {dayTag && (
                <span className="ml-auto rounded-full bg-[#D2A63C]/15 px-2 py-0.5 text-[9px] font-bold uppercase text-[#D2A63C]">
                  {dayTag}
                </span>
              )}
            </div>

            {/* Linhas (hora · sessão) */}
            <ul>
              {g.items.map((s) => {
                const dt = new Date(s.scheduledAt)
                const tier = tierLabel(s.tier)
                const Row = s.onSelect ? "button" : "div"
                return (
                  <li key={s.id} className="border-t border-gray-900/80 first:border-t-0">
                    <Row
                      {...(s.onSelect ? { onClick: s.onSelect, type: "button" as const } : {})}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                        s.onSelect ? "active:bg-gray-900/60 transition-colors" : ""
                      }`}
                    >
                      <div className="w-12 flex-shrink-0 text-center">
                        <p className="text-sm font-bold leading-tight text-white">
                          {dt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="h-8 w-px flex-shrink-0 bg-gray-800" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-white">
                          <span className="mr-1">{lmsLanguageFlag(s.language)}</span>
                          {s.title}
                        </p>
                        {s.educatorName && (
                          <p className="truncate text-[10px] text-gray-400">{s.educatorName}</p>
                        )}
                      </div>
                      {tier && (
                        <span
                          className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${tier.className}`}
                        >
                          {tier.label}
                        </span>
                      )}
                    </Row>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
