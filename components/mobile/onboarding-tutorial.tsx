"use client"

import { useState, useEffect } from "react"
import { ArrowRight, X, Check, Wallet, MessageSquare, Video, BarChart3, LayoutGrid, BrainCircuit, User, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

// ─── Tutorial Steps ────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "welcome",
    emoji: "👋",
    title: "Bem-vindo à MTM App!",
    body: "Em 30 segundos conheces tudo o que precisas de saber. Vamos começar?",
    color: "#D2A63C",
    icon: null,
  },
  {
    id: "social",
    emoji: "📰",
    title: "Feed Social",
    body: "Fica a par de todas as novidades MTM — ideas de trade, análises e publicações da comunidade.",
    color: "#D2A63C",
    icon: LayoutGrid,
    tab: "social",
  },
  {
    id: "chat",
    emoji: "💬",
    title: "Chat da Comunidade",
    body: "Canais em tempo real: #Trade Ideas, #Premium Ideas, #Trading e #Cripto. Partilha, aprende, discute.",
    color: "#26A5E4",
    icon: MessageSquare,
    tab: "chat",
  },
  {
    id: "live",
    emoji: "🎥",
    title: "Live Sessions",
    body: "Sessões de trading ao vivo com o Ricardo e a equipa MTM. Aprende em directo, com contexto real de mercado.",
    color: "#EF4444",
    icon: Video,
    tab: "live",
  },
  {
    id: "portfolio",
    emoji: "📊",
    title: "Portfólio MTM",
    body: "Acompanha o portfólio real de cripto e ações da MTM. Vê alocações, performance e oportunidades DCA.",
    color: "#10B981",
    icon: Wallet,
    tab: "portfolio",
  },
  {
    id: "scanner",
    emoji: "🔍",
    title: "Scanners",
    body: "Acede aos scanners TradingView exclusivos da MTM — Gold Killer, MTM Scanner e Sensei X.",
    color: "#8B5CF6",
    icon: BarChart3,
    tab: "scanner",
  },
  {
    id: "mentor",
    emoji: "🤖",
    title: "Mentor AI",
    body: "O teu tutor de trading pessoal disponível 24/7. Faz perguntas, analisa setups e aprende ao teu ritmo.",
    color: "#F59E0B",
    icon: BrainCircuit,
    tab: "mentor",
  },
  {
    id: "apps",
    emoji: "🛠️",
    title: "Ferramentas",
    body: "Checklist de trading, gestão de risco, calculadoras e mais — tudo numa só área.",
    color: "#D2A63C",
    icon: BookOpen,
    tab: "apps",
  },
  {
    id: "settings",
    emoji: "⚙️",
    title: "O teu Perfil",
    body: "Gere a tua conta, notificações, password e plano. Usa o menu hamburguer (☰) no topo para aceder.",
    color: "#D2A63C",
    icon: User,
    tab: "settings",
  },
  {
    id: "done",
    emoji: "🚀",
    title: "Tudo pronto!",
    body: "Já sabes como tirar o máximo da MTM App. Bom trading! Podes rever este tutorial a qualquer momento nas Definições.",
    color: "#10B981",
    icon: null,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingTutorialProps {
  onComplete?: () => void
  onTabChange?: (tab: string) => void
}

export default function OnboardingTutorial({ onComplete, onTabChange }: OnboardingTutorialProps) {
  const [step, setStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)
  const [animating, setAnimating] = useState(false)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  const goNext = () => {
    if (animating) return
    if (isLast) {
      handleComplete()
      return
    }
    setAnimating(true)
    setTimeout(() => {
      const nextStep = STEPS[step + 1]
      setStep(step + 1)
      // Navigate to the relevant tab
      if (nextStep?.tab && onTabChange) {
        onTabChange(nextStep.tab)
      }
      setAnimating(false)
    }, 180)
  }

  const handleComplete = () => {
    try { localStorage.setItem("mtm_onboarding_done", "1") } catch {}
    setIsVisible(false)
    onComplete?.()
  }

  const handleSkip = () => {
    handleComplete()
  }

  if (!isVisible) return null

  const Icon = current.icon

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      {/* Card — centrado no ecrã */}
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{
          transform: animating ? "scale(0.97)" : "scale(1)",
          transition: "transform 0.18s ease",
        }}
      >
        {/* Top colour band */}
        <div
          className="h-2"
          style={{ background: `linear-gradient(to right, ${current.color}, ${current.color}88)` }}
        />

        <div className="bg-gray-900 px-6 pt-4 pb-6">
          {/* Header: step indicators + skip */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1.5 flex-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full flex-1 transition-all duration-300"
                  style={{
                    backgroundColor: i <= step ? current.color : "#374151",
                    maxWidth: 40,
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="ml-3 flex items-center gap-1 text-gray-400 text-sm hover:text-white transition-colors shrink-0"
              aria-label="Saltar tutorial"
            >
              Saltar <X className="w-4 h-4" />
            </button>
          </div>

          {/* Icon + Emoji */}
          <div className="flex flex-col items-center mb-6">
            {Icon ? (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
                style={{ backgroundColor: `${current.color}18`, border: `1.5px solid ${current.color}40` }}
              >
                <Icon style={{ width: 32, height: 32, color: current.color }} />
              </div>
            ) : (
              <div className="text-5xl mb-3">{current.emoji}</div>
            )}

            {/* Step badge */}
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ backgroundColor: `${current.color}20`, color: current.color }}
              >
                {step + 1}
              </span>
              <span>de {STEPS.length}</span>
            </div>
          </div>

          {/* Text */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white mb-2">{current.title}</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{current.body}</p>
          </div>

          {/* CTA */}
          <button
            onClick={goNext}
            disabled={animating}
            className="w-full py-4 rounded-2xl font-bold text-base text-black flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
            style={{ background: `linear-gradient(135deg, ${current.color}, ${current.color}CC)` }}
          >
            {isLast ? (
              <>
                <Check className="w-5 h-5" />
                Começar a explorar
              </>
            ) : (
              <>
                {step === 0 ? "Vamos lá!" : "Próximo"}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {!isLast && (
            <button
              onClick={handleSkip}
              className="w-full mt-3 py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
            >
              Saltar tutorial
            </button>
          )}
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

    // Listen for replay event from settings
    const handleReplay = () => setShouldShow(true)
    window.addEventListener("mtm-replay-tutorial", handleReplay)
    return () => window.removeEventListener("mtm-replay-tutorial", handleReplay)
  }, [])

  const markDone = () => {
    try { localStorage.setItem("mtm_onboarding_done", "1") } catch {}
    setShouldShow(false)
  }

  return { shouldShow, markDone }
}
