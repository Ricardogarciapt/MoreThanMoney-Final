"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { supabase } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Heart, MessageCircle, Share2, Send, User, Plus, X, MoreVertical, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import MentionInput from "./mention-input"
import MentionText from "./mention-text"

interface Post {
  id: string
  user_id?: string
  user_name: string
  content: string
  media_url?: string
  media_urls?: string[] // Support for multiple media
  category?: string
  created_at: string
  likes_count?: number
  comments_count?: number
  liked_by_user?: boolean
}

interface StoryPreview {
  category: string
  preview_url?: string
  post_count: number
}

const CATEGORIES = [
  { id: "updates", label: "Updates", icon: "🆕", color: "from-blue-500 to-cyan-500" },
  { id: "forex", label: "Forex", icon: "💹", color: "from-green-500 to-emerald-500" },
  { id: "crypto", label: "Criptomoedas", icon: "₿", color: "from-yellow-500 to-orange-500" },
  { id: "mindset", label: "Mindset", icon: "🧠", color: "from-purple-500 to-pink-500" },
  { id: "lideranca", label: "Liderança", icon: "👑", color: "from-amber-500 to-yellow-500" },
  { id: "network", label: "Network", icon: "🌐", color: "from-indigo-500 to-blue-500" },
  { id: "social", label: "Social", icon: "🤝", color: "from-rose-500 to-red-500" },
]

