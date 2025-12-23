"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Plus, 
  Trash2, 
  Save, 
  RefreshCw,
  Edit,
  Eye,
  EyeOff,
  FileText,
  Link as LinkIcon,
  Video,
  Image,
  Upload,
  Search,
  Filter,
  ArrowUpDown
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import type { SiteContent } from "@/lib/admin-types"

type ContentType = 'link' | 'video' | 'file' | 'text' | 'image'
type ContentCategory = 'navbar' | 'footer' | 'landing' | 'education' | 'trading' | 'general'

export default function SiteContentManager() {
  const [contents, setContents] = useState<SiteContent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingContent, setEditingContent] = useState<SiteContent | null>(null)
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<ContentCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadContents()
  }, [])

  const loadContents = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/content')
      const result = await response.json()
      setContents(result.data || [])
    } catch (error) {
      console.error('Erro ao carregar conteúdos:', error)
      toast({
        title: "Erro",
        description: "Erro ao carregar conteúdos",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const saveContent = async () => {
    if (!editingContent) return

    try {
      setSaving(true)
      const url = editingContent.id 
        ? `/api/admin/content/${editingContent.id}`
        : '/api/admin/content'
      
      const method = editingContent.id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingContent)
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: "✅ Sucesso!",
          description: editingContent.id ? "Conteúdo atualizado!" : "Conteúdo criado!",
        })
        setEditingContent(null)
        loadContents()
      } else {
        throw new Error(result.error || 'Erro ao salvar')
      }
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar conteúdo",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteContent = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este conteúdo?')) return

    try {
      const response = await fetch(`/api/admin/content/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        toast({
          title: "✅ Removido!",
          description: "Conteúdo removido com sucesso",
        })
        loadContents()
      } else {
        throw new Error('Erro ao remover')
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao remover conteúdo",
        variant: "destructive"
      })
    }
  }

  const toggleActive = async (content: SiteContent) => {
    try {
      const response = await fetch(`/api/admin/content/${content.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...content, is_active: !content.is_active })
      })

      if (response.ok) {
        loadContents()
      }
    } catch (error) {
      console.error('Erro ao atualizar:', error)
    }
  }

  const addContent = () => {
    setEditingContent({
      id: '',
      type: 'text',
      category: 'general',
      title: '',
      description: '',
      url: '',
      content: '',
      file_url: '',
      file_name: '',
      file_size: 0,
      is_active: true,
      order_index: contents.length,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'admin'
    })
  }

  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4" />
      case 'link': return <LinkIcon className="w-4 h-4" />
      case 'image': return <Image className="w-4 h-4" />
      case 'file': return <Upload className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const getTypeColor = (type: ContentType) => {
    switch (type) {
      case 'video': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'link': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'image': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'file': return 'bg-green-500/20 text-green-400 border-green-500/30'
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const filteredContents = contents.filter(content => {
    if (filterType !== 'all' && content.type !== filterType) return false
    if (filterCategory !== 'all' && content.category !== filterCategory) return false
    if (searchQuery && !content.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !content.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const groupedByCategory = filteredContents.reduce((acc, content) => {
    if (!acc[content.category]) acc[content.category] = []
    acc[content.category].push(content)
    return acc
  }, {} as Record<string, SiteContent[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-mtm-primary" />
        <span className="ml-2">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-mtm-primary">Gestão de Conteúdo do Site</h2>
          <p className="text-gray-400 mt-1">
            Gerencie todo o conteúdo dinâmico do site (links, vídeos, textos, imagens, ficheiros)
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadContents}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recarregar
          </Button>
          <Button
            onClick={addContent}
            className="bg-mtm-primary hover:bg-mtm-primary-dark text-black"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Conteúdo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Total</p>
            <p className="text-2xl font-bold text-mtm-primary">{contents.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Ativos</p>
            <p className="text-2xl font-bold text-green-400">
              {contents.filter(c => c.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Vídeos</p>
            <p className="text-2xl font-bold text-red-400">
              {contents.filter(c => c.type === 'video').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Links</p>
            <p className="text-2xl font-bold text-blue-400">
              {contents.filter(c => c.type === 'link').length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-4">
            <p className="text-gray-400 text-sm">Ficheiros</p>
            <p className="text-2xl font-bold text-green-400">
              {contents.filter(c => c.type === 'file').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-gray-900 border-mtm-primary/30">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Pesquisar por título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
            >
              <option value="all">Todos os Tipos</option>
              <option value="link">Links</option>
              <option value="video">Vídeos</option>
              <option value="text">Textos</option>
              <option value="image">Imagens</option>
              <option value="file">Ficheiros</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
            >
              <option value="all">Todas as Categorias</option>
              <option value="navbar">Navbar</option>
              <option value="footer">Footer</option>
              <option value="landing">Landing</option>
              <option value="education">Educação</option>
              <option value="trading">Trading</option>
              <option value="general">Geral</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Editor Modal */}
      {editingContent && (
        <Card className="bg-gray-900 border-mtm-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{editingContent.id ? 'Editar' : 'Criar'} Conteúdo</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingContent(null)}
              >
                Cancelar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <select
                  value={editingContent.type}
                  onChange={(e) => setEditingContent({ ...editingContent, type: e.target.value as ContentType })}
                  className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                >
                  <option value="link">Link</option>
                  <option value="video">Vídeo</option>
                  <option value="text">Texto</option>
                  <option value="image">Imagem</option>
                  <option value="file">Ficheiro</option>
                </select>
              </div>
              <div>
                <Label>Categoria</Label>
                <select
                  value={editingContent.category}
                  onChange={(e) => setEditingContent({ ...editingContent, category: e.target.value as ContentCategory })}
                  className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                >
                  <option value="navbar">Navbar</option>
                  <option value="footer">Footer</option>
                  <option value="landing">Landing</option>
                  <option value="education">Educação</option>
                  <option value="trading">Trading</option>
                  <option value="general">Geral</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Título *</Label>
              <Input
                value={editingContent.title}
                onChange={(e) => setEditingContent({ ...editingContent, title: e.target.value })}
                placeholder="Título do conteúdo"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={editingContent.description || ''}
                onChange={(e) => setEditingContent({ ...editingContent, description: e.target.value })}
                placeholder="Descrição do conteúdo"
                rows={3}
              />
            </div>
            {(editingContent.type === 'link' || editingContent.type === 'video' || editingContent.type === 'image') && (
              <div>
                <Label>URL</Label>
                <Input
                  value={editingContent.url || ''}
                  onChange={(e) => setEditingContent({ ...editingContent, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}
            {editingContent.type === 'text' && (
              <div>
                <Label>Conteúdo</Label>
                <Textarea
                  value={editingContent.content || ''}
                  onChange={(e) => setEditingContent({ ...editingContent, content: e.target.value })}
                  placeholder="Conteúdo de texto"
                  rows={6}
                />
              </div>
            )}
            {editingContent.type === 'file' && (
              <>
                <div>
                  <Label>URL do Ficheiro</Label>
                  <Input
                    value={editingContent.file_url || ''}
                    onChange={(e) => setEditingContent({ ...editingContent, file_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome do Ficheiro</Label>
                    <Input
                      value={editingContent.file_name || ''}
                      onChange={(e) => setEditingContent({ ...editingContent, file_name: e.target.value })}
                      placeholder="documento.pdf"
                    />
                  </div>
                  <div>
                    <Label>Tamanho (bytes)</Label>
                    <Input
                      type="number"
                      value={editingContent.file_size || 0}
                      onChange={(e) => setEditingContent({ ...editingContent, file_size: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={editingContent.order_index || 0}
                  onChange={(e) => setEditingContent({ ...editingContent, order_index: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center space-x-2 pt-8">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={editingContent.is_active}
                  onChange={(e) => setEditingContent({ ...editingContent, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_active">Ativo</Label>
              </div>
            </div>
            <Button 
              onClick={saveContent} 
              disabled={saving || !editingContent.title}
              className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contents List */}
      <div className="space-y-4">
        {Object.entries(groupedByCategory).map(([category, categoryContents]) => (
          <Card key={category} className="bg-gray-900 border-mtm-primary/30">
            <CardHeader>
              <CardTitle className="capitalize flex items-center gap-2">
                <Filter className="w-5 h-5 text-mtm-primary" />
                {category} ({categoryContents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categoryContents
                  .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                  .map((content) => (
                    <Card key={content.id} className="bg-gray-800 border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getTypeIcon(content.type)}
                              <h3 className="font-semibold text-white">{content.title}</h3>
                              <Badge className={getTypeColor(content.type)}>
                                {content.type}
                              </Badge>
                              {content.is_active ? (
                                <Badge variant="outline" className="text-green-400 border-green-500">
                                  <Eye className="w-3 h-3 mr-1" />
                                  Ativo
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-gray-400 border-gray-500">
                                  <EyeOff className="w-3 h-3 mr-1" />
                                  Inativo
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                Ordem: {content.order_index || 0}
                              </Badge>
                            </div>
                            {content.description && (
                              <p className="text-sm text-gray-400 mb-2">{content.description}</p>
                            )}
                            {content.url && (
                              <p className="text-xs text-blue-400 break-all">{content.url}</p>
                            )}
                            {content.file_name && (
                              <p className="text-xs text-gray-400">
                                📄 {content.file_name} ({(content.file_size || 0) / 1024} KB)
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActive(content)}
                            >
                              {content.is_active ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingContent(content)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteContent(content.id)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredContents.length === 0 && (
          <Card className="bg-gray-900 border-mtm-primary/30">
            <CardContent className="p-8 text-center">
              <p className="text-gray-400">Nenhum conteúdo encontrado</p>
              <Button
                onClick={addContent}
                className="mt-4 bg-mtm-primary hover:bg-mtm-primary-dark text-black"
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Conteúdo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}


