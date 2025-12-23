"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  Archive,
  Eye,
  Download,
  Link as LinkIcon,
  Loader2,
  Lock,
  Unlock,
  ArchiveRestore
} from "lucide-react"

interface Document {
  id: string
  title: string
  description: string | null
  file_url: string
  file_type: string
  category: string
  uploaded_by: string
  uploader_name: string
  is_archived: boolean
  is_public: boolean
  views_count: number
  downloads_count: number
  tags: string[]
  created_at: string
}

const CATEGORIES = [
  { value: 'cripto', label: 'Criptomoedas', icon: '💎' },
  { value: 'trading', label: 'Trading', icon: '📈' },
  { value: 'estrategia', label: 'Estratégias', icon: '🎯' },
  { value: 'educacao', label: 'Educação', icon: '🎓' },
  { value: 'analise', label: 'Análises', icon: '📊' },
  { value: 'ferramentas', label: 'Ferramentas', icon: '🔧' },
  { value: 'outros', label: 'Outros', icon: '📁' },
]

const FILE_TYPES = [
  { value: 'pdf', label: 'PDF', icon: '📄' },
  { value: 'doc', label: 'Word', icon: '📝' },
  { value: 'xls', label: 'Excel', icon: '📊' },
  { value: 'video', label: 'Vídeo', icon: '🎥' },
  { value: 'link', label: 'Link Externo', icon: '🔗' },
  { value: 'image', label: 'Imagem', icon: '🖼️' },
]

