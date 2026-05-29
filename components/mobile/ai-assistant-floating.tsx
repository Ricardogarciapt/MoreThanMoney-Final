"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { MessageCircle, X, Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePathname, useSearchParams } from "next/navigation"
import { trackAIEvent } from "@/lib/ai-analytics"

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function AIAssistantFloating() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams?.get("tab") || ""

  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState("")
  const welcomeText = useMemo(() => {
    if (pathname?.includes("/app-mobile")) {
      return `Olá! Sou o assistente MoreThanMoney nesta app.

Ajudo com Mentor 72h, Rising Star / Bronze Star (700 CV por perna), leads, 3-way, onboarding / Fast Start e, na tab Portfólio, DCA e visão geral de risco.

Usa uma sugestão abaixo ou escreve a tua pergunta.`
    }
    return `Olá! Sou o assistente MoreThanMoney: execução (onboarding, Fast Start, mentor), negócio, trading/DCA, mindset e fitness. Como posso ajudar?`
  }, [pathname])

  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setMessages([{ role: "assistant", content: welcomeText, timestamp: new Date() }])
  }, [welcomeText])

  const starterPrompts = useMemo(() => {
    if (pathname?.includes("/app-mobile") && currentTab === "mentor") {
      return [
        "Mostra-me as 3 próximas ações para concluir as primeiras 72h.",
        "Como chego a Rising Star com um plano diário simples?",
        "Dá-me um script para 10 leads hoje + 3 follow-ups.",
      ]
    }
    if (pathname?.includes("/app-mobile") && currentTab === "live") {
      return [
        "Que live devo ver hoje para acelerar o meu onboarding?",
        "Resume os pontos mais importantes da live para executar hoje.",
      ]
    }
    return [
      "Quero um plano simples para as próximas 24 horas.",
      "Ajuda-me a organizar onboarding + fast-start sem bloquear.",
      "Que pergunta devo fazer ao mentor na próxima call?",
    ]
  }, [pathname, currentTab])

  const sendMessage = async (inputMessage: string) => {
    const userMessage = inputMessage.trim()
    if (!userMessage || loading) return
    setMessage("")
    setLoading(true)

    const startTime = Date.now()

    // Add user message
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newUserMessage])

    // Track message sent
    await trackAIEvent(
      'ai_chat_message_sent',
      { message_length: userMessage.length },
      { pathname: pathname || '', tab: searchParams?.get('tab') || '' },
      'chat_assistant'
    )

    try {
      // Check context for better AI responses
      const includeDCA = pathname?.includes('portfolio') || currentTab === 'portfolio'

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-pathname': pathname || ''
        },
        body: JSON.stringify({
          message: userMessage,
          context: { 
            include_dca: includeDCA,
            pathname: pathname || '',
            tab: currentTab,
            mentor_mode: currentTab === "mentor",
            onboarding_focus:
              pathname?.includes("/app-mobile") ||
              pathname?.includes("/onboarding") ||
              pathname?.includes("/fast-start"),
          }
        })
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Erro ao processar mensagem')
      }

      const data = await response.json()
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.message || data.response || 'Desculpe, não consegui processar sua mensagem.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

      // Track successful response
      await trackAIEvent(
        'ai_chat_response_received',
        { 
          message_length: userMessage.length,
          response_length: assistantMessage.content.length,
          has_dca_context: includeDCA
        },
        { pathname: pathname || '', tab: searchParams?.get('tab') || '' },
        'chat_assistant',
        responseTime,
        true
      )
    } catch (error) {
      const responseTime = Date.now() - startTime
      console.error('❌ [AI ASSISTANT] Erro:', error)
      const errMsg = error instanceof Error ? error.message : ""
      const fallback =
        errMsg.includes("401") || errMsg.includes("autenticado")
          ? "Precisas de ter sessão iniciada para usar o assistente."
          : "Não consegui ligar ao servidor neste momento. Verifica a ligação e tenta outra vez, ou reformula a pergunta."
      const errorMessage: Message = {
        role: 'assistant',
        content: fallback,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])

      // Track error
      await trackAIEvent(
        'ai_chat_error',
        { message_length: userMessage.length },
        { pathname: pathname || '', tab: searchParams?.get('tab') || '' },
        'chat_assistant',
        responseTime,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    await sendMessage(message)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 bg-[#D2A63C] hover:bg-[#B8942F] rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
        aria-label="Abrir assistente AI"
      >
        <MessageCircle className="w-6 h-6 text-white" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-80 h-96 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h3 className="text-white font-semibold">Assistente AI</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Fechar assistente"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-[#D2A63C] text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-4 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#D2A63C]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => sendMessage(prompt)}
              className="rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2.5 py-1 text-[11px] text-[#D2A63C] hover:bg-[#D2A63C]/20 disabled:opacity-60"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={loading}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-gray-800 text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#D2A63C]"
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="bg-[#D2A63C] hover:bg-[#B8942F]"
            disabled={loading || !message.trim()}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

