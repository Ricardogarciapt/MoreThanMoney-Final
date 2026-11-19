"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Send, Bot, User, Loader2, ChevronDown, TrendingUp, CheckCircle2, RotateCcw, ShieldCheck, Trash2, Mic, Square, Volume2, VolumeX } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useI18n, useT } from "@/components/i18n-provider"
import { TextoAuto } from "@/components/mobile/texto-auto"
import { useVozMentor } from "@/components/mobile/mentor-voz"

type Message = {
  role: "user" | "assistant"
  content: string
  id: string
}

type MentorProfile = {
  phase: string
  objetivo?: string | null
  tempo_diario?: string | null
  fase_trading?: string | null
}

type MentorTask = {
  id: string
  title: string
  status: "pending" | "completed" | "skipped"
  phase: string
}

// Revisão de 17/11: o Mentor deixou de ser um «agente de crescimento» de network marketing (Rising
// Star, PE Left/Right, recrutamentos). Agora é o mentor pessoal de cada aluno, na língua dele.
// Os textos que seguem para a IA são TRADUZIDOS (t(...)) e vão marcados `porBotao`: o Mentor
// responde na língua da app; quando o aluno escreve, responde na língua em que ele escreveu.
const STARTER_QUESTIONS = [
  {
    id: "objetivo",
    textKey: "amB.mentor.q.goals",
    suggestions: ["amB.mentor.sug.goalLearn", "amB.mentor.sug.goalAuto", "amB.mentor.sug.goalReal", "amB.mentor.sug.goalRoutine"],
  },
  {
    id: "tempo_diario",
    textKey: "amB.mentor.q.time",
    suggestions: ["amB.mentor.sug.time1", "amB.mentor.sug.time2", "amB.mentor.sug.time3", "amB.mentor.sug.timeVaries"],
  },
  {
    id: "fase_trading",
    textKey: "amB.mentor.q.stage",
    suggestions: ["amB.mentor.sug.stageNew", "amB.mentor.sug.stageDemo", "amB.mentor.sug.stageReal", "amB.mentor.sug.stageLost"],
  },
] as const

const QUICK_ACTIONS = ["plan", "concept", "risk", "next", "fear", "loss"] as const