export default function DocumentsManager() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [includeArchived, setIncludeArchived] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    file_url: '',
    file_type: 'pdf',
    category: 'educacao',
    tags: '',
    is_public: true
  })

  useEffect(() => {
    loadCurrentUser()
    loadDocuments()
  }, [includeArchived])

  const loadCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        setCurrentUser(profile)
      }
    } catch (error) {
      console.error('❌ [DOCS ADMIN] Erro ao carregar usuário:', error)
    }
  }

  const loadDocuments = async () => {
    try {
      setLoading(true)
      console.log('📚 [DOCS ADMIN] Carregando documentos...')

      const url = `/api/documents?includeArchived=${includeArchived}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        console.log(`✅ [DOCS ADMIN] ${data.documents.length} documentos carregados`)
        setDocuments(data.documents)
      }
    } catch (error) {
      console.error('❌ [DOCS ADMIN] Erro ao carregar:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      setSaving(true)

      if (!formData.title || !formData.file_url) {
        alert('❌ Preencha título e URL do ficheiro')
        return
      }

      if (!currentUser?.id) {
        alert('❌ Usuário não identificado')
        return
      }

      const payload = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        uploaded_by: currentUser.id,
        uploader_name: currentUser.full_name || currentUser.username || 'Educador MTM'
      }

      let response

      if (editingDoc) {
        // Atualizar documento existente
        response = await fetch('/api/documents', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingDoc.id,
            ...payload
          })
        })
      } else {
        // Criar novo documento
        response = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      }

      const data = await response.json()

      if (data.success) {
        alert(editingDoc ? '✅ Documento atualizado!' : '✅ Documento criado!')
        setShowDialog(false)
        resetForm()
        loadDocuments()
      } else {
        alert(`❌ Erro: ${data.error}`)
      }

    } catch (error) {
      console.error('❌ [DOCS ADMIN] Erro ao salvar:', error)
      alert('❌ Erro ao salvar documento')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (doc: Document) => {
    setEditingDoc(doc)
    setFormData({
      title: doc.title,
      description: doc.description || '',
      file_url: doc.file_url,
      file_type: doc.file_type,
      category: doc.category,
      tags: doc.tags?.join(', ') || '',
      is_public: doc.is_public
    })
    setShowDialog(true)
  }

  const handleArchive = async (doc: Document) => {
    if (!confirm(`${doc.is_archived ? 'Restaurar' : 'Arquivar'} este documento?`)) return

    try {
      const response = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: doc.id,
          is_archived: !doc.is_archived
        })
      })

      const data = await response.json()

      if (data.success) {
        alert(doc.is_archived ? '✅ Documento restaurado!' : '✅ Documento arquivado!')
        loadDocuments()
      } else {
        alert(`❌ Erro: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ [DOCS ADMIN] Erro ao arquivar:', error)
      alert('❌ Erro ao processar')
    }
  }

  const handleDelete = async (doc: Document) => {
    if (!confirm(`⚠️ DELETAR permanentemente "${doc.title}"?\n\nEsta ação não pode ser desfeita!`)) return

    try {
      const response = await fetch(`/api/documents?id=${doc.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        alert('✅ Documento deletado!')
        loadDocuments()
      } else {
        alert(`❌ Erro: ${data.error}`)
      }
    } catch (error) {
      console.error('❌ [DOCS ADMIN] Erro ao deletar:', error)
      alert('❌ Erro ao deletar')
    }
  }

  const resetForm = () => {
    setEditingDoc(null)
    setFormData({
      title: '',
      description: '',
      file_url: '',
      file_type: 'pdf',
      category: 'educacao',
      tags: '',
      is_public: true
    })
  }

  const handleDialogClose = (open: boolean) => {
    setShowDialog(open)
    if (!open) {
      resetForm()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header com Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#D2A63C] flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Gestão de Documentos
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Gerenciar biblioteca de recursos educacionais
          </p>
        </div>
        <Dialog open={showDialog} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold">
              <Plus className="h-4 w-4 mr-2" />
              Novo Documento
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#D2A63C] text-xl">
                {editingDoc ? '✏️ Editar Documento' : '➕ Novo Documento'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Título */}
              <div>
                <Label className="text-white">Título *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Ex: Guia Completo de Bitcoin"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-white">Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Breve descrição do conteúdo..."
                  className="bg-gray-800 border-gray-700 text-white mt-1 resize-none h-20"
                />
              </div>

              {/* URL do Ficheiro */}
              <div>
                <Label className="text-white">URL do Ficheiro *</Label>
                <Input
                  value={formData.file_url}
                  onChange={(e) => setFormData({...formData, file_url: e.target.value})}
                  placeholder="https://drive.google.com/file/d/..."
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Google Drive, Dropbox, YouTube, ou qualquer link direto
                </p>
              </div>

              {/* Tipo e Categoria */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-white">Tipo de Ficheiro</Label>
                  <Select value={formData.file_type} onValueChange={(value) => setFormData({...formData, file_type: value})}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      {FILE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white">Categoria</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.icon} {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label className="text-white">Tags (separadas por vírgula)</Label>
                <Input
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  placeholder="bitcoin, trading, estrategia, iniciantes"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Ajuda na busca e organização
                </p>
              </div>

              {/* Visibilidade */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  {formData.is_public ? (
                    <Unlock className="h-5 w-5 text-green-400" />
                  ) : (
                    <Lock className="h-5 w-5 text-purple-400" />
                  )}
                  <div>
                    <Label className="text-white cursor-pointer">
                      {formData.is_public ? '🌐 Documento Público' : '🔒 Documento Reservado'}
                    </Label>
                    <p className="text-xs text-gray-400">
                      {formData.is_public 
                        ? 'Todos os membros podem ver' 
                        : 'Apenas VIPs e Admins podem ver'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(checked) => setFormData({...formData, is_public: checked})}
                />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  {editingDoc ? 'Atualizar' : 'Criar'} Documento
                </Button>
                <Button
                  onClick={() => handleDialogClose(false)}
                  variant="outline"
                  className="border-gray-700 text-white hover:bg-gray-800"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#D2A63C]/20 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-[#D2A63C]" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {documents.filter(d => !d.is_archived).length}
                </p>
                <p className="text-xs text-gray-400">Documentos Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <Unlock className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {documents.filter(d => d.is_public && !d.is_archived).length}
                </p>
                <p className="text-xs text-gray-400">Públicos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <Lock className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {documents.filter(d => !d.is_public && !d.is_archived).length}
                </p>
                <p className="text-xs text-gray-400">Reservados VIP</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
                <Archive className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {documents.filter(d => d.is_archived).length}
                </p>
                <p className="text-xs text-gray-400">Arquivados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toggle Arquivados */}
      <div className="flex items-center gap-2">
        <Switch
          checked={includeArchived}
          onCheckedChange={setIncludeArchived}
        />
        <Label className="text-gray-400 cursor-pointer text-sm">
          Mostrar documentos arquivados
        </Label>
      </div>

      {/* Lista de Documentos */}
      <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Documentos ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                    doc.is_archived 
                      ? 'bg-gray-800/30 border-gray-700/50 opacity-60' 
                      : 'bg-gray-800/50 border-gray-700 hover:border-[#D2A63C]/50 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{FILE_TYPES.find(t => t.value === doc.file_type)?.icon || '📄'}</span>
                      <div>
                        <h3 className="font-bold text-white flex items-center gap-2">
                          {doc.title}
                          {!doc.is_public && (
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50 text-[10px]">
                              <Lock className="h-2.5 w-2.5 mr-1" />
                              VIP
                            </Badge>
                          )}
                          {doc.is_archived && (
                            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/50 text-[10px]">
                              <Archive className="h-2.5 w-2.5 mr-1" />
                              Arquivado
                            </Badge>
                          )}
                        </h3>
                        <p className="text-xs text-gray-400">
                          {CATEGORIES.find(c => c.value === doc.category)?.icon} {doc.category} • Por {doc.uploader_name}
                        </p>
                      </div>
                    </div>
                    
                    {doc.description && (
                      <p className="text-sm text-gray-400 ml-11 mb-2 line-clamp-1">
                        {doc.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 ml-11 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {doc.views_count || 0} views
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {doc.downloads_count || 0} downloads
                      </span>
                      <span>
                        {new Date(doc.created_at).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleEdit(doc)}
                      size="sm"
                      variant="outline"
                      className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      onClick={() => handleArchive(doc)}
                      size="sm"
                      variant="outline"
                      className={`border-gray-500/30 text-gray-400 hover:bg-gray-500/20`}
                    >
                      {doc.is_archived ? (
                        <ArchiveRestore className="h-3 w-3" />
                      ) : (
                        <Archive className="h-3 w-3" />
                      )}
                    </Button>
                    {currentUser?.user_type === 'admin' && (
                      <Button
                        onClick={() => handleDelete(doc)}
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

