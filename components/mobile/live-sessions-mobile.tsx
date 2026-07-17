"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  Volume2,
  VolumeX,
  MessageCircle,
  MessageCircleOff,
  MessageSquare,
  X,
  Radio,
  Maximize2,
  PictureInPicture2,
  Lock,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useT } from "@/components/i18n-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import LiveFinancialDisclaimer from "@/components/live/live-financial-disclaimer"
import EmojiChatPicker from "@/components/live/emoji-chat-picker"
import EducatorRatingsSection from "@/components/live/educator-ratings-section"
import { handleLiveChatEnterKey } from "@/lib/live-chat"
import { enterLiveFullscreen } from "@/lib/live-player-viewport"
import { useLmsHlsVideo } from "@/hooks/use-lms-hls-video"
import { usePictureInPictureSupported } from "@/hooks/use-picture-in-picture-supported"
import { useLmsViewerHeartbeat } from "@/hooks/use-lms-viewer-heartbeat"
import EducatorLiveViewerBadge from "@/components/live/educator-live-viewer-badge"
import { SessionsTimetable } from "@/components/live/sessions-timetable"
import { LmsPlaylistSection } from "@/components/live/lms-playlist-section"
import { notifyXpFromResponse } from "@/lib/xp-client"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"

type StreamListItem = {
  id: string
  title: string
  thumbnail_url?: string | null
  is_live: boolean
  playback_url?: string | null
  educator?: { id: string; display_name: string; avatar_url?: string | null } | null
  academy?: { name: string } | null
  access_tier?: "all" | "app_member" | "premium" | "vip" | null
  scheduled_start_at?: string | null
  playlist_url?: string | null
  playlist_title?: string | null
  playlist_access_tier?: "all" | "app_member" | "premium" | "vip" | null
}

type TimetableApiSession = {
  id: string
  streamId: string
  educatorId?: string | null
  title: string
  educatorName?: string | null
  language?: string | null
  scheduledAt: string
  tier?: string | null
}

type StreamDetail = StreamListItem & {
  stream_key?: string | null
  hls_manifest_url?: string | null
  educator_id?: string
}

function streamVisualUrl(s: StreamListItem): string | null {
  const a = s.educator?.avatar_url?.trim()
  if (a) return a
  const t = s.thumbnail_url?.trim()
  return t || null
}

type LiveSessionsMobileProps = {
  initialStreamId?: string | null
  initialEducatorId?: string | null
  /** Fecha o canal ao mudar de separador na app-mobile */
  isActive?: boolean
}

function canAccessStream(
  memberCategory: string | null | undefined,
  userType: string | null | undefined,
  tier: "all" | "app_member" | "premium" | "vip" | null | undefined
): boolean {
  if (!tier || tier === "all") return true
  if (userType === "admin" || userType === "vip" || memberCategory === "vip") return true
  // "standard" (€35 app member) e "app_member" têm acesso ao tier app_member
  if (tier === "app_member") return (
    memberCategory === "standard" ||
    memberCategory === "app_member" ||
    memberCategory === "iq" ||
    memberCategory === "premium"
  )
  if (tier === "premium") return (
    memberCategory === "iq" ||
    memberCategory === "premium"
  )
  return false
}

