"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { User, Send, ArrowLeft, Loader2, MessageCircle, Search, Plus, Users, X, Settings, GraduationCap } from "lucide-react"
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
  // Para grupos, vem da API de grupos e respeita as regras Trade/Crypto/Social
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

export default function MessagesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user: currentUser, isAdmin } = useAuth()
  // Verificar se é VIP através de uma chamada à API ou buscar do perfil
  const [isVip, setIsVip] = useState(false)
  const canManageGroups = isAdmin || isVip
  
  useEffect(() => {
    const checkVipStatus = async () => {
      if (currentUser?.id) {
        try {
          const response = await fetch(`/api/profile/get?id=${currentUser.id}`, { credentials: 'include' })
          if (response.ok) {
            const data = await response.json()
            setIsVip(data.profile?.membership_level === 'vip')
          }
        } catch (error) {
          console.error('Erro ao verificar status VIP:', error)
        }
      }
    }
    checkVipStatus()
  }, [currentUser?.id])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedConversationType, setSelectedConversationType] = useState<'direct' | 'group'>('direct')
  const [messages, setMessages] = useState<Message[]>([])
  const [filteredMessages, setFilteredMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [messageSearchQuery, setMessageSearchQuery] = useState("")
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState<UserProfile[]>([])
  const [searchByRole, setSearchByRole] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>("")
  const [roleUsers, setRoleUsers] = useState<UserProfile[]>([])
  const [loadingRoleUsers, setLoadingRoleUsers] = useState(false)
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loadingAllUsers, setLoadingAllUsers] = useState(false)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [mainTab, setMainTab] = useState<"messages" | "educadores">("messages")
  const [educators, setEducators] = useState<UserProfile[]>([])
  const [loadingEducators, setLoadingEducators] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    const groupId = searchParams.get('group')
    if (conversationId) {
      setSelectedConversation(conversationId)
      setSelectedConversationType('direct')
      loadMessages(conversationId, 'direct')
    } else if (groupId) {
      setSelectedConversation(groupId)
      setSelectedConversationType('group')
      loadMessages(groupId, 'group')
    }
    loadConversations()
  }, [searchParams])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    
    if (selectedConversation) {
      loadMessages(selectedConversation, selectedConversationType)
      unsubscribe = subscribeToMessages(selectedConversation, selectedConversationType)
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [selectedConversation, selectedConversationType])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Filtrar conversas
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations)
    } else {
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
    }
  }, [searchQuery, conversations])

  useEffect(() => {
    // Filtrar mensagens
    if (!messageSearchQuery.trim()) {
      setFilteredMessages(messages)
    } else {
      const query = messageSearchQuery.toLowerCase()
      setFilteredMessages(
        messages.filter((msg) => {
          const body = (msg.content ?? "").toLowerCase()
          const senderName = (msg.sender?.full_name ?? "").toLowerCase()
          const senderUser = (msg.sender?.username ?? "").toLowerCase()
          return body.includes(query) || senderName.includes(query) || senderUser.includes(query)
        })
      )
    }
  }, [messageSearchQuery, messages])

  const loadConversations = async () => {
    try {
      setLoading(true)
      const [conversationsRes, groupsRes] = await Promise.all([
        fetch('/api/messages/conversations', { credentials: 'include' }),
        fetch('/api/messages/groups?mobile_only=true', { credentials: 'include' })
      ])
      
      const conversationsData = conversationsRes.ok ? await conversationsRes.json() : { conversations: [] }
      const groupsData = groupsRes.ok ? await groupsRes.json() : { groups: [] }
      
      if (!conversationsRes.ok) {
        console.error('Erro ao carregar conversas:', conversationsData)
      }
      if (!groupsRes.ok) {
        console.error('Erro ao carregar grupos:', groupsData)
      }
      
      const directConvs: Conversation[] = (conversationsData.conversations || []).map((conv: any) => ({
        ...conv,
        isGroup: false
      }))
      
      const groupConvs: Conversation[] = (groupsData.groups || []).map((group: any) => ({
        id: group.id,
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          avatar_url: group.avatar_url
        },
        lastMessage: group.lastMessage,
        unreadCount: group.unreadCount || 0,
        isGroup: true,
        can_post: group.can_post
      }))
      
      // Ordenar por última mensagem (mais recente primeiro)
      const allConversations = [...directConvs, ...groupConvs].sort((a, b) => {
        const aTime = a.lastMessage?.created_at ? new Date(a.lastMessage.created_at).getTime() : 0
        const bTime = b.lastMessage?.created_at ? new Date(b.lastMessage.created_at).getTime() : 0
        return bTime - aTime
      })
      
      setConversations(allConversations)
    } catch (error) {
      console.error('Erro ao carregar conversas:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (id: string, type: 'direct' | 'group') => {
    try {
      const endpoint = type === 'group' 
        ? `/api/messages/groups/${id}`
        : `/api/messages/conversations/${id}`
      const response = await fetch(endpoint, { credentials: 'include' })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        // Scroll para o final após carregar
        setTimeout(() => scrollToBottom(), 100)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        console.error('Erro ao carregar mensagens:', errorData)
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    }
  }

  const subscribeToMessages = (id: string, type: 'direct' | 'group') => {
    const channelName = `messages-${type}-${id}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: type === 'group' ? `group_id=eq.${id}` : `conversation_id=eq.${id}`
        },
        (payload: any) => {
          console.log('Nova mensagem recebida:', payload)
          loadMessages(id, type)
          loadConversations()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: type === 'group' ? `group_id=eq.${id}` : `conversation_id=eq.${id}`
        },
        () => {
          loadMessages(id, type)
        }
      )
      .subscribe((status: string) => {
        console.log(`Subscription status para ${channelName}:`, status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim() || sending) return

    // Reforçar no cliente as mesmas regras de publicação da API
    const conv = conversations.find(c => c.id === selectedConversation)
    const canPost = conv ? (!conv.isGroup || conv.can_post !== false) : true
    if (!canPost) {
      alert('Não tens permissão para publicar neste grupo.')
      return
    }

    setSending(true)
    try {
      const endpoint = selectedConversationType === 'group'
        ? `/api/messages/groups/${selectedConversation}`
        : `/api/messages/conversations/${selectedConversation}`
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: newMessage.trim() })
      })

      if (response.ok) {
        setNewMessage("")
        // Recarregar mensagens e conversas
        await Promise.all([
          loadMessages(selectedConversation, selectedConversationType),
          loadConversations()
        ])
        scrollToBottom()
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }))
        console.error('Erro ao enviar mensagem:', errorData)
        alert(errorData.error || 'Erro ao enviar mensagem')
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      alert('Erro ao enviar mensagem. Verifica a consola para mais detalhes.')
    } finally {
      setSending(false)
    }
  }

  const loadEducators = async () => {
    if (educators.length > 0) return
    setLoadingEducators(true)
    try {
      const [eduRes, adminRes] = await Promise.all([
        fetch('/api/messages/search-users?query=&role=educator'),
        fetch('/api/messages/search-users?query=&role=admin'),
      ])
      const eduData = eduRes.ok ? await eduRes.json() : { users: [] }
      const adminData = adminRes.ok ? await adminRes.json() : { users: [] }
      const allEducators: UserProfile[] = [...(eduData.users || []), ...(adminData.users || [])]
      // Deduplicate by id
      const seen = new Set<string>()
      const unique = allEducators.filter((u) => {
        if (seen.has(u.id)) return false
        seen.add(u.id)
        return true
      })
      setEducators(unique)
    } catch (error) {
      console.error('Erro ao carregar educadores:', error)
    } finally {
      setLoadingEducators(false)
    }
  }

  const loadAllUsers = async () => {
    if (allUsers.length > 0) {
      setShowAllUsers(true)
      return
    }

    setLoadingAllUsers(true)
    try {
      // Carregar todos os utilizadores ativos (sem query retorna lista inicial)
      const response = await fetch('/api/messages/search-users?query=')
      if (response.ok) {
        const data = await response.json()
        setAllUsers(data.users || [])
        setShowAllUsers(true)
      }
    } catch (error) {
      console.error('Erro ao carregar todos os utilizadores:', error)
    } finally {
      setLoadingAllUsers(false)
    }
  }

  const searchUsers = async (query: string, role?: string) => {
    if (role) {
      // Se for pesquisa por role, usar loadUsersByRole
      return
    }

    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      setShowAllUsers(false)
      return
    }

    setSearchingUsers(true)
    try {
      const response = await fetch(`/api/messages/search-users?query=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.users || [])
        setShowAllUsers(false)
      } else {
        console.error('Erro na resposta da API:', response.status)
      }
    } catch (error) {
      console.error('Erro ao pesquisar utilizadores:', error)
    } finally {
      setSearchingUsers(false)
    }
  }

  // Direct conversation with a single user (used by educator tab)
  const handleStartConversationWith = async (user: UserProfile) => {
    try {
      setSending(true)
      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ otherUserId: user.id })
      })
      const data = await response.json()
      if (response.ok && data.conversation) {
        await loadConversations()
        setSelectedConversation(data.conversation.id)
        setSelectedConversationType('direct')
        router.push(`/messages?conversation=${data.conversation.id}`)
      }
    } catch (error) {
      console.error('Erro ao iniciar conversa com educador:', error)
    } finally {
      setSending(false)
      setSelectedRecipients([])
    }
  }

  const handleStartConversation = async () => {
    if (selectedRecipients.length === 0) {
      alert('Seleciona pelo menos um destinatário')
      return
    }

    try {
      setSending(true)

      // Se apenas 1 destinatário, criar conversa direta
      if (selectedRecipients.length === 1) {
        const response = await fetch('/api/messages/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ otherUserId: selectedRecipients[0].id })
        })

        const data = await response.json()

        if (response.ok && data.conversation) {
          setShowNewConversation(false)
          setUserSearchQuery("")
          setSearchResults([])
          setSelectedRecipients([])
          setSelectedRole("")
          setRoleUsers([])
          await loadConversations()
          router.push(`/messages?conversation=${data.conversation.id}`)
        } else {
          console.error('Erro na resposta:', data)
          alert(data.error || data.details || 'Erro ao iniciar conversa')
        }
      } else {
        // Múltiplos destinatários - criar grupo
        const memberIds = selectedRecipients.map(r => r.id)
        const groupName = selectedRecipients.length <= 3
          ? selectedRecipients.map(r => r.full_name || r.username || r.email).join(', ')
          : `${selectedRecipients[0].full_name || selectedRecipients[0].username || selectedRecipients[0].email} e mais ${selectedRecipients.length - 1}`

        const response = await fetch('/api/messages/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: groupName,
            description: `Grupo criado por ${currentUser?.email}`,
            is_public: false,
            is_mobile_visible: true,
            member_ids: memberIds
          })
        })

        const data = await response.json()

        if (response.ok && data.group) {
          setShowNewConversation(false)
          setUserSearchQuery("")
          setSearchResults([])
          setSelectedRecipients([])
          setSelectedRole("")
          setRoleUsers([])
          await loadConversations()
          router.push(`/messages?group=${data.group.id}`)
        } else {
          console.error('Erro na resposta:', data)
          alert(data.error || 'Erro ao criar grupo')
        }
      }
    } catch (error) {
      console.error('Erro ao iniciar conversa:', error)
      alert('Erro ao iniciar conversa. Verifica a consola para mais detalhes.')
    } finally {
      setSending(false)
    }
  }

  const handleAddRecipient = (user: UserProfile) => {
    if (!selectedRecipients.find(r => r.id === user.id)) {
      setSelectedRecipients([...selectedRecipients, user])
    }
  }

  const handleRemoveRecipient = (userId: string) => {
    setSelectedRecipients(selectedRecipients.filter(r => r.id !== userId))
  }

  const loadUsersByRole = async (role: string) => {
    if (!role) {
      setRoleUsers([])
      return
    }

    setLoadingRoleUsers(true)
    try {
      const response = await fetch(`/api/messages/search-users?role=${encodeURIComponent(role)}`)
      if (response.ok) {
        const data = await response.json()
        setRoleUsers(data.users || [])
      } else {
        console.error('Erro ao buscar utilizadores por role:', response.status)
      }
    } catch (error) {
      console.error('Erro ao buscar utilizadores por role:', error)
    } finally {
      setLoadingRoleUsers(false)
    }
  }

  useEffect(() => {
    if (selectedRole) {
      loadUsersByRole(selectedRole)
    } else {
      setRoleUsers([])
    }
  }, [selectedRole])

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

  // Política de publicação em grupos (Trade/Crypto/Social) alinhada com a API:
  // - Social Chat: todos podem publicar
  // - Trade/Crypto: apenas admin/VIP
  // - Outros grupos: admin/VIP ou membro (já calculado na API via can_post)
  const canPostInSelectedConv = selectedConv
    ? (!selectedConv.isGroup || selectedConv.can_post !== false)
    : true

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
            <Dialog open={showNewConversation} onOpenChange={(open) => {
              setShowNewConversation(open)
              if (!open) {
                setSelectedRecipients([])
                setUserSearchQuery("")
                setSearchResults([])
                setSelectedRole("")
                setRoleUsers([])
                setSearchByRole(false)
                setShowAllUsers(false)
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Conversa
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-[#D2A63C] flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    Nova Conversa
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  {/* Destinatários Selecionados */}
                  {selectedRecipients.length > 0 && (
                    <div className="p-3 bg-gray-800/50 rounded-lg border border-[#D2A63C]/20">
                      <p className="text-sm text-gray-400 mb-2">Destinatários ({selectedRecipients.length}):</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedRecipients.map((recipient) => (
                          <div
                            key={recipient.id}
                            className="flex items-center gap-2 bg-[#D2A63C]/20 px-3 py-1 rounded-full border border-[#D2A63C]/40"
                          >
                            {recipient.avatar_url ? (
                              <Image
                                src={recipient.avatar_url}
                                alt={recipient.full_name || recipient.username || 'User'}
                                width={20}
                                height={20}
                                className="w-5 h-5 rounded-full"
                              />
                            ) : (
                              <User className="w-4 h-4 text-[#D2A63C]" />
                            )}
                            <span className="text-sm text-white">
                              {recipient.full_name || recipient.username || recipient.email}
                            </span>
                            <button
                              onClick={() => handleRemoveRecipient(recipient.id)}
                              className="ml-1 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabs: Pesquisa vs Roles */}
                  <div className="flex gap-2 border-b border-gray-700">
                    <button
                      onClick={() => {
                        setSearchByRole(false)
                        setSelectedRole("")
                        setRoleUsers([])
                      }}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        !searchByRole
                          ? 'text-[#D2A63C] border-b-2 border-[#D2A63C]'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      <Search className="w-4 h-4 inline mr-2" />
                      Pesquisar
                    </button>
                    <button
                      onClick={() => setSearchByRole(true)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        searchByRole
                          ? 'text-[#D2A63C] border-b-2 border-[#D2A63C]'
                          : 'text-gray-400 hover:text-gray-300'
                      }`}
                    >
                      <Users className="w-4 h-4 inline mr-2" />
                      Por Role
                    </button>
                  </div>

                  {/* Pesquisa de Utilizadores */}
                  {!searchByRole && (
                    <div>
                      <div className="flex gap-2 mb-3">
                        <Input
                          placeholder="Pesquisar utilizadores por nome, username ou email..."
                          value={userSearchQuery}
                          onChange={(e) => {
                            setUserSearchQuery(e.target.value)
                            if (e.target.value.length >= 2) {
                              searchUsers(e.target.value)
                              setShowAllUsers(false)
                            } else if (e.target.value.length === 0) {
                              setSearchResults([])
                              setShowAllUsers(false)
                            }
                          }}
                          className="bg-gray-800 border-gray-700 text-white flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={loadAllUsers}
                          disabled={loadingAllUsers}
                          className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                        >
                          {loadingAllUsers ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Users className="w-4 h-4 mr-2" />
                              Lista
                            </>
                          )}
                        </Button>
                      </div>
                      {searchingUsers && (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                        </div>
                      )}
                      <div className="max-h-64 overflow-y-auto space-y-2 mt-4">
                        {/* Mostrar resultados da pesquisa ou lista completa */}
                        {(userSearchQuery.length >= 2 ? searchResults : (showAllUsers ? allUsers : [])).map((user) => {
                          const isSelected = selectedRecipients.some(r => r.id === user.id)
                          return (
                            <button
                              key={user.id}
                              onClick={() => {
                                if (!isSelected) {
                                  handleAddRecipient(user)
                                }
                              }}
                              disabled={isSelected}
                              className={`w-full p-3 rounded-lg flex items-center gap-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-[#D2A63C]/30 cursor-not-allowed'
                                  : 'hover:bg-gray-800'
                              }`}
                            >
                              {user.avatar_url ? (
                                <Image
                                  src={user.avatar_url}
                                  alt={user.full_name || user.username || 'User'}
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center">
                                  <User className="w-5 h-5 text-[#D2A63C]" />
                                </div>
                              )}
                              <div className="flex-1">
                                <p className="font-semibold">{user.full_name || user.username || 'Utilizador'}</p>
                                {user.username && <p className="text-sm text-gray-400">@{user.username}</p>}
                                {user.email && <p className="text-xs text-gray-500">{user.email}</p>}
                                {(user.user_type || user.membership_level) && (
                                  <p className="text-xs text-[#D2A63C] mt-1">
                                    {user.user_type === 'admin' ? 'Admin' : 
                                     user.membership_level === 'vip' ? 'VIP' : 
                                     user.user_type || 'Member'}
                                  </p>
                                )}
                              </div>
                              {isSelected && (
                                <div className="text-[#D2A63C]">
                                  <X className="w-5 h-5" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                        {!searchingUsers && !loadingAllUsers && userSearchQuery.length >= 2 && searchResults.length === 0 && (
                          <p className="text-center text-gray-400 py-4">Nenhum utilizador encontrado</p>
                        )}
                        {!searchingUsers && !loadingAllUsers && userSearchQuery.length === 0 && !showAllUsers && (
                          <div className="text-center text-gray-400 py-4">
                            <p className="mb-2">Pesquisa utilizadores ou</p>
                            <Button
                              variant="outline"
                              onClick={loadAllUsers}
                              className="bg-gray-800 border-[#D2A63C]/20 text-[#D2A63C] hover:bg-[#D2A63C]/10"
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Ver Lista Completa
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Seleção por Role */}
                  {searchByRole && (
                    <div>
                      <div className="mb-4">
                        <label className="text-sm text-gray-400 mb-2 block">Selecionar Role:</label>
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                          className="w-full bg-gray-800 border-gray-700 text-white rounded-lg px-3 py-2"
                        >
                          <option value="">Seleciona uma role...</option>
                          <option value="admin">Admin</option>
                          <option value="vip">VIP</option>
                          <option value="member">Member</option>
                          <option value="affiliate">Affiliate</option>
                        </select>
                      </div>
                      {loadingRoleUsers && (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                        </div>
                      )}
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {roleUsers.map((user) => {
                          const isSelected = selectedRecipients.some(r => r.id === user.id)
                          return (
                            <button
                              key={user.id}
                              onClick={() => {
                                if (!isSelected) {
                                  handleAddRecipient(user)
                                }
                              }}
                              disabled={isSelected}
                              className={`w-full p-3 rounded-lg flex items-center gap-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-[#D2A63C]/30 cursor-not-allowed'
                                  : 'hover:bg-gray-800'
                              }`}
                            >
                              {user.avatar_url ? (
                                <Image
                                  src={user.avatar_url}
                                  alt={user.full_name || user.username || 'User'}
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 rounded-full"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-[#D2A63C]/20 flex items-center justify-center">
                                  <User className="w-5 h-5 text-[#D2A63C]" />
                                </div>
                              )}
                              <div className="flex-1">
                                <p className="font-semibold">{user.full_name || user.username || 'Utilizador'}</p>
                                {user.username && <p className="text-sm text-gray-400">@{user.username}</p>}
                                {user.email && <p className="text-xs text-gray-500">{user.email}</p>}
                              </div>
                              {isSelected && (
                                <div className="text-[#D2A63C]">
                                  <X className="w-5 h-5" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                        {!loadingRoleUsers && selectedRole && roleUsers.length === 0 && (
                          <p className="text-center text-gray-400 py-4">Nenhum utilizador encontrado com esta role</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Botão de Iniciar Conversa */}
                  <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowNewConversation(false)
                        setSelectedRecipients([])
                        setUserSearchQuery("")
                        setSearchResults([])
                        setSelectedRole("")
                        setRoleUsers([])
                        setSearchByRole(false)
                        setShowAllUsers(false)
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleStartConversation}
                      disabled={selectedRecipients.length === 0 || sending}
                      className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                    >
                      {sending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          A processar...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          {selectedRecipients.length === 1 ? 'Iniciar Conversa' : `Criar Grupo (${selectedRecipients.length})`}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex gap-4 h-[calc(100vh-200px)]">
            {/* Lista de Conversas */}
            <Card className="w-80 bg-gray-900 border-[#D2A63C]/20 flex-shrink-0 flex flex-col">
              <CardContent className="p-0 h-full flex flex-col">
                {/* Tabs: Mensagens | Educadores */}
                <div className="flex border-b border-[#D2A63C]/20">
                  <button
                    onClick={() => setMainTab("messages")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                      mainTab === "messages"
                        ? "text-[#D2A63C] border-b-2 border-[#D2A63C]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    Conversas
                  </button>
                  <button
                    onClick={() => { setMainTab("educadores"); loadEducators() }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                      mainTab === "educadores"
                        ? "text-[#D2A63C] border-b-2 border-[#D2A63C]"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <GraduationCap className="w-4 h-4" />
                    Educadores
                  </button>
                </div>

                {/* Pesquisa de Conversas — only when in messages tab */}
                {mainTab === "messages" && (
                  <div className="p-4 border-b border-[#D2A63C]/20">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Pesquisar conversas..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white pl-10"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {/* Educators tab content */}
                  {mainTab === "educadores" && (
                    <div className="p-3">
                      {loadingEducators ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                        </div>
                      ) : educators.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-40" />
                          <p className="text-sm">Nenhum educador disponível</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-wide text-gray-500 px-1 mb-3">
                            Fala directamente com um educador
                          </p>
                          {educators.map((edu) => (
                            <button
                              key={edu.id}
                              onClick={async () => {
                                setMainTab("messages")
                                setSelectedRecipients([edu])
                                await handleStartConversationWith(edu)
                              }}
                              className="w-full p-3 rounded-xl bg-gray-800/50 border border-gray-700/50 hover:border-[#D2A63C]/40 hover:bg-gray-800 transition-all text-left flex items-center gap-3"
                            >
                              {edu.avatar_url ? (
                                <Image
                                  src={edu.avatar_url}
                                  alt={edu.full_name || edu.username || "Educador"}
                                  width={44}
                                  height={44}
                                  className="w-11 h-11 rounded-full border border-[#D2A63C]/30"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border border-[#D2A63C]/30">
                                  <GraduationCap className="w-5 h-5 text-[#D2A63C]" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-white truncate">
                                  {edu.full_name || edu.username || "Educador"}
                                </p>
                                {edu.username && (
                                  <p className="text-xs text-gray-400">@{edu.username}</p>
                                )}
                                <p className="text-[11px] text-[#D2A63C] mt-0.5">
                                  {edu.user_type === "admin" ? "Admin · Educador" : "Educador"}
                                </p>
                              </div>
                              <Send className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Regular conversations list */}
                  {mainTab === "messages" && (
                  <>{loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="p-4 text-center text-gray-400">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhuma conversa ainda</p>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedConversation(conv.id)
                          setSelectedConversationType(conv.isGroup ? 'group' : 'direct')
                          if (conv.isGroup) {
                            router.push(`/messages?group=${conv.id}`)
                          } else {
                            router.push(`/messages?conversation=${conv.id}`)
                          }
                        }}
                        className={`w-full p-4 border-b border-gray-800 hover:bg-gray-800/50 transition-colors text-left ${
                          selectedConversation === conv.id ? 'bg-[#D2A63C]/10' : ''
                        }`}
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
                                {conv.isGroup 
                                  ? conv.group?.name 
                                  : conv.otherUser?.full_name || conv.otherUser?.username || 'Utilizador'}
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
                  )}</>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Área de Mensagens */}
            <Card className="flex-1 bg-gray-900 border-[#D2A63C]/20 flex flex-col">
              {selectedConversation && selectedConv ? (
                <>
                  {/* Header da Conversa */}
                  <div className="p-4 border-b border-[#D2A63C]/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
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
                          {selectedConv.isGroup
                            ? selectedConv.group?.name
                            : selectedConv.otherUser?.full_name || selectedConv.otherUser?.username || 'Utilizador'}
                        </p>
                        {!selectedConv.isGroup && (
                          <Link href={`/profile/${selectedConv.otherUser?.id}`} className="text-xs text-[#D2A63C] hover:underline">
                            Ver perfil
                          </Link>
                        )}
                      </div>
                    </div>
                    {/* Pesquisa dentro da conversa */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Pesquisar mensagens..."
                        value={messageSearchQuery}
                        onChange={(e) => setMessageSearchQuery(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white pl-10 w-64"
                      />
                      {messageSearchQuery && (
                        <button
                          onClick={() => setMessageSearchQuery("")}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mensagens */}
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-4 space-y-4"
                  >
                    {filteredMessages.map((message) => {
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
                            {!isOwn && (selectedConv.isGroup || !isOwn) && (
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
                  <div className="p-4 border-t border-[#D2A63C]/20 flex flex-col gap-2">
                    {selectedConv?.isGroup && !canPostInSelectedConv && (
                      <p className="text-xs text-red-400 mb-1">
                        Neste grupo apenas admins e VIPs podem publicar (exceto no Social Chat, onde todos podem publicar).
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        placeholder={
                          !selectedConv?.isGroup || canPostInSelectedConv
                            ? "Escreve uma mensagem..."
                            : "Não tens permissão para publicar neste grupo"
                        }
                        disabled={sending || (selectedConv?.isGroup && !canPostInSelectedConv)}
                        className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C] disabled:opacity-50"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={
                          !newMessage.trim() ||
                          sending ||
                          (selectedConv?.isGroup && !canPostInSelectedConv)
                        }
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
