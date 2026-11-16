"use client"

import { useState, useEffect, useCallback, useId, useMemo } from "react"
import { semCripto } from "@/lib/ios-sem-cripto"
import { useT } from "@/components/i18n-provider"
import {
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Wallet,
  MessageSquare,
  Video,
  BarChart3,
  LayoutGrid,
  BrainCircuit,
  User,
  BookOpen,
  Bell,
  Network,
  Compass,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

// ─── Tutorial Steps ────────────────────────────────────────────────────────────

type TutorialStep = {
  id: string
  phase: string
  emoji: string
  title: string
  body: string
  tips?: string[]
  hint?: string
  color: string
  icon: LucideIcon | null
  /** Native iOS tab to activate via MTMNative bridge (social|chat|live|portfolio|scanner|apps) */
  tab?: string
  /** Selectores data-tutorial a realçar (sem desfoque total) */
  highlight?: string[]
}

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

/** Passo com os textos já traduzidos (o campo `phase`/`title`/… de STEPS guarda a chave i18n). */
type ResolvedStep = Omit<TutorialStep, "phase" | "title" | "body" | "tips" | "hint"> & {
  phase: string
  title: string
  body: string
  tips?: string[]
  hint?: string
}

function resolveHighlightSelectors(step: TutorialStep): string[] {
  return step.highlight?.map(h => h.startsWith("[") ? h : `[data-tutorial="${h}"]`) ?? []
}

function TutorialSpotlight({
  rects,
  color,
  maskId,
  onClose,
}: {
  rects: HighlightRect[]
  color: string
  maskId: string
  onClose?: () => void
}) {
  if (rects.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[299] bg-black/88 pointer-events-auto"
        aria-hidden
        onClick={onClose}
      />
    )
  }

  const pad = 8
  const radius = 14

  return (
    <>
      <svg className="fixed inset-0 z-[299] w-full h-full pointer-events-auto" aria-hidden onClick={onClose}>
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {rects.map((r, i) => (
              <rect
                key={i}
                x={r.left - pad}
                y={r.top - pad}
                width={r.width + pad * 2}
                height={r.height + pad * 2}
                rx={radius}
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.84)" mask={`url(#${maskId})`} />
      </svg>

      {rects.map((r, i) => (
        <div
          key={i}
          className="fixed z-[300] pointer-events-none rounded-2xl transition-all duration-300"
          style={{
            top: r.top - pad,
            left: r.left - pad,
            width: r.width + pad * 2,
            height: r.height + pad * 2,
            boxShadow: `0 0 0 2px ${color}, 0 0 24px ${color}99, inset 0 0 12px ${color}22`,
          }}
        />
      ))}
    </>
  )
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    phase: "amA.onboarding.phaseIntro",
    emoji: "👋",
    title: "amA.onboarding.welcomeTitle",
    body: "amA.onboarding.welcomeBody",
    tips: [
      "amA.onboarding.welcomeTip0",
      "amA.onboarding.welcomeTip1",
    ],
    color: "#D2A63C",
    icon: Sparkles,
  },
  {
    id: "navigation",
    phase: "amA.onboarding.phaseNavigation",
    emoji: "🧭",
    title: "amA.onboarding.navigationTitle",
    body: "amA.onboarding.navigationBody",
    tips: [
      "amA.onboarding.navigationTip0",
      "amA.onboarding.navigationTip1",
      "amA.onboarding.navigationTip2",
      "amA.onboarding.navigationTip3",
    ],
    hint: "amA.onboarding.navigationHint",
    color: "#38BDF8",
    icon: Compass,
    highlight: ["menu"],
  },
  {
    id: "social",
    phase: "amA.onboarding.phaseCommunity",
    emoji: "📰",
    title: "amA.onboarding.socialTitle",
    body: "amA.onboarding.socialBody",
    tips: [
      "amA.onboarding.socialTip0",
      "amA.onboarding.socialTip1",
      "amA.onboarding.socialTip2",
    ],
    hint: "amA.onboarding.socialHint",
    color: "#D2A63C",
    icon: LayoutGrid,
    highlight: [],
  },
  {
    id: "chat",
    phase: "amA.onboarding.phaseCommunity",
    emoji: "💬",
    title: "amA.onboarding.chatTitle",
    body: "amA.onboarding.chatBody",
    tips: [
      "amA.onboarding.chatTip0",
      "amA.onboarding.chatTip1",
      "amA.onboarding.chatTip2",
      "amA.onboarding.chatTip3",
    ],
    hint: "amA.onboarding.chatHint",
    color: "#26A5E4",
    icon: MessageSquare,
    highlight: [],
  },
  {
    id: "notifications",
    phase: "amA.onboarding.phaseCommunity",
    emoji: "🔔",
    title: "amA.onboarding.notificationsTitle",
    body: "amA.onboarding.notificationsBody",
    tips: [
      "amA.onboarding.notificationsTip0",
      "amA.onboarding.notificationsTip1",
      "amA.onboarding.notificationsTip2",
    ],
    hint: "amA.onboarding.notificationsHint",
    color: "#F59E0B",
    icon: Bell,
    highlight: ["notifications"],
  },
  {
    id: "live",
    phase: "amA.onboarding.phaseTraining",
    emoji: "🎥",
    title: "amA.onboarding.liveTitle",
    body: "amA.onboarding.liveBody",
    tips: [
      "amA.onboarding.liveTip0",
      "amA.onboarding.liveTip1",
      "amA.onboarding.liveTip2",
    ],
    hint: "amA.onboarding.liveHint",
    color: "#EF4444",
    icon: Video,
    highlight: [],
  },
  {
    id: "mentor",
    phase: "amA.onboarding.phaseTraining",
    emoji: "🤖",
    title: "amA.onboarding.mentorTitle",
    body: "amA.onboarding.mentorBody",
    tips: [
      "amA.onboarding.mentorTip0",
      "amA.onboarding.mentorTip1",
      "amA.onboarding.mentorTip2",
    ],
    hint: "amA.onboarding.mentorHint",
    color: "#F59E0B",
    icon: BrainCircuit,
    highlight: ["menu"],
  },
  {
    id: "portfolio",
    phase: "amA.onboarding.phaseTrading",
    emoji: "📊",
    title: "amA.onboarding.portfolioTitle",
    body: "amA.onboarding.portfolioBody",
    tips: [
      "amA.onboarding.portfolioTip0",
      "amA.onboarding.portfolioTip1",
      "amA.onboarding.portfolioTip2",
    ],
    hint: "amA.onboarding.portfolioHint",
    color: "#10B981",
    icon: Wallet,
    highlight: [],
  },
  {
    id: "scanner",
    phase: "amA.onboarding.phaseTrading",
    emoji: "🔍",
    title: "amA.onboarding.scannerTitle",
    body: "amA.onboarding.scannerBody",
    tips: [
      "amA.onboarding.scannerTip0",
      "amA.onboarding.scannerTip1",
      "amA.onboarding.scannerTip2",
    ],
    hint: "amA.onboarding.scannerHint",
    color: "#8B5CF6",
    icon: BarChart3,
    highlight: [],
  },
  {
    id: "apps",
    phase: "amA.onboarding.phaseTools",
    emoji: "🛠️",
    title: "amA.onboarding.appsTitle",
    body: "amA.onboarding.appsBody",
    tips: [
      "amA.onboarding.appsTip0",
      "amA.onboarding.appsTip1",
      "amA.onboarding.appsTip2",
    ],
    hint: "amA.onboarding.appsHint",
    color: "#D2A63C",
    icon: BookOpen,
    highlight: [],
  },
  {
    id: "mlm",
    phase: "amA.onboarding.phaseTools",
    emoji: "🤝",
    title: "amA.onboarding.mlmTitle",
    body: "amA.onboarding.mlmBody",
    tips: [
      "amA.onboarding.mlmTip0",
      "amA.onboarding.mlmTip1",
      "amA.onboarding.mlmTip2",
    ],
    hint: "amA.onboarding.mlmHint",
    color: "#2DD4BF",
    icon: Network,
    highlight: ["menu"],
  },
  {
    id: "settings",
    phase: "amA.onboarding.phaseAccount",
    emoji: "⚙️",
    title: "amA.onboarding.settingsTitle",
    body: "amA.onboarding.settingsBody",
    tips: [
      "amA.onboarding.settingsTip0",
      "amA.onboarding.settingsTip1",
      "amA.onboarding.settingsTip2",
    ],
    hint: "amA.onboarding.settingsHint",
    color: "#D2A63C",
    icon: User,
    highlight: ["menu"],
  },
  {
    id: "done",
    phase: "amA.onboarding.phaseDone",
    emoji: "🚀",
    title: "amA.onboarding.doneTitle",
    body: "amA.onboarding.doneBody",
    tips: [
      "amA.onboarding.doneTip0",
      "amA.onboarding.doneTip1",
      "amA.onboarding.doneTip2",
      "amA.onboarding.doneTip3",
      "amA.onboarding.doneTip4",
    ],
    color: "#10B981",
    icon: null,
  },
]

/**
 * App iOS: os textos do tutorial não falam de cripto (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
 * Os textos chegam já traduzidos; a limpeza cobre a versão PT («cripto») e a EN («crypto»).
 */
function semCriptoNoPasso(p: ResolvedStep): ResolvedStep {
  if (!semCripto()) return p
  const limpar = (t: string) =>
    t
      .replace(/,\s*cripto\b/gi, "")
      .replace(/\s+e\s+#Cripto\b/g, "")
      .replace(/\bem cripto e ETFs\b/g, "em ETFs")
      .replace(/,\s*crypto\b/gi, "")
      .replace(/\s+and\s+#Crypto\b/g, "")
      .replace(/\bin crypto and ETFs\b/g, "in ETFs")
  return { ...p, body: limpar(p.body), tips: p.tips?.map(limpar), hint: p.hint ? limpar(p.hint) : p.hint }
}

const QUICK_START = [
  "amA.onboarding.quickStart0",
  "amA.onboarding.quickStart1",
  "amA.onboarding.quickStart2",
  "amA.onboarding.quickStart3",
]

function resolveStep(p: TutorialStep, t: (key: string) => string): ResolvedStep {
  return {
    ...p,
    phase: t(p.phase),
    title: t(p.title),
    body: t(p.body),
    tips: p.tips?.map((k) => t(k)),
    hint: p.hint ? t(p.hint) : undefined,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingTutorialProps {
  onComplete?: () => void
  onTabChange?: (tab: string) => void
  onOpenSidebar?: () => void
}

export default function OnboardingTutorial({
  onComplete,
  onTabChange,
  onOpenSidebar,
}: OnboardingTutorialProps) {
  const [step, setStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<"next" | "prev">("next")
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([])
  const maskId = useId().replace(/:/g, "")

  const t = useT()
  const current = useMemo(() => semCriptoNoPasso(resolveStep(STEPS[step], t)), [step, t])
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100
  const Icon = current.icon

  const measureHighlights = useCallback(() => {
    const selectors = resolveHighlightSelectors(current)
    const rects: HighlightRect[] = []

    for (const sel of selectors) {
      const query = sel.startsWith("[") ? sel : `[data-tutorial="${sel}"]`
      const el = document.querySelector(query)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        rects.push({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
    }

    setHighlightRects(rects)
  }, [current])

  useEffect(() => {
    measureHighlights()
    const t1 = setTimeout(measureHighlights, 180)
    const t2 = setTimeout(measureHighlights, 400)
    window.addEventListener("resize", measureHighlights)
    window.addEventListener("scroll", measureHighlights, true)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      window.removeEventListener("resize", measureHighlights)
      window.removeEventListener("scroll", measureHighlights, true)
    }
  }, [step, measureHighlights])

  const applyStepSideEffects = (target: TutorialStep) => {
    if (target.tab) {
      // Web callback for compatibility
      onTabChange?.(target.tab)
      // Native iOS bridge — ask SwiftUI TabView to switch tab
      // NOTE: postMessage espera um objecto JS, NÃO uma string JSON
      try {
        ;(window as any).MTMNative?.postMessage(
          { action: "tabChange", tab: target.tab }
        )
      } catch {}
    }
  }

  const highlightsBottom =
    typeof window !== "undefined" &&
    highlightRects.length > 0 &&
    highlightRects.every((r) => r.top > window.innerHeight * 0.55)

  const transitionTo = (nextIndex: number, dir: "next" | "prev") => {
    if (animating || nextIndex < 0 || nextIndex >= STEPS.length) return
    setAnimating(true)
    setDirection(dir)
    setTimeout(() => {
      const target = STEPS[nextIndex]
      setStep(nextIndex)
      applyStepSideEffects(target)
      setAnimating(false)
    }, 160)
  }

  const goNext = () => {
    if (isLast) {
      handleComplete()
      return
    }
    transitionTo(step + 1, "next")
  }

  const goPrev = () => {
    if (!isFirst) transitionTo(step - 1, "prev")
  }

  const handleComplete = () => {
    try {
      localStorage.setItem("mtm_onboarding_done", "1")
    } catch {}
    setIsVisible(false)
    onComplete?.()
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[301] pointer-events-none">
      <TutorialSpotlight rects={highlightRects} color={current.color} maskId={maskId} onClose={handleComplete} />

      <div
        className={`absolute left-0 right-0 flex justify-center px-0 sm:px-4 pointer-events-auto z-[302] ${
          highlightsBottom ? "top-4 sm:top-8" : "bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
        }`}
        onClick={e => e.stopPropagation()}
        style={
          highlightsBottom
            ? { paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }
            : { paddingBottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 4.5rem))" }
        }
      >
      <div
        className={`w-full sm:max-w-md overflow-hidden shadow-2xl flex flex-col sm:rounded-3xl ${
          highlightsBottom ? "rounded-b-3xl" : "rounded-t-3xl"
        } ${
          highlightRects.length === 0
            ? "max-h-[82vh] sm:max-h-[80vh]"
            : "max-h-[60vh] sm:max-h-[72vh]"
        }`}
        style={{
          transform: animating
            ? direction === "next"
              ? "translateY(8px) scale(0.98)"
              : "translateY(-8px) scale(0.98)"
            : "translateY(0) scale(1)",
          opacity: animating ? 0.92 : 1,
          transition: "transform 0.16s ease, opacity 0.16s ease",
        }}
      >
        <div
          className="h-1.5 shrink-0"
          style={{ background: `linear-gradient(to right, ${current.color}, ${current.color}55)` }}
        />

        <div className="bg-gray-900 flex flex-col min-h-0 flex-1">
          {/* Header */}
          <div
            className="px-5 pt-4 pb-3 border-b border-gray-800/80 shrink-0"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))" }}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${current.color}20`, color: current.color }}
              >
                {current.phase}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">
                  {step + 1}/{STEPS.length}
                </span>
                <button
                  onClick={handleComplete}
                  className="flex items-center gap-1 text-gray-400 text-xs hover:text-white transition-colors"
                  aria-label={t("amA.onboarding.skipAria")}
                >
                  {t("amA.onboarding.skip")} <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, backgroundColor: current.color }}
              />
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
            <div className="flex flex-col items-center text-center mb-4">
              {Icon ? (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                  style={{
                    backgroundColor: `${current.color}18`,
                    border: `1.5px solid ${current.color}40`,
                  }}
                >
                  <Icon style={{ width: 28, height: 28, color: current.color }} />
                </div>
              ) : (
                <div className="text-5xl mb-3">{current.emoji}</div>
              )}
              <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
              <p className="text-gray-300 text-sm leading-relaxed">{current.body}</p>
            </div>

            {current.hint && (
              <div
                className="mb-4 px-3 py-2.5 rounded-xl text-left text-xs leading-relaxed"
                style={{
                  backgroundColor: `${current.color}12`,
                  border: `1px solid ${current.color}30`,
                  color: "#D1D5DB",
                }}
              >
                <span style={{ color: current.color }} className="font-semibold">
                  {t("amA.onboarding.whereToFind")}{" "}
                </span>
                {current.hint}
              </div>
            )}

            {current.tips && current.tips.length > 0 && (
              <ul className="space-y-2 text-left">
                {current.tips.map((tip) => (
                  <li
                    key={tip}
                    className="flex items-start gap-2 text-sm text-gray-300 leading-snug"
                  >
                    <span
                      className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: current.color }}
                    />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            )}

            {isLast && (
              <div className="mt-5 p-3 rounded-xl bg-gray-800/60 border border-gray-700/50 text-left">
                <p className="text-xs font-semibold text-[#D2A63C] mb-2 uppercase tracking-wide">
                  {t("amA.onboarding.quickPlanTitle")}
                </p>
                <ul className="space-y-1.5">
                  {QUICK_START.map((item) => (
                    <li key={item} className="text-xs text-gray-400 flex items-center gap-2">
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div
            className="px-5 pb-5 pt-2 border-t border-gray-800/80 shrink-0"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex gap-2">
              {!isFirst && (
                <button
                  onClick={goPrev}
                  disabled={animating}
                  className="px-4 py-3.5 rounded-2xl border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-50"
                  aria-label={t("amA.onboarding.previousAria")}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={goNext}
                disabled={animating}
                className="flex-1 py-3.5 rounded-2xl font-bold text-base text-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70"
                style={{ background: `linear-gradient(135deg, ${current.color}, ${current.color}CC)` }}
              >
                {isLast ? (
                  <>
                    <Check className="w-5 h-5" />
                    {t("amA.onboarding.startExploring")}
                  </>
                ) : isFirst ? (
                  <>
                    {t("amA.onboarding.letsGo")}
                    <ArrowRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    {t("amA.onboarding.next")}
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

// ─── Hook para controlar quando mostrar ───────────────────────────────────────

export function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(false)

  useEffect(() => {
    const check = () => {
      try {
        const done = localStorage.getItem("mtm_onboarding_done")
        setShouldShow(!done)
      } catch {
        setShouldShow(false)
      }
    }

    check()

    const handleReplay = () => {
      setShouldShow(true)
    }
    window.addEventListener("mtm-replay-tutorial", handleReplay)
    return () => window.removeEventListener("mtm-replay-tutorial", handleReplay)
  }, [])

  const markDone = () => {
    try {
      localStorage.setItem("mtm_onboarding_done", "1")
    } catch {}
    setShouldShow(false)
  }

  return { shouldShow, markDone }
}
