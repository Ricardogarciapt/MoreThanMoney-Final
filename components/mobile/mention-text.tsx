"use client"

import Link from "next/link"

interface MentionTextProps {
  text: string
  className?: string
}

/**
 * Renders chat message text with:
 * - @[Nome](id) → coloured mention links
 * - https?://... → tappable URL links (like Telegram)
 * - Everything else → plain text
 */
export default function MentionText({ text, className = "" }: MentionTextProps) {
  // Combined regex: mention OR url
  const tokenRegex = /@\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s<>"]+)/g

  type Part =
    | { type: "text"; value: string }
    | { type: "mention"; name: string; id: string }
    | { type: "url"; href: string }

  const parts: Part[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.substring(lastIndex, match.index) })
    }

    if (match[1] !== undefined) {
      // @[Name](id) mention
      parts.push({ type: "mention", name: match[1], id: match[2] })
    } else {
      // plain URL
      parts.push({ type: "url", href: match[3] })
    }

    lastIndex = tokenRegex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.substring(lastIndex) })
  }

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.value}</span>
        }
        if (part.type === "mention") {
          return (
            <Link
              key={i}
              href={`/profile/${encodeURIComponent(part.id)}`}
              className="text-[#D2A63C] font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{part.name}
            </Link>
          )
        }
        // URL
        const displayUrl = part.href.replace(/^https?:\/\//, "").replace(/\/$/, "")
        return (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {displayUrl.length > 40 ? displayUrl.slice(0, 40) + "…" : displayUrl}
          </a>
        )
      })}
    </span>
  )
}
