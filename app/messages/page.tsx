"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { User, Send, ArrowLeft, Loader2, MessageCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import ProtectedPage from "@/components/protected-page"

interface Conversation {
  id: string
  otherUser: {
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
    email?: string
  }
  lastMessage?: {
    content: string
    created_at: string
  }
  unreadCount: number
}

interface Message {
  id: string
  content: string
  sender_id: string
  created_at: string
  read: boolean
  sender: {
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  }
}

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: currentUser } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId) {
      setSelectedConversation(conversationId)
      loadMessages(conversationId)
    }
    loadConversations()
  }, [searchParams])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation)
      subscribeToMessages(selectedConversation)
    }
    return () => {
      // Cleanup subscription
    }
  }, [selectedConversation])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadConversations = async () => {
    try {
      const response = await fetch('/api/messages/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Erro ao carregar conversas:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/messages/conversations/${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    }
  }

  const subscribeToMessages = (conversationId: string) => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          // Recarregar mensagens quando nova mensagem for inserida
          loadMessages(conversationId)
          loadConversations() // Atualizar lista de conversas
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim() || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/messages/conversations/${selectedConversation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage })
      })

      if (response.ok) {
        setNewMessage("")
        loadMessages(selectedConversation)
        loadConversations()
      } else {
        alert('Erro ao enviar mensagem')
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      alert('Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    if (minutes > 0) return `${minutes}min`
    return 'agora'
  }

  const selectedConv = conversations.find(c => c.id === selectedConversation)

  return (
    <ProtectedPage redirectPath="/login?redirect=/messages">
      <div className="min-h-screen bg-black text-white">
        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/new-landing">
                <Button variant="ghost" className="text-gray-400 hover:text-white">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-[#D2A63C]">Mensagens</h1>
            </div>
          </div>

          <div className="flex gap-4 h-[calc(100vh-200px)]">
            {/* Lista de Conversas */}
            <Card className="w-80 bg-gray-900 border-[#D2A63C]/20 flex-shrink-0">
              <CardContent className="p-0 h-full flex flex-col">
                <div className="p-4 border-b border-[#D2A63C]/20">
                  <h2 className="font-semibold text-[#D2A63C]">Conversas</h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="p-4 text-center text-gray-400">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhuma conversa ainda</p>
                    </div>
                  ) : (
                    conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversation(conv.id)
                          router.push(`/messages?conversation=${conv.id}`)
                        }}
                        className={`w-full p-4 border-b border-gray-800 hover:bg-gray-800/50 transition-colors text-left ${
                          selectedConversation === conv.id ? 'bg-[#D2A63C]/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {conv.otherUser.avatar_url ? (
                            <Image
                              src={conv.otherUser.avatar_url}
                              alt={conv.otherUser.full_name || conv.otherUser.username || 'User'}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-full border-2 border-[#D2A63C]/30"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                              <User className="w-6 h-6 text-[#D2A63C]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-semibold text-white truncate">
                                {conv.otherUser.full_name || conv.otherUser.username || 'Utilizador'}
                              </p>
                              {conv.unreadCount > 0 && (
                                <span className="bg-[#D2A63C] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                            {conv.lastMessage && (
                              <p className="text-sm text-gray-400 truncate">
                                {conv.lastMessage.content}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Área de Mensagens */}
            <Card className="flex-1 bg-gray-900 border-[#D2A63C]/20 flex flex-col">
              {selectedConversation && selectedConv ? (
                <>
                  {/* Header da Conversa */}
                  <div className="p-4 border-b border-[#D2A63C]/20 flex items-center gap-3">
                    {selectedConv.otherUser.avatar_url ? (
                      <Image
                        src={selectedConv.otherUser.avatar_url}
                        alt={selectedConv.otherUser.full_name || selectedConv.otherUser.username || 'User'}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full border-2 border-[#D2A63C]/30"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                        <User className="w-5 h-5 text-[#D2A63C]" />
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-white">
                        {selectedConv.otherUser.full_name || selectedConv.otherUser.username || 'Utilizador'}
                      </p>
                      <Link href={`/profile/${selectedConv.otherUser.id}`} className="text-xs text-[#D2A63C] hover:underline">
                        Ver perfil
                      </Link>
                    </div>
                  </div>

                  {/* Mensagens */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4"
                  >
                    {messages.map((message) => {
                      const isOwn = message.sender_id === currentUser?.id
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg p-3 ${
                              isOwn
                                ? 'bg-[#D2A63C] text-black'
                                : 'bg-gray-800 text-white'
                            }`}
                          >
                            {!isOwn && (
                              <p className="text-xs font-semibold mb-1 opacity-70">
                                {message.sender.full_name || message.sender.username || 'Utilizador'}
                              </p>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            <p className="text-xs opacity-60 mt-1">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input de Mensagem */}
                  <div className="p-4 border-t border-[#D2A63C]/20 flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Escreve uma mensagem..."
                      className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C]"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sending}
                      className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                    >
                      {sending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Seleciona uma conversa para começar</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </ProtectedPage>
  )
}

