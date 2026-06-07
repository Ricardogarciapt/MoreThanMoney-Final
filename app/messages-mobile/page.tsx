"use client"

// ─── Mensagens — versão mobile ────────────────────────────────────────────────
// Vista otimizada para ecrãs pequenos (app-mobile / WebView iOS): navegação a
// um só painel (lista ↔ conversa), barra inferior fixa para escrever, e
// pesquisa/criação de conversas em ecrã inteiro. Usa exatamente os mesmos
// endpoints e o mesmo modelo de dados que /messages — apenas a interface muda.

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  User,
  Send,
  ArrowLeft,
  Loader2,
  MessageCircle,
  Search,
  Plus,
  Users,
  X,
  GraduationCap,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import ProtectedPage from "@/components/protected-page"

interface Conversation {
  id: string
  otherUser?: {
    id: string
    full_name?: string
    username?: string
    avatar_url?: string
    email?: string
  }
  group?: {
    id: string
    name: string
    description?: string
    avatar_url?: string
  }
  lastMessage?: {
    content: string
    created_at: string
  }
  unreadCount: number
  isGroup: boolean
  can_post?: boolean
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

interface UserProfile {
  id: string
  full_name?: string
  username?: string
  avatar_url?: string
  email?: string
  user_type?: string
  membership_level?: string
}

type View = "list" | "chat" | "new"

export default function MessagesMobilePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: currentUser } = useAuth()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedConversationType, setSelectedConversationType] = useState<"direct" | "group">("direct")
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Ecrã "Nova conversa"
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)

  // Separador Conversas / Educadores
  const [mainTab, setMainTab] = useState<"messages" | "educadores">("messages")
  const [educators, setEducators] = useState<UserProfile[]>([])
  const [loadingEducators, setLoadingEducators] = useState(false)
  const [startingDm, setStartingDm] = useState<string | null>(null)

  const [view, setView] = useState<View>("list")

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Carregamento inicial / deep-links (?conversation= / ?group=) ───────────
  useEffect(() => {
    const conversationId = searchParams.get("conversation")
    const groupId = searchParams.get("group")
    if (conversationId) {
      setSelectedConversation(conversationId)
      setSelectedConversationType("direct")
      setView("chat")
      loadMessages(conversationId, "direct")
    } else if (groupId) {
      setSelectedConversation(groupId)
      setSelectedConversationType("group")
      setView("chat")
      loadMessages(groupId, "group")
    }
    loadConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    if (selectedConversation) {
      loadMessages(selectedConversation, selectedConversationType)
      unsubscribe = subscribeToMessages(selectedConversation, selectedConversationType)
    }
    return () => {
      if (unsubscribe) unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation, selectedConversationType])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations)
      return
    }
    const query = searchQuery.toLowerCase()
    setFilteredConversations(
      conversations.filter((conv) => {
        if (conv.isGroup) {
          return (
            conv.group?.name?.toLowerCase().includes(query) ||
            conv.group?.description?.toLowerCase().includes(query) ||
            conv.lastMessage?.content?.toLowerCase().includes(query)
          )
        }
        return (
          conv.otherUser?.full_name?.toLowerCase().includes(query) ||
          conv.otherUser?.username?.toLowerCase().includes(query) ||
          conv.lastMessage?.content?.toLowerCase().includes(query)
        )
      })
    )
  }, [searchQuery, conversations])

  // ── Dados (mesmos endpoints de /messages) ──────────────────────────────────
  const loadConversations = async () => {
    try {
      setLoading(true)
      const [conversationsRes, groupsRes] = await Promise.all([
        fetch("/api/messages/conversations", { credentials: "include" }),
        fetch("/api/messages/groups?mobile_only=true", { credentials: "include" }),
      ])

      const conversationsData = conversationsRes.ok ? await conversationsRes.json() : { conversations: [] }
      const groupsData = groupsRes.ok ? await groupsRes.json() : { groups: [] }

      const directConvs: Conversation[] = (conversationsData.conversations || []).map((conv: any) => ({
        ...conv,
        isGroup: false,
      }))

      const groupConvs: Conversation[] = (groupsData.groups || []).map((group: any) => ({
        id: group.id,
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          avatar_url: group.avatar_url,
        },
        lastMessage: group.lastMessage,
        unreadCount: group.unreadCount || 0,
        isGroup: true,
        can_post: group.can_post,
      }))

      const allConversations = [...directConvs, ...groupConvs].sort((a, b) => {
        const aTime = a.lastMessage?.created_at ? new Date(a.lastMessage.created_at).getTime() : 0
        const bTime = b.lastMessage?.created_at ? new Date(b.lastMessage.created_at).getTime() : 0
        return bTime - aTime
      })

      setConversations(allConversations)
    } catch (error) {
      console.error("Erro ao carregar conversas:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (id: string, type: "direct" | "group") => {
    try {
      const endpoint = type === "group" ? `/api/messages/groups/${id}` : `/api/messages/conversations/${id}`
      const response = await fetch(endpoint, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        setTimeout(() => scrollToBottom(), 100)
      }
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error)
    }
  }

  const subscribeToMessages = (id: string, type: "direct" | "group") => {
    const channelName = `messages-mobile-${type}-${id}`
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: type === "group" ? `group_id=eq.${id}` : `conversation_id=eq.${id}`,
        },
        () => {
          loadMessages(id, type)
          loadConversations()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: type === "group" ? `group_id=eq.${id}` : `conversation_id=eq.${id}`,
        },
        () => loadMessages(id, type)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim() || sending) return

    const conv = conversations.find((c) => c.id === selectedConversation)
    const canPost = conv ? !conv.isGroup || conv.can_post !== false : true
    if (!canPost) {
      alert("Não tens permissão para publicar neste grupo.")
      return
    }

    setSending(true)
    try {
      const endpoint =
        selectedConversationType === "group"
          ? `/api/messages/groups/${selectedConversation}`
          : `/api/messages/conversations/${selectedConversation}`

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newMessage.trim() }),
      })

      if (response.ok) {
        setNewMessage("")
        await Promise.all([loadMessages(selectedConversation, selectedConversationType), loadConversations()])
        scrollToBottom()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }))
        alert(errorData.error || "Erro ao enviar mensagem")
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error)
      alert("Erro ao enviar mensagem. Tenta novamente.")
    } finally {
      setSending(false)
    }
  }

  const loadEducators = async () => {
    if (educators.length > 0) return
    setLoadingEducators(true)
    try {
      const [eduRes, adminRes] = await Promise.all([
        fetch("/api/messages/search-users?query=&role=educator"),
        fetch("/api/messages/search-users?query=&role=admin"),
      ])
      const eduData = eduRes.ok ? await eduRes.json() : { users: [] }
      const adminData = adminRes.ok ? await adminRes.json() : { users: [] }
      const all: UserProfile[] = [...(eduData.users || []), ...(adminData.users || [])]
      const seen = new Set<string>()
      setEducators(
        all.filter((u) => {
          if (seen.has(u.id)) return false
          seen.add(u.id)
          return true
        })
      )
    } catch (error) {
      console.error("Erro ao carregar educadores:", error)
    } finally {
      setLoadingEducators(false)
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchingUsers(true)
    try {
      const response = await fetch(`/api/messages/search-users?query=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.users || [])
      }
    } catch (error) {
      console.error("Erro ao pesquisar utilizadores:", error)
    } finally {
      setSearchingUsers(false)
    }
  }

  const openConversation = (conv: Conversation) => {
    setSelectedConversation(conv.id)
    setSelectedConversationType(conv.isGroup ? "group" : "direct")
    setView("chat")
    if (conv.isGroup) {
      router.push(`/messages-mobile?group=${conv.id}`)
    } else {
      router.push(`/messages-mobile?conversation=${conv.id}`)
    }
  }

  const startConversationWith = async (user: UserProfile) => {
    try {
      setStartingDm(user.id)
      const response = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otherUserId: user.id }),
      })
      const data = await response.json()
      if (response.ok && data.conversation) {
        await loadConversations()
        setSelectedConversation(data.conversation.id)
        setSelectedConversationType("direct")
        setView("chat")
        setUserSearchQuery("")
        setSearchResults([])
        router.push(`/messages-mobile?conversation=${data.conversation.id}`)
      } else {
        alert(data.error || "Erro ao iniciar conversa")
      }
    } catch (error) {
      console.error("Erro ao iniciar conversa:", error)
      alert("Erro ao iniciar conversa. Tenta novamente.")
    } finally {
      setStartingDm(null)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
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
    return "agora"
  }

  const selectedConv = conversations.find((c) => c.id === selectedConversation)
  const canPostInSelectedConv = selectedConv ? !selectedConv.isGroup || selectedConv.can_post !== false : true

  const goBackToList = () => {
    setView("list")
    setSelectedConversation(null)
    router.push("/messages-mobile")
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <ProtectedPage redirectPath="/login?redirect=/messages-mobile">
      <div className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden">
        {/* ───────────────────────── LISTA DE CONVERSAS ───────────────────────── */}
        {view === "list" && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3 border-b border-[#D2A63C]/15 bg-black/95 backdrop-blur-sm sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Link href="/app-mobile?tab=chat">
                  <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white -ml-2">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                </Link>
                <h1 className="text-xl font-bold text-[#D2A63C]">Mensagens</h1>
              </div>
              <Button
                size="icon"
                onClick={() => setView("new")}
                className="bg-[#D2A63C] text-black hover:bg-[#BB8525] rounded-full w-9 h-9"
                aria-label="Nova conversa"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            {/* Tabs: Conversas | Educadores */}
            <div className="flex border-b border-[#D2A63C]/15 bg-black/95">
              <button
                onClick={() => setMainTab("messages")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                  mainTab === "messages" ? "text-[#D2A63C] border-b-2 border-[#D2A63C]" : "text-gray-400"
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                Conversas
              </button>
              <button
                onClick={() => {
                  setMainTab("educadores")
                  loadEducators()
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                  mainTab === "educadores" ? "text-[#D2A63C] border-b-2 border-[#D2A63C]" : "text-gray-400"
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Educadores
              </button>
            </div>

            {mainTab === "messages" && (
              <div className="px-4 py-3 border-b border-[#D2A63C]/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    placeholder="Pesquisar conversas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-gray-900 border-gray-800 text-white pl-10 h-11 rounded-xl"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1rem)]">
              {/* Educadores */}
              {mainTab === "educadores" && (
                <div className="p-3">
                  {loadingEducators ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                    </div>
                  ) : educators.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum educador disponível</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500 px-1 mb-2">
                        Fala diretamente com um educador
                      </p>
                      {educators.map((edu) => (
                        <button
                          key={edu.id}
                          onClick={() => startConversationWith(edu)}
                          disabled={startingDm === edu.id}
                          className="w-full p-3 rounded-2xl bg-gray-900 border border-gray-800 active:border-[#D2A63C]/40 active:bg-gray-800 transition-all text-left flex items-center gap-3"
                        >
                          {edu.avatar_url ? (
                            <Image
                              src={edu.avatar_url}
                              alt={edu.full_name || edu.username || "Educador"}
                              width={48}
                              height={48}
                              className="w-12 h-12 rounded-full border border-[#D2A63C]/30"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border border-[#D2A63C]/30">
                              <GraduationCap className="w-5 h-5 text-[#D2A63C]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white truncate">
                              {edu.full_name || edu.username || "Educador"}
                            </p>
                            <p className="text-[11px] text-[#D2A63C] mt-0.5">
                              {edu.user_type === "admin" ? "Admin · Educador" : "Educador"}
                            </p>
                          </div>
                          {startingDm === edu.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500 flex-shrink-0" />
                          ) : (
                            <Send className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Conversas */}
              {mainTab === "messages" && (
                <>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">
                      <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                      <p className="text-sm mb-4">Ainda não tens conversas</p>
                      <Button onClick={() => setView("new")} className="bg-[#D2A63C] text-black hover:bg-[#BB8525] rounded-xl">
                        <Plus className="w-4 h-4 mr-2" />
                        Começar uma conversa
                      </Button>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className="w-full px-4 py-3 border-b border-gray-900 active:bg-gray-900/60 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          {conv.isGroup ? (
                            conv.group?.avatar_url ? (
                              <Image
                                src={conv.group.avatar_url}
                                alt={conv.group.name}
                                width={48}
                                height={48}
                                className="w-12 h-12 rounded-full border-2 border-[#D2A63C]/30"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                                <Users className="w-6 h-6 text-[#D2A63C]" />
                              </div>
                            )
                          ) : conv.otherUser?.avatar_url ? (
                            <Image
                              src={conv.otherUser.avatar_url}
                              alt={conv.otherUser.full_name || conv.otherUser.username || "User"}
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
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="font-semibold text-white truncate text-[15px]">
                                {conv.isGroup
                                  ? conv.group?.name
                                  : conv.otherUser?.full_name || conv.otherUser?.username || "Utilizador"}
                              </p>
                              {conv.unreadCount > 0 && (
                                <span className="bg-[#D2A63C] text-black text-[11px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                            {conv.lastMessage && (
                              <p className="text-sm text-gray-500 truncate">{conv.lastMessage.content}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ───────────────────────── CONVERSA ATIVA ───────────────────────── */}
        {view === "chat" && selectedConversation && selectedConv && (
          <div className="flex flex-col h-full">
            {/* Header da conversa */}
            <div className="flex items-center gap-3 px-3 pt-[max(env(safe-area-inset-top),1rem)] pb-3 border-b border-[#D2A63C]/15 bg-black/95 backdrop-blur-sm sticky top-0 z-10">
              <Button variant="ghost" size="icon" onClick={goBackToList} className="text-gray-400 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {selectedConv.isGroup ? (
                selectedConv.group?.avatar_url ? (
                  <Image
                    src={selectedConv.group.avatar_url}
                    alt={selectedConv.group.name}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full border-2 border-[#D2A63C]/30"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                    <Users className="w-5 h-5 text-[#D2A63C]" />
                  </div>
                )
              ) : selectedConv.otherUser?.avatar_url ? (
                <Image
                  src={selectedConv.otherUser.avatar_url}
                  alt={selectedConv.otherUser.full_name || selectedConv.otherUser.username || "User"}
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full border-2 border-[#D2A63C]/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                  <User className="w-5 h-5 text-[#D2A63C]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white truncate">
                  {selectedConv.isGroup
                    ? selectedConv.group?.name
                    : selectedConv.otherUser?.full_name || selectedConv.otherUser?.username || "Utilizador"}
                </p>
                {!selectedConv.isGroup && selectedConv.otherUser?.id && (
                  <Link href={`/profile/${selectedConv.otherUser.id}`} className="text-xs text-[#D2A63C]">
                    Ver perfil
                  </Link>
                )}
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3">
              {messages.map((message) => {
                const isOwn = message.sender_id === currentUser?.id
                return (
                  <div key={message.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                        isOwn ? "bg-[#D2A63C] text-black rounded-br-sm" : "bg-gray-800 text-white rounded-bl-sm"
                      }`}
                    >
                      {!isOwn && selectedConv.isGroup && (
                        <p className="text-[11px] font-semibold mb-1 opacity-70">
                          {message.sender.full_name || message.sender.username || "Utilizador"}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      <p className="text-[10px] opacity-60 mt-1 text-right">{formatTime(message.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Caixa de escrita */}
            <div className="border-t border-[#D2A63C]/15 bg-black/95 backdrop-blur-sm px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {selectedConv.isGroup && !canPostInSelectedConv && (
                <p className="text-[11px] text-red-400 mb-1.5 px-1">
                  Neste grupo apenas admins e VIPs podem publicar.
                </p>
              )}
              <div className="flex items-end gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder={
                    !selectedConv.isGroup || canPostInSelectedConv
                      ? "Escreve uma mensagem..."
                      : "Sem permissão para publicar"
                  }
                  disabled={sending || (selectedConv.isGroup && !canPostInSelectedConv)}
                  className="bg-gray-900 border-gray-800 text-white rounded-2xl h-11 disabled:opacity-50"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending || (selectedConv.isGroup && !canPostInSelectedConv)}
                  size="icon"
                  className="bg-[#D2A63C] text-black hover:bg-[#BB8525] disabled:opacity-40 rounded-full w-11 h-11 flex-shrink-0"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────── NOVA CONVERSA ───────────────────────── */}
        {view === "new" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-3 pt-[max(env(safe-area-inset-top),1rem)] pb-3 border-b border-[#D2A63C]/15 bg-black/95 sticky top-0 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setView("list")
                  setUserSearchQuery("")
                  setSearchResults([])
                }}
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-lg font-bold text-[#D2A63C] flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Nova conversa
              </h2>
            </div>

            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  autoFocus
                  placeholder="Pesquisar por nome, username ou email..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value)
                    searchUsers(e.target.value)
                  }}
                  className="bg-gray-900 border-gray-800 text-white pl-10 h-11 rounded-xl"
                />
                {searchingUsers && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-500" />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
              {userSearchQuery.trim().length < 2 ? (
                <div className="text-center text-gray-500 py-12 text-sm">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Escreve pelo menos 2 letras para pesquisar
                </div>
              ) : searchResults.length === 0 && !searchingUsers ? (
                <div className="text-center text-gray-500 py-12 text-sm">Nenhum utilizador encontrado</div>
              ) : (
                <div className="space-y-2 pt-1">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => startConversationWith(u)}
                      disabled={startingDm === u.id}
                      className="w-full p-3 rounded-2xl bg-gray-900 border border-gray-800 active:border-[#D2A63C]/40 active:bg-gray-800 transition-all text-left flex items-center gap-3"
                    >
                      {u.avatar_url ? (
                        <Image
                          src={u.avatar_url}
                          alt={u.full_name || u.username || "User"}
                          width={44}
                          height={44}
                          className="w-11 h-11 rounded-full border border-[#D2A63C]/30"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border border-[#D2A63C]/30">
                          <User className="w-5 h-5 text-[#D2A63C]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">
                          {u.full_name || u.username || u.email}
                        </p>
                        {u.username && <p className="text-xs text-gray-500">@{u.username}</p>}
                      </div>
                      {startingDm === u.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-500 flex-shrink-0" />
                      ) : (
                        <Send className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <p className="text-center text-[11px] text-gray-600 mt-6 px-6">
                Para criar grupos ou pesquisar por função (role), usa a versão completa em{" "}
                <Link href="/messages" className="text-[#D2A63C] underline">
                  /messages
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  )
}
