"use client"

import { useState } from "react"
import { MessageCircle, X, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AIAssistantFloating() {
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState("")

  const handleSend = () => {
    if (message.trim()) {
      // TODO: Implementar integração com API de AI
      console.log("Enviando mensagem:", message)
      setMessage("")
    }
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
        <div className="text-sm text-gray-400">
          Olá! Como posso ajudar?
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSend()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-gray-800 text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#D2A63C]"
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="bg-[#D2A63C] hover:bg-[#B8942F]"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

