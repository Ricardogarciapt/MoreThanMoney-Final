"use client"

import { useSearchParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  Handshake,
  LayoutGrid,
  Rocket,
} from "lucide-react"

export const MTM_STUDIO_URL = "https://mtmbrandbuilder.lovable.app"
export const MTM_PARTNERSHIP_URL = "https://mtmugcapp.lovable.app"
export const MTM_AIOS_URL = "https://mtmaios.lovable.app"

const APPS = [
  {
    id: "studio" as const,
    title: "MTM Studio",
    description: "Brand builder e conteúdo visual MTM",
    icon: Rocket,
    url: MTM_STUDIO_URL,
  },
  {
    id: "partnership" as const,
    title: "MTM Partnership Engine",
    description: "Parcerias, UGC e colaborações",
    icon: Handshake,
    url: MTM_PARTNERSHIP_URL,
  },
  {
    id: "aios" as const,
    title: "MTM AiOS",
    description: "Sistema operativo de inteligência artificial MTM",
    icon: LayoutGrid,
    url: MTM_AIOS_URL,
  },
]

type AppId = (typeof APPS)[number]["id"]

function isAppId(value: string | null): value is AppId {
  return value === "studio" || value === "partnership" || value === "aios"
}

export default function AppsMobile() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const appParam = searchParams.get("app")
  const selected = isAppId(appParam) ? appParam : null
  const activeApp = APPS.find((a) => a.id === selected)

  const openApp = (id: AppId) => {
    router.push(`/app-mobile?tab=apps&app=${id}`, { scroll: false })
  }

  const backToLauncher = () => {
    router.push("/app-mobile?tab=apps", { scroll: false })
  }

  if (activeApp) {
    const Icon = activeApp.icon
    return (
      <div className="relative flex min-h-[60vh] w-full flex-col bg-black">
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-800 bg-gray-900/95 px-3 py-2 backdrop-blur-sm">
          <button
            type="button"
            onClick={backToLauncher}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-white transition-colors hover:bg-gray-700 active:scale-95"
            aria-label="Voltar às apps"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-[#D2A63C]" />
            <span className="truncate text-sm font-medium text-white">
              {activeApp.title}
            </span>
          </div>
          <a
            href={activeApp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#D2A63C]/40 bg-black/70 px-2 py-1.5 text-[11px] text-[#D2A63C] hover:opacity-80"
          >
            Abrir fora
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <iframe
          src={activeApp.url}
          title={activeApp.title}
          className="w-full flex-1 bg-black"
          style={{ height: "calc(100dvh - 11rem)" }}
          loading="lazy"
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/10">
          <LayoutGrid className="h-6 w-6 text-[#D2A63C]" />
        </div>
        <h2 className="text-lg font-bold text-white">Apps MTM</h2>
        <p className="mt-1 text-sm text-gray-400">
          Escolhe uma aplicação para abrir dentro da app
        </p>
      </div>

      <div className="space-y-3">
        {APPS.map((app) => {
          const Icon = app.icon
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => openApp(app.id)}
              className="flex w-full items-start gap-4 rounded-xl border border-gray-800 bg-gray-800/50 p-4 text-left transition-all hover:border-[#D2A63C]/50 hover:bg-gray-800 active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D2A63C]/15">
                <Icon className="h-5 w-5 text-[#D2A63C]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white">{app.title}</div>
                <p className="mt-0.5 text-sm text-gray-400">{app.description}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
