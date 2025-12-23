"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { MessageCircle, ExternalLink } from "lucide-react"
import MentionText from "@/components/mobile/mention-text"
import Link from "next/link"

interface Post {
  id: string
  user_name: string
  content: string
  category?: string
  created_at: string
  likes_count?: number
  comments_count?: number
}

const CATEGORIES = [
  { id: "updates", label: "Updates", icon: "🆕" },
  { id: "forex", label: "Forex", icon: "💹" },
  { id: "crypto", label: "Criptomoedas", icon: "₿" },
  { id: "mindset", label: "Mindset", icon: "🧠" },
  { id: "lideranca", label: "Liderança", icon: "👑" },
  { id: "network", label: "Network", icon: "🌐" },
  { id: "social", label: "Social", icon: "🤝" },
]

export default function SocialFeedRSS() {
  const pathname = usePathname()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [mounted, setMounted] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)

  // Não mostrar em /app-mobile e /mobile
  const shouldHide = pathname?.startsWith('/app-mobile') || pathname?.startsWith('/mobile')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setIsAuthenticated(!!session)
        
        if (session) {
          loadPosts()
        } else {
          setLoading(false)
        }
      } catch (error) {
        console.error('Erro ao verificar autenticação:', error)
        setLoading(false)
      }
    }

    checkAuth()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      if (session) {
        loadPosts()
      } else {
        setPosts([])
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [mounted])

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10) // Mais posts para o ticker

      if (error) {
        console.error("Erro ao carregar posts:", error)
        setPosts([])
      } else {
        setPosts(data || [])
      }
    } catch (error) {
      console.error("Erro ao carregar posts:", error)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return "agora"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`
    return new Date(date).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
  }

  // Limpar conteúdo para exibição no ticker (remover menções formatadas, apenas texto)
  const getPlainText = (text: string): string => {
    return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
  }

  // Não renderizar se não deve aparecer ou não está montado
  if (!mounted || shouldHide || !isAuthenticated) {
    return null
  }

  // Não renderizar se não há posts e não está carregando
  if (!loading && posts.length === 0) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-[#D2A63C]/10 via-gray-900/50 to-[#D2A63C]/10 border-b border-[#D2A63C]/20 py-2 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-4">
          {/* Label */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <MessageCircle className="w-4 h-4 text-[#D2A63C]" />
            <span className="text-xs font-bold text-[#D2A63C] uppercase tracking-wider">
              Feed Social
            </span>
          </div>

          {/* Ticker */}
          <div className="flex-1 overflow-hidden relative" style={{ maskImage: 'linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 20px, black calc(100% - 20px), transparent)' }}>
            {loading ? (
              <div className="flex items-center justify-center py-1">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#D2A63C]"></div>
              </div>
            ) : posts.length > 0 ? (
              <div
                ref={tickerRef}
                className="flex items-center gap-6 ticker-scroll whitespace-nowrap"
                style={{
                  animationDuration: `${Math.max(posts.length * 8, 30)}s`,
                  width: 'max-content'
                }}
              >
                {/* Duplicar posts para loop contínuo */}
                {[...posts, ...posts, ...posts].map((post, index) => (
                  <Link
                    key={`${post.id}-${index}`}
                    href="/app-mobile?tab=social"
                    className="flex items-center gap-3 flex-shrink-0 group hover:text-[#D2A63C] transition-colors whitespace-nowrap"
                  >
                    <span className="text-xs text-gray-400 group-hover:text-[#D2A63C] whitespace-nowrap">
                      {post.user_name}
                    </span>
                    <span className="text-gray-600">•</span>
                    <span className="text-xs text-gray-300 whitespace-nowrap max-w-xs truncate">
                      {getPlainText(post.content)}
                    </span>
                    {post.category && (
                      <>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {CATEGORIES.find(c => c.id === post.category)?.icon}
                        </span>
                      </>
                    )}
                    <span className="text-gray-600">•</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {formatTimeAgo(post.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {/* Link Ver Tudo */}
          <Link
            href="/app-mobile?tab=social"
            className="flex items-center gap-1 text-xs text-[#D2A63C] hover:text-[#BB8525] transition-colors flex-shrink-0"
          >
            Ver tudo
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

    </div>
  )
}

