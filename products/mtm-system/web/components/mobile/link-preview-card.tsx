"use client"

import Image from "next/image"
import { ExternalLink } from "lucide-react"
import type { LinkPreviewData } from "@/lib/link-preview-types"
import { getHostname } from "@/lib/url-utils"

interface LinkPreviewCardProps {
  preview: LinkPreviewData
  className?: string
}

/** Cartão de pré-visualização de link (estilo WhatsApp). */
export default function LinkPreviewCard({ preview, className = "" }: LinkPreviewCardProps) {
  const domain = preview.siteName || getHostname(preview.url)

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`block rounded-xl border border-gray-700/80 bg-gray-900/80 overflow-hidden hover:border-[#D2A63C]/40 transition-colors ${className}`}
    >
      {preview.image && (
        <div className="relative w-full aspect-[1.91/1] max-h-48 bg-gray-800">
          <Image
            src={preview.image}
            alt={preview.title || domain}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <div className="p-3 space-y-1">
        {preview.title && (
          <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {preview.description}
          </p>
        )}
        <p className="text-[11px] text-gray-500 flex items-center gap-1 pt-0.5">
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="truncate">{domain}</span>
        </p>
      </div>
    </a>
  )
}
