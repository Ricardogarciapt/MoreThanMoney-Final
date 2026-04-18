"use client"

import type { User } from "@mtm-auto/lib/types"
import { cn } from "@mtm-auto/lib/utils"
import { ArrowLeft, Menu } from "lucide-react"
import Link from "next/link"

type TopNavProps = {
  user: User
  onLogout: () => void
  onMenuToggle: () => void
}

export function TopNav({ user, onLogout, onMenuToggle }: TopNavProps) {
  const isAdmin = user.role === "admin"

  return (
    <header className="fixed left-0 right-0 top-0 z-50 shrink-0 border-b border-[var(--mtm-border)] bg-[var(--mtm-bg2)] pt-[env(safe-area-inset-top,0px)]">
      <div className="flex h-16 items-center gap-2 px-2 sm:gap-4 sm:px-4">
      <button
        type="button"
        onClick={onMenuToggle}
        className="rounded-lg p-2 text-[var(--mtm-text2)] transition-colors hover:bg-[var(--mtm-bg3)] hover:text-[var(--mtm-text)]"
        aria-label="Abrir ou fechar menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <div className="min-w-0 flex items-baseline gap-1.5">
        <span className="mtm-font-logo text-2xl leading-none text-[var(--mtm-text)]">MTM</span>
        <span className="mtm-font-condensed rounded border border-[rgba(0,200,255,0.2)] bg-[rgba(0,200,255,0.12)] px-1.5 py-[2px] text-[9px] font-extrabold uppercase tracking-[0.25em] text-[var(--mtm-cyan)] sm:text-[10px]">
          Auto
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <Link
          href="/app-mobile"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--mtm-border)] bg-transparent px-2 py-1.5 text-[10px] sm:text-[11px] text-[var(--mtm-text3)] transition-all hover:border-[var(--mtm-cyan)] hover:text-[var(--mtm-cyan)]"
          aria-label="Voltar ao App Mobile"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden min-[420px]:inline">App</span>
        </Link>

        <span
          className={cn(
            "hidden sm:inline mtm-font-mono rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            isAdmin
              ? "border-[rgba(245,200,66,0.25)] bg-[rgba(245,200,66,0.12)] text-[var(--mtm-gold)]"
              : "border-[rgba(79,255,176,0.2)] bg-[rgba(79,255,176,0.1)] text-[var(--mtm-green)]",
          )}
        >
          {isAdmin ? "Admin" : "Cliente"}
        </span>

        <div className="flex cursor-pointer items-center gap-1.5 sm:gap-2 rounded-full border border-[var(--mtm-border)] bg-[var(--mtm-bg4)] py-1 pl-1 pr-1.5 sm:pr-2.5 transition-colors hover:border-[var(--mtm-border2)]">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-bold text-[var(--mtm-bg)]"
            style={{
              background: isAdmin
                ? "linear-gradient(135deg, var(--mtm-gold), var(--mtm-red))"
                : "linear-gradient(135deg, var(--mtm-green), var(--mtm-cyan))",
            }}
          >
            {user.initials}
          </div>
          <span className="hidden min-[400px]:inline max-w-[100px] sm:max-w-[140px] truncate text-xs font-semibold text-[var(--mtm-text)]">
            {user.name}
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-md border border-[var(--mtm-border)] bg-transparent px-2 py-1.5 sm:px-2.5 text-[10px] sm:text-[11px] text-[var(--mtm-text3)] transition-all hover:border-[var(--mtm-red)] hover:text-[var(--mtm-red)]"
        >
          Sair
        </button>
      </div>
      </div>
    </header>
  )
}
