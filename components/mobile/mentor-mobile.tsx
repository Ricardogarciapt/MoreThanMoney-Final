"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Send, Bot, User, Loader2, ChevronDown, Target, TrendingUp, CheckCircle2, RotateCcw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type Message = {
  role: "user" | "assistant"
  content: string
  id: string
}

type MentorProfile = {
  current_rank: string
  target_rank: string
  pe_left: number
  pe_right: number
  cv_left: number
  cv_right: number
  phase: string
}

type MentorTask = {
  id: string
  title: string
  status: "pending" | "completed" | "skipped"
  phase: string
}

const STARTER_QUESTIONS = [
  {
    id: "q_goals",
    text: "Qual é o teu principal objetivo agora? 🎯",
    suggestions: [
      "Atingir Rising Star",
      "Fazer os primeiros recrutamentos",
      "Perceber como funciona o plano",
      "Criar uma rotina diária",
    ],
  },
  {
    id: "q_time",
    text: "Quanto tempo tens disponível por dia para o MTM? ⏰",
    suggestions: ["1-2 horas", "2-4 horas", "Mais de 4 horas", "Depende do dia"],
  },
  {
    id: "q_stage",
    text: "Em que fase estás agora? 📍",
    suggestions: [
      "Acabei de entrar",
      "Já tenho leads, mas sem PE ainda",
      "Tenho PE Left, preciso de PE Right",
      "Já sou Rising Star",
    ],
  },
]

const QUICK_ACTIONS = [
  { label: "📋 Plano semanal", prompt: "Cria-me um plano de acção para esta semana com base no meu progresso actual." },
  { label: "💬 Script de abordagem", prompt: "Dá-me um script para abordar novos contactos sobre o MTM, sem ser forçado." },
  { label: "🔄 Como fazer follow-up", prompt: "Como devo fazer follow-up com alguém que ficou interessado mas não respondeu?" },
  { label: "🚀 Próximos passos", prompt: "Com base no meu progresso, quais são os 3 próximos passos mais importantes?" },
  { label: "❓ Gerir objecções", prompt: "Como respondo quando alguém diz que não tem dinheiro ou que não tem tempo?" },
  { label: "🏆 Rising Star em 30 dias", prompt: "Cria um plano concreto para eu atingir Rising Star em 30 dias a partir de hoje." },
]

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function RankBadge({ rank }: { rank: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    starter: { label: "Starter", color: "text-gray-400 border-gray-600" },
    rising_star: { label: "Rising Star ⭐", color: "text-yellow-400 border-yellow-600" },
    bronze_star: { label: "Bronze Star 🌟", color: "text-amber-400 border-amber-600" },
    silver_star: { label: "Silver Star 💎", color: "text-blue-400 border-blue-600" },
  }
  const info = labels[rank] || { label: rank, color: "text-gray-400 border-gray-600" }
  return (
    <span className={`inline-flex items-center border rounded-full px-2 py-0.5 text-[11px] font-medium ${info.color}`}>
      {info.label}
    </span>
  )
}

