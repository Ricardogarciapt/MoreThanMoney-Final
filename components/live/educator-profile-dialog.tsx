"use client"
import { useEffect, useState } from "react"

import Link from "next/link"
import { Calendar, Circle, GraduationCap, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import EducatorFeedbacksList from "@/components/live/educator-feedbacks-list"
import { LmsPlaylistSection } from "@/components/live/lms-playlist-section"
import { useAuth } from "@/contexts/auth-context"
import { podeAcederAoTier } from "@/lib/perfil-ui"

/** Acesso à playlist da sala pelo tier — a MESMA regra do lobby, e agora o mesmo código. */
function canAccessPlaylist(
  userPlan: string | undefined,
  userType: string | undefined,
  memberCategory: string | undefined,
  tier: "free" | "all" | "app_member" | "premium" | "vip" | null | undefined,
): boolean {
  return podeAcederAoTier(
    { user_type: userType, member_category: memberCategory, subscription_plan: userPlan },
    tier,
  )
}

export type EducatorProfilePublic = {
  id: string
  display_name: string
  bio?: string | null
  avatar_url?: string | null
  specialty?: string | null
  academy?: { id?: string; name: string; slug?: string } | null
  is_live?: boolean
}

type StreamPreview = {
  id: string
  title: string
  is_live: boolean
  scheduled_start_at?: string | null
  academy?: { name: string } | null
  playlist_url?: string | null
  playlist_title?: string | null
  playlist_access_tier?: "all" | "app_member" | "premium" | "vip" | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  educator: EducatorProfilePublic | null
  streams: StreamPreview[]
  streamsLoading?: boolean
}

export default function EducatorProfileDialog({
  open,
  onOpenChange,
  educator,
  streams,
  streamsLoading = false,
}: Props) {
  const { user } = useAuth()
  const now = Date.now()
  const [courseIdx, setCourseIdx] = useState(0)
  // CURSOS próprios do educador (lms_educator_playlists) — somam-se às playlists das salas.
  const [ownPlaylists, setOwnPlaylists] = useState<
    { id: string; title: string; url: string; image_url: string | null; access_tier: string | null }[]
  >([])
  useEffect(() => {
    if (!open || !educator?.id) return
    let cancelled = false
    fetch(`/api/live-sessions/educators/${educator.id}/playlists`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setOwnPlaylists(j?.playlists ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, educator?.id])
  const playlistStreams = [
    // Cursos próprios do educador primeiro (ordem definida por sort_order), depois as salas.
    ...ownPlaylists.map((p) => ({
      id: `own-${p.id}`,
      title: p.title,
      is_live: false,
      playlist_url: p.url,
      playlist_title: p.title,
      playlist_access_tier: (p.access_tier as StreamPreview["playlist_access_tier"]) ?? "all",
      // A capa não faz parte do StreamPreview (as salas não a têm); viaja à parte.
      __capa: p.image_url ?? null,
    })),
    ...streams.filter((s) => s.playlist_url),
  ] as StreamPreview[]
  const onlineNow = streams.filter((s) => s.is_live).slice(0, 3)
  const upcoming = streams
    .filter((s) => !s.is_live && s.scheduled_start_at && new Date(s.scheduled_start_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_start_at as string).getTime() - new Date(b.scheduled_start_at as string).getTime())
    .slice(0, 5)

  const roomHref = educator?.id ? `/live/${educator.id}` : "#"
  const isLive = educator?.is_live ?? onlineNow.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,820px)] max-w-2xl flex-col gap-0 overflow-hidden border border-[#D2A63C]/20 bg-black/95 p-0 text-white">
        <DialogHeader className="shrink-0 border-b border-[#D2A63C]/15 px-5 py-4">
          <DialogTitle className="sr-only">{educator?.display_name || "Perfil do educador"}</DialogTitle>
          {educator && (
            <div className="flex gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-[#D2A63C]/30 bg-gray-900">
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
                <p className="text-xl font-bold text-white">{educator.display_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium">
                    <Circle
                      className={`h-2 w-2 ${isLive ? "fill-emerald-400 text-emerald-400" : "fill-gray-500 text-gray-500"}`}
                    />
                    {isLive ? "Online agora" : "Offline"}
                  </span>
                  {educator.specialty && (
                    <Badge variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] text-[10px]">
                      {educator.specialty}
                    </Badge>
                  )}
                </div>
                {educator.academy?.name && (
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-gray-500">{educator.academy.name}</p>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {educator && (
            <>
              {educator.bio ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Biografia</h3>
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{educator.bio}</p>
                </section>
              ) : (
                <p className="text-sm text-gray-500 italic">Biografia em breve.</p>
              )}

              <section className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#D2A63C]" />
                  <p className="text-sm font-semibold">Agenda</p>
                </div>
                {streamsLoading ? (
                  <p className="text-xs text-gray-500">A carregar horários…</p>
                ) : (
                  <div className="space-y-3">
                    {onlineNow.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-gray-400">Online agora</p>
                        {onlineNow.map((s) => (
                          <div key={s.id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                            <p className="text-sm font-semibold">{s.title}</p>
                            <p className="text-[11px] text-gray-500">
                              {s.academy?.name ? `${s.academy.name} · ` : ""}Agora
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {upcoming.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase text-gray-400">Próximas lives</p>
                        {upcoming.map((s) => (
                          <div key={s.id} className="rounded-lg border border-gray-800 bg-black/30 px-3 py-2">
                            <p className="text-sm font-semibold">{s.title}</p>
                            <p className="text-[11px] text-gray-500">
                              {s.academy?.name ? `${s.academy.name} · ` : ""}
                              {s.scheduled_start_at
                                ? new Date(s.scheduled_start_at).toLocaleString("pt-PT")
                                : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : onlineNow.length === 0 ? (
                      <p className="text-xs text-gray-500">Sem lives agendadas neste momento.</p>
                    ) : null}
                  </div>
                )}
              </section>

              {playlistStreams.length > 0 && (
                <section className="space-y-2">
                  {/* CURSOS — playlists do educador em SEQUÊNCIA, num dropdown. Com várias playlists
                      o perfil ficava uma lista longa; assim escolhe-se o curso e vê-se só esse. */}
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-[#D2A63C]" />
                    <p className="text-sm font-semibold">Cursos</p>
                    {playlistStreams.length > 1 && (
                      <select
                        value={courseIdx}
                        onChange={(e) => setCourseIdx(Number(e.target.value))}
                        aria-label="Escolher curso"
                        className="ml-auto text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-200 max-w-[62%] truncate"
                      >
                        {playlistStreams.map((s, i) => (
                          <option key={s.id} value={i}>
                            {s.playlist_title || `${s.title} · Playlist`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {(playlistStreams.length > 1 ? [playlistStreams[Math.min(courseIdx, playlistStreams.length - 1)]] : playlistStreams).map((s) => (
                    <div key={`capa-${s.id}`} className="space-y-2">
                    {(s as unknown as { __capa?: string | null }).__capa && (
                      <div className="overflow-hidden rounded-xl border border-[#D2A63C]/20">
                        <img
                          src={(s as unknown as { __capa?: string | null }).__capa as string}
                          alt={s.playlist_title || s.title}
                          className="max-h-56 w-full object-cover object-top"
                        />
                      </div>
                    )}
                    <LmsPlaylistSection
                      defaultOpen={!s.is_live}
                      playlistUrl={s.playlist_url}
                      playlistTitle={s.playlist_title || `${s.title} · Playlist`}
                      canAccess={canAccessPlaylist(
                        (user as { subscription_plan?: string })?.subscription_plan,
                        (user as { user_type?: string })?.user_type,
                        (user as { member_category?: string })?.member_category,
                        s.playlist_access_tier,
                      )}
                      tierLabel={
                        s.playlist_access_tier === "premium"
                          ? "membros Premium (€65)"
                          : s.playlist_access_tier === "app_member"
                            ? "membros da app (€35) e superiores"
                            : s.playlist_access_tier === "vip"
                              ? "membros VIP"
                              : null
                      }
                    />
                    </div>
                  ))}
                </section>
              )}

              <EducatorFeedbacksList educatorId={educator.id} variant="channel" className="border-gray-800" />
            </>
          )}
        </div>

        {educator?.id && (
          <div className="shrink-0 border-t border-[#D2A63C]/15 px-5 py-4">
            <Link href={roomHref} className="block" onClick={() => onOpenChange(false)}>
              <Button className="w-full bg-[#D2A63C] font-semibold text-black hover:bg-[#BB8525]">
                {isLive ? "Entrar na sala" : "Ver sala do educador"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
