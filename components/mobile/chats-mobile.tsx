"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { User, Send, Loader2, MessageCircle, Users, Search } from "lucide-react"
import Image from "next/image"
import { useAuth } from "@/contexts/auth-context"
import { supabase } from "@/lib/supabase"

interface Group {
  id: string
  name: string
  description?: string
  avatar_url?: string
  lastMessage?: {
    content: string
    created_at: string
  }
  unreadCount: number
  can_post?: boolean
  is_member?: boolean
}

interface Message {
  id: string
  content: string
  sender_id: string
  created_at: string
  sender: {
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
  }
}

export default function ChatsMobile() {
  const router = useRouter()
  const { user: currentUser } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showMessages, setShowMessages] = useState(false)
  const [authError, setAuthError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Carregar grupos ao montar (sessão via cookies) e quando o user ficar disponível
  useEffect(() => {
    loadGroups()
  }, [currentUser?.id])

  useEffect(() => {
    if (selectedGroup) {
      loadMessages(selectedGroup)
      const unsubscribe = subscribeToMessages(selectedGroup)
      return () => {
        if (unsubscribe) {
          unsubscribe()
        }
      }
    }
  }, [selectedGroup])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadGroups = async () => {
    try {
      setLoading(true)
      setAuthError(false)
      const response = await fetch('/api/messages/groups?mobile_only=true', {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        // Mesma API que /messages usa: grupos mobile (is_mobile_visible / públicos)
        let apiGroups: Group[] = data.groups || []

        // Tentar manter a mesma ordem preferencial (Social, Crypto, Forex, Trade),
        // mas sem esconder outros grupos que venham da API.
        const order = ['social', 'crypto', 'forex', 'trade']
        apiGroups.sort((a, b) => {
          const aName = (a.name || '').toLowerCase()
          const bName = (b.name || '').toLowerCase()
          const aIndex = order.findIndex((k) => aName.includes(k))
          const bIndex = order.findIndex((k) => bName.includes(k))
          return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
        })

        setGroups(apiGroups)
      } else {
        if (response.status === 401) setAuthError(true)
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        console.error('❌ [CHATS MOBILE] Erro ao carregar grupos:', errorData)
        setGroups([])
      }
    } catch (error) {
      console.error('❌ [CHATS MOBILE] Erro ao carregar grupos:', error)
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (groupId: string) => {
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    }
  }

  const subscribeToMessages = (groupId: string) => {
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${groupId}`
        },
        () => {
          loadMessages(groupId)
          loadGroups()
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ [CHATS MOBILE] Subscrição ativa para grupo:', groupId)
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ [CHATS MOBILE] Erro na subscrição para grupo:', groupId)
        }
      })

    return () => {
      supabase.removeChannel(channel).catch(console.warn)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedGroup || !newMessage.trim() || sending) return

    setSending(true)
    try {
      const response = await fetch(`/api/messages/groups/${selectedGroup}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage })
      })

      if (response.ok) {
        setNewMessage("")
        loadMessages(selectedGroup)
        loadGroups()
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
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    if (minutes > 0) return `${minutes}min`
    return 'agora'
  }

  const selectedGroupData = groups.find(g => g.id === selectedGroup)
  const canPostInGroup = selectedGroupData?.can_post ?? false

  if (showMessages && selectedGroup) {
    return (
      <div className="h-full flex flex-col bg-black text-white">
        {/* Header */}
        <div className="p-4 border-b border-[#D2A63C]/20 flex items-center gap-3 bg-gray-900">
          <button
            onClick={() => {
              setShowMessages(false)
              setSelectedGroup(null)
            }}
            className="text-[#D2A63C]"
          >
            ← Voltar
          </button>
          {selectedGroupData?.avatar_url ? (
            <Image
              src={selectedGroupData.avatar_url}
              alt={selectedGroupData.name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full border-2 border-[#D2A63C]/30"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
              <Users className="w-5 h-5 text-[#D2A63C]" />
            </div>
          )}
          <div className="flex-1">
            <p className="font-semibold text-white">{selectedGroupData?.name}</p>
            {selectedGroupData?.description && (
              <p className="text-xs text-gray-400">{selectedGroupData.description}</p>
            )}
          </div>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
          {messages.map((message) => {
            const isOwn = message.sender_id === currentUser?.id
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-lg p-3 ${
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

        {/* Input */}
        <div className="p-4 border-t border-[#D2A63C]/20 flex gap-2 bg-gray-900">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (canPostInGroup) {
                  handleSendMessage()
                }
              }
            }}
            placeholder={canPostInGroup ? "Escreve uma mensagem..." : "Apenas admins e VIPs podem publicar"}
            disabled={sending || !canPostInGroup}
            className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C] disabled:opacity-50"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending || !canPostInGroup}
            className="bg-[#D2A63C] text-black hover:bg-[#BB8525] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] h-full bg-black text-white p-4">
      <h2 className="text-xl font-bold text-[#D2A63C] mb-4">Chats</h2>
      
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
        </div>
      ) : authError ? (
        <div className="text-center text-gray-400 py-12 px-4">
          <MessageCircle className="w-14 h-14 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium text-white/80 mb-2">Sessão inválida</p>
          <p className="text-xs max-w-[280px] mx-auto mb-4">
            Inicia sessão novamente para veres os chats.
          </p>
          <a href="/login?redirect=/app-mobile" className="text-[#D2A63C] text-sm underline">Ir para o login</a>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12 px-4">
          <MessageCircle className="w-14 h-14 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium text-white/80 mb-2">Nenhum chat disponível</p>
          <p className="text-xs max-w-[280px] mx-auto mb-4">
            Os grupos Social Chat, Crypto Chat, Forex Chat e Trade Chat aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                setSelectedGroup(group.id)
                setShowMessages(true)
              }}
              className="w-full p-4 bg-gray-900 rounded-lg border border-[#D2A63C]/20 hover:bg-gray-800 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                {group.avatar_url ? (
                  <Image
                    src={group.avatar_url}
                    alt={group.name}
                    width={48}
                    height={48}
                    className="w-12 h-12 rounded-full border-2 border-[#D2A63C]/30"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                    <Users className="w-6 h-6 text-[#D2A63C]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold text-white truncate">{group.name}</p>
                    {group.unreadCount > 0 && (
                      <span className="bg-[#D2A63C] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                        {group.unreadCount}
                      </span>
                    )}
                  </div>
                  {group.description && (
                    <p className="text-xs text-gray-400 mb-1">{group.description}</p>
                  )}
                  {group.lastMessage && (
                    <p className="text-sm text-gray-400 truncate">{group.lastMessage.content}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

