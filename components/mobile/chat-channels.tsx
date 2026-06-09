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
  Search,
  Info,
  ChevronDown,
  Users,
  Inbox,
  MoreHorizontal,
  Share2,
  Paperclip,
  Link2,
  Film,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import MentionInput from "./mention-input"
import MentionText from "./mention-text"
import MemberBadge from "./member-badge"
import {
  getChannelMeta,
  formatPreviewText,
  markChannelRead,
  isChannelUnread,
} from "./chat-channel-meta"

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

interface ChannelPreview {
  channel_slug: string
  content: string | null
  image_url: string | null
  telegram_sender: string | null
  message_type: string
  created_at: string
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
    message_type?: string | null
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

async function shareMessage(msg: ChatMessage) {
  const url = msg.link_url || msg.image_url || extractFirstUrl(msg.content || "")
  const text =
    msg.content?.trim() ||
    (msg.message_type === "video" ? "Vídeo partilhado" : msg.image_url ? "Imagem partilhada" : url || "Mensagem MTM")

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text })
      return
    } catch {
      // cancelado ou indisponível
    }
  }

  const copy = [text, url].filter(Boolean).join("\n")
  try {
    await navigator.clipboard.writeText(copy)
  } catch {
    // silent
  }
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

/** Pré-visualização lazy para URLs no texto sem card guardado na DB */
function InlineUrlPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<NonNullable<ChatMessage["link_preview"]> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => {
        if (cancelled || !raw) return
        const p = raw.preview || raw
        setPreview({
          title: p.title || null,
          description: p.description || null,
          image: p.image || null,
          domain: p.siteName || p.domain || (() => { try { return new URL(url).hostname } catch { return url } })(),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [url])

  if (preview) return <LinkPreviewCard preview={preview} url={url} />

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/20 border border-gray-600/40 text-xs text-blue-300 hover:underline"
    >
      <Link2 className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{url}</span>
    </a>
  )
}

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
  onShare,
}: {
  msg: ChatMessage
  isOwn: boolean
  canWrite: boolean
  isAdmin: boolean
  onClose: () => void
  onReply: () => void
  onDelete: () => void
  onShare: () => void
}) {
  const hasText = !!msg.content
  const canDel = isOwn || isAdmin
  const shareUrl = msg.link_url || msg.image_url || extractFirstUrl(msg.content || "")

  const handleCopy = () => {
    const toCopy = msg.content || msg.link_url || msg.image_url || ""
    if (toCopy) { try { navigator.clipboard.writeText(toCopy) } catch {} }
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
            {msg.message_type === "video"
              ? "🎬 Vídeo"
              : msg.image_url && !msg.content
              ? "📷 Imagem"
              : msg.content || msg.link_url || "Mensagem"}
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
          <button
            onTouchEnd={() => { onShare(); onClose() }}
            onClick={() => { onShare(); onClose() }}
            className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
          >
            <Share2 className="w-5 h-5 text-emerald-400" />
            <span className="text-[15px] text-white">Partilhar</span>
          </button>
          {(hasText || shareUrl) && (
            <button
              onTouchEnd={handleCopy}
              onClick={handleCopy}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <Copy className="w-5 h-5 text-blue-400" />
              <span className="text-[15px] text-white">Copiar</span>
            </button>
          )}
          {shareUrl && (
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <ExternalLink className="w-5 h-5 text-purple-400" />
              <span className="text-[15px] text-white">Abrir link / média</span>
            </a>
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

type PendingMedia = {
  file: File
  previewUrl: string
  mediaType: "image" | "video"
}

// ─── Pré-visualização no composer (média + link) ─────────────────────────────

function ComposeAttachmentPreview({
  pendingMedia,
  linkPreview,
  detectedUrl,
  fetchingPreview,
  onClearMedia,
  onClearLink,
}: {
  pendingMedia: PendingMedia | null
  linkPreview: ChatMessage["link_preview"]
  detectedUrl: string | null
  fetchingPreview: boolean
  onClearMedia: () => void
  onClearLink: () => void
}) {
  const showLink = !!(fetchingPreview || linkPreview || detectedUrl)
  if (!pendingMedia && !showLink) return null

  return (
    <div className="mb-2 space-y-2">
      {pendingMedia && (
        <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800">
          {pendingMedia.mediaType === "video" ? (
            <video
              src={pendingMedia.previewUrl}
              controls
              playsInline
              className="w-full max-h-44 object-contain bg-black"
            />
          ) : (
            <img
              src={pendingMedia.previewUrl}
              alt="Pré-visualização"
              className="w-full max-h-44 object-cover"
            />
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-gray-700/80">
            <div className="flex items-center gap-2 min-w-0">
              {pendingMedia.mediaType === "video" ? (
                <Film className="w-4 h-4 text-purple-400 shrink-0" />
              ) : (
                <ImageIcon className="w-4 h-4 text-[#D2A63C] shrink-0" />
              )}
              <p className="text-xs text-gray-300 truncate">{pendingMedia.file.name}</p>
            </div>
            <button
              type="button"
              onClick={onClearMedia}
              className="p-1.5 rounded-full bg-gray-700/80 text-gray-300 shrink-0"
              aria-label="Remover anexo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {showLink && (
        <div className="relative">
          {fetchingPreview ? (
            <div className="flex items-center gap-2 px-3 py-3 bg-gray-800 rounded-xl border border-gray-700 text-xs text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin text-[#D2A63C]" />
              <span>A carregar pré-visualização do link...</span>
            </div>
          ) : linkPreview && detectedUrl ? (
            <div className="relative">
              <LinkPreviewCard preview={linkPreview} url={detectedUrl} />
              <button
                type="button"
                onClick={onClearLink}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-gray-200"
                aria-label="Remover link"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : detectedUrl ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-800 rounded-xl border border-gray-700">
              <Link2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs text-blue-300 truncate flex-1">{detectedUrl}</span>
              <button type="button" onClick={onClearLink} className="p-1 shrink-0">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Anexos (foto / vídeo) ────────────────────────────────────────────────────

function AttachSheet({
  onClose,
  onPickImage,
  onPickVideo,
}: {
  onClose: () => void
  onPickImage: () => void
  onPickVideo: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
    >
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar" />
      <div
        className="relative w-full bg-gray-900 rounded-t-3xl border-t border-gray-800 shadow-2xl px-4 pt-3 pb-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>
        <p className="text-sm font-semibold text-white mb-3">Anexar</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { onPickImage(); onClose() }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800 active:bg-gray-700"
          >
            <div className="w-12 h-12 rounded-full bg-[#D2A63C]/15 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-[#D2A63C]" />
            </div>
            <span className="text-sm text-white font-medium">Foto</span>
          </button>
          <button
            type="button"
            onClick={() => { onPickVideo(); onClose() }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800 active:bg-gray-700"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
              <Film className="w-6 h-6 text-purple-400" />
            </div>
            <span className="text-sm text-white font-medium">Vídeo</span>
          </button>
        </div>
        <p className="text-[11px] text-gray-500 text-center mt-4 leading-relaxed">
          Cola um link na mensagem para ver a pré-visualização automaticamente.
        </p>
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
  onOpenActions,
}: {
  msg: ChatMessage
  isOwn: boolean
  canWrite: boolean
  isAdmin: boolean
  onReply: (msg: ChatMessage) => void
  onDelete: (msgId: string) => void
  onLongPress: (msg: ChatMessage) => void
  onOpenActions: (msg: ChatMessage) => void
}) {
  const isTelegram = msg.message_type === "telegram_forward"
  const isVideo = msg.message_type === "video"
  const inlineUrl =
    !msg.link_preview && !msg.link_url ? extractFirstUrl(msg.content || "") : null

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
    { key: "share", Icon: Share2, color: "#34D399" },
    ...(msg.content || msg.link_url || msg.image_url ? [{ key: "copy", Icon: Copy, color: "#60A5FA" }] : []),
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
    else if (key === "share") shareMessage(msg)
    else if (key === "copy") {
      const toCopy = msg.content || msg.link_url || msg.image_url || ""
      if (toCopy) { try { navigator.clipboard.writeText(toCopy) } catch {} }
    }
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
                <MemberBadge profile={msg.profile} size="xs" />
              </div>
            )}

            {/* Quoted reply — pré-visualização da interação original (estilo WhatsApp/Telegram) */}
            {msg.reply_to_message && (() => {
              const rm = msg.reply_to_message!
              const rmProfile = Array.isArray(rm.profile) ? rm.profile[0] : rm.profile
              const rmName = rmProfile?.full_name || rm.telegram_sender || "Membro"
              const rmText = rm.content?.trim()
              const rmHasImage = !!rm.image_url
              return (
                <div className="mb-1 w-full max-w-full flex items-center gap-2 rounded-lg border-l-[3px] border-[#D2A63C] bg-black/25 pl-2 pr-1.5 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight truncate">{rmName}</p>
                    {rmText ? (
                      <p className="text-[11px] text-gray-300 truncate leading-tight mt-0.5">
                        <MentionText text={rmText} />
                      </p>
                    ) : rmHasImage ? (
                      <p className="text-[11px] text-gray-400 leading-tight mt-0.5 flex items-center gap-1">
                        {rm.message_type === "video" ? (
                          <><Film className="w-3 h-3 flex-shrink-0" /> Vídeo</>
                        ) : (
                          <><ImageIcon className="w-3 h-3 flex-shrink-0" /> Foto</>
                        )}
                      </p>
                    ) : null}
                  </div>
                  {rmHasImage && (
                    <img
                      src={rm.image_url!}
                      alt=""
                      className="w-9 h-9 rounded-md object-cover flex-shrink-0"
                    />
                  )}
                </div>
              )
            })()}

            {/* Bubble */}
            <div
              className={`relative rounded-2xl py-2 text-sm ${
                isOwn ? "pl-7 pr-3" : "pl-3 pr-7"
              } ${
                isOwn
                  ? "bg-[#D2A63C] text-black rounded-tr-sm"
                  : isTelegram
                  ? "bg-[#162d3d] border border-[#26A5E4]/20 text-white rounded-tl-sm"
                  : "bg-gray-800 text-white rounded-tl-sm"
              }`}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenActions(msg) }}
                className={`absolute top-1 ${isOwn ? "left-1" : "right-1"} w-6 h-6 rounded-full flex items-center justify-center ${
                  isOwn ? "bg-black/15 text-black/50" : "bg-black/25 text-gray-400"
                } active:scale-95 z-10`}
                aria-label="Opções da mensagem"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {msg.image_url && isVideo ? (
                <video
                  src={msg.image_url}
                  controls
                  playsInline
                  className="rounded-xl max-w-full mb-1 bg-black"
                  style={{ maxHeight: 240 }}
                />
              ) : msg.image_url ? (
                <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                  <img src={msg.image_url} alt="Imagem" className="rounded-xl max-w-full mb-1" style={{ maxHeight: 200 }} />
                </a>
              ) : null}
              {msg.content && (
                <p className="whitespace-pre-wrap break-words leading-relaxed text-[13.5px]">
                  <MentionText text={msg.content} />
                </p>
              )}
              {msg.link_preview && msg.link_url && (
                <LinkPreviewCard preview={msg.link_preview} url={msg.link_url} />
              )}
              {inlineUrl && <InlineUrlPreview url={inlineUrl} />}
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

const CHAT_MESSAGE_SELECT = `
  *,
  profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
  reply_to_message:chat_messages!reply_to_id(
    content, image_url, message_type, telegram_sender,
    profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category)
  )
`

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [linkPreview, setLinkPreview] = useState<ChatMessage["link_preview"]>(null)
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null)
  const [fetchingPreview, setFetchingPreview] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [showAttachSheet, setShowAttachSheet] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [pendingNew, setPendingNew] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const previewTimer = useRef<NodeJS.Timeout | null>(null)
  const isNearBottomRef = useRef(true)
  const PAGE_SIZE = 60

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

  const clearPendingMedia = useCallback(() => {
    setPendingMedia((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }, [])

  const clearLinkPreview = useCallback(() => {
    setText((t) => {
      const url = extractFirstUrl(t)
      if (!url) return t
      return t.replace(url, "").replace(/\s{2,}/g, " ").trim()
    })
    setLinkPreview(null)
    setDetectedUrl(null)
    setFetchingPreview(false)
  }, [])

  const setPendingMediaFromFile = useCallback((file: File) => {
    const isVideo = file.type.startsWith("video/")
    const previewUrl = URL.createObjectURL(file)
    setPendingMedia((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return {
        file,
        previewUrl,
        mediaType: isVideo ? "video" : "image",
      }
    })
  }, [])

  useEffect(() => () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl)
  }, [pendingMedia])

  const handleDelete = async (msgId: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true }).eq("id", msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  // ── Fetch messages ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select(CHAT_MESSAGE_SELECT)
      .eq("channel_slug", channel.slug)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (!error && data) {
      const rows = data as unknown as ChatMessage[]
      setHasMore(rows.length > PAGE_SIZE)
      setMessages(rows.slice(0, PAGE_SIZE).reverse())
    }
    setLoading(false)
    markChannelRead(channel.slug)
  }, [channel.slug])

  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    const oldest = messages[0]?.created_at
    const { data, error } = await supabase
      .from("chat_messages")
      .select(CHAT_MESSAGE_SELECT)
      .eq("channel_slug", channel.slug)
      .eq("is_deleted", false)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (!error && data) {
      const rows = data as unknown as ChatMessage[]
      setHasMore(rows.length > PAGE_SIZE)
      const older = rows.slice(0, PAGE_SIZE).reverse()
      setMessages((prev) => [...older, ...prev])
    }
    setLoadingMore(false)
  }

  useEffect(() => {
    setLoading(true)
    setMessages([])
    setHasMore(false)
    setPendingNew(0)
    isNearBottomRef.current = true
    fetchMessages()
  }, [fetchMessages])

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" })
    setPendingNew(0)
    setShowScrollBtn(false)
    isNearBottomRef.current = true
  }

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distance < 120
    isNearBottomRef.current = nearBottom
    setShowScrollBtn(!nearBottom)
    if (nearBottom) setPendingNew(0)
  }

  // ── Auto-scroll (só se o utilizador estiver no fundo) ─────────────────────

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setPendingNew(0)
    }
  }, [messages.length])

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
              if (prev.find((m) => m.id === (data as ChatMessage).id)) return prev
              const next = [...prev, data as unknown as ChatMessage]
              if (!isNearBottomRef.current) {
                setPendingNew((n) => n + 1)
              }
              return next
            })
            if (isNearBottomRef.current) {
              markChannelRead(channel.slug)
            }
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
      setFetchingPreview(false)
      return
    }

    if (url !== detectedUrl) {
      setDetectedUrl(url)
      setLinkPreview(null)
    }

    previewTimer.current = setTimeout(async () => {
      setFetchingPreview(true)
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        if (res.ok) {
          const raw = await res.json()
          const p = raw.preview || raw
          setLinkPreview({
            title: p.title || null,
            description: p.description || null,
            image: p.image || null,
            domain: p.siteName || p.domain || (() => { try { return new URL(url).hostname } catch { return url } })(),
          })
        }
      } catch {
        // mantém chip com URL mesmo sem preview rico
      } finally {
        setFetchingPreview(false)
      }
    }, 500)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message ──────────────────────────────────────────────────────────

  const sendPushForChannel = (title: string, body: string) => {
    if (!["trading", "cripto", "geral"].includes(channel.slug)) return
    fetch("/api/notifications/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        all: true,
        title,
        body,
        data: { type: "chat_message", url: "/app-mobile", channel: channel.slug },
      }),
    }).catch(() => {})
  }

  const handleSend = async () => {
    const hasText = !!text.trim()
    const hasLink = !!detectedUrl
    const hasMedia = !!pendingMedia
    if ((!hasText && !hasLink && !hasMedia) || sending || uploading) return

    setSending(true)

    const caption = text.trim() || null
    const replyId = replyTo?.id ?? null
    let messageType: string = "text"
    let imageUrl: string | null = null

    try {
      if (hasMedia && pendingMedia) {
        setUploading(true)
        const formData = new FormData()
        formData.append("file", pendingMedia.file)
        formData.append("channel_slug", channel.slug)

        const res = await fetch("/api/chat/upload-image", { method: "POST", body: formData })
        if (!res.ok) {
          setSending(false)
          setUploading(false)
          return
        }

        const { publicUrl, mediaType } = await res.json()
        const asVideo = mediaType === "video" || pendingMedia.mediaType === "video"
        imageUrl = publicUrl
        messageType = asVideo ? "video" : "image"
      }

      const payload: Record<string, unknown> = {
        channel_slug: channel.slug,
        user_id: currentUser.id,
        content: caption,
        message_type: messageType,
        reply_to_id: replyId,
      }

      if (imageUrl) payload.image_url = imageUrl

      if (hasLink && detectedUrl) {
        payload.link_url = detectedUrl
        if (linkPreview) payload.link_preview = linkPreview
      }

      const { error } = await supabase.from("chat_messages").insert(payload)
      if (!error) {
        if (imageUrl) {
          const asVideo = messageType === "video"
          const notifTitles: Record<string, string> = {
            trading: asVideo ? "📈 Novo vídeo em #Trading" : "📈 Nova imagem em #Trading",
            cripto: asVideo ? "₿ Novo vídeo em #Cripto" : "₿ Nova imagem em #Cripto",
            geral: asVideo ? "💬 Novo vídeo em #Geral" : "💬 Nova imagem em #Geral",
          }
          sendPushForChannel(
            notifTitles[channel.slug] ?? (asVideo ? `🎬 Novo vídeo em #${channel.name}` : `📷 Nova imagem em #${channel.name}`),
            caption || (asVideo ? "Vídeo partilhado!" : "Imagem partilhada!")
          )
        } else {
          const notifTitles: Record<string, string> = {
            trading: "📈 Nova mensagem em #Trading",
            cripto: "₿ Nova mensagem em #Cripto",
            geral: "💬 Nova mensagem em #Geral",
          }
          sendPushForChannel(
            notifTitles[channel.slug] ?? `💬 Nova mensagem em #${channel.name}`,
            (caption || detectedUrl || "Nova mensagem!").substring(0, 120)
          )
        }

        setText("")
        setReplyTo(null)
        clearLinkPreview()
        clearPendingMedia()
      }
    } catch {
      // silent
    } finally {
      setSending(false)
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
            onOpenActions={setContextMsg}
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
        <button
          onClick={() => setShowInfo(true)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Info do canal"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="absolute inset-0 overflow-y-auto px-3 py-3"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <span className="text-4xl">{getChannelMeta(channel.slug).emoji}</span>
              <p className="text-white font-medium">Bem-vindo a #{channel.name}</p>
              <p className="text-gray-500 text-sm">
                {channel.description || "Este canal está pronto para a conversa."}
              </p>
              {canWrite ? (
                <p className="text-[#D2A63C] text-xs">Sê o primeiro a escrever!</p>
              ) : (
                <p className="text-gray-600 text-xs">Canal de leitura — as mensagens aparecem aqui.</p>
              )}
              <button
                onClick={() => setShowInfo(true)}
                className="mt-2 text-xs text-gray-400 underline"
              >
                Ver regras do canal
              </button>
            </div>
          ) : (
            <>
              {hasMore && (
                <button
                  onClick={loadOlderMessages}
                  disabled={loadingMore}
                  className="w-full mb-3 py-2 text-xs text-[#D2A63C] hover:bg-gray-800/50 rounded-lg flex items-center justify-center gap-1"
                >
                  {loadingMore ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Carregar mensagens anteriores
                </button>
              )}
              {renderMessages()}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {(showScrollBtn || pendingNew > 0) && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D2A63C] text-black text-xs font-semibold shadow-lg"
          >
            {pendingNew > 0 ? `${pendingNew} nova${pendingNew > 1 ? "s" : ""}` : "Ir ao fim"}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showInfo && (
        <ChannelInfoSheet
          channel={channel}
          canWrite={canWrite}
          onClose={() => setShowInfo(false)}
        />
      )}

      {/* Input / read-only bar */}
      {canWrite ? (
        <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900 px-3 py-2">
          {/* Reply banner */}
          {replyTo && (() => {
            const rtText = replyTo.content?.trim()
            const rtHasImage = !!replyTo.image_url
            return (
              <div className="flex items-center gap-2 mb-2 pl-2 pr-1 py-1.5 bg-gray-800 rounded-xl border-l-[3px] border-[#D2A63C]">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight truncate">
                    {replyTo.profile?.full_name || replyTo.telegram_sender || "Membro"}
                  </p>
                  {rtText ? (
                    <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{rtText}</p>
                  ) : rtHasImage ? (
                    <p className="text-[11px] text-gray-500 leading-tight mt-0.5 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 flex-shrink-0" /> Foto
                    </p>
                  ) : null}
                </div>
                {rtHasImage && (
                  <img
                    src={replyTo.image_url!}
                    alt=""
                    className="w-9 h-9 rounded-md object-cover flex-shrink-0"
                  />
                )}
                <button
                  onClick={() => setReplyTo(null)}
                  className="p-1 rounded-full hover:bg-gray-700 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            )
          })()}

          <ComposeAttachmentPreview
            pendingMedia={pendingMedia}
            linkPreview={linkPreview}
            detectedUrl={detectedUrl}
            fetchingPreview={fetchingPreview}
            onClearMedia={clearPendingMedia}
            onClearLink={clearLinkPreview}
          />

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setShowAttachSheet(true)}
              disabled={uploading}
              className="p-2 rounded-lg text-gray-400 hover:text-[#D2A63C] hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-40"
              aria-label="Anexar foto, vídeo ou link"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingMediaFromFile(file)
                e.target.value = ""
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingMediaFromFile(file)
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
              disabled={(!text.trim() && !detectedUrl && !pendingMedia) || sending || uploading}
              className="p-2 rounded-full bg-[#D2A63C] text-black transition-all disabled:opacity-30 disabled:bg-gray-700 disabled:text-gray-500 flex-shrink-0"
            >
              {sending || uploading ? (
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

      {showAttachSheet && (
        <AttachSheet
          onClose={() => setShowAttachSheet(false)}
          onPickImage={() => fileInputRef.current?.click()}
          onPickVideo={() => videoInputRef.current?.click()}
        />
      )}

      {/* Menu de acções (⋯, long-press ou swipe) */}
      {contextMsg && (
        <MessageContextMenu
          msg={contextMsg}
          isOwn={contextMsg.user_id === currentUser?.id}
          canWrite={canWrite}
          isAdmin={isAdmin}
          onClose={() => setContextMsg(null)}
          onReply={() => { setReplyTo(contextMsg); setContextMsg(null) }}
          onDelete={() => { handleDelete(contextMsg.id); setContextMsg(null) }}
          onShare={() => shareMessage(contextMsg)}
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

// ─── Channel Info Sheet ───────────────────────────────────────────────────────

function ChannelInfoSheet({
  channel,
  canWrite,
  onClose,
}: {
  channel: Channel
  canWrite: boolean
  onClose: () => void
}) {
  const meta = getChannelMeta(channel.slug)

  return (
    <div
      className="fixed inset-0 z-[250] flex items-end"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className="w-full bg-gray-900 rounded-t-3xl max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>
        <div className="px-5 pt-3 pb-5">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: `${meta.accent}20`, border: `1px solid ${meta.accent}40` }}
            >
              {meta.emoji}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white">#{channel.name}</h3>
              {channel.description && (
                <p className="text-sm text-gray-400 mt-1">{channel.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {meta.tag && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${meta.accent}20`, color: meta.accent }}
                  >
                    {meta.tag}
                  </span>
                )}
                {isReadOnly(channel.slug) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#26A5E4]/15 text-[#26A5E4]">
                    Telegram
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    canWrite ? "bg-green-500/15 text-green-400" : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {canWrite ? "Podes publicar" : "Só leitura"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Regras do canal
              </p>
              <ul className="space-y-2">
                {meta.rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-[#D2A63C] mt-1">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            {meta.tips && meta.tips.length > 0 && (
              <div className="p-3 rounded-xl bg-gray-800/60 border border-gray-700/50">
                <p className="text-xs font-semibold text-[#D2A63C] mb-1.5">Dica</p>
                {meta.tips.map((tip) => (
                  <p key={tip} className="text-xs text-gray-400 leading-relaxed">
                    {tip}
                  </p>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full mt-5 py-3 rounded-2xl bg-gray-800 text-white font-medium text-sm"
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
  preview,
}: {
  channel: Channel
  onSelect: (c: Channel) => void
  user: any
  isSubChannel?: boolean
  preview?: ChannelPreview
}) {
  const locked = !canReadChannel(channel.slug, user)
  const meta = getChannelMeta(channel.slug)
  const unread = preview ? isChannelUnread(channel.slug, preview.created_at) : false
  const previewText = preview
    ? formatPreviewText(preview.content, preview.image_url, preview.telegram_sender, preview.message_type)
    : null

  return (
    <button
      onClick={() => !locked && onSelect(channel)}
      disabled={locked}
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all ${
        isSubChannel ? "pl-10" : ""
      } ${locked ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-800/60 active:bg-gray-800"}`}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-lg relative"
        style={{
          backgroundColor: locked ? "#1F2937" : `${meta.accent}18`,
          border: `1px solid ${locked ? "#374151" : `${meta.accent}35`}`,
        }}
      >
        {locked ? <Lock className="w-4 h-4 text-gray-500" /> : <span>{meta.emoji}</span>}
        {unread && !locked && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#D2A63C] border-2 border-gray-900" />
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-semibold text-sm truncate ${locked ? "text-gray-500" : unread ? "text-white" : "text-gray-200"}`}
            >
              {channel.name}
            </span>
            {meta.tag && !locked && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: `${meta.accent}20`, color: meta.accent }}
              >
                {meta.tag}
              </span>
            )}
          </div>
          {preview && !locked && (
            <span className="text-[10px] text-gray-500 shrink-0">
              {formatTime(preview.created_at)}
            </span>
          )}
        </div>
        {previewText && !locked ? (
          <p className={`text-xs truncate mt-0.5 ${unread ? "text-gray-300 font-medium" : "text-gray-500"}`}>
            {previewText}
          </p>
        ) : channel.description ? (
          <p className="text-[11px] text-gray-500 truncate mt-0.5">{channel.description}</p>
        ) : null}
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
  member_category?: string | null
}

export default function ChatChannels() {
  const { user } = useAuth()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chatTab, setChatTab] = useState<"channels" | "dm">("channels")
  const [channelSearch, setChannelSearch] = useState("")
  const [previews, setPreviews] = useState<Record<string, ChannelPreview>>({})
  const [educators, setEducators] = useState<EducatorProfile[]>([])
  const [loadingEducators, setLoadingEducators] = useState(false)
  const [sendingDm, setSendingDm] = useState<string | null>(null)
  const [dmSearch, setDmSearch] = useState("")
  const [memberResults, setMemberResults] = useState<EducatorProfile[]>([])
  const [searchingMembers, setSearchingMembers] = useState(false)
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

  const startDmWithUser = async (userId: string) => {
    setSendingDm(userId)
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otherUserId: userId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.conversation?.id) {
          window.location.href = `/messages-mobile?conversation=${data.conversation.id}`
        }
      }
    } catch { /* silent */ } finally {
      setSendingDm(null)
    }
  }

  const searchMembers = async (query: string) => {
    const q = query.trim()
    if (q.length < 2) {
      setMemberResults([])
      return
    }
    setSearchingMembers(true)
    try {
      const res = await fetch(`/api/messages/search-users?query=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setMemberResults((data.users || []).filter((u: EducatorProfile) => u.id !== user?.id))
      }
    } catch { /* silent */ } finally {
      setSearchingMembers(false)
    }
  }

  const allFlatChannels = channels.flatMap((c) =>
    c.children?.length ? c.children : [c]
  )

  const filteredChannels = allFlatChannels.filter((c) => {
    if (!channelSearch.trim()) return true
    const q = channelSearch.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false)
    )
  })

  const totalUnread = allFlatChannels.filter(
    (c) => canReadChannel(c.slug, user) && previews[c.slug] && isChannelUnread(c.slug, previews[c.slug].created_at)
  ).length

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

      // Pré-visualizações da última mensagem por canal
      const { data: recent } = await supabase
        .from("chat_messages")
        .select("channel_slug, content, image_url, telegram_sender, message_type, created_at")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(100)

      if (recent) {
        const map: Record<string, ChannelPreview> = {}
        for (const row of recent as ChannelPreview[]) {
          if (!map[row.channel_slug]) map[row.channel_slug] = row
        }
        setPreviews(map)
      }
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Chat</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {allFlatChannels.length} canais
              {totalUnread > 0 && (
                <span className="text-[#D2A63C]"> · {totalUnread} com novidades</span>
              )}
            </p>
          </div>
          <Link
            href="/messages-mobile"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:border-[#D2A63C]/40"
          >
            <Inbox className="w-3.5 h-3.5 text-[#D2A63C]" />
            Privadas
          </Link>
        </div>
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
          <Users className="w-4 h-4" />
          Directo
        </button>
      </div>

      {/* Educators DM tab */}
      {chatTab === "dm" && (
        <div className="px-4 pt-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="search"
              value={dmSearch}
              onChange={(e) => {
                setDmSearch(e.target.value)
                searchMembers(e.target.value)
              }}
              placeholder="Procurar membro por nome..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
            />
          </div>

          {dmSearch.trim().length >= 2 && (
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Resultados</p>
              {searchingMembers ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
                </div>
              ) : memberResults.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum membro encontrado</p>
              ) : (
                <div className="space-y-2">
                  {memberResults.map((member) => (
                    <button
                      key={member.id}
                      disabled={sendingDm === member.id}
                      onClick={() => startDmWithUser(member.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-[#D2A63C]/40 transition-all"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
                        <Users className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium text-sm text-white truncate">
                            {member.full_name || member.username}
                          </p>
                          <MemberBadge profile={member} size="xs" />
                        </div>
                        {member.username && (
                          <p className="text-xs text-gray-500">@{member.username}</p>
                        )}
                      </div>
                      {sendingDm === member.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#D2A63C]" />
                      ) : (
                        <Send className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
                Educadores e equipa MTM
              </p>
              {educators.map((edu) => (
                <button
                  key={edu.id}
                  disabled={sendingDm === edu.id}
                  onClick={() => startDmWithUser(edu.id)}
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm text-white truncate">
                        {edu.full_name || edu.username || "Educador"}
                      </p>
                      <MemberBadge profile={edu} size="xs" />
                    </div>
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
        <>
          <div className="px-4 py-3 border-b border-gray-800/60">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="search"
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                placeholder="Procurar canal..."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-800/40">
            {channelSearch.trim() ? (
              filteredChannels.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-10">Nenhum canal encontrado</p>
              ) : (
                filteredChannels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    onSelect={handleChannelSelect}
                    user={user}
                    preview={previews[channel.slug]}
                  />
                ))
              )
            ) : (
              channels.map((channel) =>
                channel.children && channel.children.length > 0 ? (
                  <div key={channel.id}>
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
                        preview={previews[sub.slug]}
                      />
                    ))}
                  </div>
                ) : (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    onSelect={handleChannelSelect}
                    user={user}
                    preview={previews[channel.slug]}
                  />
                )
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
