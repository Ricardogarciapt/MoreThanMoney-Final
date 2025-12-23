"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import ProtectedPage from "@/components/protected-page"
import { supabase } from "@/lib/supabase"
import {
  FileText,
  Download,
  Eye,
  Search,
  Filter,
  Calendar,
  User,
  Link as LinkIcon,
  Archive,
  Lock,
  Unlock,
  Loader2
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  updated_at: string
  profiles?: {
    full_name: string
    username: string
    user_type: string
  }
}

const CATEGORIES = [
  { value: 'all', label: 'Todas as Categorias', icon: '📚' },
  { value: 'cripto', label: 'Criptomoedas', icon: '💎' },
  { value: 'trading', label: 'Trading', icon: '📈' },
  { value: 'estrategia', label: 'Estratégias', icon: '🎯' },
  { value: 'educacao', label: 'Educação', icon: '🎓' },
  { value: 'analise', label: 'Análises', icon: '📊' },
  { value: 'ferramentas', label: 'Ferramentas', icon: '🔧' },
  { value: 'outros', label: 'Outros', icon: '📁' },
]

const FILE_TYPE_ICONS: Record<string, string> = {
  'pdf': '📄',
  'doc': '📝',
  'docx': '📝',
  'xls': '📊',
  'xlsx': '📊',
  'ppt': '📽️',
  'pptx': '📽️',
  'video': '🎥',
  'mp4': '🎥',
  'image': '🖼️',
  'link': '🔗',
}

