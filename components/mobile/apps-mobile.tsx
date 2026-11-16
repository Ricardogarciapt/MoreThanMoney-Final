"use client"

import { useSearchParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  CandlestickChart,
  ExternalLink,
  Handshake,
  LayoutGrid,
  Lock,
  Rocket,
  Sparkles,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useT } from "@/components/i18n-provider"
import type { User } from "@/contexts/auth-context"
import { podeAcederPremiumUi, type PerfilUi } from "@/lib/perfil-ui"

/**
 * Quem entra nas Apps MTM: admin, VIP, Premium (o Fundador incluído), IQ e quem está em trial.
 *
 * Esta regra estava escrita três vezes — aqui, no MTM Terminal do browser e no MTM Terminal do
 * servidor — e as três não diziam exactamente o mesmo. A daqui só reconhecia o Premium quando o
 * `user_type` era exactamente "member": um Premium marcado de outra forma lia «Faz upgrade do teu
 * plano» diante de uma porta que já tinha pago.
 */
function canAccessApps(user: User | null): boolean {
  return podeAcederPremiumUi(user as PerfilUi | null)
}

export const MTM_STUDIO_URL = "https://mtmbrandbuilder.lovable.app"
export const MTM_PARTNERSHIP_URL = "https://mtmugcapp.lovable.app"

const APPS = [
  {
    /**
     * O MTM SOCIAL vem PRIMEIRO, acima do Studio.
     *
     * É a única destas que é nossa e corre dentro da própria app — as outras são janelas para
     * sítios de fora. Quem abre «Apps» está à procura de fazer alguma coisa, e esta é a que
     * deixa fazer sem sair daqui.
     */
    id: "social" as const,
    title: "MTM Social",
    descriptionKey: "amA.apps.socialDesc",
    icon: Sparkles,
    url: "/mtmsocial",
  },
  {
    id: "studio" as const,
    title: "MTM Studio",
    descriptionKey: "amA.apps.studioDesc",
    icon: Rocket,
    url: MTM_STUDIO_URL,
  },
  {
    id: "partnership" as const,
    title: "MTM Partnership Engine",
    descriptionKey: "amA.apps.partnershipDesc",
    icon: Handshake,
    url: MTM_PARTNERSHIP_URL,
  },
]

type AppId = (typeof APPS)[number]["id"]

function isAppId(value: string | null): value is AppId {
  return value === "social" || value === "studio" || value === "partnership"
}

export default function AppsMobile() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useT()
  const { user } = useAuth()
  const appParam = searchParams.get("app")
  const selected = isAppId(appParam) ? appParam : null
  const activeApp = APPS.find((a) => a.id === selected)
  const hasAccess = canAccessApps(user)

  const openApp = (id: AppId) => {
    router.push(`/app-mobile?tab=apps&app=${id}`, { scroll: false })
  }

  const backToLauncher = () => {
    router.push("/app-mobile?tab=apps", { scroll: false })
  }

  // Ecrã de acesso bloqueado — não redireciona para o site
  if (!hasAccess) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/10">
          <Lock className="h-8 w-8 text-[#D2A63C]" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">{t("amA.apps.title")}</h2>
        <p className="mb-1 text-sm font-medium text-[#D2A63C]">{t("amA.apps.lockedLabel")}</p>
        <p className="mb-6 max-w-xs text-sm text-gray-400">
          {t("amA.apps.lockedBody")}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <a
            href="https://morethanmoney.pt/member-area"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D2A63C] px-5 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-95"
          >
            <Sparkles className="h-4 w-4" />
            {t("amA.apps.viewUpgradePlans")}
          </a>
        </div>
      </div>
    )
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
            aria-label={t("amA.apps.backAria")}
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
            {t("amA.apps.openOutside")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <iframe
          src={activeApp.url}
          title={activeApp.title}
          className="w-full flex-1 bg-black app-dvh"
          style={{ "--app-dvh-offset": "11rem" } as any}
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
        <h2 className="text-lg font-bold text-white">{t("amA.apps.title")}</h2>
        <p className="mt-1 text-sm text-gray-400">
          {t("amA.apps.pickApp")}
        </p>
      </div>

      <div className="space-y-3">
        {/* O WebTrader é o sub-separador «Web trader» do Scanner, não um iframe. */}
        <button
          type="button"
          onClick={() => router.push("/app-mobile?tab=scanner&sub=webtrader", { scroll: false })}
          className="flex w-full items-start gap-4 rounded-xl border border-[#D2A63C]/40 bg-gray-800/50 p-4 text-left transition-all hover:border-[#D2A63C] hover:bg-gray-800 active:scale-[0.98]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D2A63C]/15">
            <CandlestickChart className="h-5 w-5 text-[#D2A63C]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">Web trader · MTM Funded</div>
            <p className="mt-0.5 text-sm text-gray-400">{t("amA.apps.webTraderDesc")}</p>
          </div>
        </button>
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
                <p className="mt-0.5 text-sm text-gray-400">{t(app.descriptionKey)}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
