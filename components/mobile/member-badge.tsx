"use client"

import { chavePerfilUi, type ChavePerfil, type PerfilUi } from "@/lib/perfil-ui"
import { useT } from "@/components/i18n-provider"

export type MemberBadgeProfile = PerfilUi & {
  full_name?: string | null
}

type BadgeStyle = {
  /** Chave i18n (amA.badge.*) do rótulo — traduzida no render. */
  labelKey: string
  emoji: string
  bg: string
  text: string
  border: string
}

const BADGE_STYLES: Record<ChavePerfil, BadgeStyle> = {
  admin: {
    labelKey: "amA.badge.admin",
    emoji: "🔴",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/35",
  },
  vip: {
    labelKey: "amA.badge.vip",
    emoji: "⭐",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/35",
  },
  iq: {
    labelKey: "amA.badge.iq",
    emoji: "🎓",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/35",
  },
  skool: {
    labelKey: "amA.badge.skool",
    emoji: "📚",
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/35",
  },
  premium: {
    labelKey: "amA.badge.premium",
    emoji: "💎",
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/35",
  },
  membro: {
    labelKey: "amA.badge.app",
    emoji: "📱",
    bg: "bg-green-500/15",
    text: "text-green-400",
    border: "border-green-500/35",
  },
  trial: {
    labelKey: "amA.badge.trial",
    emoji: "⏳",
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/35",
  },
  inativo: {
    labelKey: "amA.badge.paused",
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
  const t = useT()
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
      <span className="leading-none uppercase tracking-wide">{t(badge.labelKey)}</span>
    </span>
  )
}
