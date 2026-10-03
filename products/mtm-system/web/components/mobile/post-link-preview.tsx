"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { LinkPreviewData } from "@/lib/link-preview-types"
import { getPrimaryUrlFromText } from "@/lib/url-utils"
import LinkPreviewCard from "./link-preview-card"

interface PostLinkPreviewProps {
  content: string
  storedPreview?: LinkPreviewData | null
  className?: string
}

function normalizeStoredPreview(raw: unknown): LinkPreviewData | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const url = typeof o.url === "string" ? o.url : null
  if (!url) return null
  return {
    url,
    title: typeof o.title === "string" ? o.title : null,
    description: typeof o.description === "string" ? o.description : null,
    image: typeof o.image === "string" ? o.image : null,
    siteName: typeof o.siteName === "string" ? o.siteName : null,
  }
}

/** Pré-visualização de link quando o post não tem média. */
export default function PostLinkPreview({
  content,
  storedPreview,
  className = "",
}: PostLinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(
    normalizeStoredPreview(storedPreview)
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = normalizeStoredPreview(storedPreview)
    if (stored) {
      setPreview(stored)
      return
    }

    const url = getPrimaryUrlFromText(content)
    if (!url) {
      setPreview(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setPreview(data?.preview ? normalizeStoredPreview(data.preview) : null)
      })
      .catch(() => {
        if (!cancelled) setPreview({ url, title: url })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [content, storedPreview])

  if (loading && !preview) {
    return (
      <div
        className={`flex items-center justify-center gap-2 py-8 rounded-xl border border-gray-700/60 bg-gray-900/50 ${className}`}
      >
        <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
        <span className="text-xs text-gray-500">A carregar pré-visualização…</span>
      </div>
    )
  }

  if (!preview) return null

  return <LinkPreviewCard preview={preview} className={className} />
}