// Simple markdown bold renderer
function FormattedText({ text, isUser }: { text: string; isUser: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className={isUser ? "font-bold" : "text-white font-semibold"}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

export default function MentorMobile() {
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [profile, setProfile] = useState<MentorProfile | null>(null)
  const [tasks, setTasks] = useState<MentorTask[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [onboarded, setOnboarded] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingAnswers, setOnboardingAnswers] = useState<Record<string, string>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Load mentor profile & tasks
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/mentor/overview", { cache: "no-store" })
        const json = await res.json()
        if (json?.success && json.data) {
          const { profile: p, tasks: t } = json.data
          setProfile({
            current_rank: p.current_rank || "starter",
            target_rank: p.target_rank || "rising_star",
            pe_left: p.pe_left || 0,
            pe_right: p.pe_right || 0,
            cv_left: p.cv_left || 0,
            cv_right: p.cv_right || 0,
            phase: p.phase || "onboarding",
          })
          setTasks(t || [])

          const hasProgress = (t || []).some((task: MentorTask) => task.status === "completed")
          const storedOnboarded = sessionStorage.getItem("mtm_mentor_onboarded")
          if (storedOnboarded || hasProgress) {
            setOnboarded(true)
            setMessages([
              {
                role: "assistant",
                content: `Olá! Estou aqui para te ajudar a crescer no MTM. 💪\n\nO teu progresso actual: **${p.pe_left || 0} PE Left · ${p.pe_right || 0} PE Right**\n\nO que queres trabalhar hoje?`,
                id: generateId(),
              },
            ])
          }
        }
      } catch {
        // silent
      } finally {
        setLoadingProfile(false)
      }
    }
    load()
  }, [])

  const sendMessage = useCallback(
    async (userContent: string, skipInput = false) => {
      if (!userContent.trim() || streaming) return

      const userMsg: Message = { role: "user", content: userContent.trim(), id: generateId() }
      const newMessages = [...messages, userMsg]
      setMessages(newMessages)
      if (!skipInput) setInput("")
      setStreaming(true)

      const assistantId = generateId()
      setMessages((prev) => [...prev, { role: "assistant", content: "", id: assistantId }])

      try {
        abortRef.current = new AbortController()

        const mentorContext = profile
          ? {
              current_rank: profile.current_rank,
              target_rank: profile.target_rank,
              pe_left: profile.pe_left,
              pe_right: profile.pe_right,
              cv_left: profile.cv_left,
              cv_right: profile.cv_right,
              phase: profile.phase,
              pendingTasks: tasks
                .filter((t) => t.status === "pending")
                .map((t) => t.title)
                .slice(0, 3),
            }
          : undefined

        const res = await fetch("/api/mentor/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            mentorContext,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          // A rota responde JSON com `error` quando não chega a abrir o stream (401/400/500).
          const j = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error || "Não foi possível contactar o Mentor AI.")
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ""
        // A rota manda `{type:"error", message}` quando TODA a cadeia de IA falhou — a frase é
        // honesta («A IA está indisponível… groq (…); gemini (…)») e é essa que o membro vê,
        // em vez de uma bolha vazia a fingir que ainda vem resposta.
        let erroDaRota: string | null = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === "text") {
                accumulated += parsed.text
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
                )
              } else if (parsed.type === "error" && typeof parsed.message === "string") {
                erroDaRota = parsed.message
              }
            } catch {
              // ignore json parse errors on empty lines
            }
          }
        }
        if (!accumulated.trim()) {
          throw new Error(erroDaRota || "O Mentor não devolveu resposta. Tenta outra vez daqui a pouco.")
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        const motivo = (err as Error).message || "Não foi possível contactar o Mentor AI."
        toast({ title: "Mentor indisponível", description: motivo, variant: "destructive" })
        // A frase fica na conversa, no lugar da resposta — não desaparece com o toast.
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: motivo } : m)))
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming, profile, tasks, toast]
  )

  const handleOnboardingAnswer = async (questionId: string, answer: string) => {
    const newAnswers = { ...onboardingAnswers, [questionId]: answer }
    setOnboardingAnswers(newAnswers)

    if (onboardingStep < STARTER_QUESTIONS.length - 1) {
      setOnboardingStep((s) => s + 1)
    } else {
      setOnboarded(true)
      sessionStorage.setItem("mtm_mentor_onboarded", "1")

      const q1 = newAnswers[STARTER_QUESTIONS[0].id] || "Atingir Rising Star"
      const q2 = newAnswers[STARTER_QUESTIONS[1].id] || "2-4 horas"
      const q3 = newAnswers[STARTER_QUESTIONS[2].id] || "Acabei de entrar"

      const prompt = `Olá! Aqui estão os meus dados iniciais:\n- Objetivo principal: ${q1}\n- Tempo disponível por dia: ${q2}\n- Fase actual: ${q3}\n\nCom base nisto, cria-me um plano personalizado para começar com o pé direito no MTM. Quero saber exactamente o que fazer nas próximas 72 horas.`
      await sendMessage(prompt, true)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const resetChat = () => {
    if (streaming) abortRef.current?.abort()
    setMessages([
      {
        role: "assistant",
        content: `Olá! Vamos recomeçar. 🚀\n\nO que queres trabalhar hoje?`,
        id: generateId(),
      },
    ])
  }

  const pendingTasks = tasks.filter((t) => t.status === "pending")
  const completedTasks = tasks.filter((t) => t.status === "completed")
  const progressPercent =
    tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0

  if (loadingProfile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#D2A63C] animate-spin" />
      </div>
    )
  }

  // Onboarding flow
  if (!onboarded) {
    const currentQ = STARTER_QUESTIONS[onboardingStep]
    return (
      <div className="flex flex-col h-full bg-black">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D2A63C] to-amber-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-black" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Mentor MTM</p>
            <p className="text-[11px] text-gray-400">Agente de crescimento pessoal</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          <div className="w-full max-w-sm">
            <div className="flex justify-center gap-2 mb-8">
              {STARTER_QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i < onboardingStep
                      ? "bg-[#D2A63C]"
                      : i === onboardingStep
                      ? "bg-[#D2A63C] scale-125"
                      : "bg-gray-700"
                  }`}
                />
              ))}
            </div>

            <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-5 mb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D2A63C] to-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-black" />
                </div>
                <p className="text-white text-[15px] leading-relaxed">{currentQ.text}</p>
              </div>

              <div className="space-y-2 mt-4">
                {currentQ.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleOnboardingAnswer(currentQ.id, s)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-700 bg-gray-800/50 text-[13px] text-gray-200 hover:border-[#D2A63C]/50 hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-gray-500">
              Passo {onboardingStep + 1} de {STARTER_QUESTIONS.length}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D2A63C] to-amber-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-black" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Mentor MTM</p>
            {profile && <RankBadge rank={profile.current_rank} />}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowStats((s) => !s)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showStats ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={resetChat}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
            title="Reiniciar conversa"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats panel (collapsible) */}
      {showStats && profile && (
        <div className="border-b border-gray-800 px-4 py-3 bg-gray-950/50 flex-shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="w-3.5 h-3.5 text-[#D2A63C]" />
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Parceiros</p>
              </div>
              <div className="flex justify-between text-xs text-gray-300">
                <span>
                  PE Left: <span className="text-white font-semibold">{profile.pe_left}</span>
                </span>
                <span>
                  PE Right: <span className="text-white font-semibold">{profile.pe_right}</span>
                </span>
              </div>
            </div>

            <div className="bg-gray-900 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-[#D2A63C]" />
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Progresso</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#D2A63C] to-amber-500 rounded-full transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs text-white font-semibold">{progressPercent}%</span>
              </div>
            </div>
          </div>

          {pendingTasks.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Próximas tarefas</p>
              <div className="space-y-1.5">
                {pendingTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                    <p className="text-[12px] text-gray-300 truncate">{t.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {completedTasks.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <p className="text-[11px] text-gray-400">
                {completedTasks.length} tarefa{completedTasks.length > 1 ? "s" : ""} concluída
                {completedTasks.length > 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#D2A63C] to-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-black" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-[#D2A63C] text-black rounded-tr-sm"
                  : "bg-gray-900 border border-gray-800 text-gray-100 rounded-tl-sm"
              }`}
            >
              {msg.content ? (
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">
                  <FormattedText text={msg.content} isUser={msg.role === "user"} />
                </p>
              ) : (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#D2A63C] animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#D2A63C] animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#D2A63C] animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              )}
            </div>

            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-gray-300" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions — shown when conversation is fresh */}
      {messages.length <= 1 && !streaming && (
        <div className="px-4 pb-3 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Acções rápidas</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.slice(0, 4).map((a) => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.prompt, true)}
                className="text-left px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-[12px] text-gray-300 hover:border-[#D2A63C]/40 hover:text-white transition-all active:scale-[0.97]"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scrollable quick actions pill bar — shown mid-conversation */}
      {messages.length > 1 && !streaming && (
        <div className="px-4 pb-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 pb-1">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => sendMessage(a.prompt, true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 text-[11px] text-gray-400 hover:border-[#D2A63C]/40 hover:text-white transition-all"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-800 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl px-3.5 py-2.5 focus-within:border-[#D2A63C]/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreve a tua pergunta ao Mentor..."
              className="w-full bg-transparent text-white text-[13.5px] placeholder-gray-500 resize-none outline-none leading-relaxed max-h-24"
              rows={1}
              disabled={streaming}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-full bg-[#D2A63C] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 text-black animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-black" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
