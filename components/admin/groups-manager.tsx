"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Plus, Edit, Trash2, Loader2, MessageCircle, Settings } from "lucide-react"
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
}

export default function GroupsManager() {
  const { toast } = useToast()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
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

  const loadGroups = async () => {
    try {
      const response = await fetch('/api/messages/groups')
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
        setEditingGroup(null)
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
    if (!confirm('Tens a certeza que queres eliminar este grupo?')) return

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <Card className="bg-gray-900 border-[#D2A63C]/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#D2A63C] flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Gestão de Grupos de Chat
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
                  <Label htmlFor="name">Nome do Grupo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-gray-800 border-gray-700 text-white"
                    placeholder="Ex: Trade Chat"
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
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum grupo encontrado</p>
            </div>
          ) : (
            groups.map((group) => (
              <Card key={group.id} className="bg-gray-800 border-gray-700">
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
                        <div className="flex items-center gap-4 mt-1">
                          {group.is_public && (
                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                              Público
                            </span>
                          )}
                          {group.is_mobile_visible && (
                            <span className="text-xs bg-[#D2A63C]/20 text-[#D2A63C] px-2 py-0.5 rounded">
                              Mobile
                            </span>
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
                        onClick={() => {
                          setEditingGroup(group)
                          setFormData({
                            name: group.name,
                            description: group.description || "",
                            avatar_url: group.avatar_url || "",
                            is_public: group.is_public,
                            is_mobile_visible: group.is_mobile_visible
                          })
                        }}
                        className="border-gray-700 text-gray-300 hover:bg-gray-700"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteGroup(group.id)}
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
        </div>
      </CardContent>

      {/* Dialog de edição */}
      {editingGroup && (
        <Dialog open={!!editingGroup} onOpenChange={() => setEditingGroup(null)}>
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
                  onClick={() => handleUpdateGroup(editingGroup.id)}
                  className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525]"
                >
                  Guardar
                </Button>
                <Button
                  onClick={() => setEditingGroup(null)}
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

