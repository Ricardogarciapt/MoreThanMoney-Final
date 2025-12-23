"use client"

import Link from "next/link"

interface MentionTextProps {
  text: string
  className?: string
}

export default function MentionText({ text, className = "" }: MentionTextProps) {
  // Regex para encontrar menções no formato @[Nome](id)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g

  const parts: (string | { type: 'mention'; name: string; id: string })[] = []
  let lastIndex = 0
  let match

  while ((match = mentionRegex.exec(text)) !== null) {
    // Adicionar texto antes da menção
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }

    // Adicionar menção
    parts.push({
      type: 'mention',
      name: match[1],
      id: match[2]
    })

    lastIndex = mentionRegex.lastIndex
  }

  // Adicionar texto restante
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          return <span key={index}>{part}</span>
        } else {
          return (
            <Link
              key={index}
              href={`/profile/${part.id}`}
              className="text-[#D2A63C] font-semibold hover:underline"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              @{part.name}
            </Link>
          )
        }
      })}
    </span>
  )
}

