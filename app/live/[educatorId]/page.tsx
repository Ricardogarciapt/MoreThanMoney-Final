"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { GraduationCap, Loader2, Presentation, X } from "lucide-react"
import ProtectedPage from "@/components/protected-page"
import LiveStreamRoom from "@/components/live/live-stream-room"
import EducatorRatingsSection from "@/components/live/educator-ratings-section"
import { LmsPlaylistSection } from "@/components/live/lms-playlist-section"
import { useAuth } from "@/contexts/auth-context"
import { Badge } from "@/components/ui/badge"

function planAllows(userPlan: string | null | undefined, userType: string | null | undefined, tier?: string | null): boolean {
  if (userType === "admin") return true
  const t = tier || "all"
  if (t === "all") return true
  if (t === "app_member") return userPlan === "app_member" || userPlan === "premium"
  if (t === "premium") return userPlan === "premium"
  return false
}

type EducatorPublic = {
  id: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  specialty?: string | null
  academy?: { name: string } | null
}

/**
 * Apresentações incorporadas por educador (Google Slides publicado).
 * start=false → abre em pausa; o utilizador controla os slides pelos controlos nativos.
 */
const EDUCATOR_PRESENTATIONS: Record<string, { title: string; description: string; embedUrl: string }> = {
  "c6e156d5-842d-4aee-855e-d52c63e764c6": {
    title: "Básicos de Trading",
    description: "Fundamentos essenciais — avança ao teu ritmo.",
    embedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQ2upJdpxAtl0U_z_Y8wTl4wjXCb3gKMUqvOT9wHFXaIq2lI6FAWHQi5ieE1WywphmO1P3j0UmVkM-s/pubembed?start=false&loop=false&delayms=60000",
  },
}

