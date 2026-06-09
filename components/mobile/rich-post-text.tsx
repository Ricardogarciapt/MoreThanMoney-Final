"use client"

import Link from "next/link"
import { normalizeUrlForHref } from "@/lib/url-utils"

type Segment =
  | { type: "text"; value: string }
  | { type: "mention"; name: string; id: string }
  | { type: "link"; href: string; label: string }

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi

function parsePostText(text: string): Segment[] {
  const tokens: { index: number; end: number; segment: Segment }[] = []

  let m: RegExpExecArray | null
  MENTION_RE.lastIndex = 0
  while ((m = MENTION_RE.exec(text)) !== null) {
    tokens.push({
      index: m.index,
      end: m.index + m[0].length,
      segment: { type: "mention", name: m[1], id: m[2] },
    })
  }

  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0]
    const href = normalizeUrlForHref(raw)
    if (!href) continue
    const insideMention = tokens.some(
      (t) => t.segment.type === "mention" && m!.index >= t.index && m!.index < t.end
    )
    if (insideMention) continue
    tokens.push({
      index: m.index,
      end: m.index + raw.length,
      segment: { type: "link", href, label: raw.replace(/[.,;:!?)}\]]+$/, "") },
    })
  }

  tokens.sort((a, b) => a.index - b.index)

  const segments: Segment[] = []
  let cursor = 0
  for (const tok of tokens) {
    if (tok.index < cursor) continue
    if (tok.index > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, tok.index) })
    }
    segments.push(tok.segment)
    cursor = tok.end
  }
  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) })
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }]
}

interface RichPostTextProps {
  text: string
  className?: string
}

export default function RichPostText({ text, className = "" }: RichPostTextProps) {
  const segments = parsePostText(text)

  return (
    <span className={className}>
      {segments.map((part, index) => {
        if (part.type === "text") {
          return <span key={index}>{part.value}</span>
        }
        if (part.type === "mention") {
          return (
            <Link
              key={index}
              href={`/profile/${part.id}`}
              className="text-[#D2A63C] font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{part.name}
            </Link>
          )
        }
        return (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6eb5ff] underline underline-offset-2 break-all hover:text-[#9ecfff]"
            onClick={(e) => e.stopPropagation()}
          >
            {part.label}
          </a>
        )
      })}
    </span>
  )
}