export default function SocialFeed() {
  const [mounted, setMounted] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [newPost, setNewPost] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [canPost, setCanPost] = useState(false)
  const [storyPreviews, setStoryPreviews] = useState<Map<string, StoryPreview>>(new Map())
  const [newPostMedia, setNewPostMedia] = useState<File | null>(null)
  const [newPostMedias, setNewPostMedias] = useState<File[]>([]) // Multiple media support
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]) // Multiple previews
  const [currentMediaIndex, setCurrentMediaIndex] = useState<Map<string, number>>(new Map()) // Carousel index per post
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const storiesRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const [storyFlipStates, setStoryFlipStates] = useState<Map<string, { showPreview: boolean; currentIndex: number }>>(new Map())
  const [viewedCategories, setViewedCategories] = useState<Set<string>>(new Set())
  const [expandedComments, setExpandedComments] = useState<string | null>(null)
  const [commentText, setCommentText] = useState<Map<string, string>>(new Map())
  const [postComments, setPostComments] = useState<Map<string, any[]>>(new Map())
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set())
  const feedRef = useRef<HTMLDivElement>(null)
  const [postMentions, setPostMentions] = useState<any[]>([])
  const [commentMentions, setCommentMentions] = useState<Map<string, any[]>>(new Map())

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      loadUser()
      loadPosts()
      loadViewedCategories()
      
      // Subscribir a posts (retorna função de cleanup)
      let unsubscribeFn: (() => void) | null = null
      
      const setupSubscription = async () => {
        try {
          const cleanup = await subscribeToPosts()
          if (cleanup && typeof cleanup === 'function') {
            unsubscribeFn = cleanup
          }
        } catch (error) {
          console.error('❌ [SOCIAL FEED] Erro ao configurar subscription:', error)
        }
      }
      
      setupSubscription()
      
      // Cleanup ao desmontar
      return () => {
        if (unsubscribeFn && typeof unsubscribeFn === 'function') {
          try {
            unsubscribeFn()
          } catch (error) {
            console.warn('⚠️ [SOCIAL FEED] Erro ao limpar subscription:', error)
          }
        }
      }
    }
  }, [mounted])

  const loadViewedCategories = async () => {
    try {
      // 1. Carregar do sessionStorage primeiro (mais rápido)
      const storedViewed = sessionStorage.getItem('mtm_viewed_categories')
      if (storedViewed) {
        try {
          const categories = JSON.parse(storedViewed)
          setViewedCategories(new Set(categories))
          console.log('✅ [SOCIAL FEED] Categorias visualizadas carregadas do sessionStorage:', categories)
        } catch (e) {
          console.warn('⚠️ [SOCIAL FEED] Erro ao parsear sessionStorage')
        }
      }
      
      // 2. Sincronizar com o backend (opcional, em background)
      const response = await fetch('/api/social/story-views')
      if (response.ok) {
        const data = await response.json()
        const backendCategories = data.viewedCategories || []
        if (backendCategories.length > 0) {
          setViewedCategories(new Set(backendCategories))
          // Atualizar sessionStorage com dados do backend
          sessionStorage.setItem('mtm_viewed_categories', JSON.stringify(backendCategories))
        }
      }
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao carregar categorias visualizadas:', error)
    }
  }

  const markCategoryAsViewed = async (categoryId: string) => {
    // Se já foi visualizada, não fazer nada
    if (viewedCategories.has(categoryId)) {
      return
    }

    // Atualizar imediatamente no sessionStorage (otimista)
    const newViewedCategories = new Set([...viewedCategories, categoryId])
    setViewedCategories(newViewedCategories)
    try {
      sessionStorage.setItem('mtm_viewed_categories', JSON.stringify([...newViewedCategories]))
      console.log('✅ [SOCIAL FEED] Categoria salva no sessionStorage:', categoryId)
    } catch (e) {
      console.warn('⚠️ [SOCIAL FEED] Erro ao salvar no sessionStorage')
    }

    // Recalcular previews imediatamente
    generateStoryPreviews(posts)

    // Sincronizar com backend em background
    try {
      const response = await fetch('/api/social/story-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId })
      })

      if (response.ok) {
        console.log('✅ [SOCIAL FEED] Categoria sincronizada com backend:', categoryId)
      } else {
        console.warn('⚠️ [SOCIAL FEED] Falha ao sincronizar com backend, mas mantido localmente')
      }
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao marcar categoria como vista:', error)
      // Mesmo com erro, mantém no sessionStorage
    }
  }

  const loadUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        
        if (error) {
          console.error('❌ [SOCIAL FEED] Erro ao carregar perfil:', error)
          const basicProfile = {
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || 'Utilizador',
            user_type: 'member',
            member_category: 'standard'
          }
          setCurrentUser(basicProfile)
          setCanPost(false)
        } else {
          setCurrentUser(profile)
          setCanPost(
            profile?.user_type === 'admin' || 
            profile?.member_category === 'vip'
          )
        }
      }
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro crítico ao carregar user:', error)
    }
  }

  const loadPosts = async () => {
    setLoading(true)
    try {
      console.log('🔄 [SOCIAL FEED] Iniciando carregamento de posts...')
      
      // Verificar autenticação
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('🔐 [SOCIAL FEED] Sessão:', {
        autenticado: !!session?.user,
        user_id: session?.user?.id || 'N/A',
        email: session?.user?.email || 'N/A'
      })

      // Query base com colunas obrigatórias - SEMPRE usar estas
      // Nota: updated_at pode não existir em algumas instalações, vamos verificar
      const baseColumns = "id, user_id, user_name, content, media_url, category, created_at"
      
      // Tentar adicionar colunas opcionais se existirem (mas não bloquear se falhar)
      let selectQuery = baseColumns
      
      // Verificar e adicionar colunas opcionais uma a uma (incluindo updated_at)
      const optionalColumns = ["updated_at", "media_urls", "mentions", "likes_count", "comments_count"]
      
      for (const col of optionalColumns) {
        try {
          const { error: testError } = await supabase
            .from("posts")
            .select(col)
            .limit(0) // Query vazia apenas para testar schema
          
          if (!testError) {
            selectQuery += `, ${col}`
            console.log(`✅ [SOCIAL FEED] Coluna ${col} disponível`)
          } else {
            console.log(`ℹ️ [SOCIAL FEED] Coluna ${col} não disponível:`, testError.message)
          }
        } catch (e: any) {
          console.log(`ℹ️ [SOCIAL FEED] Coluna ${col} não disponível (exceção):`, e.message)
        }
      }

      // Carregar posts com query otimizada
      console.log('📊 [SOCIAL FEED] Query final:', selectQuery)
      const { data, error } = await supabase
        .from("posts")
        .select(selectQuery)
        .order("created_at", { ascending: false })
      
      console.log('📦 [SOCIAL FEED] Resposta do Supabase:', {
        tem_dados: !!data,
        total: data?.length || 0,
        erro: error ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        } : null
      })

      if (error) {
        console.error("❌ [SOCIAL FEED] Erro ao carregar posts:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        
        // Se erro for de coluna não encontrada, tentar sem colunas opcionais
        if (error.message?.includes("media_urls") || error.message?.includes("column") || error.message?.includes("does not exist")) {
          console.log("⚠️ [SOCIAL FEED] Tentando carregar posts sem colunas opcionais...")
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("posts")
            .select("id, user_id, user_name, content, media_url, category, created_at")
            .order("created_at", { ascending: false })
          
          if (fallbackError) {
            console.error("❌ [SOCIAL FEED] Erro ao carregar posts (fallback):", {
              message: fallbackError.message,
              details: fallbackError.details,
              hint: fallbackError.hint,
              code: fallbackError.code
            })
            alert(`❌ Erro ao carregar posts: ${fallbackError.message}\n\nVerifica as políticas RLS no Supabase.`)
            setPosts([])
          } else {
            console.log(`✅ [SOCIAL FEED] ${fallbackData?.length || 0} posts carregados (fallback)`)
            setPosts(fallbackData || [])
            generateStoryPreviews(fallbackData || [])
          }
        } else if (error.message?.includes("permission") || error.message?.includes("policy") || error.message?.includes("RLS")) {
          console.error("❌ [SOCIAL FEED] Erro de permissão/RLS:", error.message)
          alert(`❌ Erro de permissão ao carregar posts.\n\nVerifica as políticas RLS no Supabase.\n\nErro: ${error.message}`)
          setPosts([])
        } else {
          console.error("❌ [SOCIAL FEED] Erro desconhecido:", error)
          alert(`❌ Erro ao carregar posts: ${error.message}`)
          setPosts([])
        }
      } else {
        // Processar posts: converter media_url para media_urls se necessário
        const processedPosts = (data || []).map((post: any) => {
          // Se não tem media_urls mas tem media_url, criar array
          if (!post.media_urls && post.media_url) {
            post.media_urls = [post.media_url]
          }
          // Garantir que likes_count e comments_count existem
          if (post.likes_count === undefined || post.likes_count === null) {
            post.likes_count = 0
          }
          if (post.comments_count === undefined || post.comments_count === null) {
            post.comments_count = 0
          }
          return post
        })
        
        console.log(`✅ [SOCIAL FEED] ${processedPosts.length} posts processados e carregados`)
        console.log('📋 [SOCIAL FEED] Primeiros 3 posts:', processedPosts.slice(0, 3).map((p: any) => ({
          id: p.id,
          user_name: p.user_name,
          preview: p.content?.substring(0, 50),
          category: p.category,
          tem_media: !!(p.media_url || p.media_urls?.length > 0)
        })))
        
        setPosts(processedPosts)
        generateStoryPreviews(processedPosts)
        
        // Carregar likes do usuário atual
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: likesData, error: likesError } = await supabase
              .from("post_likes")
              .select("post_id")
              .eq("user_id", session.user.id)
            
            if (likesError) {
              console.error("❌ [SOCIAL FEED] Erro ao carregar likes:", likesError)
            } else {
              const userLikes = new Set(likesData?.map(like => like.post_id) || [])
              setPosts(prevPosts => 
                processedPosts.map((post: Post) => ({
                  ...post,
                  liked_by_user: userLikes.has(post.id)
                }))
              )
            }
          }
        } catch (likesError) {
          console.error("❌ [SOCIAL FEED] Erro ao processar likes:", likesError)
          // Continuar sem likes se houver erro
        }
      }
    } catch (error) {
      console.error("❌ [SOCIAL FEED] Erro ao carregar posts:", error)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const generateStoryPreviews = (postsData: Post[]) => {
    const previews = new Map<string, StoryPreview>()
    
    CATEGORIES.forEach(cat => {
      const categoryPosts = postsData.filter(p => p.category === cat.id && p.media_url)
      
      // Contar apenas posts de categorias NÃO visualizadas
      const unviewedCount = viewedCategories.has(cat.id) ? 0 : categoryPosts.length
      
      const preview: StoryPreview = {
        category: cat.id,
        preview_url: categoryPosts[0]?.media_url,
        post_count: unviewedCount // Mostrar apenas não visualizados
      }
      previews.set(cat.id, preview)
      
      // Inicializar estado de flip se não existir
      if (!storyFlipStates.has(cat.id)) {
        setStoryFlipStates(prev => {
          const newMap = new Map(prev)
          newMap.set(cat.id, { showPreview: false, currentIndex: 0 })
          return newMap
        })
      }
    })
    
    setStoryPreviews(previews)
  }

  // Efeito para animação flip nos stories (coin flip aleatório)
  useEffect(() => {
    if (!mounted || posts.length === 0) return

    const timeouts = new Map<string, NodeJS.Timeout>()

    CATEGORIES.forEach(cat => {
      const categoryPosts = posts.filter(p => p.category === cat.id && p.media_url)
      const preview = storyPreviews.get(cat.id)
      const postCount = preview?.post_count || 0
      
      // IMPORTANTE: Só ativar coin flip se houver posts não visualizados (post_count > 0)
      if (categoryPosts.length > 0 && postCount > 0) {
        // Função recursiva para criar intervalos aleatórios
        const scheduleNextFlip = (): NodeJS.Timeout => {
          // Intervalo aleatório entre 3-7 segundos
          const delay = 3000 + Math.random() * 4000
          
          return setTimeout(() => {
            setStoryFlipStates(prev => {
              const newMap = new Map(prev)
              const current = prev.get(cat.id) || { showPreview: false, currentIndex: 0 }
              
              if (current.showPreview) {
                // Voltar ao ícone após mostrar preview
                newMap.set(cat.id, { showPreview: false, currentIndex: current.currentIndex })
              } else {
                // Mostrar próxima preview (rotação circular ou aleatória)
                // Usar índice aleatório para mais variedade
                const randomIndex = Math.floor(Math.random() * categoryPosts.length)
                newMap.set(cat.id, { showPreview: true, currentIndex: randomIndex })
              }
              
              return newMap
            })

            // Agendar próximo flip
            const nextTimeout = scheduleNextFlip()
            timeouts.set(cat.id, nextTimeout)
          }, delay)
        }

        // Iniciar primeiro flip após delay inicial aleatório (2-5 segundos)
        const initialDelay = 2000 + Math.random() * 3000
        const firstTimeout = setTimeout(() => {
          const timeout = scheduleNextFlip()
          timeouts.set(cat.id, timeout)
        }, initialDelay)
        
        timeouts.set(cat.id, firstTimeout)
      } else if (categoryPosts.length > 0 && postCount === 0) {
        // Se tem posts mas já foram todos visualizados (post_count = 0), desativar animação
        setStoryFlipStates(prev => {
          const newMap = new Map(prev)
          newMap.set(cat.id, { showPreview: false, currentIndex: 0 })
          return newMap
        })
      }
    })

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
    }
  }, [mounted, posts, storyPreviews])

  const subscribeToPosts = async () => {
    try {
      console.log('📡 [SOCIAL FEED] Iniciando subscrição Realtime...')
      
      // Verificar sessão antes de criar subscription
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.access_token) {
        console.warn('⚠️ [SOCIAL FEED] Sem sessão válida, usando apenas polling')
        // Retornar função vazia - o polling já está ativo via loadPosts
        return () => {}
      }

      console.log('🔐 [SOCIAL FEED] Sessão:', {
        autenticado: !!session,
        user_id: session?.user?.id,
        email: session?.user?.email
      })
      
      const channel = supabase
        .channel("posts-changes", {
          config: {
            broadcast: { self: false },
            presence: { key: 'user_id' }
          }
        })
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "posts" 
          },
          (payload) => {
            console.log('📨 [SOCIAL FEED] Evento Realtime recebido:', payload.eventType)
            
            if (payload.eventType === "INSERT") {
              const newPost = payload.new as any
              // Garantir que media_urls está presente
              if (!newPost.media_urls && newPost.media_url) {
                newPost.media_urls = [newPost.media_url]
              }
              setPosts((prev) => {
                // Evitar duplicados
                if (prev.some(p => p.id === newPost.id)) {
                  return prev
                }
                return [newPost, ...prev]
              })
              // Recarregar posts completos para garantir sincronização
              setTimeout(() => loadPosts(), 1000)
            } else if (payload.eventType === "UPDATE") {
              const updatedPost = payload.new as any
              if (!updatedPost.media_urls && updatedPost.media_url) {
                updatedPost.media_urls = [updatedPost.media_url]
              }
              setPosts((prev) =>
                prev.map((p) => (p.id === updatedPost.id ? updatedPost : p))
              )
            } else if (payload.eventType === "DELETE") {
              setPosts((prev) => prev.filter((p) => p.id !== payload.old.id))
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ [SOCIAL FEED] Subscrição Realtime ativa')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ [SOCIAL FEED] Erro na subscrição Realtime')
            // Não tentar reconectar automaticamente - usar apenas polling
          } else if (status === 'TIMED_OUT') {
            console.warn('⚠️ [SOCIAL FEED] Subscrição Realtime timeout, usando polling')
            // Não tentar reconectar automaticamente - usar apenas polling
          } else {
            console.log('📡 [SOCIAL FEED] Status subscrição:', status)
          }
        })

      // Retornar função de cleanup
      return () => {
        console.log('🧹 [SOCIAL FEED] Limpando subscrição Realtime...')
        supabase.removeChannel(channel).catch(console.warn)
      }
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao criar subscrição:', error)
      return () => {} // Retornar função vazia se houver erro
    }
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setNewPostMedias(files)
      const previews: string[] = []
      let loadedCount = 0
      
      files.forEach((file) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          previews.push(reader.result as string)
          loadedCount++
          if (loadedCount === files.length) {
            setMediaPreviews(previews)
          }
        }
        reader.readAsDataURL(file)
      })
      
      // Backward compatibility: set first file as single media
      if (files.length === 1) {
        setNewPostMedia(files[0])
        setMediaPreview(previews[0] || null)
      }
    }
  }

  const handleCreatePost = async () => {
    if (!newPost.trim()) {
      alert('❌ Por favor, escreve algo antes de publicar!')
      return
    }

    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        alert('❌ Deves estar autenticado para publicar!')
        setUploading(false)
        return
      }

      const userName =
        currentUser?.full_name ||
        session.user.user_metadata?.full_name ||
        session.user.email?.split("@")[0] ||
        "Utilizador"

      let mediaUrl: string | null = null
      let mediaUrls: string[] = []

      // Upload de múltiplas mídias se houver
      const filesToUpload = newPostMedias.length > 0 ? newPostMedias : (newPostMedia ? [newPostMedia] : [])
      
      if (filesToUpload.length > 0) {
        for (const file of filesToUpload) {
          const fileExt = file.name.split('.').pop()
          const fileName = `${session.user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
          const filePath = `posts/${fileName}`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('uploads')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            })

          if (uploadError) {
            console.error('❌ [SOCIAL FEED] Erro ao fazer upload:', uploadError)
            
            if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
              alert('❌ Erro: Bucket "uploads" não existe no Supabase Storage.\n\n📋 SOLUÇÃO:\n1. Executa: scripts/fix-posts-storage-completo.sql\n2. Ou cria bucket manualmente no Dashboard')
            } else if (uploadError.message?.includes('policy') || uploadError.message?.includes('permission')) {
              alert('❌ Erro: Sem permissão para fazer upload.\n\n📋 SOLUÇÃO:\n1. Executa: scripts/fix-posts-storage-completo.sql\n2. Verifica políticas RLS do Storage')
            } else if (uploadError.message?.includes('size') || uploadError.message?.includes('limit')) {
              alert('❌ Erro: Ficheiro muito grande. Tamanho máximo: 50MB')
            } else {
              alert(`❌ Erro ao fazer upload: ${uploadError.message}\n\nVerifica o console para mais detalhes.`)
            }
            setUploading(false)
            return
          }

          const { data: { publicUrl } } = supabase.storage
            .from('uploads')
            .getPublicUrl(filePath)

          mediaUrls.push(publicUrl)
        }
        
        // Backward compatibility: first media as single media_url
        mediaUrl = mediaUrls[0] || null
      }

      // Extrair IDs de menções
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
      const mentionedUserIds: string[] = []
      let match
      while ((match = mentionRegex.exec(newPost)) !== null) {
        mentionedUserIds.push(match[2])
      }

      // Preparar dados para inserção (apenas colunas que existem)
      const postData: any = {
        user_id: session.user.id,
        user_name: userName,
        content: newPost.trim(),
        category: selectedCategory || null,
        media_url: mediaUrl, // Backward compatibility - sempre presente
      }

      // Tentar inserir com media_urls e mentions, mas tratar erro se colunas não existirem
      console.log('📝 [SOCIAL FEED] Tentando criar post:', {
        user_id: session.user.id,
        user_name: userName,
        content_length: newPost.trim().length,
        category: selectedCategory,
        media_count: mediaUrls.length,
        mentions_count: mentionedUserIds.length,
        postData
      })
      
      const { data: insertedPost, error } = await supabase.from("posts").insert([
        {
          ...postData,
          // Tentar adicionar colunas opcionais - se não existirem, o Supabase vai ignorar
          ...(mediaUrls.length > 0 && { media_urls: mediaUrls }),
          ...(mentionedUserIds.length > 0 && { mentions: mentionedUserIds }),
        },
      ]).select()
      
      console.log('📝 [SOCIAL FEED] Resposta da inserção:', {
        sucesso: !error,
        post_id: insertedPost?.[0]?.id || null,
        erro: error ? {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        } : null
      })
      
      // Se erro for de coluna não encontrada, tentar inserir sem colunas opcionais
      if (error && (error.message?.includes("media_urls") || error.message?.includes("mentions") || error.message?.includes("column"))) {
        console.warn("⚠️ [SOCIAL FEED] Colunas opcionais não encontradas, inserindo apenas colunas básicas")
        const { data: fallbackPost, error: fallbackError } = await supabase.from("posts").insert([postData]).select()
        
        console.log('📝 [SOCIAL FEED] Resposta fallback:', {
          sucesso: !fallbackError,
          post_id: fallbackPost?.[0]?.id || null,
          erro: fallbackError ? {
            message: fallbackError.message,
            details: fallbackError.details,
            hint: fallbackError.hint,
            code: fallbackError.code
          } : null
        })
        
        if (fallbackError) {
          console.error("❌ [SOCIAL FEED] Erro ao criar post (fallback):", fallbackError)
          
          // Mensagens de erro mais específicas
          if (fallbackError.message?.includes('relation') && fallbackError.message?.includes('does not exist')) {
            alert('❌ Erro: Tabela "posts" não existe no Supabase.\n\n📋 SOLUÇÃO:\n1. Executa: scripts/fix-posts-storage-completo.sql\n2. Ou: scripts/create-posts-table-with-categories.sql')
          } else if (fallbackError.message?.includes('permission') || fallbackError.message?.includes('policy')) {
            alert('❌ Erro: Sem permissão para criar posts.\n\n📋 SOLUÇÃO:\n1. Verifica se és VIP ou Admin\n2. Executa: scripts/fix-posts-storage-completo.sql para configurar RLS')
          } else if (fallbackError.message?.includes('violates check constraint')) {
            alert('❌ Erro: Categoria inválida. Categorias válidas: updates, forex, crypto, mindset, lideranca, network, social')
          } else {
            alert(`❌ Erro ao publicar: ${fallbackError.message}\n\n💡 Execute o script: scripts/fix-posts-media-urls.sql no Supabase`)
          }
          
          setUploading(false)
          return
        }
        // Se fallback funcionou, continuar com o fluxo de sucesso
      } else if (error) {
        console.error("❌ [SOCIAL FEED] Erro ao criar post:", error)
        console.error("❌ [SOCIAL FEED] Detalhes:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        
        // Mensagens de erro mais específicas
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          alert('❌ Erro: Tabela "posts" não existe no Supabase.\n\n📋 SOLUÇÃO:\n1. Executa: scripts/fix-posts-storage-completo.sql\n2. Ou: scripts/create-posts-table-with-categories.sql')
        } else if (error.message?.includes('permission') || error.message?.includes('policy')) {
          alert('❌ Erro: Sem permissão para criar posts.\n\n📋 SOLUÇÃO:\n1. Verifica se és VIP ou Admin\n2. Executa: scripts/fix-posts-storage-completo.sql para configurar RLS')
        } else if (error.message?.includes('violates check constraint')) {
          alert('❌ Erro: Categoria inválida. Categorias válidas: updates, forex, crypto, mindset, lideranca, network, social')
        } else {
          let errorMessage = `❌ Erro ao publicar: ${error.message}`
          if (error.message?.includes("media_urls") || error.message?.includes("column")) {
            errorMessage += "\n\n💡 SOLUÇÃO:\nExecute o script SQL no Supabase:\nscripts/fix-posts-media-urls.sql"
          }
          alert(errorMessage)
        }
        
        setUploading(false)
        return
      }

      // Se chegou aqui, a inserção foi bem-sucedida
      // Enviar notificações para membros mencionados
      if (mentionedUserIds.length > 0) {
        try {
          for (const mentionedUserId of mentionedUserIds) {
            await fetch('/api/notifications/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: mentionedUserId,
                title: `💬 ${userName} mencionou-te`,
                body: newPost.trim().substring(0, 100),
                data: {
                  type: 'mention',
                  url: '/app-mobile?tab=social',
                  author: userName,
                  post_id: 'new'
                },
                tag: 'mention'
              })
            })
          }
          console.log('✅ [SOCIAL FEED] Notificações de menção enviadas')
        } catch (notifError) {
          console.error('⚠️ [SOCIAL FEED] Erro ao enviar notificações de menção:', notifError)
        }
      }

      // Enviar notificação push para todos os utilizadores sobre novo post
      try {
        const postTitle = newPost.trim().length > 50 
          ? newPost.trim().substring(0, 50) + '...' 
          : newPost.trim()
        
        await fetch('/api/notifications/send-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            all: true, // Enviar para todos
            title: `💎 Novo Post de ${userName}`,
            body: postTitle,
            data: {
              type: 'social_post',
              url: '/app-mobile?tab=social',
              author: userName,
              post_id: 'new' // Será atualizado quando o real-time sync funcionar
            },
            tag: 'social-post'
          })
        })
        console.log('✅ [SOCIAL FEED] Notificação push enviada para novo post')
      } catch (notifError) {
        console.error('⚠️ [SOCIAL FEED] Erro ao enviar notificação push:', notifError)
        // Não bloquear o fluxo se a notificação falhar
      }
      
      // Limpar formulário e recarregar posts
      console.log('✅ [SOCIAL FEED] Post criado com sucesso! Limpando formulário...')
      setNewPost("")
      setSelectedCategory("")
      setNewPostMedia(null)
      setNewPostMedias([])
      setMediaPreview(null)
      setMediaPreviews([])
      setShowCreatePost(false)
      
      // Recarregar posts imediatamente e depois novamente após 1 segundo (para garantir)
      loadPosts()
      setTimeout(() => {
        console.log('🔄 [SOCIAL FEED] Recarregando posts após criação...')
        loadPosts()
      }, 1000)
    } catch (error) {
      console.error("❌ [SOCIAL FEED] Erro ao criar post:", error)
      alert('❌ Erro ao publicar. Tenta novamente.')
    } finally {
      setUploading(false)
    }
  }

  // Limpar formato de menções para partilha (remover IDs, manter apenas nomes)
  const cleanMentionsForShare = (text: string): string => {
    return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
  }

  const handleSharePost = async (post: Post) => {
    try {
      // Encurtar link - usar apenas primeiro segmento do ID do post (mais curto)
      const postIdShort = post.id.split('-')[0] || post.id.substring(0, 8)
      const shortLink = `${window.location.origin}/p/${postIdShort}`
      // Limpar menções antes de partilhar (remover IDs)
      const cleanContent = cleanMentionsForShare(post.content)
      const shareText = `${cleanContent}\n\n- ${post.user_name} via MTM App`
      const fullShareText = `${shareText}\n\n🔗 Ver: ${shortLink}`

      // Get all media (support multiple)
      const mediaList = post.media_urls && post.media_urls.length > 0 
        ? post.media_urls 
        : (post.media_url ? [post.media_url] : [])
      
      // Se tem mídia, tentar partilhar com imagens/vídeos + texto + link
      if (mediaList.length > 0) {
        const imageFiles: File[] = []
        
        // Fetch all images - URLs já são públicas do Supabase Storage
        for (let i = 0; i < mediaList.length; i++) {
          const mediaUrl = mediaList[i]
          const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || mediaUrl.includes('.mov') || mediaUrl.includes('video')
          
          if (!isVideo) {
            try {
              // As URLs do Supabase Storage já são públicas, usar diretamente
              const response = await fetch(mediaUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                  'Accept': 'image/*',
                },
              })
              
              if (response.ok) {
                const blob = await response.blob()
                
                // Determinar extensão e tipo MIME corretos
                const contentType = response.headers.get('content-type') || blob.type
                const urlParts = mediaUrl.split('.')
                const urlWithoutParams = urlParts[urlParts.length - 1].split('?')[0]
                const extension = urlWithoutParams.toLowerCase() || 
                  (contentType.includes('png') ? 'png' : 
                   contentType.includes('gif') ? 'gif' : 
                   contentType.includes('webp') ? 'webp' : 'jpg')
                
                // Garantir tipo MIME correto
                let mimeType = contentType || blob.type
                if (!mimeType || mimeType === 'application/octet-stream') {
                  mimeType = extension === 'png' ? 'image/png' : 
                            extension === 'gif' ? 'image/gif' : 
                            extension === 'webp' ? 'image/webp' : 'image/jpeg'
                }
                
                const fileName = `post-${post.id}-${i}.${extension}`
                const file = new File([blob], fileName, { 
                  type: mimeType,
                  lastModified: Date.now()
                })
                
                imageFiles.push(file)
                console.log(`✅ [SHARE] Imagem ${i + 1}/${mediaList.length} carregada: ${fileName} (${(blob.size / 1024).toFixed(1)}KB, ${mimeType})`)
              } else {
                console.warn(`⚠️ [SHARE] Falha ao buscar imagem ${i + 1}: ${response.status} ${response.statusText}`)
                // Tentar usar a URL diretamente no fallback
              }
            } catch (error) {
              console.warn(`⚠️ [SHARE] Erro ao buscar mídia ${i + 1}:`, error)
              // Continuar com outras imagens mesmo se uma falhar
            }
          } else {
            console.log(`ℹ️ [SHARE] Vídeo detectado (${i + 1}), será partilhado como URL`)
          }
        }
        
        // Share with files if available - PRIORIDADE: partilhar com anexos
        if (imageFiles.length > 0 && navigator.share && navigator.canShare) {
          try {
            const shareDataWithFiles: any = {
              title: `📱 ${post.user_name} - MTM`,
              text: fullShareText,
              files: imageFiles,
            }
            
            // Verificar se pode partilhar com ficheiros
            if (navigator.canShare(shareDataWithFiles)) {
              await navigator.share(shareDataWithFiles)
              console.log(`✅ [SHARE] Partilhado com ${imageFiles.length} anexo(s)`)
              // Regressar a app-mobile após partilha
              if (window.location.pathname !== '/app-mobile') {
                window.location.href = '/app-mobile?tab=social'
              }
              return
            } else {
              console.warn('⚠️ [SHARE] Navigator não suporta partilha com estes ficheiros, tentando sem ficheiros')
            }
          } catch (error) {
            if ((error as Error).name === 'AbortError') {
              // Utilizador cancelou, regressar mesmo assim
              if (window.location.pathname !== '/app-mobile') {
                window.location.href = '/app-mobile?tab=social'
              }
              return
            }
            console.warn('⚠️ [SHARE] Erro ao partilhar com ficheiros, tentando sem:', error)
          }
        }

        // Fallback: partilhar texto + link + URLs das mídias (preview com links)
        if (navigator.share) {
          try {
            const mediaPreviewText = mediaList.length > 0 
              ? `\n\n📸 Preview da publicação:\n${mediaList.map((url, idx) => `🖼️ Imagem ${idx + 1}: ${url}`).join('\n')}`
              : ''
            await navigator.share({
              title: `📱 ${post.user_name} - MTM`,
              text: `${fullShareText}${mediaPreviewText}`,
              url: shortLink, // Incluir URL para preview
            })
            console.log('✅ [SHARE] Partilhado com preview de mídia (URLs)')
            // Regressar a app-mobile após partilha
            if (window.location.pathname !== '/app-mobile') {
              window.location.href = '/app-mobile?tab=social'
            }
            return
          } catch (error) {
            if ((error as Error).name === 'AbortError') {
              // Utilizador cancelou, regressar mesmo assim
              if (window.location.pathname !== '/app-mobile') {
                window.location.href = '/app-mobile?tab=social'
              }
              return
            }
            console.error('❌ [SHARE] Erro ao partilhar:', error)
          }
        }
      }

      // Se não tem mídia ou Web Share API não disponível
      if (navigator.share) {
        try {
          await navigator.share({
            title: `📱 ${post.user_name} - MTM`,
            text: fullShareText,
            url: shortLink,
          })
          // Regressar a app-mobile após partilha
          if (window.location.pathname !== '/app-mobile') {
            window.location.href = '/app-mobile?tab=social'
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            // Utilizador cancelou, regressar mesmo assim
            if (window.location.pathname !== '/app-mobile') {
              window.location.href = '/app-mobile?tab=social'
            }
            return
          }
          // Fallback para clipboard - sempre inclui texto + link + mídias
          const mediaList = post.media_urls && post.media_urls.length > 0 
            ? post.media_urls 
            : (post.media_url ? [post.media_url] : [])
          const mediaUrlsText = mediaList.length > 0 
            ? `\n\n📸 Preview da publicação:\n${mediaList.map((url, idx) => `🖼️ ${idx + 1}. ${url}`).join('\n')}`
            : ''
          const textToCopy = `${fullShareText}${mediaUrlsText}`
          
          await navigator.clipboard.writeText(textToCopy)
          alert("✅ Conteúdo copiado para área de transferência!\n\nInclui preview da publicação com links para as imagens.")
          // Regressar a app-mobile após copiar
          if (window.location.pathname !== '/app-mobile') {
            window.location.href = '/app-mobile?tab=social'
          }
        }
      } else {
        // Fallback: copiar para clipboard - sempre inclui texto + link + mídias
        const mediaList = post.media_urls && post.media_urls.length > 0 
          ? post.media_urls 
          : (post.media_url ? [post.media_url] : [])
        const mediaUrlsText = mediaList.length > 0 
          ? `\n\n📸 Preview da publicação:\n${mediaList.map((url, idx) => `🖼️ ${idx + 1}. ${url}`).join('\n')}`
          : ''
        const textToCopy = `${fullShareText}${mediaUrlsText}`
        
        await navigator.clipboard.writeText(textToCopy)
        alert("✅ Conteúdo copiado para área de transferência!\n\nInclui preview da publicação com links para as imagens.")
        // Regressar a app-mobile após copiar
        if (window.location.pathname !== '/app-mobile') {
          window.location.href = '/app-mobile?tab=social'
        }
      }
    } catch (error) {
      console.error('❌ [SHARE] Erro ao partilhar post:', error)
      alert('❌ Erro ao partilhar. Tenta novamente.')
      // Regressar a app-mobile mesmo em caso de erro
      if (window.location.pathname !== '/app-mobile') {
        window.location.href = '/app-mobile?tab=social'
      }
    }
  }

  const handleLike = async (postId: string) => {
    if (!currentUser) return

    const post = posts.find(p => p.id === postId)
    if (!post) return

    try {
      if (post.liked_by_user) {
        // Remover like
        const { error } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id)

        if (error) {
          console.error('❌ [SOCIAL FEED] Erro ao remover like:', error)
          return
        }
      } else {
        // Adicionar like
        const { error } = await supabase
          .from("post_likes")
          .insert({
            post_id: postId,
            user_id: currentUser.id
          })

        if (error) {
          console.error('❌ [SOCIAL FEED] Erro ao dar like:', error)
          return
        }
      }

      // Atualizar UI
      setPosts(posts.map(p =>
        p.id === postId
          ? {
              ...p,
              likes_count: (p.likes_count || 0) + (post.liked_by_user ? -1 : 1),
              liked_by_user: !post.liked_by_user,
            }
          : p
      ))
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao processar like:', error)
    }
  }

  const loadComments = async (postId: string) => {
    if (loadingComments.has(postId) || postComments.has(postId)) return
    
    setLoadingComments(prev => new Set(prev).add(postId))
    
    try {
      const { data, error } = await supabase
        .from('post_comments')
        .select('id, post_id, user_id, user_name, content, mentions, created_at, updated_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('❌ [SOCIAL FEED] Erro ao carregar comentários:', error)
        return
      }
      
      if (data) {
        setPostComments(prev => new Map(prev).set(postId, data))
      }
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao carregar comentários:', error)
    } finally {
      setLoadingComments(prev => {
        const newSet = new Set(prev)
        newSet.delete(postId)
        return newSet
      })
    }
  }

  const handleAddComment = async (postId: string) => {
    const comment = commentText.get(postId)
    if (!currentUser || !comment?.trim()) return

    try {
      // Extrair IDs de menções
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
      const mentionedUserIds: string[] = []
      let match
      while ((match = mentionRegex.exec(comment)) !== null) {
        mentionedUserIds.push(match[2])
      }

      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          user_id: currentUser.id,
          user_name: currentUser.full_name || currentUser.email || 'Utilizador',
          content: comment.trim(),
          mentions: mentionedUserIds.length > 0 ? mentionedUserIds : null
        })
        .select()
        .single()

      // Enviar notificações para membros mencionados
      if (mentionedUserIds.length > 0) {
        try {
          for (const mentionedUserId of mentionedUserIds) {
            await fetch('/api/notifications/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: mentionedUserId,
                title: `💬 ${currentUser.full_name || currentUser.email} mencionou-te`,
                body: comment.trim().substring(0, 100),
                data: {
                  type: 'mention',
                  url: '/app-mobile?tab=social',
                  author: currentUser.full_name || currentUser.email,
                  post_id: postId
                },
                tag: 'mention'
              })
            })
          }
          console.log('✅ [SOCIAL FEED] Notificações de menção em comentário enviadas')
        } catch (notifError) {
          console.error('⚠️ [SOCIAL FEED] Erro ao enviar notificações de menção:', notifError)
        }
      }

      if (error) {
        console.error('❌ [SOCIAL FEED] Erro ao adicionar comentário:', error)
        alert('Erro ao adicionar comentário')
        return
      }

      // Adicionar comentário à lista
      setPostComments(prev => {
        const newMap = new Map(prev)
        const currentComments = newMap.get(postId) || []
        newMap.set(postId, [data, ...currentComments])
        return newMap
      })

      // Limpar input
      setCommentText(prev => {
        const newMap = new Map(prev)
        newMap.set(postId, '')
        return newMap
      })

      // Atualizar contador de comentários (trigger já atualiza automaticamente)
      setPosts(posts.map(p =>
        p.id === postId
          ? { ...p, comments_count: (p.comments_count || 0) + 1 }
          : p
      ))
    } catch (error) {
      console.error('❌ [SOCIAL FEED] Erro ao processar comentário:', error)
      alert('Erro ao adicionar comentário')
    }
  }

  const toggleComments = (postId: string) => {
    if (expandedComments === postId) {
      setExpandedComments(null)
    } else {
      setExpandedComments(postId)
      loadComments(postId)
    }
  }

  const filteredPosts = activeCategory
    ? posts.filter((p) => p.category === activeCategory)
    : posts

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return "agora"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
    return new Date(date).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
  }

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* Stories Section - Instagram Style */}
      <div 
        ref={storiesRef}
        className="flex gap-4 overflow-x-auto px-4 py-4 border-b border-gray-800 scrollbar-hide"
        onTouchStart={(e) => {
          // Guardar posição inicial do touch
          touchStartX.current = e.touches[0].clientX
          touchStartY.current = e.touches[0].clientY
          // Prevenir propagação para não ativar swipe de abas
          e.stopPropagation()
        }}
        onTouchMove={(e) => {
          // Se está scrollando horizontalmente nos stories, prevenir swipe de abas
          const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current)
          const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current)
          
          // Se movimento horizontal é maior que vertical, é scroll dos stories
          if (deltaX > deltaY && deltaX > 10) {
            e.stopPropagation() // Prevenir propagação para swipe de abas
          }
        }}
        onTouchEnd={(e) => {
          // Prevenir propagação no touch end também
          e.stopPropagation()
        }}
        onScroll={(e) => {
          // Prevenir que scroll horizontal nos stories propague
          e.stopPropagation()
        }}
      >
        {CATEGORIES.map((cat) => {
          const preview = storyPreviews.get(cat.id)
          const isActive = activeCategory === cat.id
          const postCount = preview?.post_count || 0

          return (
            <div
              key={cat.id}
              onClick={() => {
                // Definir categoria ativa e fazer scroll automático para os posts
                const categoryPosts = posts.filter(p => p.category === cat.id)
                if (categoryPosts.length > 0) {
                  setActiveCategory(isActive ? null : cat.id)
                  // Scroll automático após um pequeno delay para garantir que o estado foi atualizado
                  setTimeout(() => {
                    if (feedRef.current) {
                      const firstPost = feedRef.current.querySelector('[data-post-category="' + cat.id + '"]')
                      if (firstPost) {
                        firstPost.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        // Marcar categoria como visualizada quando scroll
                        markCategoryAsViewed(cat.id)
                        // Limpeza otimista imediata do contador do destaque
                        setViewedCategories(prev => new Set([...prev, cat.id]))
                        setStoryPreviews(prev => {
                          const updated = new Map(prev)
                          const current = updated.get(cat.id)
                          if (current) {
                            updated.set(cat.id, { ...current, post_count: 0 })
                          }
                          return updated
                        })
                        // Reduzir contagem de notificações: marcar apenas notificações do tipo 'social_post' como lidas
                        if (currentUser?.id) {
                          supabase
                            .from('notifications')
                            .update({ read: true })
                            .eq('user_id', currentUser.id)
                            .eq('type', 'social_post')
                            .eq('read', false)
                            .then((result) => {
                              if (result.error) {
                                console.warn('⚠️ [SOCIAL FEED] Falha ao marcar notificações como lidas:', result.error)
                              } else {
                                console.log('✅ [SOCIAL FEED] Notificações sociais marcadas como lidas após ver destaque')
                              }
                            })
                        }
                      }
                    }
                  }, 100)
                } else {
                  setActiveCategory(isActive ? null : cat.id)
                }
              }}
              className={`flex flex-col items-center cursor-pointer transition-all duration-300 flex-shrink-0 ${
                isActive ? "opacity-100 scale-105" : "opacity-70 hover:opacity-90"
              }`}
            >
              {/* Story Circle com animação flip */}
              <div className="relative">
                <div className="relative w-20 h-20 perspective-1000">
                  <div
                    className={`story-flip-container w-20 h-20 rounded-full border-4 transition-all duration-300 ${
                      isActive
                        ? "border-[#D2A63C] shadow-[0_0_20px_#D2A63C,0_0_40px_#D2A63C50] scale-110"
                        : "border-gray-700 hover:border-[#D2A63C]/50"
                    } ${storyFlipStates.get(cat.id)?.showPreview ? 'story-flipped' : ''}`}
                  >
                    {/* Face frontal - Ícone */}
                    <div className={`story-face story-face-front absolute inset-0 rounded-full flex items-center justify-center bg-gradient-to-br ${cat.color} ${
                      storyFlipStates.get(cat.id)?.showPreview ? 'opacity-0' : 'opacity-100'
                    } transition-opacity duration-300`}>
                      <span className="text-4xl drop-shadow-lg">{cat.icon}</span>
                    </div>

                    {/* Face traseira - Preview */}
                    {(() => {
                      const categoryPosts = posts.filter(p => p.category === cat.id && p.media_url)
                      const flipState = storyFlipStates.get(cat.id)
                      const currentPost = categoryPosts[flipState?.currentIndex || 0]
                      
                      return currentPost?.media_url ? (
                        <div className={`story-face story-face-back absolute inset-0 rounded-full overflow-hidden border-2 border-black ${
                          flipState?.showPreview ? 'opacity-100' : 'opacity-0'
                        } transition-opacity duration-300`}>
                          <Image
                            src={currentPost.media_url}
                            alt={`Preview ${cat.label}`}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      ) : null
                    })()}
                  </div>
                </div>
                
                {/* Post Count Badge */}
                {postCount > 0 && (
                  <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isActive 
                      ? "bg-[#D2A63C] text-black" 
                      : "bg-gray-700 text-white"
                  } transition-colors`}>
                    {postCount}
                  </div>
                )}

                {/* Active Indicator */}
                {isActive && (
                  <div className="absolute inset-0 rounded-full border-4 border-[#D2A63C] animate-ping opacity-75"></div>
                )}
              </div>
              
              {/* Label */}
              <p className={`text-gray-300 text-xs mt-2 font-medium transition-colors ${
                isActive ? "text-[#D2A63C]" : ""
              }`}>
                {cat.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Create Post Section */}
      {canPost && (
        <div className="p-4 border-b border-gray-800 bg-gradient-to-r from-gray-900/50 to-black/50">
          {!showCreatePost ? (
            <Button
              onClick={() => setShowCreatePost(true)}
              className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Nova Publicação
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#D2A63C]">Nova Publicação</h3>
                <button
                  onClick={() => {
                    setShowCreatePost(false)
                    setNewPost("")
                    setSelectedCategory("")
                    setMediaPreview(null)
                    setMediaPreviews([])
                    setNewPostMedia(null)
                    setNewPostMedias([])
                  }}
                  className="p-1 hover:bg-gray-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <MentionInput
                value={newPost}
                onChange={setNewPost}
                placeholder="Partilha algo com a comunidade... (usa @ para mencionar membros)"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-[#D2A63C] outline-none resize-none transition-colors"
                rows={4}
                onMentionsChange={setPostMentions}
              />

              {/* Multiple Media Previews */}
              {(mediaPreviews.length > 0 || mediaPreview) && (
                <div className="space-y-2">
                  {(mediaPreviews.length > 0 ? mediaPreviews : (mediaPreview ? [mediaPreview] : [])).map((preview, idx) => (
                    <div key={idx} className="relative rounded-lg overflow-hidden border border-gray-700">
                      {preview.startsWith('data:video') ? (
                        <video src={preview} controls className="w-full max-h-64 object-cover" />
                      ) : (
                        <Image
                          src={preview}
                          alt={`Preview ${idx + 1}`}
                          width={500}
                          height={256}
                          className="w-full max-h-64 object-cover"
                          unoptimized
                        />
                      )}
                      <button
                        onClick={() => {
                          if (mediaPreviews.length > 0) {
                            const newPreviews = mediaPreviews.filter((_, i) => i !== idx)
                            setMediaPreviews(newPreviews)
                            setNewPostMedias(newPostMedias.filter((_, i) => i !== idx))
                            if (newPreviews.length === 0) {
                              setMediaPreview(null)
                              setNewPostMedia(null)
                            }
                          } else {
                            setMediaPreview(null)
                            setNewPostMedia(null)
                          }
                          if (fileInputRef.current) fileInputRef.current.value = ""
                        }}
                        className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black rounded-full transition-colors"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                      {mediaPreviews.length > 1 && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                          {idx + 1} / {mediaPreviews.length}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleMediaSelect}
                  className="hidden"
                  id="media-upload"
                />
                <label
                  htmlFor="media-upload"
                  className="cursor-pointer px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-[#D2A63C]" />
                  <span className="text-sm">Adicionar Mídia</span>
                </label>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="flex-1 bg-gray-800 border border-[#D2A63C]/30 text-gray-300 rounded-lg p-2 text-sm focus:border-[#D2A63C] outline-none transition-colors"
                >
                  <option value="">Seleciona categoria</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={handleCreatePost}
                disabled={!newPost.trim() || uploading}
                className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    A publicar...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Publicar
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Active Category Filter Badge */}
      {activeCategory && (
        <div className="px-4 py-2 bg-[#D2A63C]/20 border-b border-[#D2A63C]/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">
              {CATEGORIES.find(c => c.id === activeCategory)?.icon}
            </span>
            <span className="text-[#D2A63C] font-semibold">
              Filtrado: {CATEGORIES.find(c => c.id === activeCategory)?.label}
            </span>
            <span className="text-gray-400 text-sm">
              ({filteredPosts.length} {filteredPosts.length === 1 ? 'publicação' : 'publicações'})
            </span>
          </div>
          <button
            onClick={() => setActiveCategory(null)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Feed */}
      <div ref={feedRef} className="p-4 flex flex-col gap-4">
        {filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <Card
              key={post.id}
              data-post-category={post.category}
              className="post-card bg-gradient-to-br from-gray-900/90 to-black/90 border border-[#D2A63C]/20 rounded-2xl shadow-lg hover:shadow-[#D2A63C]/20 transition-all duration-300"
            >
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#D2A63C] to-[#BB8525] rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-black" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#D2A63C] text-base">
                        {post.user_name}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(post.created_at)}
                        </span>
                        {post.category && (
                          <>
                            <span className="text-xs text-gray-600">•</span>
                            <span className="text-xs text-gray-400 uppercase">
                              {CATEGORIES.find(c => c.id === post.category)?.icon} {post.category}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Edit/Delete Button (Admin or Post Creator) */}
                    {(currentUser?.user_type === 'admin' || currentUser?.id === post.user_id) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="ml-auto text-gray-400 hover:text-[#D2A63C] transition-colors">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-gray-800 border-gray-700">
                          <DropdownMenuItem
                            onClick={async () => {
                              if (confirm('Tens a certeza que queres editar esta publicação?')) {
                                // TODO: Implement edit functionality
                                const newContent = prompt('Edita o conteúdo:', post.content)
                                if (newContent && newContent !== post.content) {
                                  try {
                                    const { error } = await supabase
                                      .from('posts')
                                      .update({ content: newContent })
                                      .eq('id', post.id)
                                    
                                    if (error) throw error
                                    loadPosts()
                                  } catch (error) {
                                    console.error('Erro ao editar:', error)
                                    alert('Erro ao editar publicação')
                                  }
                                }
                              }
                            }}
                            className="text-white hover:bg-blue-500/20 cursor-pointer flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              if (confirm('Tens a certeza que queres apagar esta publicação? Esta ação não pode ser desfeita.')) {
                                try {
                                  const { error } = await supabase
                                    .from('posts')
                                    .delete()
                                    .eq('id', post.id)
                                  
                                  if (error) throw error
                                  loadPosts()
                                } catch (error) {
                                  console.error('Erro ao apagar:', error)
                                  alert('Erro ao apagar publicação')
                                }
                              }
                            }}
                            className="text-white hover:bg-red-500/20 cursor-pointer flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Apagar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="text-gray-200 whitespace-pre-wrap leading-relaxed mb-3">
                  <MentionText text={post.content} />
                </div>

                {/* Media Carousel */}
                {(() => {
                  const mediaList = post.media_urls && post.media_urls.length > 0 
                    ? post.media_urls 
                    : (post.media_url ? [post.media_url] : [])
                  
                  if (mediaList.length === 0) return null
                  
                  const currentIndex = currentMediaIndex.get(post.id) || 0
                  const currentMedia = mediaList[currentIndex]
                  
                  return (
                    <div className="mb-3 rounded-xl overflow-hidden border border-gray-700 relative">
                      {/* Media Display */}
                      <div className="relative">
                        {currentMedia.includes('.mp4') || currentMedia.includes('.webm') ? (
                          <video src={currentMedia} controls className="w-full rounded-xl" />
                        ) : (
                          <Image
                            src={currentMedia}
                            alt={`Post media ${currentIndex + 1}`}
                            width={800}
                            height={384}
                            className="w-full rounded-xl object-cover max-h-96"
                            unoptimized
                          />
                        )}
                        
                        {/* Carousel Navigation */}
                        {mediaList.length > 1 && (
                          <>
                            {currentIndex > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCurrentMediaIndex(prev => new Map(prev).set(post.id, currentIndex - 1))
                                }}
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all"
                              >
                                <ChevronLeft className="w-5 h-5 text-white" />
                              </button>
                            )}
                            {currentIndex < mediaList.length - 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCurrentMediaIndex(prev => new Map(prev).set(post.id, currentIndex + 1))
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 rounded-full p-2 transition-all"
                              >
                                <ChevronRight className="w-5 h-5 text-white" />
                              </button>
                            )}
                            
                            {/* Dots Indicator */}
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                              {mediaList.map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCurrentMediaIndex(prev => new Map(prev).set(post.id, idx))
                                  }}
                                  className={`w-2 h-2 rounded-full transition-all ${
                                    idx === currentIndex ? 'bg-[#D2A63C] w-6' : 'bg-white/50'
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Actions */}
                <div className="flex items-center gap-6 pt-3 border-t border-gray-700/50">
                  <button
                    onClick={() => handleLike(post.id)}
                    className={`flex items-center gap-2 transition-all duration-200 ${
                      post.liked_by_user
                        ? "text-red-500 scale-110"
                        : "text-gray-400 hover:text-red-400 hover:scale-105"
                    }`}
                  >
                    <Heart
                      className={`w-6 h-6 ${
                        post.liked_by_user ? "fill-current animate-pulse" : ""
                      }`}
                    />
                    <span className="text-sm font-semibold">
                      {post.likes_count || 0}
                    </span>
                  </button>

                  <button 
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-2 text-gray-400 hover:text-[#D2A63C] transition-all duration-200 hover:scale-105"
                  >
                    <MessageCircle className="w-6 h-6" />
                    <span className="text-sm font-semibold">
                      {post.comments_count || 0}
                    </span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 text-gray-400 hover:text-[#D2A63C] transition-colors ml-auto">
                        <Share2 className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 border-gray-700">
                      <DropdownMenuItem
                        onClick={async () => {
                          const postIdShort = post.id.split('-')[0] || post.id.substring(0, 8)
                          const shortLink = `${window.location.origin}/p/${postIdShort}`
                          const cleanContent = cleanMentionsForShare(post.content)
                          const shareText = `${cleanContent}\n\n- ${post.user_name} via MTM App\n\n🔗 Ver: ${shortLink}`
                          const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`
                          window.open(url, '_blank')
                        }}
                        className="text-white hover:bg-green-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0123.995 12a11.872 11.872 0 01-3.547 8.506 11.821 11.821 0 01-8.448 3.494A11.815 11.815 0 01.005 12 11.867 11.867 0 015.285 2.471a11.805 11.805 0 018.927-3.221h.001z"/></svg>
                        WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          const postIdShort = post.id.split('-')[0] || post.id.substring(0, 8)
                          const shortLink = `${window.location.origin}/p/${postIdShort}`
                          const cleanContent = cleanMentionsForShare(post.content)
                          const shareText = `${cleanContent}\n\n- ${post.user_name} via MTM App`
                          const url = `https://t.me/share/url?url=${encodeURIComponent(shortLink)}&text=${encodeURIComponent(shareText)}`
                          window.open(url, '_blank')
                        }}
                        className="text-white hover:bg-blue-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        Telegram
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          await handleSharePost(post)
                        }}
                        className="text-white hover:bg-gray-700 cursor-pointer"
                      >
                        Mais opções...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Comentários Expandidos */}
                {expandedComments === post.id && (
                  <div className="px-4 pb-4 border-t border-gray-700/50 pt-4">
                    {/* Lista de Comentários */}
                    {loadingComments.has(post.id) ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
                      </div>
                    ) : postComments.has(post.id) && (postComments.get(post.id)?.length ?? 0) > 0 ? (
                      <div className="space-y-3 mb-4">
                        {(postComments.get(post.id) || []).map((comment: any) => (
                          <div key={comment.id} className="flex gap-2">
                            <div className="w-8 h-8 bg-[#D2A63C]/20 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-[#D2A63C]" />
                            </div>
                            <div className="flex-1 bg-gray-800/50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-[#D2A63C]">
                                  {comment.user_name}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {formatTimeAgo(comment.created_at)}
                                </span>
                              </div>
                              <div className="text-sm text-gray-300 leading-relaxed">
                                <MentionText text={comment.content} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        <p className="text-sm">Ainda não há comentários.</p>
                      </div>
                    )}

                    {/* Input para Adicionar Comentário */}
                    {currentUser && (
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <MentionInput
                            value={commentText.get(post.id) || ''}
                            onChange={(value) => {
                              setCommentText(prev => {
                                const newMap = new Map(prev)
                                newMap.set(post.id, value)
                                return newMap
                              })
                            }}
                            placeholder="Escreve um comentário... (usa @ para mencionar)"
                            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
                            rows={1}
                            onMentionsChange={(mentions) => {
                              setCommentMentions(prev => {
                                const newMap = new Map(prev)
                                newMap.set(post.id, mentions)
                                return newMap
                              })
                            }}
                          />
                        </div>
                        <button
                          onClick={() => handleAddComment(post.id)}
                          disabled={!commentText.get(post.id)?.trim()}
                          className="bg-[#D2A63C] text-black px-4 py-2 rounded-lg font-semibold hover:bg-[#BB8525] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Publicar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center text-gray-500 py-20">
            {activeCategory ? (
              <div className="space-y-2">
                <div className="text-6xl mb-4">
                  {CATEGORIES.find(c => c.id === activeCategory)?.icon}
                </div>
                <p className="text-lg">Ainda não há publicações nesta categoria.</p>
                <p className="text-sm text-gray-600">
                  Sê o primeiro a partilhar algo sobre{" "}
                  {CATEGORIES.find(c => c.id === activeCategory)?.label.toLowerCase()}!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-6xl mb-4">📭</div>
                <p className="text-lg">Ainda não há publicações.</p>
                <p className="text-sm text-gray-600">
                  Sê o primeiro a partilhar algo com a comunidade!
                </p>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}