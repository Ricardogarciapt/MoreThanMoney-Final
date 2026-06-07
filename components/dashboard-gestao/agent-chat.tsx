"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2, RotateCcw, Copy, Check, Wrench, ChevronDown, ChevronUp, Mic, MicOff, Radio } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavItem } from "./dg-sidebar"
import MarkdownRenderer from "./markdown-renderer"
import AgentContextPanel from "./agent-context-panel"

// ── Voice types ───────────────────────────────────────────────────────────────
type VoiceMode = "off" | "wake" | "command"

// ── Types ─────────────────────────────────────────────────────────────────────
interface ToolEvent {
  name: string
  id: string
  preview?: string
  done?: boolean
}

interface Message {
  role: "user" | "assistant"
  content: string
  tools?: ToolEvent[]
  error?: boolean
}

// ── Tool indicator component ──────────────────────────────────────────────────
function ToolIndicator({ tool }: { tool: ToolEvent }) {
  const [expanded, setExpanded] = useState(false)

  const TOOL_LABELS: Record<string, string> = {
    get_platform_stats: "A consultar estatísticas da plataforma…",
    get_calendly_bookings: "A carregar marcações Calendly…",
    get_recent_users: "A carregar utilizadores recentes…",
    search_manychat_subscriber: "A pesquisar subscriber no ManyChat…",
    get_manychat_tags: "A carregar tags ManyChat…",
    get_manychat_flows: "A carregar flows ManyChat…",
  }

  const TOOL_LABELS_DONE: Record<string, string> = {
    get_platform_stats: "Estatísticas carregadas",
    get_calendly_bookings: "Marcações Calendly carregadas",
    get_recent_users: "Utilizadores carregados",
    search_manychat_subscriber: "Subscriber encontrado",
    get_manychat_tags: "Tags ManyChat carregadas",
    get_manychat_flows: "Flows ManyChat carregados",
  }

  return (
    <div className="my-2 rounded-lg border border-[#D2A63C]/20 bg-[#D2A63C]/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        {tool.done ? (
          <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 text-[#D2A63C] animate-spin flex-shrink-0" />
        )}
        <span className="text-[11px] text-[#D2A63C] flex-1">
          {tool.done ? (TOOL_LABELS_DONE[tool.name] || tool.name) : (TOOL_LABELS[tool.name] || tool.name)}
        </span>
        {tool.done && tool.preview && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {expanded && tool.preview && (
        <div className="border-t border-[#D2A63C]/10 px-3 py-2">
          <pre className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap overflow-auto max-h-40 leading-relaxed">
            {tool.preview}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  idx,
  isStreaming,
  isLast,
  onCopy,
  copiedIdx,
}: {
  msg: Message
  idx: number
  isStreaming: boolean
  isLast: boolean
  onCopy: (text: string, idx: number) => void
  copiedIdx: number | null
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-[#D2A63C] px-4 py-2.5 text-sm text-black font-medium">
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
      </div>
    )
  }

  // Assistant message
  const showTyping = isStreaming && isLast && !msg.content && (!msg.tools || msg.tools.every(t => t.done))

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full">
        {/* Tool events */}
        {msg.tools?.map((tool, ti) => (
          <ToolIndicator key={ti} tool={tool} />
        ))}

        {/* Text content */}
        {(msg.content || showTyping) && (
          <div
            className={cn(
              "relative group rounded-2xl rounded-bl-sm px-4 py-3",
              msg.error
                ? "bg-red-950/40 border border-red-500/20"
                : "bg-zinc-900 border border-white/5"
            )}
          >
            {showTyping ? (
              <div className="flex gap-1 py-1">
                <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            ) : msg.error ? (
              <p className="text-red-400 text-sm">{msg.content}</p>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}

            {/* Copy button */}
            {msg.content && !msg.error && (
              <button
                onClick={() => onCopy(msg.content, idx)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/10 hover:bg-white/20"
              >
                {copiedIdx === idx ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-400" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Voice helpers ─────────────────────────────────────────────────────────────
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  return SR ? new SR() : null
}

const WAKE_WORDS = ["ei aios", "hey aios", "aios", "ei ios", "ei a i o s"]

function matchesWakeWord(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  return WAKE_WORDS.some(w => t.includes(w))
}

// ── Main AgentChat ─────────────────────────────────────────────────────────────
export default function AgentChat({ agent }: { agent: NavItem }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Voice state ──────────────────────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("off")
  const [liveTranscript, setLiveTranscript] = useState("")
  const [hasVoiceSupport, setHasVoiceSupport] = useState(false)
  const voiceModeRef = useRef<VoiceMode>("off")
  const recognitionRef = useRef<any>(null)
  const pendingVoiceSendRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => { voiceModeRef.current = voiceMode }, [voiceMode])

  // Detect voice API support
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setHasVoiceSupport(!!SR)
  }, [])

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
  }, [])

  const startCommandMode = useCallback(() => {
    stopRecognition()
    setVoiceMode("command")
    setLiveTranscript("")

    const recognition = getSpeechRecognition()
    if (!recognition) return
    recognition.lang = "pt-PT"
    recognition.continuous = false
    recognition.interimResults = true

    let finalText = ""

    recognition.onresult = (e: any) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(finalText + interim)
      setInput(finalText + interim)
    }

    recognition.onend = () => {
      recognitionRef.current = null
      const trimmed = finalText.trim()
      if (trimmed) {
        // Store for auto-send — picked up by useEffect
        pendingVoiceSendRef.current = trimmed
        setInput(trimmed)
      }
      setVoiceMode("off")
      setLiveTranscript("")
    }

    recognition.onerror = () => {
      recognitionRef.current = null
      setVoiceMode("off")
      setLiveTranscript("")
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [stopRecognition])

  const startWakeMode = useCallback(() => {
    stopRecognition()
    setVoiceMode("wake")

    const launchWake = () => {
      if (voiceModeRef.current !== "wake") return
      const recognition = getSpeechRecognition()
      if (!recognition) return
      recognition.lang = "pt-PT"
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (e: any) => {
        let interim = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          interim += e.results[i][0].transcript
        }
        if (matchesWakeWord(interim)) {
          recognition.abort()
          recognitionRef.current = null
          startCommandMode()
        }
      }

      recognition.onend = () => {
        recognitionRef.current = null
        // Restart if still in wake mode
        if (voiceModeRef.current === "wake") {
          setTimeout(launchWake, 300)
        }
      }

      recognition.onerror = (e: any) => {
        recognitionRef.current = null
        if (e.error !== "aborted" && voiceModeRef.current === "wake") {
          setTimeout(launchWake, 1000)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    }

    launchWake()
  }, [stopRecognition, startCommandMode])

  const stopVoice = useCallback(() => {
    stopRecognition()
    setVoiceMode("off")
    setLiveTranscript("")
  }, [stopRecognition])

  // Cleanup on unmount / agent change
  useEffect(() => {
    return () => { stopRecognition() }
  }, [stopRecognition])

  const Icon = agent.icon

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
  }, [input])

  // Reset on agent change
  useEffect(() => {
    stopVoice()
    setMessages([])
    setInput("")
    setIsStreaming(false)
  }, [agent.id])

  // Auto-send voice command when recognition ends with a transcript
  useEffect(() => {
    const pending = pendingVoiceSendRef.current
    if (pending && voiceMode === "off" && !isStreaming) {
      pendingVoiceSendRef.current = null
      sendMessage(pending)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode])

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return
    // Stop any active voice session when sending
    stopVoice()

    const userMsg: Message = { role: "user", content }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput("")
    setIsStreaming(true)

    const assistantMsg: Message = { role: "assistant", content: "", tools: [] }
    setMessages([...history, assistantMsg])

    try {
      const res = await fetch("/api/dashboard-gestao/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: agent.id,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) {
        const err = await res.text()
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "assistant", content: `Erro ao contactar o agente: ${err}`, error: true },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let text = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()

          if (raw === "[DONE]") continue

          try {
            const evt = JSON.parse(raw)

            if (evt.type === "text") {
              text += evt.text
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: text }
                }
                return updated
              })
            } else if (evt.type === "tool_start") {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    tools: [...(last.tools || []), { name: evt.name, id: evt.id, done: false }],
                  }
                }
                return updated
              })
            } else if (evt.type === "tool_result") {
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === "assistant") {
                  const tools = (last.tools || []).map(t =>
                    t.id === evt.id ? { ...t, done: true, preview: evt.preview } : t
                  )
                  updated[updated.length - 1] = { ...last, tools }
                }
                return updated
              })
            } else if (evt.type === "error") {
              setMessages(prev => [
                ...prev.slice(0, -1),
                { role: "assistant", content: evt.message || "Erro desconhecido", error: true },
              ])
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `Erro de rede: ${String(err)}`, error: true },
      ])
    } finally {
      setIsStreaming(false)
    }
  }, [input, messages, isStreaming, agent.id, stopVoice])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const copyMessage = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const clearChat = () => {
    setMessages([])
    setInput("")
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Context panel */}
      <AgentContextPanel agent={agent} onPrompt={(p) => sendMessage(p)} />

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-[#D2A63C]/10 bg-zinc-950/40 px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}
            >
              <Icon className="h-4 w-4" style={{ color: agent.color }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">{agent.label}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  isStreaming ? "bg-[#D2A63C] animate-pulse" : "bg-green-400"
                )} />
                <span className="text-[10px] text-gray-500">
                  {isStreaming ? "A processar…" : "Pronto"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-600 bg-white/5 px-2 py-1 rounded-full">
              <Wrench className="h-3 w-3" />
              6 ferramentas
            </div>

            {/* Wake word toggle */}
            {hasVoiceSupport && (
              <button
                onClick={() => voiceMode === "wake" ? stopVoice() : startWakeMode()}
                title={voiceMode === "wake" ? "Desativar wake word" : "Ativar wake word 'Ei, AIOS'"}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all",
                  voiceMode === "wake"
                    ? "bg-[#D2A63C]/20 text-[#D2A63C] border border-[#D2A63C]/30"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                )}
              >
                <Radio className={cn("h-3 w-3", voiceMode === "wake" && "animate-pulse")} />
                <span className="hidden sm:inline">
                  {voiceMode === "wake" ? "A ouvir…" : "Ei, AIOS"}
                </span>
              </button>
            )}

            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/5"
              >
                <RotateCcw className="h-3 w-3" />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4 ring-1"
                style={{
                  background: `${agent.color}12`,
                  ringColor: `${agent.color}25`,
                  border: `1px solid ${agent.color}20`,
                }}
              >
                <Icon className="h-8 w-8" style={{ color: agent.color }} />
              </div>
              <p className="text-white font-semibold text-base">{agent.label}</p>
              <p className="text-gray-500 text-sm mt-1 max-w-xs leading-relaxed">{agent.description}</p>
              <p className="text-gray-700 text-xs mt-4">
                Usa as ações rápidas à esquerda ou escreve uma mensagem
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              msg={msg}
              idx={idx}
              isStreaming={isStreaming}
              isLast={idx === messages.length - 1}
              onCopy={copyMessage}
              copiedIdx={copiedIdx}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#D2A63C]/10 bg-zinc-950/40 p-4 flex-shrink-0">

          {/* Voice status bar */}
          {voiceMode !== "off" && (
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl mb-3 text-sm font-medium transition-all",
              voiceMode === "wake"
                ? "bg-[#D2A63C]/10 border border-[#D2A63C]/20 text-[#D2A63C]"
                : "bg-red-950/40 border border-red-500/30 text-red-300"
            )}>
              {voiceMode === "wake" ? (
                <>
                  <Radio className="h-4 w-4 animate-pulse flex-shrink-0" />
                  <span>A ouvir wake word — diz <strong>&quot;Ei, AIOS&quot;</strong> para ativar</span>
                  <button onClick={stopVoice} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
                </>
              ) : (
                <>
                  <span className="relative flex h-3 w-3 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="flex-1">
                    {liveTranscript
                      ? <span className="italic">&quot;{liveTranscript}&quot;</span>
                      : "Fala agora…"}
                  </span>
                  <button onClick={stopVoice} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
                </>
              )}
            </div>
          )}

          <div className="flex items-end gap-3 bg-zinc-900 rounded-2xl border border-white/10 px-4 py-3 focus-within:border-[#D2A63C]/30 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Pergunta ao agente ${agent.label}…`}
              rows={1}
              disabled={isStreaming}
              className="flex-1 bg-transparent text-white placeholder-gray-600 resize-none outline-none text-sm leading-relaxed min-h-[24px] max-h-[160px]"
            />

            {/* Mic button */}
            {hasVoiceSupport && (
              <button
                onClick={() => voiceMode === "command" ? stopVoice() : startCommandMode()}
                disabled={isStreaming}
                title={voiceMode === "command" ? "Parar gravação" : "Falar agora (clique)"}
                className={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-all",
                  voiceMode === "command"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                    : isStreaming
                      ? "bg-zinc-800 text-gray-700 cursor-not-allowed"
                      : "bg-zinc-800 text-gray-500 hover:bg-zinc-700 hover:text-gray-300"
                )}
              >
                {voiceMode === "command" ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}

            <button
              id="aios-send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className={cn(
                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-all",
                input.trim() && !isStreaming
                  ? "bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                  : "bg-zinc-800 text-gray-600 cursor-not-allowed"
              )}
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-2">
            Enter para enviar · Shift+Enter para nova linha
            {hasVoiceSupport && " · 🎙 Clica no mic ou diz «Ei, AIOS»"}
          </p>
        </div>
      </div>
    </div>
  )
}