function generateId() {
  return Math.random().toString(36).substring(2, 9)
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
  const t = useT()
  // O Mentor responde no idioma da app (17/11): um aluno alemão recebia-o em português.
  const { lang } = useI18n()
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
  // Voz (19/11): ler respostas em voz alta fica guardado por aparelho; e quem fala com o Mentor
  // ouve a resposta mesmo com a leitura desligada — é uma conversa falada.
  const [lerAuto, setLerAuto] = useState(false)
  const falarRef = useRef<(id: string, texto: string) => void>(() => {})
  const proximaPorVoz = useRef(false)
  useEffect(() => {
    try {
      setLerAuto(localStorage.getItem("mtm_mentor_ler_auto") === "1")
    } catch {
      /* sem armazenamento: fica desligado */
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Perfil, plano e a conversa guardada (o Mentor lembra-se de ti noutro aparelho ou dia).
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/mentor/overview", { cache: "no-store" })
        const json = await res.json()
        if (json?.success && json.data) {
          const { profile: p, tasks: tarefas, historico } = json.data
          setProfile({
            phase: p.phase || "onboarding",
            objetivo: p.objetivo,
            tempo_diario: p.tempo_diario,
            fase_trading: p.fase_trading,
          })
          setTasks(tarefas || [])

          const anteriores: Message[] = (historico || []).map((m: { id: string; role: Message["role"]; content: string }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          }))
          const hasProgress = (tarefas || []).some((task: MentorTask) => task.status === "completed")
          const storedOnboarded = sessionStorage.getItem("mtm_mentor_onboarded")
          if (anteriores.length || p.objetivo || storedOnboarded || hasProgress) {
            setOnboarded(true)
            setMessages(
              anteriores.length
                ? anteriores
                : [{ role: "assistant", content: `${t("amB.mentor.greeting").replace("{nome}", "")}\n\n${t("amB.mentor.askToday")}`, id: generateId() }]
            )
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
    async (userContent: string, skipInput = false, porBotao = false) => {
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

        const res = await fetch("/api/mentor/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
            idioma: lang,
            porBotao,
          }),
          signal: abortRef.current.signal,
        })

        if (!res.ok || !res.body) {
          // A rota responde JSON com `error` quando não chega a abrir o stream (401/400/500).
          const j = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error || t("amB.mentor.errContact"))
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
          throw new Error(erroDaRota || t("amB.mentor.errEmpty"))
        }
        if (lerAuto || proximaPorVoz.current) falarRef.current(assistantId, accumulated)
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        const motivo = (err as Error).message || t("amB.mentor.errContact")
        toast({ title: t("amB.mentor.unavailable"), description: motivo, variant: "destructive" })
        // A frase fica na conversa, no lugar da resposta — não desaparece com o toast.
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: motivo } : m)))
      } finally {
        setStreaming(false)
        abortRef.current = null
        proximaPorVoz.current = false
      }
    },
    [messages, streaming, toast, t, lang, lerAuto]
  )

  const handleOnboardingAnswer = async (questionId: string, labelKey: string) => {
    const newAnswers = { ...onboardingAnswers, [questionId]: t(labelKey) }
    setOnboardingAnswers(newAnswers)

    if (onboardingStep < STARTER_QUESTIONS.length - 1) {
      setOnboardingStep((s) => s + 1)
    } else {
      setOnboarded(true)
      sessionStorage.setItem("mtm_mentor_onboarded", "1")
      // Guarda as respostas: o Mentor passa a saber o objetivo, o tempo e a fase em todas as conversas.
      fetch("/api/mentor/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAnswers),
      }).catch(() => {})
      const prompt = t("amB.mentor.onbPrompt")
        .replace("{goal}", newAnswers.objetivo || "")
        .replace("{time}", newAnswers.tempo_diario || "")
        .replace("{stage}", newAnswers.fase_trading || "")
      await sendMessage(prompt, true, true)
    }
  }

  const apagarConversa = async () => {
    if (streaming) abortRef.current?.abort()
    try {
      const res = await fetch("/api/mentor/overview", { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast({ title: t("amB.mentor.erased") })
      resetChat()
    } catch {
      toast({ title: t("amB.mentor.unavailable"), variant: "destructive" })
    }
  }

  const voz = useVozMentor({
    lang,
    aoTranscrever: (texto) => {
      proximaPorVoz.current = true
      void sendMessage(texto, true)
    },
    aoErro: (chave) => toast({ title: t(chave), variant: "destructive" }),
  })
  falarRef.current = voz.falar
  const alternarLerAuto = () => {
    const novo = !lerAuto
    setLerAuto(novo)
    if (!novo) voz.calar()
    try {
      localStorage.setItem("mtm_mentor_ler_auto", novo ? "1" : "0")
    } catch {
      /* sem armazenamento */
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
        content: `${t("amB.mentor.restartGreeting")}\n\n${t("amB.mentor.askToday")}`,
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
            <p className="text-[11px] text-gray-400">{t("amB.mentor.agentSubtitle")}</p>
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
                <p className="text-white text-[15px] leading-relaxed">{t(currentQ.textKey)}</p>
              </div>

              <div className="space-y-2 mt-4">
                {currentQ.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleOnboardingAnswer(currentQ.id, s)}
                    className="w-full text-left px-4 py-3 rounded-xl border border-gray-700 bg-gray-800/50 text-[13px] text-gray-200 hover:border-[#D2A63C]/50 hover:bg-gray-800 transition-all active:scale-[0.98]"
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-gray-500">
              {t("amB.mentor.step").replace("{n}", String(onboardingStep + 1)).replace("{total}", String(STARTER_QUESTIONS.length))}
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
            <p className="text-[11px] text-gray-400">{t("amB.mentor.agentSubtitle")}</p>
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
            title={t("amB.mentor.restart")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats panel (collapsible) */}
      {showStats && (
        <div className="border-b border-gray-800 px-4 py-3 bg-gray-950/50 flex-shrink-0">
          <div className="grid grid-cols-1 gap-3">
            <div className="bg-gray-900 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-[#D2A63C]" />
                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{t("amB.mentor.progressLabel")}</p>
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
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">{t("amB.mentor.upcoming")}</p>
              <div className="space-y-1.5">
                {pendingTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                    <p className="text-[12px] text-gray-300 truncate"><TextoAuto texto={t.title} /></p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {completedTasks.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <p className="text-[11px] text-gray-400">
                {t(completedTasks.length > 1 ? "amB.mentor.tasksDoneMany" : "amB.mentor.tasksDoneOne").replace("{n}", String(completedTasks.length))}
              </p>
            </div>
          )}
          <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3 flex gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D2A63C] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] leading-relaxed text-gray-400">{t("amB.mentor.privacy")}</p>
              <button onClick={apagarConversa} className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300">
                <Trash2 className="w-3 h-3" /> {t("amB.mentor.erase")}
              </button>
            </div>
          </div>
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
                <>
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">
                    <FormattedText text={msg.content} isUser={msg.role === "user"} />
                  </p>
                  {msg.role === "assistant" && voz.podeOuvir && !(streaming && msg.id === messages[messages.length - 1]?.id) && (
                    <button
                      type="button"
                      onClick={() => voz.falar(msg.id, msg.content)}
                      aria-label={t(voz.aFalar === msg.id ? "amB.mentor.voz.calar" : "amB.mentor.voz.ouvir")}
                      className={`mt-1.5 -mb-0.5 inline-flex items-center gap-1 text-[11px] transition-colors ${
                        voz.aFalar === msg.id ? "text-[#E9C46A]" : "text-gray-500 hover:text-[#E9C46A]"
                      }`}
                    >
                      {voz.aFalar === msg.id ? <Square className="w-3 h-3" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {t(voz.aFalar === msg.id ? "amB.mentor.voz.calar" : "amB.mentor.voz.ouvir")}
                    </button>
                  )}
                </>
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
          <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">{t("amB.mentor.quickActions")}</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.slice(0, 4).map((a) => (
              <button
                key={a}
                onClick={() => sendMessage(t(`amB.mentor.qp.${a}`), true, true)}
                className="text-left px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-[12px] text-gray-300 hover:border-[#D2A63C]/40 hover:text-white transition-all active:scale-[0.97]"
              >
                {t(`amB.mentor.qa.${a}`)}
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
                key={a}
                onClick={() => sendMessage(t(`amB.mentor.qp.${a}`), true, true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 text-[11px] text-gray-400 hover:border-[#D2A63C]/40 hover:text-white transition-all"
              >
                {t(`amB.mentor.qa.${a}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-gray-800 flex-shrink-0">
        {voz.estado !== "parado" && (
          <p className="text-[11px] text-[#E9C46A] mb-1.5 flex items-center gap-1.5" aria-live="polite">
            {voz.estado === "a-ouvir" ? (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            {t(voz.estado === "a-ouvir" ? "amB.mentor.voz.aOuvir" : "amB.mentor.voz.aTranscrever")}
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {voz.podeOuvir && (
            <button
              type="button"
              onClick={alternarLerAuto}
              aria-pressed={lerAuto}
              aria-label={t("amB.mentor.voz.lerAuto")}
              title={t("amB.mentor.voz.lerAuto")}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border transition-all active:scale-95 ${
                lerAuto ? "border-[#D2A63C] text-[#E9C46A] bg-[#D2A63C]/10" : "border-gray-700 text-gray-500"
              }`}
            >
              {lerAuto ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}
          <div className="flex-1 bg-gray-900 border border-gray-700 rounded-2xl px-3.5 py-2.5 focus-within:border-[#D2A63C]/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("amB.mentor.placeholder")}
              className="w-full bg-transparent text-white text-[13.5px] placeholder-gray-500 resize-none outline-none leading-relaxed max-h-24"
              rows={1}
              disabled={streaming}
            />
          </div>
          {voz.podeFalar && !input.trim() ? (
            <button
              type="button"
              onClick={voz.alternarMicro}
              disabled={streaming || voz.estado === "a-transcrever"}
              aria-label={t(voz.estado === "a-ouvir" ? "amB.mentor.voz.parar" : "amB.mentor.voz.falar")}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-40 ${
                voz.estado === "a-ouvir" ? "bg-red-500 animate-pulse" : "bg-[#D2A63C]"
              }`}
            >
              {voz.estado === "a-transcrever" || streaming ? (
                <Loader2 className="w-4 h-4 text-black animate-spin" />
              ) : voz.estado === "a-ouvir" ? (
                <Square className="w-4 h-4 text-white" />
              ) : (
                <Mic className="w-4 h-4 text-black" />
              )}
            </button>
          ) : (
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
          )}
        </form>
      </div>
    </div>
  )
}
