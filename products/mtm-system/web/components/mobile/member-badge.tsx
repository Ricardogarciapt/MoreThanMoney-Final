"use client"

import { chavePerfilUi, type ChavePerfil, type PerfilUi } from "@/lib/perfil-ui"

export type MemberBadgeProfile = PerfilUi & {
  full_name?: string | null
}

type BadgeStyle = {
  label: string
  emoji: string
  bg: string
  text: string
  border: string
}

const BADGE_STYLES: Record<ChavePerfil, BadgeStyle> = {
  admin: {
    label: "Admin",
    emoji: "🔴",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/35",
  },
  vip: {
    label: "VIP",
    emoji: "⭐",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/35",
  },
  iq: {
    label: "IQ",
    emoji: "🎓",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/35",
  },
  skool: {
    label: "Skool",
    emoji: "📚",
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/35",
  },
  premium: {
    label: "Premium",
    emoji: "💎",
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/35",
  },
  membro: {
    label: "App",
    emoji: "📱",
    bg: "bg-green-500/15",
    text: "text-green-400",
    border: "border-green-500/35",
  },
  trial: {
    label: "Trial",
    emoji: "⏳",
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/35",
  },
  inativo: {
    label: "Em pausa",
    emoji: "⏸",
    bg: "bg-gray-500/15",
    text: "text-gray-400",
    border: "border-gray-500/35",
  },
}

/**
 * O emblema que a comunidade vê ao lado do nome.
 *
 * Lia `member_category || user_type` no fim, e daí vinham dois enganos: o trial aparecia como
 * «💎 Premium» (é um `guest` com a categoria Premium) e quem estava em pausa por pagamento
 * continuava a exibir o emblema do plano que deixou de pagar. Agora é a mesma leitura de perfil
 * que o menu e as definições usam.
 */
export function resolveMemberBadge(profile?: MemberBadgeProfile | null): BadgeStyle | null {
  if (!profile) return null
  return BADGE_STYLES[chavePerfilUi(profile)] ?? null
}

export default function MemberBadge({
  profile,
  size = "sm",
}: {
  profile?: MemberBadgeProfile | null
  size?: "sm" | "xs"
}) {
  const badge = resolveMemberBadge(profile)
  if (!badge) return null

  const sizeClass =
    size === "xs"
      ? "text-[9px] px-1.5 py-0.5 gap-0.5"
      : "text-[10px] px-2 py-0.5 gap-1"

  return (
    <span
      className={`inline-flex items-center font-bold rounded-full border ${sizeClass} ${badge.bg} ${badge.text} ${badge.border}`}
    >
      <span className="leading-none">{badge.emoji}</span>
      <span className="leading-none uppercase tracking-wide">{badge.label}</span>
    </span>
  )
}
