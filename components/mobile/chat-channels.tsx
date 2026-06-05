"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import {
  ArrowLeft,
  Send,
  ImageIcon,
  Hash,
  Lock,
  ChevronRight,
  X,
  ExternalLink,
  Loader2,
  AlertCircle,
  CornerUpLeft,
  Copy,
  Trash2,
  GraduationCap,
  MessageCircle,
  TrendingUp,
  Check,
} from "lucide-react"
import Image from "next/image"
import MentionInput from "./mention-input"
import MentionText from "./mention-text"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Channel {
  id: string
  slug: string
  name: string
  description: string | null
  parent_slug: string | null
  position: number
  children?: Channel[]
}

interface MessageProfile {
  full_name: string | null
  avatar_url: string | null
  user_type: string | null
  member_category: string | null
}

interface ChatMessage {
  id: string
  channel_slug: string
  user_id: string | null
  content: string | null
  image_url: string | null
  link_url: string | null
  link_preview: { title?: string; description?: string; image?: string; domain?: string } | null
  message_type: string
  telegram_sender: string | null
  reply_to_id: string | null
  is_deleted: boolean
  created_at: string
  profile?: MessageProfile | null
  reply_to_message?: {
    content: string | null
    image_url?: string | null
    telegram_sender?: string | null
    profile?: MessageProfile | MessageProfile[] | null
  } | null
}

// ─── Derived permissions (no DB columns — all derived from slug) ───────────────

function isReadOnly(slug: string) {
  return slug === "trade-ideas-setup" || slug === "premium-ideas"
}

function requiresPremium(slug: string) {
  return slug === "premium-ideas"
}

function canReadChannel(slug: string, user: any): boolean {
  if (!user?.is_active) return false
  if (requiresPremium(slug)) {
    return (
      user.subscription_plan === "premium" ||
      user.member_category === "iq" ||
      user.member_category === "vip" ||
      user.user_type === "admin"
    )
  }
  return true
}

function requiresBrokerUID(slug: string) {
  return slug === "trade-ideas" || slug === "trade-ideas-setup" || slug === "premium-ideas"
}

function canWriteChannel(slug: string, user: any): boolean {
  if (!user?.is_active) return false
  if (isReadOnly(slug) || slug === "trade-ideas") return false
  if (slug === "geral") return true
  if (slug === "trading") {
    if (user.subscription_plan === "premium" || user.member_category === "iq") return true
    if (user.user_type === "admin") return true
    if (user.created_at) {
      const joinedAt = new Date(user.created_at)
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      return joinedAt <= threeMonthsAgo
    }
    return false
  }
  if (slug === "cripto") {
    return (
      user.user_type === "admin" ||
      user.member_category === "iq" ||
      user.member_category === "vip"
    )
  }
  return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBadgeInfo(profile?: MessageProfile | null) {
  if (!profile) return null
  const cat = profile.member_category || profile.user_type
  const map: Record<string, { label: string; color: string }> = {
    admin: { label: "Admin", color: "text-red-400" },
    vip: { label: "VIP", color: "text-yellow-400" },
    iq: { label: "IQ", color: "text-blue-400" },
  }
  return cat ? (map[cat] ?? null) : null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Hoje"
  if (d.toDateString() === yesterday.toDateString()) return "Ontem"
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/)
  return match ? match[1] : null
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ profile, size = 32 }: { profile?: MessageProfile | null; size?: number }) {
  if (profile?.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={profile.full_name || "User"}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
      />
    )
  }
  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?"
  return (
    <div
      className="rounded-full bg-[#D2A63C]/20 border border-[#D2A63C]/40 flex items-center justify-center text-[#D2A63C] font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )
}

// ─── Link Preview Card ────────────────────────────────────────────────────────

function LinkPreviewCard({
  preview,
  url,
}: {
  preview: NonNullable<ChatMessage["link_preview"]>
  url: string
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-lg border border-gray-700 bg-gray-800/80 overflow-hidden hover:border-[#D2A63C]/40 transition-colors"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-full h-28 object-cover"
          onError={(e) => {
            ;(e.target as HTMLElement).style.display = "none"
          }}
        />
      )}
      <div className="p-2">
        {preview.domain && (
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            {preview.domain}
          </p>
        )}
        {preview.title && (
          <p className="text-xs font-semibold text-white mt-0.5 line-clamp-2">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{preview.description}</p>
        )}
      </div>
    </a>
  )
}

