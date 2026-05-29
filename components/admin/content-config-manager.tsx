"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  Video, 
  Link as LinkIcon, 
  Plus, 
  Trash2, 
  Save, 
  RefreshCw,
  Edit,
  ExternalLink,
  Youtube,
  MessageCircle,
  Calendar,
  FileText,
  BookOpen,
  Image as ImageIcon
} from "lucide-react"
import { Separator as UISeparator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import type { ContentConfig, VideoConfig, ExternalLinkConfig, ImageConfig } from "@/lib/content-config"

export default function ContentConfigManager() {
  const [config, setConfig] = useState<ContentConfig>({ videos: [], links: [], images: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingVideo, setEditingVideo] = useState<VideoConfig | null>(null)
  const [editingLink, setEditingLink] = useState<ExternalLinkConfig | null>(null)
  const [editingImage, setEditingImage] = useState<ImageConfig | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/content-config', {
        credentials: 'include'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Validar estrutura dos dados
      if (data && typeof data === 'object') {
        setConfig({
          videos: Array.isArray(data.videos) ? data.videos : [],
          links: Array.isArray(data.links) ? data.links : [],
          images: Array.isArray(data.images) ? data.images : []
        })
      } else {
        throw new Error('Resposta inválida da API')
      }
    } catch (error: any) {
      console.error('❌ [CONTENT_CONFIG] Erro ao carregar configuração:', error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar configuração de conteúdo",
        variant: "destructive"
      })
      // Usar configuração padrão em caso de erro
      setConfig({ videos: [], links: [], images: [] })
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      
      // Validar estrutura antes de enviar
      if (!config || typeof config !== 'object') {
        throw new Error('Configuração inválida')
      }
      
      const response = await fetch('/api/admin/content-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          videos: Array.isArray(config.videos) ? config.videos : [],
          links: Array.isArray(config.links) ? config.links : [],
          images: Array.isArray(config.images) ? config.images : []
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        toast({
          title: "✅ Sucesso!",
          description: result.message || "Configuração de conteúdo salva com sucesso!",
        })
        // Recarregar para garantir sincronização
        await loadConfig()
      } else {
        throw new Error(result.error || 'Erro ao salvar configuração')
      }
    } catch (error: any) {
      console.error('❌ [CONTENT_CONFIG] Erro ao salvar:', error)
      toast({
        title: "Erro",
        description: error.message || "Erro ao salvar configuração",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const addVideo = () => {
    const newVideo: VideoConfig = {
      id: `video-${Date.now()}`,
      title: 'Novo Vídeo',
      videoId: '',
      page: '',
      section: '',
      autoplay: false
    }
    setEditingVideo(newVideo)
  }

  const saveVideo = () => {
    if (!editingVideo) return
    
    const existingIndex = config.videos.findIndex(v => v.id === editingVideo.id)
    
    if (existingIndex >= 0) {
      // Atualizar existente
      const updatedVideos = [...config.videos]
      updatedVideos[existingIndex] = editingVideo
      setConfig({ ...config, videos: updatedVideos })
    } else {
      // Adicionar novo
      setConfig({ ...config, videos: [...config.videos, editingVideo] })
    }
    
    setEditingVideo(null)
    toast({
      title: "Vídeo salvo",
      description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
    })
  }

  const deleteVideo = (id: string) => {
    if (confirm('Tem certeza que deseja remover este vídeo?')) {
      setConfig({
        ...config,
        videos: config.videos.filter(v => v.id !== id)
      })
      toast({
        title: "Vídeo removido",
        description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
      })
    }
  }

  const addLink = () => {
    const newLink: ExternalLinkConfig = {
      id: `link-${Date.now()}`,
      title: 'Novo Link',
      url: '',
      type: 'other',
      page: '',
      section: ''
    }
    setEditingLink(newLink)
  }

  const saveLink = () => {
    if (!editingLink) return
    
    const existingIndex = config.links.findIndex(l => l.id === editingLink.id)
    
    if (existingIndex >= 0) {
      // Atualizar existente
      const updatedLinks = [...config.links]
      updatedLinks[existingIndex] = editingLink
      setConfig({ ...config, links: updatedLinks })
    } else {
      // Adicionar novo
      setConfig({ ...config, links: [...config.links, editingLink] })
    }
    
    setEditingLink(null)
    toast({
      title: "Link salvo",
      description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
    })
  }

  const deleteLink = (id: string) => {
    if (confirm('Tem certeza que deseja remover este link?')) {
      setConfig({
        ...config,
        links: config.links.filter(l => l.id !== id)
      })
      toast({
        title: "Link removido",
        description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
      })
    }
  }

  const getLinkIcon = (type: ExternalLinkConfig['type']) => {
    switch (type) {
      case 'whatsapp': return <MessageCircle className="w-4 h-4" />
      case 'calendly': return <Calendar className="w-4 h-4" />
      case 'drive': return <FileText className="w-4 h-4" />
      case 'notion': return <BookOpen className="w-4 h-4" />
      case 'skool': return <BookOpen className="w-4 h-4" />
      default: return <ExternalLink className="w-4 h-4" />
    }
  }

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
          <h2 className="text-2xl font-bold text-mtm-primary">Gestão de Conteúdo</h2>
          <p className="text-gray-400 mt-1">
            Gerencie todos os vídeos e links externos do site
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadConfig}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recarregar
          </Button>
          <Button
            onClick={saveConfig}
            disabled={saving}
            className="bg-mtm-primary hover:bg-mtm-primary-dark text-black"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Tudo'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Vídeos Configurados</p>
                <p className="text-3xl font-bold text-mtm-primary">{config.videos.length}</p>
              </div>
              <Youtube className="w-12 h-12 text-mtm-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-mtm-primary/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Links Externos</p>
                <p className="text-3xl font-bold text-mtm-primary">{config.links.length}</p>
              </div>
              <LinkIcon className="w-12 h-12 text-mtm-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="videos" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="videos">
            <Video className="w-4 h-4 mr-2" />
            Vídeos ({config.videos?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="links">
            <LinkIcon className="w-4 h-4 mr-2" />
            Links ({config.links?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="w-4 h-4 mr-2" />
            Imagens ({config.images?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* VÍDEOS TAB */}
        <TabsContent value="videos" className="space-y-4">
          <Button onClick={addVideo} className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Novo Vídeo
          </Button>

          {/* Video Editor Modal */}
          {editingVideo && (
            <Card className="bg-gray-900 border-mtm-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Editar Vídeo</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingVideo(null)}
                  >
                    Cancelar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Informações do Vídeo */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações do Vídeo</h3>
                  </div>
                  
                  <div>
                    <Label>Título do Vídeo *</Label>
                    <Input
                      value={editingVideo.title}
                      onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                      placeholder="Ex: Apresentação IQONIC"
                    />
                  </div>
                  
                  <div>
                    <Label>Subtítulo do Vídeo (opcional)</Label>
                    <Input
                      value={editingVideo.subtitle || ''}
                      onChange={(e) => setEditingVideo({ ...editingVideo, subtitle: e.target.value })}
                      placeholder="Ex: Descobre como transformar a tua vida financeira"
                    />
                  </div>
                  
                  <div>
                    <Label>Descrição do Vídeo (opcional)</Label>
                    <Textarea
                      value={editingVideo.description || ''}
                      onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                      placeholder="Descrição detalhada do vídeo..."
                      rows={3}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Video ID do YouTube *</Label>
                      <Input
                        value={editingVideo.videoId}
                        onChange={(e) => setEditingVideo({ ...editingVideo, videoId: e.target.value })}
                        placeholder="Ex: RQIimjljeMI"
                      />
                      <p className="text-xs text-gray-400 mt-1">ID do vídeo do YouTube</p>
                    </div>
                    <div>
                      <Label>Playlist ID (opcional)</Label>
                      <Input
                        value={editingVideo.playlist || ''}
                        onChange={(e) => setEditingVideo({ ...editingVideo, playlist: e.target.value })}
                        placeholder="Ex: PL6XU0y2YUMZK..."
                      />
                      <p className="text-xs text-gray-400 mt-1">ID da playlist do YouTube</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="autoplay"
                      checked={editingVideo.autoplay || false}
                      onChange={(e) => setEditingVideo({ ...editingVideo, autoplay: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="autoplay">Reproduzir automaticamente</Label>
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                {/* Informações da Secção */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações da Secção</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Página *</Label>
                      <Input
                        value={editingVideo.page}
                        onChange={(e) => setEditingVideo({ ...editingVideo, page: e.target.value })}
                        placeholder="Ex: /iqonic"
                      />
                      <p className="text-xs text-gray-400 mt-1">Rota da página onde o vídeo aparece</p>
                    </div>
                    <div>
                      <Label>Nome da Secção *</Label>
                      <Input
                        value={editingVideo.section}
                        onChange={(e) => setEditingVideo({ ...editingVideo, section: e.target.value })}
                        placeholder="Ex: Hero"
                      />
                      <p className="text-xs text-gray-400 mt-1">Identificador da secção na página</p>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Título da Secção (opcional)</Label>
                    <Input
                      value={editingVideo.sectionTitle || ''}
                      onChange={(e) => setEditingVideo({ ...editingVideo, sectionTitle: e.target.value })}
                      placeholder="Ex: Bem-vindo à IQONIC"
                    />
                    <p className="text-xs text-gray-400 mt-1">Título exibido na secção onde o vídeo aparece</p>
                  </div>
                  
                  <div>
                    <Label>Subtítulo da Secção (opcional)</Label>
                    <Input
                      value={editingVideo.sectionSubtitle || ''}
                      onChange={(e) => setEditingVideo({ ...editingVideo, sectionSubtitle: e.target.value })}
                      placeholder="Ex: A tua porta para o sucesso global"
                    />
                    <p className="text-xs text-gray-400 mt-1">Subtítulo exibido na secção</p>
                  </div>
                  
                  <div>
                    <Label>Descrição da Secção (opcional)</Label>
                    <Textarea
                      value={editingVideo.sectionDescription || ''}
                      onChange={(e) => setEditingVideo({ ...editingVideo, sectionDescription: e.target.value })}
                      placeholder="Descrição da secção onde o vídeo aparece..."
                      rows={3}
                    />
                    <p className="text-xs text-gray-400 mt-1">Texto descritivo da secção</p>
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                <Button 
                  onClick={saveVideo} 
                  disabled={!editingVideo.title || !editingVideo.videoId || !editingVideo.page || !editingVideo.section}
                  className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Vídeo
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Videos List */}
          <div className="space-y-2">
            {config.videos.map((video) => (
              <Card key={video.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Youtube className="w-5 h-5 text-red-500" />
                        <h3 className="font-semibold text-white">{video.title}</h3>
                        {video.autoplay && (
                          <Badge variant="outline" className="text-xs">Autoplay</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p><strong>Video ID:</strong> {video.videoId}</p>
                        {video.playlist && <p><strong>Playlist:</strong> {video.playlist}</p>}
                        {video.subtitle && <p><strong>Subtítulo:</strong> {video.subtitle}</p>}
                        {video.description && <p><strong>Descrição:</strong> {video.description.substring(0, 100)}{video.description.length > 100 ? '...' : ''}</p>}
                        <p><strong>Página:</strong> {video.page} → {video.section}</p>
                        {video.sectionTitle && <p><strong>Título da Secção:</strong> {video.sectionTitle}</p>}
                        {video.sectionSubtitle && <p><strong>Subtítulo da Secção:</strong> {video.sectionSubtitle}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingVideo(video)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteVideo(video.id)}
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
        </TabsContent>

        {/* LINKS TAB */}
        <TabsContent value="links" className="space-y-4">
          <Button onClick={addLink} className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Novo Link
          </Button>

          {/* Link Editor Modal */}
          {editingLink && (
            <Card className="bg-gray-900 border-mtm-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Editar Link</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingLink(null)}
                  >
                    Cancelar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Informações do Link */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações do Link</h3>
                  </div>
                  
                  <div>
                    <Label>Título do Link *</Label>
                    <Input
                      value={editingLink.title}
                      onChange={(e) => setEditingLink({ ...editingLink, title: e.target.value })}
                      placeholder="Ex: WhatsApp IQONIC"
                    />
                  </div>
                  
                  <div>
                    <Label>Subtítulo do Link (opcional)</Label>
                    <Input
                      value={editingLink.subtitle || ''}
                      onChange={(e) => setEditingLink({ ...editingLink, subtitle: e.target.value })}
                      placeholder="Ex: Contacta-nos diretamente"
                    />
                  </div>
                  
                  <div>
                    <Label>URL *</Label>
                    <Input
                      value={editingLink.url}
                      onChange={(e) => setEditingLink({ ...editingLink, url: e.target.value })}
                      placeholder="https://..."
                    />
                    <p className="text-xs text-gray-400 mt-1">URL completa do link</p>
                  </div>
                  
                  <div>
                    <Label>Tipo *</Label>
                    <select
                      value={editingLink.type}
                      onChange={(e) => setEditingLink({ ...editingLink, type: e.target.value as any })}
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded-md text-white"
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="calendly">Calendly</option>
                      <option value="website">Website</option>
                      <option value="drive">Google Drive</option>
                      <option value="notion">Notion</option>
                      <option value="skool">Skool</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  
                  <div>
                    <Label>Descrição do Link (opcional)</Label>
                    <Textarea
                      value={editingLink.description || ''}
                      onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                      placeholder="Breve descrição do link..."
                      rows={3}
                    />
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                {/* Informações da Secção */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações da Secção</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Página *</Label>
                      <Input
                        value={editingLink.page}
                        onChange={(e) => setEditingLink({ ...editingLink, page: e.target.value })}
                        placeholder="Ex: /iqonic"
                      />
                      <p className="text-xs text-gray-400 mt-1">Rota da página onde o link aparece</p>
                    </div>
                    <div>
                      <Label>Nome da Secção *</Label>
                      <Input
                        value={editingLink.section}
                        onChange={(e) => setEditingLink({ ...editingLink, section: e.target.value })}
                        placeholder="Ex: Primary CTA"
                      />
                      <p className="text-xs text-gray-400 mt-1">Identificador da secção na página</p>
                    </div>
                  </div>
                  
                  <div>
                    <Label>Título da Secção (opcional)</Label>
                    <Input
                      value={editingLink.sectionTitle || ''}
                      onChange={(e) => setEditingLink({ ...editingLink, sectionTitle: e.target.value })}
                      placeholder="Ex: Contacta-nos Agora"
                    />
                    <p className="text-xs text-gray-400 mt-1">Título exibido na secção onde o link aparece</p>
                  </div>
                  
                  <div>
                    <Label>Subtítulo da Secção (opcional)</Label>
                    <Input
                      value={editingLink.sectionSubtitle || ''}
                      onChange={(e) => setEditingLink({ ...editingLink, sectionSubtitle: e.target.value })}
                      placeholder="Ex: Estamos aqui para ajudar"
                    />
                    <p className="text-xs text-gray-400 mt-1">Subtítulo exibido na secção</p>
                  </div>
                  
                  <div>
                    <Label>Descrição da Secção (opcional)</Label>
                    <Textarea
                      value={editingLink.sectionDescription || ''}
                      onChange={(e) => setEditingLink({ ...editingLink, sectionDescription: e.target.value })}
                      placeholder="Descrição da secção onde o link aparece..."
                      rows={3}
                    />
                    <p className="text-xs text-gray-400 mt-1">Texto descritivo da secção</p>
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                <Button 
                  onClick={saveLink} 
                  disabled={!editingLink.title || !editingLink.url || !editingLink.page || !editingLink.section}
                  className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Link
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Links List */}
          <div className="space-y-2">
            {config.links.map((link) => (
              <Card key={link.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getLinkIcon(link.type)}
                        <h3 className="font-semibold text-white">{link.title}</h3>
                        <Badge variant="outline" className="text-xs">{link.type}</Badge>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p className="break-all"><strong>URL:</strong> {link.url}</p>
                        {link.subtitle && <p><strong>Subtítulo:</strong> {link.subtitle}</p>}
                        {link.description && <p><strong>Descrição:</strong> {link.description}</p>}
                        <p><strong>Página:</strong> {link.page} → {link.section}</p>
                        {link.sectionTitle && <p><strong>Título da Secção:</strong> {link.sectionTitle}</p>}
                        {link.sectionSubtitle && <p><strong>Subtítulo da Secção:</strong> {link.sectionSubtitle}</p>}
                        {link.sectionDescription && <p><strong>Descrição da Secção:</strong> {link.sectionDescription.substring(0, 100)}{link.sectionDescription.length > 100 ? '...' : ''}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingLink(link)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteLink(link.id)}
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
        </TabsContent>

        {/* IMAGENS TAB */}
        <TabsContent value="images" className="space-y-4">
          <Button onClick={() => {
            const newImage: ImageConfig = {
              id: `image-${Date.now()}`,
              title: 'Nova Imagem',
              url: '',
              alt: '',
              page: '',
              section: ''
            }
            setEditingImage(newImage)
          }} className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Nova Imagem
          </Button>

          {/* Image Editor Modal */}
          {editingImage && (
            <Card className="bg-gray-900 border-mtm-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Editar Imagem</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingImage(null)}
                  >
                    Cancelar
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações da Imagem</h3>
                  </div>
                  
                  <div>
                    <Label>Título da Imagem *</Label>
                    <Input
                      value={editingImage.title}
                      onChange={(e) => setEditingImage({ ...editingImage, title: e.target.value })}
                      placeholder="Ex: O Problema"
                    />
                  </div>
                  
                  <div>
                    <Label>URL da Imagem *</Label>
                    <Input
                      value={editingImage.url}
                      onChange={(e) => setEditingImage({ ...editingImage, url: e.target.value })}
                      placeholder="Ex: /mtm/Problema.png"
                    />
                    <p className="text-xs text-gray-400 mt-1">Caminho relativo ou URL completa</p>
                  </div>
                  
                  <div>
                    <Label>Texto Alternativo (Alt) *</Label>
                    <Input
                      value={editingImage.alt}
                      onChange={(e) => setEditingImage({ ...editingImage, alt: e.target.value })}
                      placeholder="Ex: O Problema"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Largura (opcional)</Label>
                      <Input
                        type="number"
                        value={editingImage.width || ''}
                        onChange={(e) => setEditingImage({ ...editingImage, width: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Ex: 1200"
                      />
                    </div>
                    <div>
                      <Label>Altura (opcional)</Label>
                      <Input
                        type="number"
                        value={editingImage.height || ''}
                        onChange={(e) => setEditingImage({ ...editingImage, height: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="Ex: 600"
                      />
                    </div>
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-mtm-primary" />
                    <h3 className="text-lg font-semibold text-mtm-primary">Informações da Secção</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Página *</Label>
                      <Input
                        value={editingImage.page}
                        onChange={(e) => setEditingImage({ ...editingImage, page: e.target.value })}
                        placeholder="Ex: /mtm"
                      />
                    </div>
                    <div>
                      <Label>Nome da Secção *</Label>
                      <Input
                        value={editingImage.section}
                        onChange={(e) => setEditingImage({ ...editingImage, section: e.target.value })}
                        placeholder="Ex: O Diagnóstico"
                      />
                    </div>
                  </div>
                </div>

                <UISeparator className="bg-mtm-primary/30" />

                <Button 
                  onClick={() => {
                    if (!editingImage.title || !editingImage.url || !editingImage.alt || !editingImage.page || !editingImage.section) {
                      toast({
                        title: "Erro",
                        description: "Preencha todos os campos obrigatórios",
                        variant: "destructive"
                      })
                      return
                    }
                    
                    const existingIndex = (config.images || []).findIndex((img: ImageConfig) => img.id === editingImage.id)
                    
                    if (existingIndex >= 0) {
                      const updatedImages = [...(config.images || [])]
                      updatedImages[existingIndex] = editingImage
                      setConfig({ ...config, images: updatedImages })
                    } else {
                      setConfig({ ...config, images: [...(config.images || []), editingImage] })
                    }
                    
                    setEditingImage(null)
                    toast({
                      title: "Imagem salva",
                      description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
                    })
                  }}
                  className="w-full bg-mtm-primary hover:bg-mtm-primary-dark text-black"
                >
                  Salvar Imagem
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Images List */}
          <div className="space-y-4">
            {(config.images || []).map((image: ImageConfig) => (
              <Card key={image.id} className="bg-gray-900 border-mtm-primary/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon className="w-5 h-5 text-mtm-primary" />
                        <h3 className="font-semibold text-white">{image.title}</h3>
                        <Badge variant="outline" className="text-xs">
                          {image.page}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {image.section}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400 mb-1">URL: {image.url}</p>
                      <p className="text-sm text-gray-400">Alt: {image.alt}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingImage(image)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja remover esta imagem?')) {
                            setConfig({
                              ...config,
                              images: (config.images || []).filter((img: ImageConfig) => img.id !== image.id)
                            })
                            toast({
                              title: "Imagem removida",
                              description: "Clique em 'Salvar Tudo' para aplicar as mudanças",
                            })
                          }
                        }}
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
        </TabsContent>
      </Tabs>
    </div>
  )
}

