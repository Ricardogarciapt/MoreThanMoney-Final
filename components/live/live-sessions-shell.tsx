import Link from "next/link"
import { ReactNode } from "react"

const shellMain =
  "min-h-screen bg-[#050508] text-white bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(210,166,60,0.08),transparent_50%)]"

/**
 * Moldura visual partilhada: Live Sessions (lobby, /live, studio, etc.)
 */
export function LiveSessionsShell({
  title,
  subtitle,
  children,
  showEducatorLink = true,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  showEducatorLink?: boolean
}) {
  return (
    <main className={shellMain}>
      <header className="border-b border-[#D2A63C]/15 bg-black/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:py-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#D2A63C]/70">Live Sessions</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm text-gray-400">{subtitle}</p>}
          </div>
          {showEducatorLink && (
            <Link
              href="/live-sessions/studio"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#D2A63C]/35 bg-[#D2A63C]/10 px-4 py-2.5 text-sm font-medium text-[#D2A63C] transition hover:bg-[#D2A63C]/20"
            >
              Sou educador
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </main>
  )
}
