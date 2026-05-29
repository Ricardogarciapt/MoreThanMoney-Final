"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function PostShortLinkPage() {
  const params = useParams()
  const router = useRouter()
  const postIdShort = params.id as string

  useEffect(() => {
    if (!postIdShort) return

    // Buscar post completo pelo ID curto (primeiros 8 caracteres)
    const findAndRedirect = async () => {
      try {
        // Buscar todos os posts e encontrar o que começa com esse ID curto
        const { data: posts, error } = await supabase
          .from('posts')
          .select('id')
          .limit(1000) // Limitar para performance

        if (error) {
          console.error('Erro ao buscar post:', error)
          router.push('/app-mobile?tab=social')
          return
        }

        // Encontrar post que começa com o ID curto
        const matchingPost = posts?.find(p => 
          p.id.substring(0, 8) === postIdShort.substring(0, 8)
        )

        if (matchingPost) {
          // Redirecionar para o post completo
          router.push(`/app-mobile?tab=social&post=${matchingPost.id}`)
        } else {
          // Se não encontrar, redirecionar para feed geral
          router.push('/app-mobile?tab=social')
        }
      } catch (error) {
        console.error('Erro ao processar link curto:', error)
        router.push('/app-mobile?tab=social')
      }
    }

    findAndRedirect()
  }, [postIdShort, router])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D2A63C] mx-auto mb-4"></div>
        <p className="text-gray-300">A redirecionar para a publicação...</p>
      </div>
    </div>
  )
}