// ─── Message Context Menu (long press — iOS action sheet style) ───────────────

function MessageContextMenu({
  msg,
  isOwn,
  canWrite,
  isAdmin,
  onClose,
  onReply,
  onDelete,
}: {
  msg: ChatMessage
  isOwn: boolean
  canWrite: boolean
  isAdmin: boolean
  onClose: () => void
  onReply: () => void
  onDelete: () => void
}) {
  const hasText = !!msg.content
  const canDel = isOwn || isAdmin

  const handleCopy = () => {
    if (msg.content) { try { navigator.clipboard.writeText(msg.content) } catch {} }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-[#1C1C1E] rounded-t-2xl overflow-hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Message preview */}
        <div className="mx-4 mt-4 mb-3 px-3 py-2.5 bg-gray-800 rounded-xl border-l-[3px] border-[#D2A63C]">
          <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight mb-1">
            {isOwn ? "Tu" : (msg.profile?.full_name || msg.telegram_sender || "Membro")}
          </p>
          <p className="text-sm text-gray-300 line-clamp-2 leading-snug">
            {msg.image_url && !msg.content ? "📷 Imagem" : msg.content || "📷 Imagem"}
          </p>
        </div>

        <div className="h-px bg-gray-700/40 mx-4 mb-1" />

        {/* Actions */}
        <div className="px-3 py-1">
          {canWrite && (
            <button
              onTouchEnd={() => { onReply(); onClose() }}
              onClick={() => { onReply(); onClose() }}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <CornerUpLeft className="w-5 h-5 text-[#D2A63C]" />
              <span className="text-[15px] text-white">Responder</span>
            </button>
          )}
          {hasText && (
            <button
              onTouchEnd={handleCopy}
              onClick={handleCopy}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <Copy className="w-5 h-5 text-blue-400" />
              <span className="text-[15px] text-white">Copiar texto</span>
            </button>
          )}
          {canDel && (
            <>
              <div className="h-px bg-gray-700/40 mx-3 my-1" />
              <button
                onTouchEnd={() => { onDelete(); onClose() }}
                onClick={() => { onDelete(); onClose() }}
                className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-red-900/30"
              >
                <Trash2 className="w-5 h-5 text-red-400" />
                <span className="text-[15px] text-red-400">Apagar mensagem</span>
              </button>
            </>
          )}
        </div>

        {/* Cancel */}
        <div className="px-4 pt-1 pb-2">
          <button
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-gray-700/80 text-white text-[15px] font-semibold active:bg-gray-600"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  canWrite,
  isAdmin,
  onReply,
  onDelete,
  onLongPress,
}: {
  msg: ChatMessage
  isOwn: boolean
  canWrite: boolean
  isAdmin: boolean
  onReply: (msg: ChatMessage) => void
  onDelete: (msgId: string) => void
  onLongPress: (msg: ChatMessage) => void
}) {
  const isTelegram = msg.message_type === "telegram_forward"
  const badge = getBadgeInfo(msg.profile)

  // ── Swipe gesture state ───────────────────────────────────────────────────
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [snapOpen, setSnapOpen] = useState(false)
  const [animating, setAnimating] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedSignificantly = useRef(false)
  const swipingHorizontal = useRef(false)

  // ── Action tray config ────────────────────────────────────────────────────
  const trayItems: Array<{ key: string; Icon: React.ComponentType<any>; color: string }> = [
    ...(canWrite ? [{ key: "reply", Icon: CornerUpLeft, color: "#D2A63C" }] : []),
    ...(msg.content ? [{ key: "copy", Icon: Copy, color: "#60A5FA" }] : []),
    ...((isOwn || isAdmin) ? [{ key: "delete", Icon: Trash2, color: "#F87171" }] : []),
  ]
  // Width: 8px padding + n×40px buttons + (n-1)×6px gaps + 6px right buffer
  const TRAY_W = trayItems.length > 0
    ? 14 + trayItems.length * 40 + (trayItems.length - 1) * 6
    : 0
  const SNAP_THRESHOLD = TRAY_W * 0.5

  // ── Touch handlers ────────────────────────────────────────────────────────

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    movedSignificantly.current = false
    swipingHorizontal.current = false

    // Long-press timer — fires if no significant movement
    longPressTimer.current = setTimeout(() => {
      if (!movedSignificantly.current) {
        try { (navigator as any).vibrate?.(15) } catch {}
        onLongPress(msg)
      }
    }, 480)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)

    // Cancel long-press on any real movement
    if (Math.abs(dx) > 6 || dy > 6) {
      movedSignificantly.current = true
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }

    if (TRAY_W === 0) return
    // If clearly scrolling vertically, don't swipe
    if (!swipingHorizontal.current && dy > Math.abs(dx) && dy > 10) return

    if (dx > 0) {
      swipingHorizontal.current = true
      setAnimating(false)
      const base = snapOpen ? TRAY_W : 0
      const raw = base + dx * (base + dx > TRAY_W ? 0.15 : 0.85)
      setSwipeOffset(Math.min(raw, TRAY_W + 22))
    } else if (snapOpen && dx < 0) {
      swipingHorizontal.current = true
      setAnimating(false)
      setSwipeOffset(Math.max(TRAY_W + dx * 0.85, 0))
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    setAnimating(true)

    if (!movedSignificantly.current && snapOpen) {
      // Tap on open tray — close it
      setSnapOpen(false)
      setSwipeOffset(0)
      return
    }
    if (swipeOffset >= SNAP_THRESHOLD) {
      setSnapOpen(true)
      setSwipeOffset(TRAY_W)
    } else {
      setSnapOpen(false)
      setSwipeOffset(0)
    }
  }

  const handleTrayAction = (key: string) => {
    setSnapOpen(false)
    setAnimating(true)
    setSwipeOffset(0)
    if (key === "reply") onReply(msg)
    else if (key === "copy" && msg.content) { try { navigator.clipboard.writeText(msg.content) } catch {} }
    else if (key === "delete") onDelete(msg.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mb-2" style={{ position: "relative" }}>
      {/* Action tray — sits in normal flow on the left, hidden until swipe */}
      {TRAY_W > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center gap-1.5 pl-2"
          style={{ width: TRAY_W }}
        >
          {trayItems.map(({ key, Icon, color }) => (
            <button
              key={key}
              onTouchEnd={(e) => { e.stopPropagation(); handleTrayAction(key) }}
              onClick={() => handleTrayAction(key)}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-700/90 active:scale-90 transition-transform"
            >
              <Icon style={{ width: 18, height: 18, color }} />
            </button>
          ))}
        </div>
      )}

      {/* Sliding content — covers tray via bg-gray-900 */}
      <div
        className="relative bg-gray-900"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: animating ? "transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)" : "none",
          zIndex: 1,
          WebkitTouchCallout: "none" as any,
          userSelect: "none" as any,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTransitionEnd={() => setAnimating(false)}
      >
        <div className={`flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"} items-end`}>
          {!isOwn && <Avatar profile={msg.profile} size={28} />}

          <div className={`flex flex-col max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}>
            {/* Name row */}
            {!isOwn && (
              <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                <span className="text-xs font-semibold text-white">
                  {isTelegram ? msg.telegram_sender || "Telegram" : msg.profile?.full_name || "Membro"}
                </span>
                {isTelegram && <TelegramIcon className="w-3 h-3 text-[#26A5E4]" />}
                {badge && <span className={`text-[10px] ${badge.color}`}>{badge.label}</span>}
              </div>
            )}

            {/* Quoted reply */}
            {msg.reply_to_message && (() => {
              const rm = msg.reply_to_message!
              const rmProfile = Array.isArray(rm.profile) ? rm.profile[0] : rm.profile
              const rmName = rmProfile?.full_name || rm.telegram_sender || "Membro"
              const rmContent = rm.image_url && !rm.content ? "📷 Imagem" : rm.content || "📷 Imagem"
              return (
                <div className="mb-1 w-full rounded-lg border-l-[3px] border-[#D2A63C] bg-black/25 px-2 py-1">
                  <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight">{rmName}</p>
                  <p className="text-[11px] text-gray-300 truncate leading-tight mt-0.5">
                    <MentionText text={rmContent} />
                  </p>
                </div>
              )
            })()}

            {/* Bubble */}
            <div
              className={`relative rounded-2xl px-3 py-2 text-sm ${
                isOwn
                  ? "bg-[#D2A63C] text-black rounded-tr-sm"
                  : isTelegram
                  ? "bg-[#162d3d] border border-[#26A5E4]/20 text-white rounded-tl-sm"
                  : "bg-gray-800 text-white rounded-tl-sm"
              }`}
            >
              {msg.image_url && (
                <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                  <img src={msg.image_url} alt="Imagem" className="rounded-xl max-w-full mb-1" style={{ maxHeight: 200 }} />
                </a>
              )}
              {msg.content && (
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[13.5px]">
                  <MentionText text={msg.content} />
                </p>
              )}
              {msg.link_preview && msg.link_url && (
                <LinkPreviewCard preview={msg.link_preview} url={msg.link_url} />
              )}
              <p className={`text-[10px] mt-0.5 text-right leading-none ${isOwn ? "text-black/40" : "text-gray-600"}`}>
                {formatTime(msg.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Channel View ─────────────────────────────────────────────────────────────

function ChannelView({
  channel,
  onBack,
  currentUser,
}: {
  channel: Channel
  onBack: () => void
  currentUser: any
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [linkPreview, setLinkPreview] = useState<ChatMessage["link_preview"]>(null)
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)
  const [fetchingPreview, setFetchingPreview] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewTimer = useRef<NodeJS.Timeout | null>(null)

  // Lock parent scroll container so only the message list scrolls
  useEffect(() => {
    const scrollArea = document.querySelector<HTMLElement>(".app-mobile-scroll-area")
    if (!scrollArea) return
    const prev = scrollArea.style.overflow
    scrollArea.style.overflow = "hidden"
    return () => {
      scrollArea.style.overflow = prev
    }
  }, [])

  const canWrite = canWriteChannel(channel.slug, currentUser)
  const isAdmin = currentUser?.user_type === "admin"
  const [contextMsg, setContextMsg] = useState<ChatMessage | null>(null)

  const handleDelete = async (msgId: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true }).eq("id", msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  // ── Fetch messages ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select(
        `
        *,
        profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
        reply_to_message:chat_messages!reply_to_id(
          content, image_url, telegram_sender,
          profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category)
        )
      `
      )
      .eq("channel_slug", channel.slug)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(100)

    if (!error && data) setMessages(data as unknown as ChatMessage[])
    setLoading(false)
  }, [channel.slug])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const sub = supabase
      .channel(`chat:${channel.slug}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_slug=eq.${channel.slug}`,
        },
        async (payload: { new: Record<string, unknown> }) => {
          const { data } = await supabase
            .from("chat_messages")
            .select(
              `
              *,
              profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
              reply_to_message:chat_messages!reply_to_id(
                content, image_url,
                profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category)
              )
            `
            )
            .eq("id", payload.new.id)
            .single()

          if (data) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === (data as any).id)) return prev
              return [...prev, data as unknown as ChatMessage]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [channel.slug])

  // ── Link preview detection ────────────────────────────────────────────────

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)

    const url = extractFirstUrl(text)
    if (!url) {
      setLinkPreview(null)
      setDetectedUrl(null)
      return
    }
    if (url === detectedUrl) return

    previewTimer.current = setTimeout(async () => {
      setFetchingPreview(true)
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        if (res.ok) {
          const raw = await res.json()
          // API returns { preview: LinkPreviewData }; normalise to our ChatMessage shape
          const p = raw.preview || raw
          setLinkPreview({
            title: p.title || null,
            description: p.description || null,
            image: p.image || null,
            domain: p.siteName || p.domain || (() => { try { return new URL(url).hostname } catch { return url } })(),
          })
          setDetectedUrl(url)
        }
      } catch {
        // silent
      } finally {
        setFetchingPreview(false)
      }
    }, 700)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    if ((!text.trim() && !linkPreview) || sending) return
    setSending(true)

    const payload: Record<string, any> = {
      channel_slug: channel.slug,
      user_id: currentUser.id,
      content: text.trim() || null,
      message_type: "text",
      reply_to_id: replyTo?.id ?? null,
    }

    if (detectedUrl && linkPreview) {
      payload.link_url = detectedUrl
      payload.link_preview = linkPreview
    }

    const { error } = await supabase.from("chat_messages").insert(payload)
    if (!error) {
      setText("")
      setReplyTo(null)
      setLinkPreview(null)
      setDetectedUrl(null)

      // Push notification for trading / cripto channels
      if (channel.slug === "trading" || channel.slug === "cripto") {
        const notifTitle = channel.slug === "trading" ? "📈 Nova mensagem em #Trading" : "₿ Nova mensagem em #Cripto"
        const notifBody  = (text.trim() || "Nova mensagem!").substring(0, 120)
        fetch("/api/notifications/send-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            all: true,
            title: notifTitle,
            body: notifBody,
            data: { type: "chat_message", url: "/app-mobile", channel: channel.slug },
          }),
        }).catch(() => {})
      }
    }
    setSending(false)
  }

  // ── Upload image ──────────────────────────────────────────────────────────

  const handleImageUpload = async (file: File) => {
    if (uploading) return
    setUploading(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("channel_slug", channel.slug)

    try {
      const res = await fetch("/api/chat/upload-image", { method: "POST", body: formData })
      if (res.ok) {
        const { publicUrl } = await res.json()
        const { error: imgErr } = await supabase.from("chat_messages").insert({
          channel_slug: channel.slug,
          user_id: currentUser.id,
          image_url: publicUrl,
          content: text.trim() || null,
          message_type: "image",
          reply_to_id: replyTo?.id ?? null,
        })
        setText("")
        setReplyTo(null)

        // Push notification for trading / cripto channels
        if (!imgErr && (channel.slug === "trading" || channel.slug === "cripto")) {
          const notifTitle = channel.slug === "trading" ? "📈 Nova imagem em #Trading" : "₿ Nova imagem em #Cripto"
          fetch("/api/notifications/send-push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              all: true,
              title: notifTitle,
              body: text.trim() || "Imagem partilhada!",
              data: { type: "chat_message", url: "/app-mobile", channel: channel.slug },
            }),
          }).catch(() => {})
        }
      }
    } catch {
      // silent
    } finally {
      setUploading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const renderMessages = () => {
    let lastDay = ""
    return messages.map((msg) => {
      const day = formatDay(msg.created_at)
      const showDay = day !== lastDay
      lastDay = day
      return (
        <div key={msg.id}>
          {showDay && (
            <div className="flex items-center gap-2 my-4">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-[11px] text-gray-500 px-2">{day}</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
          )}
          <MessageBubble
            msg={msg}
            isOwn={msg.user_id === currentUser?.id}
            canWrite={canWrite}
            isAdmin={isAdmin}
            onReply={setReplyTo}
            onDelete={handleDelete}
            onLongPress={setContextMsg}
          />
        </div>
      )
    })
  }

  return (
    // Fill the viewport minus the app header (~68 px) and the bottom tab bar (~66 px)
    <div
      className="flex flex-col bg-gray-900"
      style={{ height: "calc(100dvh - 152px)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-lg active:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <h2 className="font-semibold text-white text-sm leading-tight truncate">
              {channel.name}
            </h2>
          </div>
          {channel.description && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5">{channel.description}</p>
          )}
        </div>
        {requiresPremium(channel.slug) && (
          <div className="flex items-center gap-1 text-[#D2A63C] text-[11px]">
            <Lock className="w-3.5 h-3.5" />
            <span>Premium</span>
          </div>
        )}
        {isReadOnly(channel.slug) && (
          <TelegramIcon className="w-4 h-4 text-[#26A5E4]" />
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Hash className="w-10 h-10 text-gray-700" />
            <p className="text-gray-500 text-sm">Ainda não há mensagens em #{channel.name}.</p>
            {canWrite && <p className="text-gray-600 text-xs">Sê o primeiro a escrever!</p>}
          </div>
        ) : (
          <>
            {renderMessages()}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input / read-only bar */}
      {canWrite ? (
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-3 py-2">
          {/* Reply banner */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 pl-2 pr-1 py-1.5 bg-gray-800 rounded-xl border-l-[3px] border-[#D2A63C]">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight">
                  {replyTo.profile?.full_name || replyTo.telegram_sender || "Membro"}
                </p>
                <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                  {replyTo.image_url && !replyTo.content ? "📷 Imagem" : replyTo.content || "📷 Imagem"}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="p-1 rounded-full hover:bg-gray-700 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          )}

          {/* Link preview banner */}
          {(linkPreview || fetchingPreview) && (
            <div className="mb-2 px-2 py-1.5 bg-gray-800 rounded-lg">
              {fetchingPreview ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>A carregar pré-visualização...</span>
                </div>
              ) : linkPreview ? (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {linkPreview.domain && (
                      <p className="text-[10px] text-gray-500">{linkPreview.domain}</p>
                    )}
                    {linkPreview.title && (
                      <p className="text-xs text-white font-medium truncate">{linkPreview.title}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setLinkPreview(null)
                      setDetectedUrl(null)
                    }}
                    className="p-0.5"
                  >
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2 rounded-lg text-gray-400 hover:text-[#D2A63C] hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageUpload(file)
                e.target.value = ""
              }}
            />

            <div className="flex-1 bg-gray-800 rounded-2xl px-3 py-2.5">
              <MentionInput
                value={text}
                onChange={setText}
                placeholder="Escreve uma mensagem... (@nome para mencionar)"
                className="w-full bg-transparent text-white text-[14px] placeholder-gray-500 resize-none outline-none leading-relaxed"
                rows={1}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={(!text.trim() && !linkPreview) || sending}
              className="p-2 rounded-full bg-[#D2A63C] text-black transition-all disabled:opacity-30 disabled:bg-gray-700 disabled:text-gray-500 flex-shrink-0"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-2">
          {isReadOnly(channel.slug) ? (
            <>
              <TelegramIcon className="w-4 h-4 text-[#26A5E4]" />
              <p className="text-xs text-gray-500">Só leitura</p>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-gray-600" />
              <p className="text-xs text-gray-500">
                {channel.slug === "trading"
                  ? "Precisas de 3 meses de membro ou plano Premium para publicar."
                  : "Não tens permissão para publicar neste canal."}
              </p>
            </>
          )}
        </div>
      )}

      {/* Long-press context menu */}
      {contextMsg && (
        <MessageContextMenu
          msg={contextMsg}
          isOwn={contextMsg.user_id === currentUser?.id}
          canWrite={canWrite}
          isAdmin={isAdmin}
          onClose={() => setContextMsg(null)}
          onReply={() => { setReplyTo(contextMsg); setContextMsg(null) }}
          onDelete={() => { handleDelete(contextMsg.id); setContextMsg(null) }}
        />
      )}
    </div>
  )
}

// ─── Broker UID Modal ─────────────────────────────────────────────────────────

function BrokerUidModal({
  onSave,
  onClose,
}: {
  onSave: (uid: string) => void
  onClose: () => void
}) {
  const [uid, setUid] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    const trimmed = uid.trim()
    if (!trimmed) { setError("Insere o teu número de conta TMGM."); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error("Sem sessão")
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ broker_uid: trimmed })
        .eq("id", session.user.id)
      if (dbErr) throw dbErr
      onSave(trimmed)
    } catch {
      setError("Erro ao guardar. Tenta novamente.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full bg-gray-900 rounded-t-3xl overflow-hidden shadow-2xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
      >
        {/* Top handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#D2A63C]/10 border border-[#D2A63C]/30 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-[#D2A63C]" />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg leading-tight">Conta de Corretora Necessária</h3>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                Para acederes aos canais de Trade Ideas, precisas de ter uma conta activa na <strong className="text-white">TMGM</strong>, parceira oficial MTM.
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          {/* UID input */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">
              O teu número de conta TMGM (UID)
            </label>
            <input
              type="text"
              value={uid}
              onChange={e => { setUid(e.target.value); setError("") }}
              placeholder="Ex: 12345678"
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/60 font-mono"
            />
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            <p className="text-xs text-gray-500 mt-1.5">
              Encontras o teu UID no painel da TMGM após o login.
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> A guardar...</>
            ) : (
              <><Check className="w-4 h-4" /> Confirmar e entrar</>
            )}
          </button>

          {/* Open account link */}
          <div className="text-center space-y-1">
            <p className="text-xs text-gray-500">Ainda não tens conta?</p>
            <a
              href="/app-mobile/accountopen"
              className="text-sm text-[#D2A63C] font-medium underline"
            >
              Abre a tua conta TMGM aqui →
            </a>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Channel List ─────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  onSelect,
  user,
  isSubChannel = false,
}: {
  channel: Channel
  onSelect: (c: Channel) => void
  user: any
  isSubChannel?: boolean
}) {
  const locked = !canReadChannel(channel.slug, user)

  return (
    <button
      onClick={() => !locked && onSelect(channel)}
      disabled={locked}
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all ${
        isSubChannel ? "pl-10" : ""
      } ${locked ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-800/60 active:bg-gray-800"}`}
    >
      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
        {locked ? (
          <Lock className="w-4 h-4 text-gray-500" />
        ) : isReadOnly(channel.slug) ? (
          <TelegramIcon className="w-4 h-4 text-[#26A5E4]" />
        ) : (
          <Hash className="w-4 h-4 text-gray-400" />
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-medium text-sm ${locked ? "text-gray-500" : "text-white"}`}
          >
            {channel.name}
          </span>
          {requiresPremium(channel.slug) && !locked && (
            <span className="text-[10px] text-[#D2A63C] border border-[#D2A63C]/40 px-1 rounded">
              Premium
            </span>
          )}
        </div>
        {channel.description && (
          <p className="text-[11px] text-gray-500 truncate mt-0.5">{channel.description}</p>
        )}
      </div>
      {!locked && <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />}
    </button>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

interface EducatorProfile {
  id: string
  full_name?: string | null
  username?: string | null
  avatar_url?: string | null
  user_type?: string | null
}

export default function ChatChannels() {
  const { user } = useAuth()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatTab, setChatTab] = useState<"channels" | "dm">("channels")
  const [educators, setEducators] = useState<EducatorProfile[]>([])
  const [loadingEducators, setLoadingEducators] = useState(false)
  const [sendingDm, setSendingDm] = useState<string | null>(null)
  const [brokerUid, setBrokerUid] = useState<string | null>(null)
  const [brokerUidModal, setBrokerUidModal] = useState(false)
  const [pendingChannel, setPendingChannel] = useState<Channel | null>(null)

  const loadEducators = async () => {
    if (educators.length > 0) return
    setLoadingEducators(true)
    try {
      const [eduRes, adminRes] = await Promise.all([
        fetch("/api/messages/search-users?query=&role=educator"),
        fetch("/api/messages/search-users?query=&role=admin"),
      ])
      const eduData = eduRes.ok ? await eduRes.json() : { users: [] }
      const adminData = adminRes.ok ? await adminRes.json() : { users: [] }
      const all: EducatorProfile[] = [...(eduData.users || []), ...(adminData.users || [])]
      const seen = new Set<string>()
      setEducators(all.filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true }))
    } catch { /* silent */ } finally {
      setLoadingEducators(false)
    }
  }

  const startDmWithEducator = async (educatorId: string) => {
    setSendingDm(educatorId)
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otherUserId: educatorId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.conversation?.id) {
          window.location.href = `/messages?conversation=${data.conversation.id}`
        }
      }
    } catch { /* silent */ } finally {
      setSendingDm(null)
    }
  }

  useEffect(() => {
    const fetchChannels = async () => {
      const { data, error } = await supabase
        .from("chat_channels")
        .select("id, slug, name, description, parent_slug, position")
        .order("position", { ascending: true })

      if (error) {
        setError("Erro ao carregar canais.")
        setLoading(false)
        return
      }

      const all: Channel[] = (data || []) as Channel[]
      const parents = all.filter((c) => !c.parent_slug)
      const tree = parents.map((p) => ({
        ...p,
        children: all.filter((c) => c.parent_slug === p.slug),
      }))

      setChannels(tree)
      setLoading(false)
    }

    const fetchBrokerUid = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        const { data } = await supabase
          .from("profiles")
          .select("broker_uid")
          .eq("id", session.user.id)
          .single()
        if (data?.broker_uid) setBrokerUid(data.broker_uid)
      } catch {}
    }

    fetchChannels()
    fetchBrokerUid()
  }, [])

  const handleChannelSelect = (channel: Channel) => {
    if (requiresBrokerUID(channel.slug) && !brokerUid) {
      setPendingChannel(channel)
      setBrokerUidModal(true)
      return
    }
    setActiveChannel(channel)
  }

  const handleBrokerUidSaved = (uid: string) => {
    setBrokerUid(uid)
    setBrokerUidModal(false)
    if (pendingChannel) {
      setActiveChannel(pendingChannel)
      setPendingChannel(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-gray-400 text-sm">{error}</p>
      </div>
    )
  }

  // Channel view — ChannelView component handles its own height + parent-scroll-lock
  if (activeChannel) {
    return (
      <ChannelView
        channel={activeChannel}
        onBack={() => setActiveChannel(null)}
        currentUser={user}
      />
    )
  }

  // Channel list
  return (
    <div className="pb-4">
      {/* Broker UID Modal */}
      {brokerUidModal && (
        <BrokerUidModal
          onSave={handleBrokerUidSaved}
          onClose={() => { setBrokerUidModal(false); setPendingChannel(null) }}
        />
      )}
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-white">Chat</h2>
        <p className="text-xs text-gray-500 mt-0.5">Canais da comunidade MTM</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setChatTab("channels")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
            chatTab === "channels"
              ? "text-[#D2A63C] border-b-2 border-[#D2A63C]"
              : "text-gray-400"
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          Canais
        </button>
        <button
          onClick={() => { setChatTab("dm"); loadEducators() }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
            chatTab === "dm"
              ? "text-[#D2A63C] border-b-2 border-[#D2A63C]"
              : "text-gray-400"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          Educadores
        </button>
      </div>

      {/* Educators DM tab */}
      {chatTab === "dm" && (
        <div className="px-4 pt-4">
          {loadingEducators ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
            </div>
          ) : educators.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum educador disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">
                Fala directamente com um educador
              </p>
              {educators.map((edu) => (
                <button
                  key={edu.id}
                  disabled={sendingDm === edu.id}
                  onClick={() => startDmWithEducator(edu.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-[#D2A63C]/40 transition-all active:scale-[0.98]"
                >
                  {edu.avatar_url ? (
                    <Image
                      src={edu.avatar_url}
                      alt={edu.full_name || edu.username || "Educador"}
                      width={44}
                      height={44}
                      className="w-11 h-11 rounded-full border border-[#D2A63C]/30"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border border-[#D2A63C]/30">
                      <GraduationCap className="w-5 h-5 text-[#D2A63C]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-sm text-white truncate">
                      {edu.full_name || edu.username || "Educador"}
                    </p>
                    {edu.username && (
                      <p className="text-xs text-gray-400">@{edu.username}</p>
                    )}
                    <p className="text-[11px] text-[#D2A63C] mt-0.5">
                      {edu.user_type === "admin" ? "Admin · Educador" : "Educador"}
                    </p>
                  </div>
                  {sendingDm === edu.id ? (
                    <Loader2 className="w-4 h-4 text-[#D2A63C] animate-spin flex-shrink-0" />
                  ) : (
                    <Send className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Channels tab */}
      {chatTab === "channels" && (
        <div className="divide-y divide-gray-800/40">
          {channels.map((channel) =>
            channel.children && channel.children.length > 0 ? (
              <div key={channel.id}>
                {/* Category header */}
                <div className="px-4 pt-4 pb-1">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    {channel.name}
                  </span>
                  {channel.description && (
                    <p className="text-[11px] text-gray-600 mt-0.5">{channel.description}</p>
                  )}
                </div>
                {channel.children.map((sub) => (
                  <ChannelRow
                    key={sub.id}
                    channel={sub}
                    onSelect={handleChannelSelect}
                    user={user}
                    isSubChannel
                  />
                ))}
              </div>
            ) : (
              <ChannelRow
                key={channel.id}
                channel={channel}
                onSelect={handleChannelSelect}
                user={user}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
