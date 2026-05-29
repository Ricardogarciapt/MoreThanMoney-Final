"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  MessageCircle, 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  Settings,
  Eye,
  Send,
  Shield,
  UserPlus,
  UserMinus,
  Search,
  BarChart3
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Group {
  id: string
  name: string
  description?: string
  avatar_url?: string
  is_public: boolean
  is_mobile_visible: boolean
  created_by?: string
  member_count?: number
  last_message_at?: string
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
    email?: string
  }
}

interface GroupMember {
  id: string
  user_id: string
  role: 'admin' | 'member'
  user: {
    id: string
    full_name?: string
    username?: string
    email?: string
    avatar_url?: string
  }
}

export default function ChatsMessagesManager() {
  const { toast } = useToast()
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showMembersDialog, setShowMembersDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("groups")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    avatar_url: "",
    is_public: true,
    is_mobile_visible: false
  })

  useEffect(() => {
    loadGroups()
  }, [])

  useEffect(() => {
    if (selectedGroup) {
      loadMessages(selectedGroup.id)
      loadMembers(selectedGroup.id)
    }
  }, [selectedGroup])

  const loadGroups = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/messages/groups', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setGroups(data.groups || [])
      }
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao carregar grupos",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (groupId: string) => {
    try {
      setLoadingMessages(true)
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  const loadMembers = async (groupId: string) => {
    try {
      const response = await fetch(`/api/messages/groups/${groupId}/members`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Erro ao carregar membros:', error)
    }
  }

  const handleCreateGroup = async () => {
    try {
      const response = await fetch('/api/messages/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast({
          title: "✅ Sucesso",
          description: "Grupo criado com sucesso",
        })
        setShowCreateDialog(false)
        setFormData({
          name: "",
          description: "",
          avatar_url: "",
          is_public: true,
          is_mobile_visible: false
        })
        loadGroups()
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao criar grupo",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao criar grupo:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao criar grupo",
        variant: "destructive"
      })
    }
  }

  const handleUpdateGroup = async (groupId: string) => {
    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast({
          title: "✅ Sucesso",
          description: "Grupo atualizado com sucesso",
        })
        setSelectedGroup(null)
        setFormData({
          name: "",
          description: "",
          avatar_url: "",
          is_public: true,
          is_mobile_visible: false
        })
        loadGroups()
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao atualizar grupo",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao atualizar grupo:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao atualizar grupo",
        variant: "destructive"
      })
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Tens a certeza que queres eliminar este grupo? Todas as mensagens serão perdidas.')) return

    try {
      const response = await fetch(`/api/messages/groups/${groupId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        toast({
          title: "✅ Sucesso",
          description: "Grupo eliminado com sucesso",
        })
        setSelectedGroup(null)
        loadGroups()
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao eliminar grupo",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao eliminar grupo:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao eliminar grupo",
        variant: "destructive"
      })
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Tens a certeza que queres eliminar esta mensagem?')) return

    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        toast({
          title: "✅ Sucesso",
          description: "Mensagem eliminada",
        })
        if (selectedGroup) {
          loadMessages(selectedGroup.id)
        }
      } else {
        const data = await response.json()
        toast({
          title: "❌ Erro",
          description: data.error || "Erro ao eliminar mensagem",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Erro ao eliminar mensagem:', error)
      toast({
        title: "❌ Erro",
        description: "Erro ao eliminar mensagem",
        variant: "destructive"
      })
    }
  }

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900 border-[#D2A63C]/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#D2A63C] flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Gestão de Chats e Mensagens
            </CardTitle>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Grupo
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-[#D2A63C]">Criar Novo Grupo</DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Grupo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="Ex: Social Chat"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="Descrição do grupo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="avatar_url">URL do Avatar (opcional)</Label>
                    <Input
                      id="avatar_url"
                      value={formData.avatar_url}
                      onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                      className="bg-gray-800 border-gray-700 text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_public"
                        checked={formData.is_public}
                        onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="is_public">Grupo Público</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_mobile_visible"
                        checked={formData.is_mobile_visible}
                        onChange={(e) => setFormData({ ...formData, is_mobile_visible: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="is_mobile_visible">Visível no App Mobile</Label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateGroup}
                      className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                      disabled={!formData.name.trim()}
                    >
                      Criar
                    </Button>
                    <Button
                      onClick={() => setShowCreateDialog(false)}
                      variant="outline"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Pesquisar grupos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger value="groups">Grupos ({filteredGroups.length})</TabsTrigger>
              <TabsTrigger value="messages" disabled={!selectedGroup}>
                Mensagens {selectedGroup && `(${messages.length})`}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="groups" className="space-y-4 mt-4">
              {filteredGroups.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum grupo encontrado</p>
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <Card 
                    key={group.id} 
                    className={`bg-gray-800 border-gray-700 cursor-pointer hover:border-[#D2A63C]/50 transition-colors ${
                      selectedGroup?.id === group.id ? 'border-[#D2A63C]' : ''
                    }`}
                    onClick={() => {
                      setSelectedGroup(group)
                      setActiveTab("messages")
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {group.avatar_url ? (
                            <img
                              src={group.avatar_url}
                              alt={group.name}
                              className="w-12 h-12 rounded-full border-2 border-[#D2A63C]/30"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[#D2A63C]/20 flex items-center justify-center border-2 border-[#D2A63C]/30">
                              <Users className="w-6 h-6 text-[#D2A63C]" />
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="font-semibold text-white">{group.name}</h3>
                            {group.description && (
                              <p className="text-sm text-gray-400">{group.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              {group.is_public && (
                                <Badge variant="outline" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                                  Público
                                </Badge>
                              )}
                              {group.is_mobile_visible && (
                                <Badge variant="outline" className="text-xs bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/30">
                                  Mobile
                                </Badge>
                              )}
                              {group.member_count !== undefined && (
                                <span className="text-xs text-gray-400">
                                  {group.member_count} membros
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedGroup(group)
                              setFormData({
                                name: group.name,
                                description: group.description || "",
                                avatar_url: group.avatar_url || "",
                                is_public: group.is_public,
                                is_mobile_visible: group.is_mobile_visible
                              })
                              setShowEditDialog(true)
                            }}
                            className="border-gray-700 text-gray-300 hover:bg-gray-700"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteGroup(group.id)
                            }}
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
            
            <TabsContent value="messages" className="mt-4">
              {selectedGroup ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                    <div>
                      <h3 className="font-semibold text-white">{selectedGroup.name}</h3>
                      <p className="text-sm text-gray-400">{messages.length} mensagens</p>
                    </div>
                    <Button
                      onClick={() => {
                        setFormData({
                          name: selectedGroup.name,
                          description: selectedGroup.description || "",
                          avatar_url: selectedGroup.avatar_url || "",
                          is_public: selectedGroup.is_public,
                          is_mobile_visible: selectedGroup.is_mobile_visible
                        })
                        setShowEditDialog(true)
                      }}
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:bg-gray-700"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Editar Grupo
                    </Button>
                  </div>
                  
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma mensagem neste grupo</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                      {messages.map((message) => (
                        <Card key={message.id} className="bg-gray-800 border-gray-700">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-white text-sm">
                                    {message.sender.full_name || message.sender.username || message.sender.email || 'Utilizador'}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {new Date(message.created_at).toLocaleString('pt-PT')}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">{message.content}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteMessage(message.id)}
                                className="border-red-500/50 text-red-400 hover:bg-red-500/10 ml-2"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <Eye className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Seleciona um grupo para ver as mensagens</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog de edição */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-gray-900 border-[#D2A63C]/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#D2A63C]">Editar Grupo</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="edit_name">Nome do Grupo</Label>
              <Input
                id="edit_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit_description">Descrição</Label>
              <Textarea
                id="edit_description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label htmlFor="edit_avatar_url">URL do Avatar (opcional)</Label>
              <Input
                id="edit_avatar_url"
                value={formData.avatar_url}
                onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_is_public"
                  checked={formData.is_public}
                  onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="edit_is_public">Grupo Público</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_is_mobile_visible"
                  checked={formData.is_mobile_visible}
                  onChange={(e) => setFormData({ ...formData, is_mobile_visible: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="edit_is_mobile_visible">Visível no App Mobile</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (selectedGroup) {
                    handleUpdateGroup(selectedGroup.id)
                    setShowEditDialog(false)
                  }
                }}
                className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
              >
                Guardar
              </Button>
              <Button
                onClick={() => setShowEditDialog(false)}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

