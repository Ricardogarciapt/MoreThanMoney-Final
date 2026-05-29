"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import AuthModal from "./auth-modal"

interface ProtectedRouteProps {
  children: React.ReactNode
  title?: string
  description?: string
  fallback?: React.ReactNode
}

export default function ProtectedRoute({ 
  children, 
  title = "Acesso Restrito", 
  description = "Faça login ou registe-se para aceder a este conteúdo",
  fallback 
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShowAuthModal(true)
    }
  }, [isAuthenticated, isLoading])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-500 mx-auto mb-4"></div>
          <p className="text-gold-100">A carregar...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="text-center max-w-md mx-auto p-6">
              <div className="mb-6">
                <div className="w-16 h-16 bg-gold-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gold-100 mb-2">{title}</h1>
                <p className="text-gold-50/70">{description}</p>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-gold-600 hover:bg-gold-700 text-black font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                Entrar ou Registar
              </button>
            </div>
          </div>
        )}
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          title={title}
          description={description}
        />
      </>
    )
  }

  return <>{children}</>
}