export default function DocsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [userType, setUserType] = useState<string | null>(null)

  useEffect(() => {
    loadUserType()
    loadDocuments()
  }, [])

  useEffect(() => {
    filterDocuments()
  }, [documents, searchTerm, selectedCategory])

  const loadUserType = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', session.user.id)
          .single()

        setUserType(profile?.user_type || null)
      }
    } catch (error) {
      console.error('❌ [DOCS] Erro ao carregar user type:', error)
    }
  }

  const loadDocuments = async () => {
    try {
      setLoading(true)
      console.log('📚 [DOCS] Carregando documentos...')

      const response = await fetch('/api/documents')
      const data = await response.json()

      if (data.success) {
        console.log(`✅ [DOCS] ${data.documents.length} documentos carregados`)
        setDocuments(data.documents)
      } else {
        console.error('❌ [DOCS] Erro na resposta:', data)
      }
    } catch (error) {
      console.error('❌ [DOCS] Erro ao carregar:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterDocuments = () => {
    let filtered = documents

    // Filtro por categoria
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(doc => doc.category === selectedCategory)
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(doc => 
        doc.title.toLowerCase().includes(term) ||
        doc.description?.toLowerCase().includes(term) ||
        doc.tags?.some(tag => tag.toLowerCase().includes(term)) ||
        doc.uploader_name?.toLowerCase().includes(term)
      )
    }

    setFilteredDocuments(filtered)
  }

  const handleView = async (doc: Document) => {
    try {
      // Incrementar contador de visualizações
      await fetch('/api/documents/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id })
      })

      // Abrir documento
      window.open(doc.file_url, '_blank')
    } catch (error) {
      console.error('❌ [DOCS] Erro ao abrir:', error)
    }
  }

  const handleDownload = async (doc: Document) => {
    try {
      // Incrementar contador de downloads
      await fetch('/api/documents/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id })
      })

      // Abrir em nova aba (força download em alguns browsers)
      window.open(doc.file_url, '_blank')
    } catch (error) {
      console.error('❌ [DOCS] Erro ao baixar:', error)
    }
  }

  const getFileIcon = (fileType: string) => {
    return FILE_TYPE_ICONS[fileType] || '📄'
  }

  const getCategoryIcon = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.icon || '📁'
  }

  if (loading) {
    return (
      <ProtectedPage redirectPath="/login?redirect=/docs" loadingMessage="A carregar documentos...">
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#D2A63C] mx-auto mb-4" />
            <p className="text-gray-400">A carregar biblioteca de documentos...</p>
          </div>
        </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage redirectPath="/login?redirect=/docs" loadingMessage="A carregar documentos...">
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white pb-20">
        {/* Animated Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#D2A63C]/30 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#BB8525]/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <div className="container mx-auto px-4 py-8 relative z-10">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-12 bg-gradient-to-b from-[#D2A63C] to-[#BB8525]"></div>
              <div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                  <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                    BIBLIOTECA DE DOCUMENTOS
                  </span>
                </h1>
                <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
                  <FileText className="h-3 w-3 text-[#D2A63C]" />
                  Recursos educacionais dos nossos educadores
                </p>
              </div>
            </div>

            {/* Filtros e Busca */}
            <div className="flex flex-col md:flex-row gap-4 mt-6">
              {/* Busca */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Pesquisar documentos, tags, educador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-900/50 border-[#D2A63C]/30 text-white placeholder:text-gray-500"
                />
              </div>

              {/* Filtro de Categoria */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-64 bg-gray-900/50 border-[#D2A63C]/30 text-white">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-[#D2A63C]/30 text-white">
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value} className="hover:bg-[#D2A63C]/20">
                      {cat.icon} {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Estatísticas */}
            <div className="flex items-center gap-4 text-xs mt-4 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#D2A63C]/10 border border-[#D2A63C]/30 rounded-full">
                <FileText className="h-3 w-3 text-[#D2A63C]" />
                <span className="text-gray-400">{filteredDocuments.length} documentos</span>
              </div>
              {userType && ['admin', 'vip'].includes(userType) && (
                <Badge className="bg-[#D2A63C]/20 text-[#D2A63C] border-[#D2A63C]/50">
                  🌟 Acesso VIP
                </Badge>
              )}
            </div>
          </div>

          {/* Grid de Documentos */}
          {filteredDocuments.length === 0 ? (
            <Card className="bg-gray-900/50 border-[#D2A63C]/30">
              <CardContent className="p-12 text-center">
                <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">Nenhum documento encontrado</p>
                {searchTerm && (
                  <p className="text-sm text-gray-500">
                    Tenta ajustar os filtros de busca
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDocuments.map((doc) => (
                <Card 
                  key={doc.id} 
                  className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm hover:border-[#D2A63C]/60 transition-all group relative overflow-hidden"
                >
                  {/* Badge Reservado */}
                  {!doc.is_public && (
                    <div className="absolute top-4 right-4 z-10">
                      <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50 flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Reservado VIP
                      </Badge>
                    </div>
                  )}

                  {/* Badge Arquivado */}
                  {doc.is_archived && (
                    <div className="absolute top-4 right-4 z-10">
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/50 flex items-center gap-1">
                        <Archive className="h-3 w-3" />
                        Arquivado
                      </Badge>
                    </div>
                  )}

                  {/* Glow Effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#D2A63C]/5 rounded-full blur-3xl group-hover:bg-[#D2A63C]/10 transition-all"></div>

                  <CardHeader className="relative z-10">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 bg-[#D2A63C]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">{getFileIcon(doc.file_type)}</span>
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-white text-lg mb-1 line-clamp-2">
                          {doc.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50">
                            {getCategoryIcon(doc.category)} {doc.category}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {doc.description && (
                      <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">
                        {doc.description}
                      </p>
                    )}
                  </CardHeader>

                  <CardContent className="relative z-10 space-y-3">
                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {doc.tags.slice(0, 4).map((tag, idx) => (
                          <span 
                            key={idx}
                            className="text-[10px] px-2 py-0.5 bg-gray-800/50 text-gray-400 rounded-full border border-gray-700/50"
                          >
                            #{tag}
                          </span>
                        ))}
                        {doc.tags.length > 4 && (
                          <span className="text-[10px] px-2 py-0.5 text-gray-500">
                            +{doc.tags.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1" title="Visualizações">
                          <Eye className="h-3 w-3" />
                          <span>{doc.views_count || 0}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Downloads">
                          <Download className="h-3 w-3" />
                          <span>{doc.downloads_count || 0}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span className="text-[#D2A63C] text-[10px]">
                          {doc.uploader_name || doc.profiles?.full_name || 'MTM'}
                        </span>
                      </div>
                    </div>

                    {/* Data */}
                    <div className="flex items-center gap-1 text-[10px] text-gray-600">
                      <Calendar className="h-3 w-3" />
                      {new Date(doc.created_at).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => handleView(doc)}
                        className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold"
                        size="sm"
                      >
                        <Eye className="h-3 w-3 mr-1.5" />
                        Ver
                      </Button>
                      <Button
                        onClick={() => handleDownload(doc)}
                        variant="outline"
                        className="border-[#D2A63C]/30 hover:bg-[#D2A63C]/20 text-white"
                        size="sm"
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedPage>
  )
}

