"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { isAllowedT2TSource } from "@/lib/mtmcopy/t2t-source"
import { useAuth } from "@/contexts/auth-context"
import {
  canReadChannel,
  canWriteChannel,
  isPremiumChannel,
  isReadOnlyChannel,
  requiresBrokerUidChannel,
} from "@/lib/chat-channel-permissions"
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
  FileText,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import MentionInput from "./mention-input"
import MentionText from "./mention-text"
import MemberBadge from "./member-badge"
import ChatPinnedInstructions from "./chat-pinned-instructions"
import {
  getChannelMeta,
  formatPreviewText,
  markChannelRead,
  isChannelUnread,
} from "./chat-channel-meta"
import { shouldReduceSafariEffects, waitForSupabaseSession } from "@/lib/supabase-session"
import { getChatMessageShareUrl } from "@/lib/chat-short-link"
import { notifyXpFromResponse } from "@/lib/xp-client"
import { useT } from "@/components/i18n-provider"

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

// ─── Derived permissions (lib/chat-channel-permissions.ts) ───────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
}

function formatDay(iso: string, t: (key: string) => string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t("chat.today")
  if (d.toDateString() === yesterday.toDateString()) return t("chat.yesterday")
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/(https?:\/\/[^\s]+)/)
  return match ? match[1] : null
}

function normalizeMessageProfile(
  profile?: MessageProfile | MessageProfile[] | null,
): MessageProfile | null {
  if (!profile) return null
  return Array.isArray(profile) ? profile[0] ?? null : profile
}

function normalizeChatMessage(raw: ChatMessage): ChatMessage {
  return {
    ...raw,
    profile: normalizeMessageProfile(raw.profile as MessageProfile | MessageProfile[] | null),
    reply_to_message: raw.reply_to_message
      ? {
          ...raw.reply_to_message,
          profile: normalizeMessageProfile(
            raw.reply_to_message.profile as MessageProfile | MessageProfile[] | null,
          ),
        }
      : null,
  }
}

async function shareMessage(msg: ChatMessage) {
  const origin = typeof window !== "undefined" ? window.location.origin : undefined
  const url = getChatMessageShareUrl(msg, origin)
  const text =
    msg.content?.trim() ||
    (msg.message_type === "video"
      ? "Vídeo partilhado no chat MTM"
      : msg.image_url
        ? "Imagem partilhada no chat MTM"
        : url
          ? "Link partilhado no chat MTM"
          : "Mensagem MTM")

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text })
      return
    } catch {
      // cancelado ou indisponível
    }
  }

  const copy = url ? `${text}\n${url}` : text
  try {
    await navigator.clipboard.writeText(copy)
  } catch {
    // silent
  }
}

