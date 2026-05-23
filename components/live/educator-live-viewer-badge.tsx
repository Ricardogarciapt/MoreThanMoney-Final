"use client"

import { Users } from "lucide-react"

type Props = {
  count: number
  isLive?: boolean
  className?: string
}

/** Contador de espectadores ativos (atualizado por heartbeat na sala). */
export default function EducatorLiveViewerBadge({ count, isLive = true, className = "" }: Props) {
  if (!isLive) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-semibold text-emerald-200 ${className}`}
      title="Utilizadores a assistir neste momento (atualização em tempo real)"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Users className="h-3.5 w-3.5" />
      {count === 1 ? "1 a assistir" : `${count} a assistir`}
    </span>
  )
}