/** Modal com a apresentação incorporada — o utilizador controla os slides. */
function PresentationModal({
  title,
  embedUrl,
  onClose,
}: {
  title: string
  embedUrl: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-2xl border border-[#D2A63C]/30 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2 text-[#D2A63C]">
            <Presentation className="h-5 w-5" />
            <span className="text-sm font-semibold">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* 960×569 ≈ 16:9.5 — caixa responsiva que mantém o rácio dos slides */}
        <div className="relative w-full" style={{ aspectRatio: "960 / 569" }}>
          <iframe
            src={embedUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            frameBorder="0"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}

export default function LiveByEducatorPage() {
  const params = useParams<{ educatorId: string }>()
  const educatorId = params?.educatorId || ""
  const { user } = useAuth()
  const [streamId, setStreamId] = useState<string>("")
  const [educator, setEducator] = useState<EducatorPublic | null>(null)
  const [playlist, setPlaylist] = useState<{ url: string | null; tier: string | null; title: string | null }>({ url: null, tier: null, title: null })
  const [loading, setLoading] = useState(true)
  const [showPresentation, setShowPresentation] = useState(false)
  const presentation = EDUCATOR_PRESENTATIONS[educatorId]
  // Track consecutive empty polls to avoid killing the player on transient API failures
  const emptyPollsRef = useRef(0)
  // Only show the loading spinner once — never re-hide LiveStreamRoom on interval polls
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!educatorId) return
    const load = async () => {
      // Do NOT call setLoading(true) here — that would unmount LiveStreamRoom every 20s!
      // loading starts true (useState(true)) and goes false after the first successful fetch.
      try {
        const [streamsRes, ratingsRes, allStreamsRes] = await Promise.all([
          fetch(`/api/live-sessions/streams?educatorId=${educatorId}&live=true`).then((r) => r.json()),
          fetch(`/api/live-sessions/educators/${educatorId}/ratings`).then((r) => r.json()),
          fetch(`/api/live-sessions/streams?educatorId=${educatorId}`).then((r) => r.json()).catch(() => ({ data: [] })),
        ])
        const withPlaylist = (allStreamsRes.data || []).find((s: { playlist_url?: string | null }) => s.playlist_url)
        if (withPlaylist)
          setPlaylist({
            url: withPlaylist.playlist_url,
            tier: withPlaylist.playlist_access_tier ?? null,
            title: withPlaylist.playlist_title ?? null,
          })
        const first = (streamsRes.data || [])[0]
        if (first?.id) {
          emptyPollsRef.current = 0
          setStreamId((prev) => (prev === first.id ? prev : first.id))
        } else {
          // Only clear the stream after 3 consecutive empty polls (~60s) to survive transient hiccups
          emptyPollsRef.current += 1
          if (emptyPollsRef.current >= 3) setStreamId("")
        }
        if (ratingsRes.success && ratingsRes.educator) {
          setEducator(ratingsRes.educator as EducatorPublic)
        }
      } finally {
        // Only clear the loading state once (initial mount). Subsequent polls must NOT touch loading
        // or they would briefly hide LiveStreamRoom and restart the HLS player.
        if (!hasLoadedRef.current) {
          hasLoadedRef.current = true
          setLoading(false)
        }
      }
    }
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [educatorId])

  return (
    <ProtectedPage redirectPath="/login?redirect=/live" loadingMessage="A validar acesso ao canal...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Link
            href="/live-sessions"
            className="inline-flex text-sm text-gray-400 hover:text-[#D2A63C]"
          >
            ← Lobby Live Sessions
          </Link>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
            </div>
          )}

          {!loading && educator && (
            <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-2 border-[#D2A63C]/30 bg-gray-900">
                {educator.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={educator.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-600">
                    <GraduationCap className="h-10 w-10 opacity-50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-white">{educator.display_name}</h1>
                {educator.specialty && (
                  <Badge variant="outline" className="mt-2 border-[#D2A63C]/40 text-[#D2A63C]">
                    {educator.specialty}
                  </Badge>
                )}
                {educator.academy?.name && (
                  <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">{educator.academy.name}</p>
                )}
                {educator.bio && (
                  <p className="mt-3 text-sm text-gray-400 leading-relaxed">{educator.bio}</p>
                )}
              </div>
            </section>
          )}

          {!loading && presentation && (
            <button
              type="button"
              onClick={() => setShowPresentation(true)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-[#D2A63C]/25 bg-gradient-to-br from-[#D2A63C]/10 to-transparent p-4 text-left transition hover:border-[#D2A63C]/50 hover:from-[#D2A63C]/15"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D2A63C]/15 text-[#D2A63C]">
                <Presentation className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{presentation.title}</p>
                <p className="text-xs text-gray-400">{presentation.description}</p>
              </div>
              <span className="shrink-0 rounded-lg border border-[#D2A63C]/40 px-3 py-1.5 text-xs font-semibold text-[#D2A63C] transition group-hover:bg-[#D2A63C] group-hover:text-black">
                Abrir
              </span>
            </button>
          )}

          {!loading && !streamId && (
            <p className="rounded-xl border border-dashed border-gray-700 bg-black/40 p-6 text-center text-gray-400">
              Este educador não está em direto neste momento. Podes deixar feedback na secção abaixo.
            </p>
          )}

          {!loading && streamId && <LiveStreamRoom streamId={streamId} />}

          {!loading && playlist.url && (
            <LmsPlaylistSection
              playlistUrl={playlist.url}
              playlistTitle={playlist.title}
              canAccess={planAllows(
                (user as { subscription_plan?: string })?.subscription_plan,
                (user as { user_type?: string })?.user_type,
                playlist.tier,
              )}
              tierLabel={
                playlist.tier === "premium"
                  ? "membros Premium (€65)"
                  : playlist.tier === "app_member"
                    ? "membros da app (€35) e superiores"
                    : null
              }
              defaultOpen
            />
          )}

          {!loading && educatorId && (
            <EducatorRatingsSection educatorId={educatorId} streamId={streamId || null} variant="channel" />
          )}
        </div>

        {presentation && showPresentation && (
          <PresentationModal
            title={presentation.title}
            embedUrl={presentation.embedUrl}
            onClose={() => setShowPresentation(false)}
          />
        )}
      </main>
    </ProtectedPage>
  )
}