function getChatCopyText(msg: ChatMessage): string {
  const origin = typeof window !== "undefined" ? window.location.origin : undefined
  const shareUrl = getChatMessageShareUrl(msg, origin)
  const caption = msg.content?.trim()
  if (caption && shareUrl) return `${caption}\n${shareUrl}`
  if (caption) return caption
  return shareUrl || msg.link_url || msg.image_url || ""
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
/** Extrai o ID do snapshot TradingView de qualquer URL /x/ID (www, br, pt, etc.) */
function extractTvSnapshotId(url: string): string | null {
  const m = url.match(/tradingview\.com\/x\/([A-Za-z0-9]+)/i)
  return m ? m[1] : null
}

/** Preview de snapshot TradingView — imagem S3 directa, sem API */
function TvSnapshotPreview({ tvId }: { tvId: string }) {
  const t = useT()
  const imgUrl = `https://s3.tradingview.com/snapshots/${tvId[0].toLowerCase()}/${tvId}.png`
  const shareUrl = `https://www.tradingview.com/x/${tvId}/`
  return (
    <a
      href={shareUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block rounded-xl overflow-hidden border border-gray-600/40 hover:border-gray-500/60 transition-colors"
    >
      <img
        src={imgUrl}
        alt={t("chat.tvChartAlt")}
        className="w-full max-h-64 object-cover bg-gray-900"
        loading="lazy"
      />
      <div className="px-2.5 py-1.5 bg-black/50 text-xs text-gray-400 flex items-center gap-1.5">
        <Link2 className="w-3 h-3 shrink-0 text-blue-400" />
        <span className="truncate text-blue-300">tradingview.com/x/{tvId}/</span>
      </div>
    </a>
  )
}

/** Preview genérico via API link-preview */
function GenericUrlPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<NonNullable<ChatMessage["link_preview"]> | null>(null)
  const liteMode = shouldReduceSafariEffects()

  useEffect(() => {
    if (liteMode) return
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
  }, [url, liteMode])

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

function InlineUrlPreview({ url }: { url: string }) {
  const tvId = extractTvSnapshotId(url)
  if (tvId) return <TvSnapshotPreview tvId={tvId} />
  return <GenericUrlPreview url={url} />
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
  const t = useT()
  const hasText = !!msg.content
  const canDel = isOwn || isAdmin
  const shareUrl = getChatMessageShareUrl(msg)
  const openUrl = msg.link_url || msg.image_url || extractFirstUrl(msg.content || "")

  const handleCopy = () => {
    const toCopy = getChatCopyText(msg)
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
            {isOwn ? t("chat.you") : (msg.profile?.full_name || msg.telegram_sender || "")}
          </p>
          <p className="text-sm text-gray-300 line-clamp-2 leading-snug">
            {msg.message_type === "video"
              ? t("chat.videoWithIcon")
              : msg.image_url && !msg.content
              ? t("chat.imageWithIcon")
              : msg.content || msg.link_url || t("chat.message")}
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
              <span className="text-[15px] text-white">{t("chat.reply")}</span>
            </button>
          )}
          <button
            onTouchEnd={() => { onShare(); onClose() }}
            onClick={() => { onShare(); onClose() }}
            className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
          >
            <Share2 className="w-5 h-5 text-emerald-400" />
            <span className="text-[15px] text-white">{t("chat.share")}</span>
          </button>
          {(hasText || shareUrl) && (
            <button
              onTouchEnd={handleCopy}
              onClick={handleCopy}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <Copy className="w-5 h-5 text-blue-400" />
              <span className="text-[15px] text-white">{t("chat.copy")}</span>
            </button>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center gap-4 px-3 py-4 rounded-xl active:bg-gray-700/50"
            >
              <ExternalLink className="w-5 h-5 text-purple-400" />
              <span className="text-[15px] text-white">{t("chat.openLinkMedia")}</span>
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
                <span className="text-[15px] text-red-400">{t("chat.deleteMessage")}</span>
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
            {t("chat.cancel")}
          </button>
        </div>
      </div>
    </div>
  )
}

type PendingMedia = {
  file: File
  previewUrl: string
  mediaType: "image" | "video" | "document"
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
  const t = useT()
  const showLink = !!(fetchingPreview || linkPreview || detectedUrl)
  if (!pendingMedia && !showLink) return null

  return (
    <div className="mb-2 space-y-2">
      {pendingMedia && (
        <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800">
          {pendingMedia.mediaType === "document" ? (
            <div className="flex items-center gap-3 px-3 py-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{pendingMedia.file.name}</p>
                <p className="text-xs text-gray-400">{(pendingMedia.file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          ) : pendingMedia.mediaType === "video" ? (
            <video
              src={pendingMedia.previewUrl}
              controls
              playsInline
              className="w-full max-h-44 object-contain bg-black"
            />
          ) : (
            <img
              src={pendingMedia.previewUrl}
              alt={t("chat.previewAlt")}
              className="w-full max-h-44 object-cover"
            />
          )}
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-t border-gray-700/80">
            <div className="flex items-center gap-2 min-w-0">
              {pendingMedia.mediaType === "video" ? (
                <Film className="w-4 h-4 text-purple-400 shrink-0" />
              ) : pendingMedia.mediaType === "document" ? (
                <FileText className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <ImageIcon className="w-4 h-4 text-[#D2A63C] shrink-0" />
              )}
              <p className="text-xs text-gray-300 truncate">{pendingMedia.file.name}</p>
            </div>
            <button
              type="button"
              onClick={onClearMedia}
              className="p-1.5 rounded-full bg-gray-700/80 text-gray-300 shrink-0"
              aria-label={t("chat.removeAttachment")}
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
              <span>{t("chat.loadingLinkPreview")}</span>
            </div>
          ) : linkPreview && detectedUrl ? (
            <div className="relative">
              <LinkPreviewCard preview={linkPreview} url={detectedUrl} />
              <button
                type="button"
                onClick={onClearLink}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-gray-200"
                aria-label={t("chat.removeLink")}
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
  onPickFile,
}: {
  onClose: () => void
  onPickImage: () => void
  onPickVideo: () => void
  onPickFile: () => void
}) {
  const t = useT()
  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{
        backgroundColor: shouldReduceSafariEffects() ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.55)",
        backdropFilter: shouldReduceSafariEffects() ? undefined : "blur(3px)",
      }}
    >
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label={t("chat.close")} />
      <div
        className="relative w-full bg-gray-900 rounded-t-3xl border-t border-gray-800 shadow-2xl px-4 pt-3 pb-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>
        <p className="text-sm font-semibold text-white mb-3">{t("chat.attach")}</p>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => { onPickImage(); onClose() }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800 active:bg-gray-700"
          >
            <div className="w-12 h-12 rounded-full bg-[#D2A63C]/15 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-[#D2A63C]" />
            </div>
            <span className="text-sm text-white font-medium">{t("chat.photo")}</span>
          </button>
          <button
            type="button"
            onClick={() => { onPickVideo(); onClose() }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800 active:bg-gray-700"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
              <Film className="w-6 h-6 text-purple-400" />
            </div>
            <span className="text-sm text-white font-medium">{t("chat.video")}</span>
          </button>
          <button
            type="button"
            onClick={() => { onPickFile(); onClose() }}
            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-gray-800 active:bg-gray-700"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <FileText className="w-6 h-6 text-red-400" />
            </div>
            <span className="text-sm text-white font-medium">{t("chat.file")}</span>
          </button>
        </div>
        <p className="text-[11px] text-gray-500 text-center mt-4 leading-relaxed">
          {t("chat.pasteLinkHint")}
        </p>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

// ── Tap to Trade MTM — deteção de mensagens negociáveis ───────────────────────
// ⚠️ Deve espelhar o âmbito T2T do servidor (tapToTradeEnabledChannels / rotas com
// tap_to_trade=true). Se mudares o âmbito no /admin, atualiza aqui também (ou o botão
// do chat dessincroniza do accept do servidor). Âmbito atual: Forex + MTM + GoldKiller + Premium.
const TAP_TRADE_CHANNELS = new Set(['trade-ideas-setup', 'sinais-scanner-mtm', 'trade-ideas', 'sinais-goldkiller', 'premium-ideas'])
const TAP_TRADE_FOLLOWUP_RE = /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad|descartad|invalidad)/i
/** Um follow-up POSTERIOR com isto RESOLVE o sinal (ativou/fechou/morreu) → o botão T2T esconde-se.
 *  'ENTRY HIT' literal (monitor/PrimeVerse) e não 'ativad' — senão as entradas Sensei ("Ideia
 *  Activada"), que SÃO sinais, resolver-se-iam umas às outras. */
const TAP_TRADE_RESOLVING_RE = /(entry\s*hit|tp\s*\d?\s*(hit|atingid)|hit\s*tp|sl\s*hit|stop\s*loss\s*hit|posi[çc][aã]o\s*fechada|fechad[ao]|encerrad|cancelad|descartad|invalidad|break\s*even)/i
/** Direção do sinal/follow-up, quando declarada. */
function t2tDirectionOf(content?: string | null): "BUY" | "SELL" | "" {
  if (!content) return ""
  if (/\b(sell|short|venda)\b|🔴/i.test(content)) return "SELL"
  if (/\b(buy|long|compra)\b|🔵|🟢/i.test(content)) return "BUY"
  return ""
}
/** Símbolo do sinal, para emparelhar follow-ups com a entrada certa (nunca substring cega). */
function t2tSymbolOf(content?: string | null): string | null {
  if (!content) return null
  const c = content.toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|NAS100|US30|US500|GER40|UK100|JP225|SPX500|BTCUSD|ETHUSD|SOLUSD|XRPUSD)\b/) ||
    c.match(/\b[A-Z]{3}(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/) ||
    c.match(/\bXAU\b|\bGOLD\b/)
  return m ? m[0] : null
}
/**
 * IDs dos sinais já RESOLVIDOS por um follow-up posterior (mesmo canal + mesmo símbolo).
 * Pedido Ricardo 2026-08-20: o botão T2T fica visível enquanto a ideia estiver VÁLIDA/pendente
 * e esconde-se ao descarte/ativação/fecho — não por idade cega.
 */
function computeResolvedSignalIds(messages: ChatMessage[]): Set<string> {
  const resolved = new Set<string>()
  const followups = messages.filter((m) => m.content && TAP_TRADE_RESOLVING_RE.test(m.content))
  if (!followups.length) return resolved
  for (const m of messages) {
    if (!m.content || !looksLikeTradeSignal(m.channel_slug, m.content)) continue
    const sym = t2tSymbolOf(m.content)
    const t0 = m.created_at ? new Date(m.created_at).getTime() : 0
    const dir = t2tDirectionOf(m.content)
    const hit = followups.some((f) => {
      if (f.id === m.id || f.channel_slug !== m.channel_slug) return false
      const t1 = f.created_at ? new Date(f.created_at).getTime() : 0
      if (t1 <= t0) return false
      const fsym = t2tSymbolOf(f.content)
      if (sym && fsym && fsym !== sym) return false
      // Direção tem de casar quando ambas são conhecidas — um fecho SELL não resolve um setup BUY.
      const fdir = t2tDirectionOf(f.content)
      return !dir || !fdir || fdir === dir
    })
    if (hit) resolved.add(m.id)
  }
  return resolved
}
const TAP_TRADE_DIR_RE = /(\b(buy|sell|long|short|compra|venda)\b|🟢|🔴)/i
/** Sensei: só a "Entry Alert / Ideia Activada" (entrada activada) é negociável. */
const SENSEI_ACTIVE_RE = /(entrada\s+activ|entrada\s+ativ|ideia\s+activ|ideia\s+ativ|entry\s+alert)/i
/** Tempo máximo para um sinal estar ativo / clicável (5 minutos). */
const TAP_TRADE_MAX_AGE_MS = 5 * 60 * 1000

/** Heurística client-side: é um sinal de ENTRADA negociável? (o backend valida definitivamente) */
function looksLikeTradeSignal(channelSlug?: string | null, content?: string | null): boolean {
  // Só as 4 fontes permitidas (Premium/Sensei/James/PrimeVerse) — filtro por FONTE, não só canal.
  if (!channelSlug || !content || !isAllowedT2TSource(channelSlug, content)) return false
  if (TAP_TRADE_FOLLOWUP_RE.test(content)) return false // follow-ups (TP hit/BE/SL) não são entradas
  if (!TAP_TRADE_DIR_RE.test(content)) return false // precisa de direção
  if (!/\d{2,}/.test(content)) return false // precisa de pelo menos um preço
  // Entrada COMPLETA: exige TP (alvo). Exclui updates só-SL / "Ref:" / resumos → não são negociáveis.
  if (!/\btp\s*\d|\btp\s*:|take\s*profit|🎯/i.test(content)) return false

  // Sensei: exige o alerta de entrada activada COMPLETO (entrada + SL + TP)
  if (channelSlug === 'sensei-scanner') {
    const activated = SENSEI_ACTIVE_RE.test(content)
    const hasSL = /stop\s*loss|🛑/i.test(content)
    const hasTP = /take\s*profit|tp\s*\d/i.test(content)
    if (!(activated && hasSL && hasTP)) return false
  }
  return true
}

/** Setups PENDENTES (entrada por zona/limite por tocar) ficam aceitáveis até 24h — o backend valida
 *  se já foram ativados/fechados. Entradas A MERCADO mantêm os 5 min. Pedido Ricardo 2026-08-18. */
const TAP_TRADE_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** O sinal traz um NÍVEL de entrada? ("Entrada: 4398", "Gold Sell Zone 4398 - 4403", "Entry: …") */
function hasEntryLevel(content?: string | null): boolean {
  if (!content) return false
  return /(entrada|entry|zona|zone)\s*:?\s*[0-9]+[.,]?[0-9]*/i.test(content)
}

/** Sinal ainda aceitável? Setup pendente → 24h; entrada a mercado → 5 min. */
function isSignalActive(createdAt?: string | null, content?: string | null): boolean {
  if (!createdAt) return true
  const max = hasEntryLevel(content) ? TAP_TRADE_PENDING_MAX_AGE_MS : TAP_TRADE_MAX_AGE_MS
  return Date.now() - new Date(createdAt).getTime() <= max
}

function MessageBubble({
  msg,
  isOwn,
  canWrite,
  isAdmin,
  onReply,
  onDelete,
  onLongPress,
  onOpenActions,
  onTapToTrade,
  resolved = false,
}: {
  msg: ChatMessage
  isOwn: boolean
  canWrite: boolean
  isAdmin: boolean
  onReply: (msg: ChatMessage) => void
  onDelete: (msgId: string) => void
  onLongPress: (msg: ChatMessage) => void
  onOpenActions: (msg: ChatMessage) => void
  onTapToTrade?: (msg: ChatMessage) => void
  /** Sinal já resolvido por follow-up posterior (ativado/fechado/descartado) → sem botão T2T. */
  resolved?: boolean
}) {
  const t = useT()
  const tradeable =
    !isOwn &&
    !!onTapToTrade &&
    !resolved &&
    looksLikeTradeSignal(msg.channel_slug, msg.content) &&
    isSignalActive(msg.created_at, msg.content)
  const isTelegram = msg.message_type === "telegram_forward"
  const isVideo    = msg.message_type === "video"
  const isDocument = msg.message_type === "document"
  const liteMode = shouldReduceSafariEffects()
  const inlineUrl =
    !liteMode && !msg.link_preview && !msg.link_url ? extractFirstUrl(msg.content || "") : null

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
  const TRAY_W =
    liteMode || trayItems.length === 0
      ? 0
      : 14 + trayItems.length * 40 + (trayItems.length - 1) * 6
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
      const toCopy = getChatCopyText(msg)
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
            {/* Name row — no Premium · Ouro escondemos a etiqueta do remetente (pedido Ricardo:
                chat idêntico ao Telegram, sem "MTM Auto Premium"/marca do relay). */}
            {!isOwn && !(msg.channel_slug === "premium-ideas" && isTelegram) && (
              <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                <span className="text-xs font-semibold text-white">
                  {isTelegram ? msg.telegram_sender || "Telegram" : msg.profile?.full_name || ""}
                </span>
                {isTelegram && <TelegramIcon className="w-3 h-3 text-[#26A5E4]" />}
                <MemberBadge profile={msg.profile} size="xs" />
              </div>
            )}

            {/* Quoted reply — pré-visualização da interação original (estilo WhatsApp/Telegram) */}
            {msg.reply_to_message && (() => {
              const rm = msg.reply_to_message!
              const rmProfile = Array.isArray(rm.profile) ? rm.profile[0] : rm.profile
              const rmName = rmProfile?.full_name || rm.telegram_sender || ""
              const rmText = rm.content?.trim()
              const rmHasImage = !!rm.image_url
              return (
                <div className="mb-1 w-full max-w-full flex items-center gap-2 rounded-lg border-l-[3px] border-[#D2A63C] bg-black/25 pl-2 pr-1.5 py-1">
                  <div className="flex-1 min-w-0">
                    {rmName && <p className="text-[11px] font-semibold text-[#D2A63C] leading-tight truncate">{rmName}</p>}
                    {rmText ? (
                      <p className="text-[11px] text-gray-300 truncate leading-tight mt-0.5">
                        <MentionText text={rmText} />
                      </p>
                    ) : rmHasImage ? (
                      <p className="text-[11px] text-gray-400 leading-tight mt-0.5 flex items-center gap-1">
                        {rm.message_type === "video" ? (
                          <><Film className="w-3 h-3 flex-shrink-0" /> {t("chat.video")}</>
                        ) : (
                          <><ImageIcon className="w-3 h-3 flex-shrink-0" /> {t("chat.photo")}</>
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
                aria-label={t("chat.messageOptions")}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {msg.image_url && isDocument ? (
                <a
                  href={msg.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/10 mb-1 no-underline"
                >
                  <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">
                      {msg.image_url.split("/").pop()?.split("?")[0] ?? t("chat.document")}
                    </p>
                    <p className="text-[10px] text-gray-400">{t("chat.tapToOpen")}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-500 shrink-0" />
                </a>
              ) : msg.image_url && isVideo ? (
                <video
                  src={msg.image_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="rounded-xl max-w-full mb-1 bg-black"
                  style={{ maxHeight: liteMode ? 180 : 240 }}
                />
              ) : msg.image_url ? (
                <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={msg.image_url}
                    alt={t("chat.imageAlt")}
                    loading="lazy"
                    decoding="async"
                    className="rounded-xl max-w-full mb-1"
                    style={{ maxHeight: liteMode ? 160 : 200 }}
                  />
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
              {tradeable && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onTapToTrade!(msg) }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2 active:scale-[0.98] transition-transform"
                  aria-label={t("chat.tapToTradeAria")}
                >
                  <TrendingUp className="w-4 h-4" /> Tap to Trade MTM
                </button>
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

const CHAT_MESSAGE_SELECT_FULL = `
  *,
  profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
  reply_to_message:chat_messages!reply_to_id(
    content, image_url, message_type, telegram_sender,
    profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category)
  )
`

/** Safari: select mais leve — evita stack overflow em canais de trades com muitas mensagens. */
const CHAT_MESSAGE_SELECT_LITE = `
  *,
  profile:profiles!chat_messages_user_id_profiles_fkey(full_name, avatar_url, user_type, member_category),
  reply_to_message:chat_messages!reply_to_id(content, image_url, message_type, telegram_sender)
`

function chatMessageSelect() {
  return shouldReduceSafariEffects() ? CHAT_MESSAGE_SELECT_LITE : CHAT_MESSAGE_SELECT_FULL
}

function chatPageSize() {
  return shouldReduceSafariEffects() ? 25 : 60
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
  const [sendError, setSendError] = useState<string | null>(null)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileDocRef = useRef<HTMLInputElement>(null)
  const previewTimer = useRef<NodeJS.Timeout | null>(null)
  const isNearBottomRef = useRef(true)
  const messagesRef = useRef<ChatMessage[]>([])
  const PAGE_SIZE = chatPageSize()
  const liteMode = shouldReduceSafariEffects()
  const t = useT()

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

  const setPendingMediaFromFile = useCallback((file: File, forceType?: "document") => {
    const isVideo = file.type.startsWith("video/")
    const isDoc = forceType === "document" || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
    const previewUrl = isDoc ? "" : URL.createObjectURL(file)
    setPendingMedia((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return {
        file,
        previewUrl,
        mediaType: isDoc ? "document" : isVideo ? "video" : "image",
      }
    })
  }, [])

  useEffect(() => () => {
    if (pendingMedia?.previewUrl) URL.revokeObjectURL(pendingMedia.previewUrl)
  }, [pendingMedia])

  const handleDelete = async (msgId: string) => {
    const { getAccessToken } = await import("@/lib/auth-token")
    const token = await getAccessToken()
    if (token) {
      await fetch(`/api/chat/messages/${msgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
    }
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  // ── Tap to Trade MTM ────────────────────────────────────────────────────────
  const [tapTrade, setTapTrade] = useState<
    { msg: ChatMessage; status: "confirm" | "loading" | "done" | "error"; message?: string } | null
  >(null)

  const runTapTrade = async () => {
    if (!tapTrade) return
    const target = tapTrade.msg
    setTapTrade({ msg: target, status: "loading" })
    try {
      const { getAccessToken } = await import("@/lib/auth-token")
      const token = await getAccessToken()
      if (!token) {
        setTapTrade({ msg: target, status: "error", message: t("chat.sessionRelogin") })
        return
      }
      const res = await fetch("/api/mtmcopy/tap-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_message_id: target.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTapTrade({ msg: target, status: "error", message: data.error || t("chat.tradeOpenFailed") })
        return
      }
      setTapTrade({ msg: target, status: "done", message: data.message || t("chat.tradeOpened") })
    } catch (e) {
      setTapTrade({ msg: target, status: "error", message: e instanceof Error ? e.message : t("chat.unexpectedError") })
    }
  }

  // ── Fetch messages ────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    setMessagesError(null)
    const token = await waitForSupabaseSession()
    if (!token) {
      setMessagesError(t("chat.sessionUnavailableReopen"))
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .select(chatMessageSelect())
      .eq("channel_slug", channel.slug)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (error) {
      console.error("[chat] fetchMessages:", error.message)
      setMessagesError(t("chat.loadMessagesError"))
      setLoading(false)
      return
    }

    if (data) {
      const rows = (data as unknown as ChatMessage[]).map(normalizeChatMessage)
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
      .select(chatMessageSelect())
      .eq("channel_slug", channel.slug)
      .eq("is_deleted", false)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (!error && data) {
      const rows = data as unknown as ChatMessage[]
      setHasMore(rows.length > PAGE_SIZE)
      const older = rows.slice(0, PAGE_SIZE).reverse().map(normalizeChatMessage)
      setMessages((prev) => [...older, ...prev])
    }
    setLoadingMore(false)
  }

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    setLoading(true)
    setMessages([])
    setHasMore(false)
    setPendingNew(0)
    isNearBottomRef.current = true
    fetchMessages()
  }, [fetchMessages])

  const liteScroll = liteMode

  const scrollToBottom = (smooth = true) => {
    const behavior = smooth && !liteScroll ? "smooth" : "auto"
    messagesEndRef.current?.scrollIntoView({ behavior })
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
      messagesEndRef.current?.scrollIntoView({ behavior: liteScroll ? "auto" : "smooth" })
      setPendingNew(0)
    }
  }, [messages.length, liteScroll])

  // ── Realtime (Chrome) / polling (Safari — evita CLOSED e bloqueios) ───────

  useEffect(() => {
    let tornDown = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const appendMessage = (normalized: ChatMessage) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === normalized.id)) return prev
        if (!isNearBottomRef.current) setPendingNew((n) => n + 1)
        return [...prev, normalized]
      })
      if (isNearBottomRef.current) markChannelRead(channel.slug)
    }

    const pollNewMessages = async () => {
      if (tornDown) return
      const current = messagesRef.current
      const lastAt = current[current.length - 1]?.created_at
      if (!lastAt) return

      const { data } = await supabase
        .from("chat_messages")
        .select(chatMessageSelect())
        .eq("channel_slug", channel.slug)
        .eq("is_deleted", false)
        .gt("created_at", lastAt)
        .order("created_at", { ascending: true })
        .limit(20)

      if (!data?.length || tornDown) return
      for (const row of data as unknown as ChatMessage[]) {
        appendMessage(normalizeChatMessage(row))
      }
    }

    if (liteMode) {
      pollTimer = setInterval(() => {
        void pollNewMessages()
      }, 20000)
      return () => {
        tornDown = true
        if (pollTimer) clearInterval(pollTimer)
      }
    }

    const realtimeChannel = supabase.channel(`chat:${channel.slug}`)

    realtimeChannel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `channel_slug=eq.${channel.slug}`,
      },
      async (payload: { new: Record<string, unknown> }) => {
        if (tornDown) return
        const { data } = await supabase
          .from("chat_messages")
          .select(chatMessageSelect())
          .eq("id", payload.new.id as string)
          .single()

        if (data) appendMessage(normalizeChatMessage(data as unknown as ChatMessage))
      }
    )

    realtimeChannel.subscribe((status: string) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (!pollTimer && !tornDown) {
          pollTimer = setInterval(() => void pollNewMessages(), 20000)
        }
      }
    })

    return () => {
      tornDown = true
      if (pollTimer) clearInterval(pollTimer)
      try {
        void realtimeChannel.unsubscribe()
      } catch {
        /* ignore */
      }
    }
  }, [channel.slug, liteMode])

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
  // Push notifications são despachadas server-side em /api/chat/messages

  const handleSend = async () => {
    const hasText = !!text.trim()
    const hasLink = !!detectedUrl
    const hasMedia = !!pendingMedia
    if ((!hasText && !hasLink && !hasMedia) || sending || uploading) return
    if (!currentUser?.id) {
      setSendError(t("chat.invalidSession"))
      return
    }

    setSending(true)
    setSendError(null)

    const caption = text.trim() || null
    const replyId = replyTo?.id ?? null
    let messageType: string = "text"
    let imageUrl: string | null = null

    try {
      const { getAccessToken } = await import("@/lib/auth-token")
      const accessToken = await getAccessToken()
      if (!accessToken) {
        setSendError(t("chat.expiredSession"))
        return
      }

      if (hasMedia && pendingMedia) {
        setUploading(true)
        const formData = new FormData()
        formData.append("file", pendingMedia.file)
        formData.append("channel_slug", channel.slug)

        const uploadRes = await fetch("/api/chat/upload-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        })
        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json().catch(() => ({}))
          setSendError(uploadErr.error || t("chat.uploadFailed"))
          return
        }

        const { publicUrl, mediaType } = await uploadRes.json()
        const asVideo = mediaType === "video" || pendingMedia.mediaType === "video"
        const asDoc   = mediaType === "document" || pendingMedia.mediaType === "document"
        imageUrl = publicUrl
        messageType = asDoc ? "document" : asVideo ? "video" : "image"
      }

      const postRes = await fetch("/api/chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          channel_slug: channel.slug,
          content: caption,
          message_type: messageType,
          image_url: imageUrl,
          reply_to_id: replyId,
          link_url: hasLink ? detectedUrl : null,
          link_preview: hasLink && linkPreview ? linkPreview : null,
        }),
      })

      const postData = await postRes.json().catch(() => ({}))
      if (!postRes.ok) {
        setSendError(postData.error || t("chat.postFailed"))
        return
      }

      const newMsg = postData.message as ChatMessage | undefined
      if (newMsg) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        isNearBottomRef.current = true
      }

      if (postData.xp) {
        void notifyXpFromResponse(postData.xp)
      }

      setText("")
      setReplyTo(null)
      clearLinkPreview()
      clearPendingMedia()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("chat.unexpectedPost")
      setSendError(message)
    } finally {
      setSending(false)
      setUploading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const renderMessages = () => {
    let lastDay = ""
    const resolvedIds = computeResolvedSignalIds(messages)
    return messages.map((msg) => {
      const day = formatDay(msg.created_at, t)
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
            resolved={resolvedIds.has(msg.id)}
            onReply={setReplyTo}
            onDelete={handleDelete}
            onLongPress={setContextMsg}
            onOpenActions={setContextMsg}
            onTapToTrade={(m) => setTapTrade({ msg: m, status: "confirm" })}
          />
        </div>
      )
    })
  }

  return (
    // Fill the viewport minus the app header (~68 px) and the bottom tab bar (~66 px)
    // app-dvh = altura com fallback vh para WebViews antigos (BlueStacks/Chromium 101 não tem dvh)
    <div
      className="flex flex-col bg-gray-900 app-dvh"
      style={{ "--app-dvh-offset": "152px" } as any}
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
        {isPremiumChannel(channel.slug) && (
          <div className="flex items-center gap-1 text-[#D2A63C] text-[11px]">
            <Lock className="w-3.5 h-3.5" />
            <span>{t("chat.premium")}</span>
          </div>
        )}
        {isReadOnlyChannel(channel.slug) && (
          <TelegramIcon className="w-4 h-4 text-[#26A5E4]" />
        )}
        <button
          onClick={() => setShowInfo(true)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label={t("chat.channelInfo")}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {/* Card FIXO: como seguir os sinais (só canais de sinais com instruções configuradas) */}
      <ChatPinnedInstructions slug={channel.slug} />

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
          ) : messagesError ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-gray-400 text-sm">{messagesError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  fetchMessages()
                }}
                className="text-xs text-[#D2A63C] underline"
              >
                {t("chat.retry")}
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
              <span className="text-4xl">{getChannelMeta(channel.slug).emoji}</span>
              <p className="text-white font-medium">{t("chat.welcome")} #{channel.name}</p>
              <p className="text-gray-500 text-sm">
                {channel.description || t("chat.channelReady")}
              </p>
              {canWrite ? (
                <p className="text-[#D2A63C] text-xs">{t("chat.beFirst")}</p>
              ) : (
                <p className="text-gray-600 text-xs">{t("chat.readOnlyChannel")}</p>
              )}
              <button
                onClick={() => setShowInfo(true)}
                className="mt-2 text-xs text-gray-400 underline"
              >
                {t("chat.viewRules")}
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
                  {t("chat.loadOlder")}
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
            {pendingNew > 0 ? `${pendingNew} ${pendingNew > 1 ? t("chat.newMany") : t("chat.newOne")}` : t("chat.goToEnd")}
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
                    {replyTo.profile?.full_name || replyTo.telegram_sender || ""}
                  </p>
                  {rtText ? (
                    <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{rtText}</p>
                  ) : rtHasImage ? (
                    <p className="text-[11px] text-gray-500 leading-tight mt-0.5 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 flex-shrink-0" /> {t("chat.photo")}
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

          {sendError && (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 flex-1">{sendError}</p>
              <button
                type="button"
                onClick={() => setSendError(null)}
                className="p-0.5 text-red-400 hover:text-red-300"
                aria-label={t("chat.closeError")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setShowAttachSheet(true)}
              disabled={uploading}
              className="p-2 rounded-lg text-gray-400 hover:text-[#D2A63C] hover:bg-gray-800 transition-colors flex-shrink-0 disabled:opacity-40"
              aria-label={t("chat.attachPhotoVideoLink")}
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
            <input
              ref={fileDocRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingMediaFromFile(file, "document")
                e.target.value = ""
              }}
            />

            <div className="flex-1 bg-gray-800 rounded-2xl px-3 py-2.5">
              <MentionInput
                value={text}
                onChange={setText}
                placeholder={t("chat.messagePlaceholder")}
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
          {isReadOnlyChannel(channel.slug) ? (
            <>
              <TelegramIcon className="w-4 h-4 text-[#26A5E4]" />
              <p className="text-xs text-gray-500">{t("chat.readOnly")}</p>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4 text-gray-600" />
              <p className="text-xs text-gray-500">
                {channel.slug === "trading"
                  ? t("chat.needMemberOrPremium")
                  : t("chat.noPermissionPost")}
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
          onPickFile={() => fileDocRef.current?.click()}
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

      {tapTrade && (
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-4"
          onClick={() => tapTrade.status !== "loading" && setTapTrade(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-[#D2A63C]" />
              <h3 className="text-base font-bold">Tap to Trade MTM</h3>
            </div>

            {tapTrade.status === "confirm" && (
              <>
                <p className="text-sm text-zinc-300 mb-3">
                  {t("chat.tapConfirm1")} <strong className="text-white">{t("chat.tapConfirmMt5")}</strong>{t("chat.tapConfirm2")}{" "}
                  <strong className="text-white">{t("chat.tapConfirmRisk")}</strong> {t("chat.tapConfirm3")}
                </p>
                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 max-h-28 overflow-y-auto whitespace-pre-wrap mb-4">
                  {tapTrade.msg.content}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTapTrade(null)}
                    className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95"
                  >
                    {t("chat.cancel")}
                  </button>
                  <button
                    onClick={runTapTrade}
                    className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95"
                  >
                    {t("chat.confirmOpen")}
                  </button>
                </div>
              </>
            )}
            {tapTrade.status === "loading" && (
              <p className="text-sm text-zinc-300 py-6 text-center">{t("chat.openingTrade")}</p>
            )}
            {tapTrade.status === "done" && (
              <>
                <p className="text-sm text-emerald-400 py-4 text-center">✅ {tapTrade.message}</p>
                <button
                  onClick={() => setTapTrade(null)}
                  className="w-full rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95"
                >
                  {t("chat.close")}
                </button>
              </>
            )}
            {tapTrade.status === "error" && (
              <>
                <p className="text-sm text-rose-400 py-4 text-center">⚠️ {tapTrade.message}</p>
                <button
                  onClick={() => setTapTrade(null)}
                  className="w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95"
                >
                  {t("chat.close")}
                </button>
              </>
            )}
          </div>
        </div>
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
  const t = useT()
  const [uid, setUid] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    const trimmed = uid.trim()
    if (!trimmed) { setError(t("chat.enterVtAccount")); return }
    setSaving(true)
    try {
      const { getCurrentUserId } = await import("@/lib/auth-token")
      const uid = await getCurrentUserId()
      if (!uid) throw new Error("Sem sessão")
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ broker_uid: trimmed })
        .eq("id", uid)
      if (dbErr) throw dbErr
      onSave(trimmed)
    } catch {
      setError(t("chat.saveError"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{
        backgroundColor: shouldReduceSafariEffects() ? "rgba(0,0,0,0.92)" : "rgba(0,0,0,0.7)",
        backdropFilter: shouldReduceSafariEffects() ? undefined : "blur(4px)",
      }}
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
              <h3 className="font-bold text-white text-lg leading-tight">{t("chat.brokerRequired")}</h3>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                {t("chat.brokerBody1")} <strong className="text-white">VT Markets</strong>{t("chat.brokerBody2")}
              </p>
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          {/* UID input */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">
              {t("chat.vtAccountLabel")}
            </label>
            <input
              type="text"
              value={uid}
              onChange={e => { setUid(e.target.value); setError("") }}
              placeholder={t("chat.vtPlaceholder")}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/60 font-mono"
            />
            {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            <p className="text-xs text-gray-500 mt-1.5">
              {t("chat.uidHint")}
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t("chat.saving")}</>
            ) : (
              <><Check className="w-4 h-4" /> {t("chat.confirmEnter")}</>
            )}
          </button>

          {/* Open account link */}
          <div className="text-center space-y-1">
            <p className="text-xs text-gray-500">{t("chat.noAccountYet")}</p>
            <a
              href="/app-mobile/accountopen"
              className="text-sm text-[#D2A63C] font-medium underline"
            >
              {t("chat.openVtAccount")}
            </a>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
          >
            {t("chat.close")}
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
  const t = useT()
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
                {isReadOnlyChannel(channel.slug) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#26A5E4]/15 text-[#26A5E4]">
                    Telegram
                  </span>
                )}
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    canWrite ? "bg-green-500/15 text-green-400" : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {canWrite ? t("chat.canPost") : t("chat.readOnly")}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t("chat.channelRules")}
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
                <p className="text-xs font-semibold text-[#D2A63C] mb-1.5">{t("chat.tip")}</p>
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
            {t("chat.close")}
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

export default function ChatChannels({ initialSlug }: { initialSlug?: string | null }) {
  const t = useT()
  const { user, isLoading: authLoading } = useAuth()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const autoSelectedSlugRef = useRef<string | null>(null)
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
  const [reloadTick, setReloadTick] = useState(0)

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
    if (authLoading) return

    const fetchChannels = async () => {
      setLoading(true)
      setError(null)

      const token = await waitForSupabaseSession()
      if (!token) {
        setError(t("chat.sessionUnavailableApp"))
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("chat_channels")
        .select("id, slug, name, description, parent_slug, position")
        .order("position", { ascending: true })

      if (error) {
        console.error("[chat] fetchChannels:", error.message)
        setError(t("chat.loadError"))
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
        const { getCurrentUserId } = await import("@/lib/auth-token")
        const uid = await getCurrentUserId()
        if (!uid) return
        const { data } = await supabase
          .from("profiles")
          .select("broker_uid")
          .eq("id", uid)
          .single()
        if (data?.broker_uid) setBrokerUid(data.broker_uid)
      } catch {}
    }

    fetchChannels()
    fetchBrokerUid()
  }, [authLoading, user?.id, reloadTick])

  // Auto-selecionar canal vindo de notificação/deep-link
  useEffect(() => {
    if (!initialSlug || !channels.length) return
    if (autoSelectedSlugRef.current === initialSlug) return
    const flat = channels.flatMap((c) => (c.children?.length ? c.children : [c]))
    const target = flat.find((c) => c.slug === initialSlug)
    if (target) {
      autoSelectedSlugRef.current = initialSlug
      setActiveChannel(target)
    }
  }, [channels, initialSlug])

  const handleChannelSelect = (channel: Channel) => {
    if (requiresBrokerUidChannel(channel.slug) && !brokerUid) {
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
        <button
          type="button"
          onClick={() => setReloadTick((t) => t + 1)}
          className="text-xs text-[#D2A63C] underline mt-1"
        >
          {t("chat.retry")}
        </button>
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
            <h2 className="text-lg font-bold text-white">{t("chat.title")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {allFlatChannels.length} {t("chat.channels")}
              {totalUnread > 0 && (
                <span className="text-[#D2A63C]"> · {totalUnread} {t("chat.withNews")}</span>
              )}
            </p>
          </div>
          <Link
            href="/messages-mobile"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:border-[#D2A63C]/40"
          >
            <Inbox className="w-3.5 h-3.5 text-[#D2A63C]" />
            {t("chat.private")}
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
          {t("chat.tabChannels")}
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
          {t("chat.tabDirect")}
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
              placeholder={t("chat.searchMember")}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
            />
          </div>

          {dmSearch.trim().length >= 2 && (
            <div className="mb-5">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{t("chat.results")}</p>
              {searchingMembers ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
                </div>
              ) : memberResults.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">{t("chat.noMemberFound")}</p>
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
              <p className="text-sm">{t("chat.noEducator")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">
                {t("chat.educatorsTeam")}
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
                      alt={edu.full_name || edu.username || t("chat.educator")}
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
                        {edu.full_name || edu.username || t("chat.educator")}
                      </p>
                      <MemberBadge profile={edu} size="xs" />
                    </div>
                    {edu.username && (
                      <p className="text-xs text-gray-400">@{edu.username}</p>
                    )}
                    <p className="text-[11px] text-[#D2A63C] mt-0.5">
                      {edu.user_type === "admin" ? t("chat.adminEducator") : t("chat.educator")}
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
                placeholder={t("chat.searchChannel")}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-800/40">
            {channelSearch.trim() ? (
              filteredChannels.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-10">{t("chat.noChannelFound")}</p>
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
