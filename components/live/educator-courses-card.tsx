"use client"

import { useEffect, useState } from "react"
import { GraduationCap, Lock, PlayCircle, ChevronDown } from "lucide-react"
import { LmsPlaylistSection } from "@/components/live/lms-playlist-section"

/**
 * CARD DE CURSOS do educador — junta as playlists PRÓPRIAS do educador
 * (lms_educator_playlists, geridas por ele no Studio) com as playlists das SALAS dele,
 * e aplica o gating por tier. Usado na página da sala ao vivo (/live/[educatorId]).
 *
 * Com vários cursos mostra um seletor; com um só, abre-o diretamente.
 */
export interface CourseItem {
  id: string
  title: string
  url: string
  tier: string | null
  /** 'educator' = curso próprio · 'room' = playlist de uma sala. */
  origin: "educator" | "room"
}

function allows(plan: string | null | undefined, userType: string | null | undefined, tier?: string | null): boolean {
  if (userType === "admin") return true
  const t = tier || "all"
  if (t === "all") return true
  if (t === "app_member") return plan === "app_member" || plan === "premium"
  if (t === "premium") return plan === "premium"
  if (t === "vip") return false
  return false
}

function tierLabel(tier: string | null): string | null {
  if (tier === "premium") return "membros Premium (€65)"
  if (tier === "app_member") return "membros da app (€35) e superiores"
  if (tier === "vip") return "membros VIP"
  return null
}

export default function EducatorCoursesCard({
  educatorId,
  roomCourses = [],
  userPlan,
  userType,
  defaultOpen = false,
}: {
  educatorId: string
  /** Playlists vindas das salas do educador (a página já as tem). */
  roomCourses?: CourseItem[]
  userPlan?: string | null
  userType?: string | null
  defaultOpen?: boolean
}) {
  const [own, setOwn] = useState<CourseItem[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!educatorId) return
    let cancelled = false
    fetch(`/api/live-sessions/educators/${educatorId}/playlists`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        const list: CourseItem[] = (j?.playlists ?? []).map(
          (p: { id: string; title: string; url: string; access_tier: string | null }) => ({
            id: `own-${p.id}`,
            title: p.title,
            url: p.url,
            tier: p.access_tier ?? "all",
            origin: "educator" as const,
          }),
        )
        setOwn(list)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [educatorId])

  // Cursos próprios primeiro (ordem definida pelo educador), depois as salas.
  const courses = [...own, ...roomCourses]
  if (!courses.length) return null

  const current = courses[Math.min(idx, courses.length - 1)]
  const canAccess = allows(userPlan, userType, current.tier)

  return (
    <section className="rounded-2xl border border-[#D2A63C]/25 bg-gradient-to-b from-[#D2A63C]/[0.07] to-transparent p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <GraduationCap className="h-5 w-5 text-[#D2A63C]" />
        <h2 className="text-base font-semibold text-white">Cursos do educador</h2>
        <span className="rounded-full bg-[#D2A63C]/15 px-2 py-0.5 text-[11px] text-[#D2A63C]">
          {courses.length} {courses.length === 1 ? "curso" : "cursos"}
        </span>
      </div>

      {courses.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {courses.map((c, i) => {
            const locked = !allows(userPlan, userType, c.tier)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setIdx(i)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  i === idx
                    ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]"
                    : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {locked ? <Lock className="h-3 w-3" /> : <PlayCircle className="h-3 w-3" />}
                <span className="max-w-[190px] truncate">{c.title}</span>
              </button>
            )
          })}
        </div>
      )}

      <LmsPlaylistSection
        key={current.id}
        defaultOpen={defaultOpen || courses.length === 1}
        playlistUrl={current.url}
        playlistTitle={current.title}
        canAccess={canAccess}
        tierLabel={tierLabel(current.tier)}
      />

      {courses.length > 1 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500">
          <ChevronDown className="h-3 w-3" /> Escolhe um curso acima para ver as aulas.
        </p>
      )}
    </section>
  )
}
