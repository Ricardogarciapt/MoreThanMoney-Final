"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2, RotateCcw, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavItem } from "./dg-sidebar"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface AgentChatProps {
  agent: NavItem
}

export default function AgentChat({ agent }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const Icon = agent.icon

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
  }, [input])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return
    const userMsg: Message = { role: "user", content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput("")
    setIsStreaming(true)

    const assistantMsg: Message = { role: "assistant", content: "" }
    setMessages([...newMessages, assistantMsg])

    try {
      const res = await fetch("/api/dashboard-gestao/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agent.id, messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        const err = await res.text()
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: `❌ Erro: ${err}` },
        ])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ""
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                text += parsed.text
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: text },
                ])
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `❌ Erro de rede: ${String(err)}` },
      ])
    } finally {
      setIsStreaming(false)
    }
  }, [input, messages, isStreaming, agent.id])

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
    <div className="flex flex-col h-full">
      {/* Agent header */}
      <div className="flex items-center justify-between border-b border-[#D2A63C]/15 bg-zinc-950/60 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl ring-1"
            style={{
              background: `${agent.color}20`,
              ringColor: `${agent.color}40`,
              borderColor: `${agent.color}30`,
              border: `1px solid ${agent.color}30`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: agent.color }} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{agent.label}</h2>
            <p className="text-xs text-gray-500">{agent.description}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            <RotateCcw className="h-3 w-3" />
            Limpar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
              style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}25` }}
            >
              <Icon className="h-8 w-8" style={{ color: agent.color }} />
            </div>
            <p className="text-white font-semibold text-lg">{agent.label}</p>
            <p className="text-gray-500 text-sm mt-1 max-w-xs">{agent.description}</p>
            <p className="text-gray-600 text-xs mt-4">Escreve uma mensagem para começar</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "relative group max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "bg-[#D2A63C] text-black rounded-br-sm"
                  : "bg-zinc-900 text-gray-100 rounded-bl-sm border border-white/5"
              )}
            >
              {msg.role === "assistant" && isStreaming && idx === messages.length - 1 && !msg.content && (
                <div className="flex gap-1 py-1">
                  <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {/* Copy button on assistant messages */}
              {msg.role === "assistant" && msg.content && (
                <button
                  onClick={() => copyMessage(msg.content, idx)}
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
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#D2A63C]/15 bg-zinc-950/60 p-4 flex-shrink-0">
        <div className="flex items-end gap-3 bg-zinc-900 rounded-2xl border border-white/10 px-4 py-3 focus-within:border-[#D2A63C]/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Fala com o agente ${agent.label}...`}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-gray-600 resize-none outline-none text-sm leading-relaxed min-h-[24px] max-h-[160px]"
            disabled={isStreaming}
          />
          <button
            onClick={sendMessage}
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
        <p className="text-center text-xs text-gray-700 mt-2">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}