export default function LiveSessionsMobile({
  initialStreamId = null,
  initialEducatorId = null,
  isActive = true,
}: LiveSessionsMobileProps) {
  const router = useRouter()
  const { toast } = useToast()
  const t = useT()

  // Upsell de sessões/aulas bloqueadas. No app iOS nativo a compra é por Apple IAP
  // (ecrã nativo) — nunca abrir checkout Stripe dentro do WebView (política Apple).
  const goUpgrade = useCallback(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    const isIOSNative = /MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)
    if (isIOSNative) {
      toast({ title: t("live.premiumContentTitle"), description: t("live.premiumContentDesc") })
      return
    }
    router.push("/upgrade")
  }, [router, toast, t])
  const { user } = useAuth()
  const [liveStreams, setLiveStreams] = useState<StreamListItem[]>([])
  const [scheduledStreams, setScheduledStreams] = useState<StreamListItem[]>([])
  const [scheduledSessions, setScheduledSessions] = useState<TimetableApiSession[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [stream, setStream] = useState<StreamDetail | null>(null)
  const [messages, setMessages] = useState<
    { id: string; sender_name: string; sender_type: string; message: string; created_at: string }[]
  >([])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [showChat, setShowChat] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [inAppFullscreen, setInAppFullscreen] = useState(false)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const prevIsLiveRef = useRef(false)
  const disclaimerTimerRef = useRef<number | null>(null)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)
  const pipSupported = usePictureInPictureSupported()

  const closeDisclaimer = () => {
    setDisclaimerOpen(false)
    if (disclaimerTimerRef.current) {
      window.clearTimeout(disclaimerTimerRef.current)
      disclaimerTimerRef.current = null
    }
  }

  const loadLive = useCallback(async () => {
    setLoading(true)
    try {
      const [liveRes, allRes, schedRes] = await Promise.all([
        fetch("/api/live-sessions/streams?live=true").then((r) => r.json()),
        fetch("/api/live-sessions/streams").then((r) => r.json()),
        fetch("/api/live-sessions/schedule?days=21&limit=14").then((r) => r.json()).catch(() => ({ data: [] })),
      ])
      setLiveStreams(liveRes.data || [])
      // Próximas lives: não live, com scheduled_start_at no futuro
      const now = Date.now()
      const upcoming = (allRes.data || [] as StreamListItem[])
        .filter((s: StreamListItem) => !s.is_live && s.scheduled_start_at && new Date(s.scheduled_start_at).getTime() > now)
        .sort((a: StreamListItem, b: StreamListItem) => new Date(a.scheduled_start_at!).getTime() - new Date(b.scheduled_start_at!).getTime())
        .slice(0, 10)
      setScheduledStreams(upcoming)
      setScheduledSessions((schedRes.data || []) as TimetableApiSession[])
    } catch {
      setLiveStreams([])
      setScheduledStreams([])
      setScheduledSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLive()
    const t = setInterval(loadLive, 15000)
    return () => clearInterval(t)
  }, [loadLive])

  // ── Realtime: toast when educator starts a stream ────────────────────────
  useEffect(() => {
    if (!isActive) return
    const channel = supabase
      .channel("lms_streams_live_status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lms_streams" },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const newRow = payload.new as { is_live?: boolean; title?: string; educator_id?: string }
          const oldRow = payload.old as { is_live?: boolean }
          // Only when going from offline → live
          if (newRow.is_live && !oldRow.is_live) {
            toast({
              title: t("live.liveStartingTitle"),
              description: `${newRow.title || t("live.sessionFallback")} ${t("live.liveStartedDesc")} `,
              duration: 6000,
            })
            loadLive()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isActive, loadLive, toast, t])

  const openModal = useCallback(
    async (id: string): Promise<boolean> => {
      prevIsLiveRef.current = false
      closeDisclaimer()
      setSelectedId(id)
      setOpen(true)
      setShowChat(true)
      setFeedbackOpen(false)
      setInAppFullscreen(false)
      setText("")
      router.replace(`/app-mobile?tab=live&stream=${encodeURIComponent(id)}`, {
        scroll: false,
      })

      try {
        const streamRes = await fetch(`/api/live-sessions/streams/${id}`).then((r) => r.json())
        if (!streamRes?.success || !streamRes.data) {
          toast({
            title: t("live.roomUnavailableTitle"),
            description: streamRes?.error || t("live.roomUnavailableDesc"),
            variant: "destructive",
          })
          setOpen(false)
          setSelectedId(null)
          setStream(null)
          setMessages([])
          router.replace("/app-mobile?tab=live", { scroll: false })
          return false
        }
        setStream(streamRes.data)
        const msgRes = await fetch(`/api/live-sessions/streams/${id}/messages`).then((r) => r.json())
        setMessages(msgRes.data || [])
        return true
      } catch {
        toast({
          title: t("live.openLiveErrorTitle"),
          description: t("live.openLiveErrorDesc"),
          variant: "destructive",
        })
        setOpen(false)
        setSelectedId(null)
        setStream(null)
        setMessages([])
        router.replace("/app-mobile?tab=live", { scroll: false })
        return false
      }
    },
    [router, toast, t]
  )

  const resetModal = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    setOpen(false)
    setSelectedId(null)
    setStream(null)
    setMessages([])
    setInAppFullscreen(false)
    setFeedbackOpen(false)
    prevIsLiveRef.current = false
    closeDisclaimer()
  }, [])

  const closeModal = useCallback(() => {
    resetModal()
    router.replace("/app-mobile?tab=live", { scroll: false })
  }, [resetModal, router])

  const openedFromUrlRef = useRef(false)
  const hasDeepLink = Boolean(initialStreamId?.trim() || initialEducatorId?.trim())

  useEffect(() => {
    if (!isActive) return
    if (openedFromUrlRef.current) return

    const streamId = initialStreamId?.trim()
    const educatorId = initialEducatorId?.trim()
    if (!streamId && !educatorId) return

    const run = async () => {
      if (streamId) {
        const ok = await openModal(streamId)
        if (ok) openedFromUrlRef.current = true
        return
      }

      if (educatorId) {
        try {
          const res = await fetch(
            `/api/live-sessions/streams?educatorId=${encodeURIComponent(educatorId)}&live=true`
          ).then((r) => r.json())
          const first = (res.data || [])[0]
          if (first?.id) {
            const ok = await openModal(first.id)
            if (ok) openedFromUrlRef.current = true
          } else {
            toast({
              title: t("live.educatorOfflineTitle"),
              description: t("live.educatorOfflineDesc"),
              variant: "destructive",
            })
            router.replace("/app-mobile?tab=live", { scroll: false })
          }
        } catch {
          toast({
            title: t("live.errorTitle"),
            description: t("live.openEducatorRoomError"),
            variant: "destructive",
          })
        }
      }
    }

    void run()
  }, [isActive, initialStreamId, initialEducatorId, openModal, toast, router, t])

  useEffect(() => {
    if (!initialStreamId?.trim() && !initialEducatorId?.trim()) {
      openedFromUrlRef.current = false
    }
  }, [initialStreamId, initialEducatorId])

  useEffect(() => {
    if (!isActive && open && !hasDeepLink) {
      resetModal()
    }
  }, [isActive, open, resetModal, hasDeepLink])

  const refreshModal = useCallback(async () => {
    if (!selectedId) return
    const [streamRes, msgRes] = await Promise.all([
      fetch(`/api/live-sessions/streams/${selectedId}`).then((r) => r.json()),
      fetch(`/api/live-sessions/streams/${selectedId}/messages`).then((r) => r.json()),
    ])
    setStream(streamRes.data || null)
    setMessages(msgRes.data || [])
  }, [selectedId])

  useEffect(() => {
    if (!open || !selectedId) return
    const { stream } = (window as any).__mtm_state || { stream: null }
    const isLive = Boolean(stream?.is_live)
    const interval = isLive ? 15000 : 5000
    const id = setInterval(refreshModal, interval)
    return () => clearInterval(id)
  }, [open, selectedId, refreshModal])

  useEffect(() => {
    const onFs = () => setIsNativeFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onFs)
    onFs()
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const hlsUrl = useMemo(() => {
    if (stream?.hls_manifest_url) return String(stream.hls_manifest_url)
    return ""
  }, [stream?.hls_manifest_url])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.volume = volume
    el.muted = muted || volume === 0
  }, [volume, muted, hlsUrl, stream?.playback_url])

  const toggleMute = () => {
    const el = videoRef.current
    if (!el) return
    const next = !el.muted
    setMuted(next)
    el.muted = next
    if (!next && volume === 0) setVolume(0.5)
  }

  const handleVolumeChange = (value: number) => {
    setVolume(value)
    if (value > 0) setMuted(false)
  }

  const send = async () => {
    const m = text.trim()
    if (!m || !selectedId) return
    setSending(true)
    try {
      const res = await fetch(`/api/live-sessions/streams/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ message: m }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.xp) void notifyXpFromResponse(data.xp)
      setText("")
      refreshModal()
    } finally {
      setSending(false)
    }
  }

  const appendEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`)
  }

  const isLive = Boolean(stream?.is_live)
  const useHls = Boolean(hlsUrl && (stream?.is_live || !stream?.playback_url))
  const { viewerCount } = useLmsViewerHeartbeat(selectedId, Boolean(open && selectedId && isLive))
  useLmsHlsVideo(videoRef, useHls ? hlsUrl : null)

  const iframePlaybackUrl = useMemo(() => {
    const raw = String(stream?.playback_url || "").trim()
    if (!raw) return ""
    try {
      const u = new URL(raw)
      u.searchParams.set("autoplay", "1")
      u.searchParams.set("mute", "1")
      return u.toString()
    } catch {
      return raw
    }
  }, [stream?.playback_url])

  useEffect(() => {
    if (!open) {
      prevIsLiveRef.current = false
      closeDisclaimer()
      return
    }

    const isLiveNow = Boolean(stream?.is_live)
    if (!isLiveNow) {
      prevIsLiveRef.current = false
      closeDisclaimer()
      return
    }

    // Mostra apenas na transição para "live" para não reaparecer a cada refresh.
    if (isLiveNow && !prevIsLiveRef.current) {
      prevIsLiveRef.current = true
      setDisclaimerOpen(true)

      if (disclaimerTimerRef.current) window.clearTimeout(disclaimerTimerRef.current)
      disclaimerTimerRef.current = window.setTimeout(() => {
        setDisclaimerOpen(false)
        disclaimerTimerRef.current = null
      }, 3000)
    }
  }, [open, stream?.is_live])

  const openFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }
    if (inAppFullscreen) {
      setInAppFullscreen(false)
      return
    }
    const entered = await enterLiveFullscreen({
      video: useHls ? videoRef.current : null,
      iframe: stream?.playback_url ? iframeRef.current : null,
      fallbackContainer: playerWrapRef.current,
    })
    if (!entered) setInAppFullscreen((v) => !v)
  }

  const openPiP = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture()
        return
      }
      await video.requestPictureInPicture()
    } catch (error) {
      console.warn("[live-sessions-mobile] PiP indisponível:", error)
    }
  }

  const videoClassBase =
    "w-full bg-black object-contain " +
    (inAppFullscreen
      ? "h-full min-h-0 flex-1"
      : "h-full min-h-0 flex-1 max-sm:h-full max-sm:min-h-0 sm:h-auto sm:min-h-[min(62dvh,520px)] sm:max-h-[min(80dvh,600px)] sm:flex-none sm:aspect-video sm:max-h-none")

  const iframeClassBase =
    "w-full border-0 bg-black object-contain " +
    (inAppFullscreen
      ? "h-full min-h-0 flex-1"
      : "h-full min-h-0 flex-1 max-sm:h-full max-sm:min-h-0 sm:h-auto sm:min-h-[min(62dvh,520px)] sm:max-h-[min(80dvh,600px)] sm:flex-none sm:aspect-video sm:max-h-none")

  const hasPlayback = Boolean(stream?.playback_url || hlsUrl)

  return (
    <div className="min-h-[50vh] px-2 pb-28 pt-2 sm:px-3" data-live-player-guard>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[#D2A63C]">{t("live.title")}</h2>
          <p className="text-xs text-gray-500">{t("live.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#D2A63C]/30 text-gray-200"
            onClick={() => loadLive()}
          >
            {t("live.refresh")}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
        </div>
      )}

      {!loading && liveStreams.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D2A63C]/25 bg-black/40 p-8 text-center text-sm text-gray-400">
          <Radio className="mx-auto mb-2 h-8 w-8 text-[#D2A63C]/50" />
          {t("live.emptyLiveNow")}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {!loading &&
          liveStreams.map((s) => {
            const img = streamVisualUrl(s)
            const educatorName = s.educator?.display_name || t("live.educatorFallback")
            const hasAccess = canAccessStream(
              (user as any)?.member_category,
              (user as any)?.user_type,
              s.access_tier
            )
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => (hasAccess ? openModal(s.id) : goUpgrade())}
                className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-gray-950/90 text-left shadow-md transition active:scale-[0.98] hover:border-[#D2A63C]/40"
              >
                <div className="relative aspect-video w-full bg-gray-900">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain object-center"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">{t("live.noImage")}</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
                    {t("live.badgeLive")}
                  </span>
                  {s.access_tier === "premium" && (
                    <span className="absolute right-2 top-2 rounded-md bg-purple-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
                      Premium
                    </span>
                  )}
                  {s.access_tier === "app_member" && (
                    <span className="absolute right-2 top-2 rounded-md bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black shadow">
                      {t("live.badgeMember")}
                    </span>
                  )}
                  {!hasAccess && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 backdrop-blur-sm">
                      <Lock className="h-6 w-6 text-white/70" />
                      <p className="text-[10px] font-semibold text-white/90 text-center px-2">
                        {s.access_tier === "premium" ? t("live.packPremiumPrice") : t("live.packMemberPrice")}
                      </p>
                      <span className="mt-0.5 rounded-full bg-[#D2A63C] px-2 py-0.5 text-[9px] font-bold text-black">
                        {t("live.upgradeCta")}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-xs font-semibold text-white">{s.title}</p>
                  {s.educator?.display_name ? (
                    <p
                      className="mt-0.5 truncate text-[10px] text-gray-400"
                      aria-label={`${t("live.channelOf")} ${educatorName}`}
                    >
                      {s.educator.display_name}
                    </p>
                  ) : null}
                  {s.academy?.name && (
                    <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-gray-600">{s.academy.name}</p>
                  )}
                </div>
              </button>
            )
          })}
      </div>

      {/* ── Próximas sessões (Horário — estilo calendário escolar) ──────────── */}
      {scheduledSessions.length > 0 && (
        <div className="mt-6 mb-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#D2A63C]" />
            {t("live.scheduleHeading")}
          </h3>
          <SessionsTimetable
            sessions={scheduledSessions.map((s) => ({
              id: s.id,
              title: s.title,
              educatorName: s.educatorName ?? null,
              language: s.language ?? null,
              scheduledAt: s.scheduledAt,
              tier: s.tier,
            }))}
          />
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (v) {
            setOpen(true)
            return
          }
          closeModal()
        }}
      >
        <DialogContent
          data-live-player-guard
          className={cn(
            "flex flex-col gap-0 overflow-hidden border-0 bg-[#08080a] p-0 shadow-none [&>button]:hidden",
            "fixed left-0 right-0 top-0 z-[100] w-screen max-w-[100vw] translate-x-0 translate-y-0 rounded-none",
            "bottom-[var(--app-mobile-footer-tabs-height,calc(5.5rem+env(safe-area-inset-bottom,0px)))] h-[calc(100dvh-var(--app-mobile-footer-tabs-height,calc(5.5rem+env(safe-area-inset-bottom,0px))))] min-h-0",
            "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[min(92dvh,820px)] sm:max-h-[min(92dvh,820px)] sm:w-[calc(100vw-1rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-[#D2A63C]/25 sm:shadow-lg",
            showChat ? "sm:h-[min(92dvh,820px)]" : "sm:h-auto sm:max-h-[85dvh]"
          )}
        >
          <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-2 border-b border-[#D2A63C]/15 bg-black/40 px-2 py-2 pr-2 sm:px-3">
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="line-clamp-2 text-left text-[13px] font-semibold text-white sm:text-sm">
                {stream?.title || t("live.streamTitleFallback")}
              </DialogTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-[9px] text-gray-500 sm:text-[10px]">
                  {stream?.educator?.display_name}
                  {stream?.academy?.name ? ` · ${stream.academy.name}` : ""}
                  {isLive ? ` · ${t("live.onlineTag")}` : ""}
                </p>
                {isLive && (
                  <EducatorLiveViewerBadge
                    isLive
                    count={viewerCount}
                    className="scale-90 origin-left py-0.5 text-[10px]"
                  />
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-gray-400 hover:text-white"
              onClick={closeModal}
            >
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>

          {stream?.playlist_url && (
            <div className="shrink-0 border-b border-gray-800/70 bg-black/30 px-2 py-2 sm:px-3">
              <LmsPlaylistSection
                playlistUrl={stream.playlist_url}
                playlistTitle={stream.playlist_title}
                canAccess={canAccessStream(
                  (user as any)?.member_category,
                  (user as any)?.user_type,
                  stream.playlist_access_tier,
                )}
                tierLabel={
                  stream.playlist_access_tier === "premium"
                    ? t("live.playlistTierPremium")
                    : stream.playlist_access_tier === "app_member"
                      ? t("live.playlistTierMember")
                      : null
                }
              />
            </div>
          )}

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              !showChat && "max-sm:min-h-0"
            )}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden border-b border-gray-800/80 px-0 py-1 sm:gap-2 sm:py-2 sm:px-3">
              <div
                ref={playerWrapRef}
                className={cn(
                  "relative flex min-h-0 w-full flex-1 flex-col overflow-hidden border-y border-[#D2A63C]/20 bg-black sm:rounded-xl sm:border sm:border-[#D2A63C]/15",
                  inAppFullscreen
                    ? "min-h-0 flex-1 rounded-none border-x-0 sm:rounded-xl sm:border-x"
                    : "flex-1 border-x-0 sm:min-h-0 sm:flex-none sm:rounded-xl sm:border-x"
                )}
              >
                {disclaimerOpen && (
                  <div className="absolute left-2 top-2 z-50 w-full max-w-[360px]">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={closeDisclaimer}
                        className="absolute -top-2 -right-2 z-10 rounded-full border border-gray-700 bg-black/70 p-1 text-gray-200 hover:bg-black/90"
                        aria-label={t("live.closeNotice")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <LiveFinancialDisclaimer />
                    </div>
                  </div>
                )}
                {isLive && hlsUrl ? (
                  <video
                    key={hlsUrl}
                    ref={videoRef}
                    className={videoClassBase}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : iframePlaybackUrl ? (
                  <iframe
                    ref={iframeRef}
                    src={iframePlaybackUrl}
                    title={stream?.title || t("live.streamTitleFallback")}
                    className={iframeClassBase}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : hlsUrl ? (
                  <video
                    key={hlsUrl}
                    ref={videoRef}
                    className={videoClassBase}
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center px-4 text-center text-xs text-gray-500 sm:aspect-video">
                    {t("live.noPlayback")}
                  </div>
                )}
              </div>

              {hasPlayback && (
                <div className="shrink-0 space-y-2 px-2 pb-1 sm:px-0 sm:pb-0" data-live-player-guard>
                  {useHls && (
                    <div className="flex items-center gap-2 rounded-xl border border-[#D2A63C]/15 bg-black/50 px-2 py-2">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="shrink-0 text-[#D2A63C]/80 hover:text-[#D2A63C]"
                        aria-label={muted || volume === 0 ? t("live.unmute") : t("live.mute")}
                      >
                        {muted || volume === 0 ? (
                          <VolumeX className="h-4 w-4" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="h-2 flex-1 accent-[#D2A63C]"
                        aria-label={t("live.volume")}
                      />
                      <span className="w-8 text-right text-[10px] text-gray-500">
                        {Math.round((muted ? 0 : volume) * 100)}%
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 border-gray-700 text-gray-200 sm:flex-none"
                      onClick={openFullscreen}
                    >
                      <Maximize2 className="mr-2 h-4 w-4" />
                      {inAppFullscreen || isNativeFullscreen ? t("live.reduce") : t("live.fullscreen")}
                    </Button>
                    {useHls && pipSupported && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 border-gray-700 text-gray-200 sm:flex-none"
                        onClick={openPiP}
                      >
                        <PictureInPicture2 className="mr-2 h-4 w-4" />
                        PiP
                      </Button>
                    )}
                  </div>

                  {isLive && stream?.playback_url && !useHls && (
                    <p className="text-[10px] text-gray-500">
                      {t("live.embedVolumeHint")}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 border-gray-700 text-gray-200"
                      onClick={() => setShowChat((v) => !v)}
                    >
                      {showChat ? (
                        <>
                          <MessageCircleOff className="mr-2 h-4 w-4" />
                          {t("live.hideChat")}
                        </>
                      ) : (
                        <>
                          <MessageCircle className="mr-2 h-4 w-4" />
                          {t("live.showChat")}
                        </>
                      )}
                    </Button>
                    {stream?.educator?.id ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 border-[#D2A63C]/40 text-[#D2A63C]"
                        onClick={() => setFeedbackOpen(true)}
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        {t("live.feedback")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {showChat && (
              <div className="flex min-h-0 max-sm:max-h-[38dvh] flex-1 flex-col border-t border-gray-800/80 bg-[#08080a]/95">
                <div className="min-h-[120px] flex-1 overflow-y-auto px-3 py-2">
                  <div className="space-y-2">
                    {messages.map((msg) => (
                      <div key={msg.id} className="text-xs">
                        <p className={msg.sender_type === "educator" ? "text-[#D2A63C]" : "text-blue-300"}>
                          {msg.sender_name}
                        </p>
                        <p className="text-gray-200">{msg.message}</p>
                      </div>
                    ))}
                    {messages.length === 0 && <p className="text-xs text-gray-500">{t("live.noMessages")}</p>}
                  </div>
                </div>
                <div className="shrink-0 border-t border-gray-800 p-2">
                  <div className="flex gap-2">
                    <textarea
                      className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-700 bg-black/60 px-2 py-2 text-sm text-white"
                      rows={2}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) =>
                        handleLiveChatEnterKey(e, send, { disabled: !text.trim() || sending })
                      }
                      placeholder={t("live.messagePlaceholder")}
                    />
                    <div className="flex flex-col gap-1">
                      <EmojiChatPicker onPick={appendEmoji} />
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                        disabled={!text.trim() || sending}
                        onClick={send}
                      >
                        {t("live.send")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent
          className={cn(
            "z-[110] flex max-h-[min(85dvh,640px)] flex-col gap-0 overflow-hidden border border-[#D2A63C]/30 bg-[#08080a] p-0",
            "fixed left-1/2 top-1/2 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl"
          )}
        >
          <DialogHeader className="shrink-0 border-b border-[#D2A63C]/15 px-4 py-3">
            <DialogTitle className="text-base font-semibold text-[#D2A63C]">{t("live.feedback")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {stream?.educator?.id ? (
              <EducatorRatingsSection
                educatorId={stream.educator.id}
                streamId={selectedId}
                variant="channel"
                embeddedForm
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
