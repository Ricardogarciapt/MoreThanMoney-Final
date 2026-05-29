"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { GraduationCap, Loader2 } from "lucide-react"
import ProtectedPage from "@/components/protected-page"
import LiveStreamRoom from "@/components/live/live-stream-room"
import EducatorRatingsSection from "@/components/live/educator-ratings-section"
import { Badge } from "@/components/ui/badge"

type EducatorPublic = {
  id: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  specialty?: string | null
  academy?: { name: string } | null
}

export default function LiveByEducatorPage() {
  const params = useParams<{ educatorId: string }>()
  const educatorId = params?.educatorId || ""
  const [streamId, setStreamId] = useState<string>("")
  const [educator, setEducator] = useState<EducatorPublic | null>(null)
  const [loading, setLoading] = useState(true)
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
        const [streamsRes, ratingsRes] = await Promise.all([
          fetch(`/api/live-sessions/streams?educatorId=${educatorId}&live=true`).then((r) => r.json()),
          fetch(`/api/live-sessions/educators/${educatorId}/ratings`).then((r) => r.json()),
        ])
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

          {!loading && !streamId && (
            <p className="rounded-xl border border-dashed border-gray-700 bg-black/40 p-6 text-center text-gray-400">
              Este educador não está em direto neste momento. Podes deixar feedback na secção abaixo.
            </p>
          )}

          {!loading && streamId && <LiveStreamRoom streamId={streamId} />}

          {!loading && educatorId && (
            <EducatorRatingsSection educatorId={educatorId} streamId={streamId || null} variant="channel" />
          )}
        </div>
      </main>
    </ProtectedPage>
  )
}
