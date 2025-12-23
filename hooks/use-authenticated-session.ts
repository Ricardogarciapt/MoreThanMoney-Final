"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

export function useAuthenticatedSession() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error("Erro ao verificar sessão:", error)
          setIsAuthenticated(false)
          setUserId(null)
        } else if (session?.user) {
          setIsAuthenticated(true)
          setUserId(session.user.id)
        } else {
          setIsAuthenticated(false)
          setUserId(null)
        }
      } catch (error) {
        console.error("Erro ao verificar sessão:", error)
        setIsAuthenticated(false)
        setUserId(null)
      } finally {
        setLoading(false)
      }
    }

    checkSession()

    // Ouvir mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true)
        setUserId(session.user.id)
      } else {
        setIsAuthenticated(false)
        setUserId(null)
      }
      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return {
    isAuthenticated,
    userId,
    loading,
  }
}

